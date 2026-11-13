import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import { authorizeRoles } from '../middleware/authorizeRoles.js'
import { writeAuditLog } from '../audit/log.js'
import { deliverNotification } from '../notifications/delivery.js'
import {
  facilityAvailabilitySchema,
  facilityBookingCreateSchema,
  facilityBookingDecisionSchema,
  facilityIdSchema,
  facilityCreateSchema,
} from '../facilities/validation.js'

const activeBookingStatuses = ['PENDING', 'APPROVED']
const facilitySelection = {
  id: true,
  name: true,
  description: true,
  location: true,
  capacity: true,
  isActive: true,
}
const bookingSelection = {
  id: true,
  title: true,
  purpose: true,
  startsAt: true,
  endsAt: true,
  status: true,
  reviewedAt: true,
  createdAt: true,
  facility: { select: facilitySelection },
  requester: { select: { id: true, name: true } },
}

function assertRepository(repository) {
  if (!repository?.facility?.findMany || !repository.facility?.findUnique
    || !repository.facility?.create || !repository.facilityBooking?.findMany
    || !repository.facilityBooking?.findFirst || !repository.facilityBooking?.create
    || !repository.facilityBooking?.updateMany || !repository.$transaction) {
    throw new Error('A facility repository with facility, facilityBooking, and $transaction is required.')
  }
}

function conflictResponse(response) {
  return response.status(409).json({ error: { message: 'That facility time is no longer available. Choose another slot.' } })
}

