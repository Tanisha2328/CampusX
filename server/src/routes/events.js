import { Router } from 'express'
import {
  eventCreateSchema,
  eventIdSchema,
  eventPaginationSchema,
  eventUpdateSchema,
} from '../events/validation.js'
import { authenticate } from '../middleware/authenticate.js'
import { authorizeRoles } from '../middleware/authorizeRoles.js'
import { deliverNotification, deliverToCampusUsers } from '../notifications/delivery.js'
import { writeAuditLog } from '../audit/log.js'

const eventSelection = {
  id: true,
  title: true,
  description: true,
  venue: true,
  startsAt: true,
  endsAt: true,
  capacity: true,
  registrationDeadline: true,
  status: true,
  _count: { select: { registrations: true } },
}

function assertEventRepository(eventRepository) {
  if (!eventRepository
    || !['findMany', 'findFirst', 'findUnique', 'create', 'update'].every(
      (method) => typeof eventRepository.event?.[method] === 'function',
    )
    || !['count', 'create', 'findMany', 'findUnique', 'deleteMany'].every(
      (method) => typeof eventRepository.eventRegistration?.[method] === 'function',
    )
    || typeof eventRepository.$transaction !== 'function') {
    throw new Error('An event repository with event, eventRegistration, and $transaction is required.')
  }
}

function getPagination(request, response) {
  const parsed = eventPaginationSchema.safeParse(request.query)

  if (!parsed.success) {
    response.status(400).json({ error: { message: 'Invalid pagination parameters.' } })
    return null
  }

  return {
    ...parsed.data,
    skip: (parsed.data.page - 1) * parsed.data.limit,
  }
}

function paginated(items, total, { page, limit }) {
  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }
}

function withRegistrationState(event) {
  const registration = event.registrations?.[0]
  const { registrations, _count, ...details } = event
  return {
    ...details,
    registrationCount: _count?.registrations ?? 0,
    isRegistered: Boolean(registration),
    registrationId: registration?.id ?? null,
  }
}

function notFound(response, message = 'Event not found.') {
  return response.status(404).json({ error: { message } })
}

async function notifyEventPublished({
  event,
  actorId,
  transitionKey,
  userRepository,
  notificationRepository,
}) {
  await deliverToCampusUsers({
    userRepository,
    notificationRepository,
    excludeUserId: actorId,
    notificationFor: (recipientId) => ({
      recipientId,
      title: 'New campus event',
      message: event.title,
      category: 'EVENT',
      relatedEntityId: event.id,
      relatedEntityType: 'EVENT',
      dedupeKey: `event-published:${event.id}:${transitionKey}:${recipientId}`,
    }),
  })
}