export default function facilitiesRouter({
  userRepository,
  facilityRepository,
  auditRepository,
  notificationRepository,
  jwtSecret,
  clock = () => new Date(),
}) {
  assertRepository(facilityRepository)
  const router = Router()
  const authenticated = authenticate({ userRepository, jwtSecret })
  const managers = authorizeRoles('ADMIN')
  const campusUsers = authorizeRoles('STUDENT', 'FACULTY', 'CLUB_COORDINATOR', 'ADMIN')

  router.get('/', authenticated, campusUsers, async (_request, response) => {
    const items = await facilityRepository.facility.findMany({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: facilitySelection,
    })
    return response.status(200).json({ items })
  })

  router.post('/', authenticated, managers, async (request, response) => {
    const parsed = facilityCreateSchema.safeParse(request.body)
    if (!parsed.success) return response.status(400).json({ error: { message: 'Invalid facility details.' } })
    try {
      const facility = await facilityRepository.facility.create({
        data: parsed.data,
        select: facilitySelection,
      })
      await writeAuditLog(auditRepository, {
        actorId: request.user.id,
        action: 'FACILITY_CREATED',
        entityType: 'Facility',
        entityId: facility.id,
        details: { name: facility.name },
      })
      return response.status(201).json({ facility })
    } catch (error) {
      if (error?.code === 'P2002') {
        return response.status(409).json({ error: { message: 'A facility with that name already exists.' } })
      }
      throw error
    }
  })

  router.get('/:id/availability', authenticated, campusUsers, async (request, response) => {
    const id = facilityIdSchema.safeParse(request.params.id)
    const range = facilityAvailabilitySchema.safeParse(request.query)
    if (!id.success || !range.success) {
      return response.status(400).json({ error: { message: 'Invalid facility or time range.' } })
    }
    const facility = await facilityRepository.facility.findUnique({
      where: { id: id.data },
      select: { id: true, isActive: true },
    })
    if (!facility?.isActive) return response.status(404).json({ error: { message: 'Facility not found.' } })
    const conflicts = await facilityRepository.facilityBooking.findMany({
      where: {
        facilityId: id.data,
        status: { in: activeBookingStatuses },
        startsAt: { lt: new Date(range.data.endsAt) },
        endsAt: { gt: new Date(range.data.startsAt) },
      },
      orderBy: { startsAt: 'asc' },
      select: { startsAt: true, endsAt: true },
    })
    return response.status(200).json({ available: conflicts.length === 0, conflicts })
  })

  router.get('/bookings/mine', authenticated, campusUsers, async (request, response) => {
    const items = await facilityRepository.facilityBooking.findMany({
      where: { requesterId: request.user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: bookingSelection,
    })
    return response.status(200).json({ items })
  })

  router.get('/bookings', authenticated, managers, async (_request, response) => {
    const items = await facilityRepository.facilityBooking.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: bookingSelection,
    })
    return response.status(200).json({ items })
  })

  router.post('/bookings', authenticated, campusUsers, async (request, response) => {
    const parsed = facilityBookingCreateSchema.safeParse(request.body)
    if (!parsed.success) return response.status(400).json({ error: { message: 'Invalid booking request.' } })
    if (new Date(parsed.data.startsAt) <= clock()) {
      return response.status(400).json({ error: { message: 'Bookings must start in the future.' } })
    }

    try {
      const booking = await facilityRepository.$transaction(async (transaction) => {
        const facility = await transaction.facility.findUnique({
          where: { id: parsed.data.facilityId },
          select: { id: true, isActive: true },
        })
        if (!facility?.isActive) return null
        const conflict = await transaction.facilityBooking.findFirst({
          where: {
            facilityId: facility.id,
            status: { in: activeBookingStatuses },
            startsAt: { lt: new Date(parsed.data.endsAt) },
            endsAt: { gt: new Date(parsed.data.startsAt) },
          },
          select: { id: true },
        })
        if (conflict) return { conflict: true }
        return transaction.facilityBooking.create({
          data: {
            ...parsed.data,
            startsAt: new Date(parsed.data.startsAt),
            endsAt: new Date(parsed.data.endsAt),
            requesterId: request.user.id,
          },
          select: bookingSelection,
        })
      }, { isolationLevel: 'Serializable' })
      if (!booking) return response.status(404).json({ error: { message: 'Facility not found.' } })
      if (booking.conflict) return conflictResponse(response)
      return response.status(201).json({ booking })
    } catch (error) {
      if (error?.code === 'P2034') return conflictResponse(response)
      throw error
    }
  })

  router.patch('/bookings/:id', authenticated, managers, async (request, response) => {
    const id = facilityIdSchema.safeParse(request.params.id)
    const parsed = facilityBookingDecisionSchema.safeParse(request.body)
    if (!id.success || !parsed.success) {
      return response.status(400).json({ error: { message: 'Invalid booking decision.' } })
    }
    try {
      const result = await facilityRepository.$transaction(async (transaction) => {
        const booking = await transaction.facilityBooking.findFirst({
          where: { id: id.data, status: 'PENDING' },
          select: { id: true, facilityId: true, startsAt: true, endsAt: true },
        })
        if (!booking) return null
        if (parsed.data.status === 'APPROVED') {
          const conflict = await transaction.facilityBooking.findFirst({
            where: {
              id: { not: booking.id },
              facilityId: booking.facilityId,
              status: { in: activeBookingStatuses },
              startsAt: { lt: booking.endsAt },
              endsAt: { gt: booking.startsAt },
            },
            select: { id: true },
          })
          if (conflict) return { conflict: true }
        }
        const updated = await transaction.facilityBooking.updateMany({
          where: { id: booking.id, status: 'PENDING' },
          data: {
            status: parsed.data.status,
            reviewedById: request.user.id,
            reviewedAt: clock(),
          },
        })
        if (!updated.count) return null
        return transaction.facilityBooking.findFirst({
          where: { id: booking.id },
          select: bookingSelection,
        })
      }, { isolationLevel: 'Serializable' })
      if (!result) return response.status(404).json({ error: { message: 'Pending booking not found.' } })
      if (result.conflict) return conflictResponse(response)
      await writeAuditLog(auditRepository, {
        actorId: request.user.id,
        action: `FACILITY_BOOKING_${parsed.data.status}`,
        entityType: 'FacilityBooking',
        entityId: result.id,
        details: { facilityId: result.facility.id },
      })
      if (notificationRepository?.notification?.create) {
        await notificationRepository.notification.create({
          data: {
            recipientId: result.requester.id,
            title: `Facility booking ${parsed.data.status.toLowerCase()}`,
            message: `${result.facility.name}: ${result.title}`,
            category: 'FACILITY_BOOKING',
            relatedEntityId: result.id,
            relatedEntityType: 'FACILITY_BOOKING',
            dedupeKey: `facility-booking:${result.id}:${parsed.data.status}`,
          },
        })
      }
      return response.status(200).json({ booking: result })
    } catch (error) {
      if (error?.code === 'P2034') return conflictResponse(response)
      throw error
    }
  })

  router.post('/bookings/:id/cancel', authenticated, campusUsers, async (request, response) => {
    const id = facilityIdSchema.safeParse(request.params.id)
    if (!id.success) {
      return response.status(400).json({ error: { message: 'Invalid booking ID.' } })
    }

    const existing = await facilityRepository.facilityBooking.findFirst({
      where: {
        id: id.data,
        requesterId: request.user.id,
        status: { in: activeBookingStatuses },
        startsAt: { gt: clock() },
      },
      select: { id: true, status: true },
    })
    if (!existing) {
      return response.status(404).json({ error: { message: 'An upcoming booking you own was not found.' } })
    }
    const result = await facilityRepository.facilityBooking.updateMany({
      where: {
        id: existing.id,
        requesterId: request.user.id,
        status: existing.status,
        startsAt: { gt: clock() },
      },
      data: { status: 'CANCELLED' },
    })
    if (!result.count) {
      return response.status(409).json({ error: { message: 'The booking changed while being cancelled. Reload and retry.' } })
    }
    if (auditRepository) {
      await writeAuditLog(auditRepository, {
        actorId: request.user.id,
        action: 'FACILITY_BOOKING_CANCELLED',
        entityType: 'FacilityBooking',
        entityId: existing.id,
      })
    }
    await deliverNotification(notificationRepository, {
      recipientId: request.user.id,
      title: 'Facility booking cancelled',
      message: 'Your upcoming facility booking has been cancelled.',
      category: 'FACILITY_BOOKING',
      relatedEntityId: existing.id,
      relatedEntityType: 'FACILITY_BOOKING',
      dedupeKey: `facility-booking:${existing.id}:CANCELLED`,
    })
    return response.status(204).end()
  })

  return router
}