export default function eventsRouter({
  userRepository,
  eventRepository,
  notificationRepository,
  auditRepository,
  jwtSecret,
  clock = () => new Date(),
}) {
  assertEventRepository(eventRepository)
  const router = Router()
  const requireAuthentication = authenticate({ userRepository, jwtSecret })
  const requireStudent = authorizeRoles('STUDENT')
  const requireManager = authorizeRoles('ADMIN', 'CLUB_COORDINATOR')

  router.get('/manage', requireAuthentication, requireManager, async (request, response) => {
    const pagination = getPagination(request, response)
    if (!pagination) return

    const where = request.user.role === 'ADMIN' ? {} : { createdById: request.user.id }
    const [events, total] = await Promise.all([
      eventRepository.event.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        select: {
          ...eventSelection,
        },
      }),
      eventRepository.event.count({ where }),
    ])

    return response.status(200).json(paginated(events, total, pagination))
  })

  router.get('/', requireAuthentication, async (request, response) => {
    const pagination = getPagination(request, response)
    if (!pagination) return

    const where = { status: 'PUBLISHED', startsAt: { gt: clock() } }
    const [events, total] = await Promise.all([
      eventRepository.event.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        select: {
          ...eventSelection,
          registrations: {
            where: { studentId: request.user.id },
            take: 1,
            select: { id: true },
          },
        },
      }),
      eventRepository.event.count({ where }),
    ])

    return response.status(200).json(paginated(
      events.map(withRegistrationState),
      total,
      pagination,
    ))
  })

  router.get('/my-registrations', requireAuthentication, requireStudent, async (request, response) => {
    const pagination = getPagination(request, response)
    if (!pagination) return

    const where = { studentId: request.user.id }
    const [registrations, total] = await Promise.all([
      eventRepository.eventRegistration.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select: {
          id: true,
          createdAt: true,
          event: { select: eventSelection },
        },
      }),
      eventRepository.eventRegistration.count({ where }),
    ])

    return response.status(200).json(paginated(registrations, total, pagination))
  })

  router.get('/:id', requireAuthentication, async (request, response) => {
    const parsedId = eventIdSchema.safeParse(request.params.id)
    if (!parsedId.success) {
      return response.status(400).json({ error: { message: 'Invalid event ID.' } })
    }

    const where = request.user.role === 'ADMIN'
      ? { id: parsedId.data }
      : request.user.role === 'CLUB_COORDINATOR'
        ? { id: parsedId.data, createdById: request.user.id }
        : {
          id: parsedId.data,
          status: 'PUBLISHED',
          startsAt: { gt: clock() },
        }
    const event = await eventRepository.event.findFirst({
      where,
      select: {
        ...eventSelection,
        registrations: {
          where: { studentId: request.user.id },
          take: 1,
          select: { id: true },
        },
      },
    })

    if (!event) return notFound(response)
    return response.status(200).json({ event: withRegistrationState(event) })
  })

  router.post('/', requireAuthentication, requireManager, async (request, response) => {
    const parsed = eventCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      return response.status(400).json({ error: { message: 'Invalid event details.' } })
    }

    const data = {
      ...parsed.data,
      startsAt: new Date(parsed.data.startsAt),
      endsAt: new Date(parsed.data.endsAt),
      registrationDeadline: new Date(parsed.data.registrationDeadline),
      status: parsed.data.status ?? 'DRAFT',
    }
    if (data.status === 'PUBLISHED'
      && (data.startsAt <= clock() || data.registrationDeadline <= clock())) {
      return response.status(400).json({
        error: { message: 'Published events must be upcoming and have a future registration deadline.' },
      })
    }

    const event = await eventRepository.event.create({
      data: { ...data, createdById: request.user.id },
      select: eventSelection,
    })
    if (event.status === 'PUBLISHED') {
      await notifyEventPublished({
        event,
        actorId: request.user.id,
        transitionKey: 'created',
        userRepository,
        notificationRepository,
      })
    }
    if (auditRepository) {
      await writeAuditLog(auditRepository, {
        actorId: request.user.id,
        action: 'EVENT_CREATED',
        entityType: 'Event',
        entityId: event.id,
        details: { title: event.title, status: event.status },
      })
    }
    return response.status(201).json({ event })
  })

  router.patch('/:id', requireAuthentication, requireManager, async (request, response) => {
    const parsedId = eventIdSchema.safeParse(request.params.id)
    const parsed = eventUpdateSchema.safeParse(request.body)
    if (!parsedId.success || !parsed.success) {
      return response.status(400).json({ error: { message: 'Invalid event update.' } })
    }

    const where = request.user.role === 'ADMIN'
      ? { id: parsedId.data }
      : { id: parsedId.data, createdById: request.user.id }
    const existing = await eventRepository.event.findFirst({ where })
    if (!existing) return notFound(response)

    const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : existing.startsAt
    const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : existing.endsAt
    const registrationDeadline = parsed.data.registrationDeadline
      ? new Date(parsed.data.registrationDeadline)
      : existing.registrationDeadline

    if (endsAt <= startsAt || registrationDeadline > startsAt) {
      return response.status(400).json({ error: { message: 'Invalid event times or registration deadline.' } })
    }

    const status = parsed.data.status ?? existing.status
    if (status === 'PUBLISHED'
      && (startsAt <= clock() || registrationDeadline <= clock())) {
      return response.status(400).json({
        error: { message: 'Published events must be upcoming and have a future registration deadline.' },
      })
    }

    const data = { ...parsed.data }
    if (parsed.data.startsAt) data.startsAt = startsAt
    if (parsed.data.endsAt) data.endsAt = endsAt
    if (parsed.data.registrationDeadline) data.registrationDeadline = registrationDeadline

    const event = await eventRepository.event.update({
      where: { id: parsedId.data },
      data,
      select: eventSelection,
    })
    if (existing.status !== 'PUBLISHED' && event.status === 'PUBLISHED') {
      await notifyEventPublished({
        event,
        actorId: request.user.id,
        transitionKey: existing.updatedAt.toISOString(),
        userRepository,
        notificationRepository,
      })
    }
    if (auditRepository) {
      await writeAuditLog(auditRepository, {
        actorId: request.user.id,
        action: 'EVENT_UPDATED',
        entityType: 'Event',
        entityId: event.id,
        details: { title: event.title, status: event.status },
      })
    }
    return response.status(200).json({ event })
  })

  router.post('/:id/registrations', requireAuthentication, requireStudent, async (request, response) => {
    const parsedId = eventIdSchema.safeParse(request.params.id)
    if (!parsedId.success) {
      return response.status(400).json({ error: { message: 'Invalid event ID.' } })
    }

    try {
      const now = clock()
      const result = await eventRepository.$transaction(async (transaction) => {
        const event = await transaction.event.findUnique({
          where: { id: parsedId.data },
          select: {
            id: true,
            status: true,
            startsAt: true,
            registrationDeadline: true,
            capacity: true,
          },
        })

        if (!event || event.status !== 'PUBLISHED' || event.startsAt <= now) {
          return { error: 'unavailable' }
        }
        if (event.registrationDeadline <= now) {
          return { error: 'deadline' }
        }

        const existingRegistration = await transaction.eventRegistration.findUnique({
          where: {
            eventId_studentId: {
              eventId: event.id,
              studentId: request.user.id,
            },
          },
          select: { id: true },
        })
        if (existingRegistration) return { error: 'duplicate' }

        const registrationCount = await transaction.eventRegistration.count({
          where: { eventId: event.id },
        })
        if (registrationCount >= event.capacity) return { error: 'capacity' }

        const registration = await transaction.eventRegistration.create({
          data: { eventId: event.id, studentId: request.user.id },
          select: { id: true, eventId: true, studentId: true, createdAt: true },
        })
        return { registration }
      }, { isolationLevel: 'Serializable' })

      if (result.error === 'unavailable') return notFound(response)
      if (result.error === 'deadline') {
        return response.status(409).json({ error: { message: 'The event registration deadline has passed.' } })
      }
      if (result.error === 'duplicate') {
        return response.status(409).json({ error: { message: 'You are already registered for this event.' } })
      }
      if (result.error === 'capacity') {
        return response.status(409).json({ error: { message: 'The event has reached capacity.' } })
      }
      await deliverNotification(notificationRepository, {
        recipientId: request.user.id,
        title: 'Event registration confirmed',
        message: 'Your registration for the event was successful.',
        category: 'EVENT_REGISTRATION',
        relatedEntityId: result.registration.eventId,
        relatedEntityType: 'EVENT',
        dedupeKey: `event-registration:${result.registration.eventId}:${request.user.id}:${result.registration.id}`,
      })
      return response.status(201).json({ registration: result.registration })
    } catch (error) {
      if (error?.code === 'P2002') {
        return response.status(409).json({ error: { message: 'You are already registered for this event.' } })
      }
      if (error?.code === 'P2034') {
        return response.status(409).json({ error: { message: 'Registration conflicted with another request. Please retry.' } })
      }
      throw error
    }
  })

  router.delete('/:id/registrations/me', requireAuthentication, requireStudent, async (request, response) => {
    const parsedId = eventIdSchema.safeParse(request.params.id)
    if (!parsedId.success) {
      return response.status(400).json({ error: { message: 'Invalid event ID.' } })
    }

    const event = await eventRepository.event.findUnique({
      where: { id: parsedId.data },
      select: { id: true, startsAt: true, status: true },
    })
    if (!event) return notFound(response)
    if (!['PUBLISHED', 'CANCELLED'].includes(event.status) || event.startsAt <= clock()) {
      return response.status(409).json({ error: { message: 'Registration can only be cancelled before the event starts.' } })
    }

    const result = await eventRepository.eventRegistration.deleteMany({
      where: { eventId: parsedId.data, studentId: request.user.id },
    })
    if (result.count === 0) return notFound(response, 'Event registration not found.')
    return response.status(204).end()
  })

  return router
}
