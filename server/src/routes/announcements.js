import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import { authorizeRoles } from '../middleware/authorizeRoles.js'
import {
  announcementCreateSchema,
  announcementIdSchema,
  announcementListSchema,
  announcementPublishSchema,
  announcementUpdateSchema,
} from '../announcements/validation.js'
import { deliverToCampusUsers } from '../notifications/delivery.js'
import { writeAuditLog } from '../audit/log.js'

const announcementSelection = {
  id: true,
  eventId: true,
  title: true,
  message: true,
  category: true,
  priority: true,
  status: true,
  publishAt: true,
  publishedAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  event: { select: { id: true, title: true } },
}

function assertRepository(announcementRepository, eventRepository) {
  if (!['findMany', 'findFirst', 'create', 'updateMany', 'count'].every(
    (method) => typeof announcementRepository?.announcement?.[method] === 'function',
  ) || typeof eventRepository?.event?.findFirst !== 'function') {
    throw new Error('Announcement and event repositories with the required read/write methods are required.')
  }
}

function pagination(request, response) {
  const parsed = announcementListSchema.safeParse(request.query)
  if (!parsed.success) {
    response.status(400).json({ error: { message: 'Invalid announcement filters or pagination.' } })
    return null
  }
  return {
    ...parsed.data,
    skip: (parsed.data.page - 1) * parsed.data.limit,
  }
}

function safeAnnouncement(announcement) {
  const { createdById, createdBy, ...publicFields } = announcement
  return {
    ...publicFields,
    createdBy: createdBy ? { name: createdBy.name } : null,
  }
}

function manageWhere(user) {
  if (user.role === 'ADMIN') return {}
  if (user.role === 'FACULTY') {
    return { createdById: user.id, eventId: null }
  }
  return {
    createdById: user.id,
    category: 'EVENTS',
    event: { is: { createdById: user.id } },
  }
}

function publicWhere(now) {
  return {
    status: 'PUBLISHED',
    OR: [{ publishAt: null }, { publishAt: { lte: now } }],
    AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
  }
}

function toNotification(announcement, recipientId) {
  return {
    recipientId,
    title: announcement.title,
    message: announcement.message.slice(0, 2000),
    category: 'ANNOUNCEMENT',
    relatedEntityId: announcement.id,
    relatedEntityType: 'ANNOUNCEMENT',
    dedupeKey: `announcement:${announcement.id}:${recipientId}`,
  }
}

async function notifyAnnouncement({
  announcement,
  userRepository,
  notificationRepository,
}) {
  await deliverToCampusUsers({
    userRepository,
    notificationRepository,
    excludeUserId: announcement.createdBy.id,
    notificationFor: (recipientId) => toNotification(announcement, recipientId),
  })
}

export async function publishDueAnnouncements({
  announcementRepository,
  userRepository,
  notificationRepository,
  clock = () => new Date(),
}) {
  const now = clock()
  const due = await announcementRepository.announcement.findMany({
    where: { status: 'SCHEDULED', publishAt: { lte: now } },
    orderBy: [{ publishAt: 'asc' }, { id: 'asc' }],
    select: { ...announcementSelection, createdById: true },
  })

  for (const announcement of due) {
    if (announcement.expiresAt && announcement.expiresAt <= now) {
      await announcementRepository.announcement.updateMany({
        where: { id: announcement.id, status: 'SCHEDULED' },
        data: { status: 'ARCHIVED' },
      })
      continue
    }

    const updated = await announcementRepository.announcement.updateMany({
      where: {
        id: announcement.id,
        status: 'SCHEDULED',
        publishAt: { lte: now },
      },
      data: { status: 'PUBLISHED', publishedAt: now },
    })
    if (updated.count === 0) continue

    const published = await announcementRepository.announcement.findFirst({
      where: { id: announcement.id },
      select: announcementSelection,
    })
    if (published) {
      await notifyAnnouncement({ announcement: published, userRepository, notificationRepository })
    }
  }
}

export function startAnnouncementScheduler(options, intervalMs = 60_000) {
  const timer = setInterval(() => {
    publishDueAnnouncements(options).catch(() => {
      console.error('Scheduled announcement processing failed.')
    })
  }, intervalMs)
  return () => clearInterval(timer)
}

export default function announcementsRouter({
  userRepository,
  announcementRepository,
  eventRepository,
  notificationRepository,
  auditRepository,
  jwtSecret,
  clock = () => new Date(),
}) {
  assertRepository(announcementRepository, eventRepository)
  const router = Router()
  const requireAuthentication = authenticate({ userRepository, jwtSecret })
  const requirePublisher = authorizeRoles('ADMIN', 'FACULTY', 'CLUB_COORDINATOR')

  router.get('/manage', requireAuthentication, requirePublisher, async (request, response) => {
    const page = pagination(request, response)
    if (!page) return
    const where = {
      ...manageWhere(request.user),
      ...(page.category ? { category: page.category } : {}),
      ...(page.status ? { status: page.status } : {}),
    }
    const [items, total] = await Promise.all([
      announcementRepository.announcement.findMany({
        where,
        skip: page.skip,
        take: page.limit,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        select: announcementSelection,
      }),
      announcementRepository.announcement.count({ where }),
    ])
    return response.status(200).json({
      items: items.map(safeAnnouncement),
      pagination: { page: page.page, limit: page.limit, total, totalPages: Math.ceil(total / page.limit) },
    })
  })

  router.get('/', requireAuthentication, async (request, response) => {
    const page = pagination(request, response)
    if (!page) return
    const now = clock()
    const where = {
      ...publicWhere(now),
      ...(page.category ? { category: page.category } : {}),
    }
    const [items, total] = await Promise.all([
      announcementRepository.announcement.findMany({
        where,
        skip: page.skip,
        take: page.limit,
        orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
        select: announcementSelection,
      }),
      announcementRepository.announcement.count({ where }),
    ])
    return response.status(200).json({
      items: items.map(safeAnnouncement),
      pagination: { page: page.page, limit: page.limit, total, totalPages: Math.ceil(total / page.limit) },
    })
  })

  router.post('/', requireAuthentication, requirePublisher, async (request, response) => {
    const parsed = announcementCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      return response.status(400).json({ error: { message: 'Invalid announcement details.' } })
    }
    const input = parsed.data
    if (input.eventId && input.category !== 'EVENTS') {
      return response.status(400).json({ error: { message: 'Only event announcements may reference an event.' } })
    }
    if (request.user.role === 'CLUB_COORDINATOR'
      && (input.category !== 'EVENTS' || !input.eventId)) {
      return response.status(403).json({ error: { message: 'Club coordinators may only create announcements for their own events.' } })
    }
    if (request.user.role === 'FACULTY'
      && (!['GENERAL', 'ACADEMIC'].includes(input.category) || input.eventId)) {
      return response.status(403).json({ error: { message: 'Faculty may publish general or academic announcements only.' } })
    }

    if (input.eventId) {
      const event = await eventRepository.event.findFirst({
        where: {
          id: input.eventId,
          ...(request.user.role === 'CLUB_COORDINATOR' ? { createdById: request.user.id } : {}),
        },
        select: { id: true },
      })
      if (!event) {
        return response.status(400).json({ error: { message: 'The referenced event does not exist or is not managed by you.' } })
      }
    }

    const data = {
      ...input,
      priority: input.priority ?? 'NORMAL',
      eventId: input.eventId ?? null,
      publishAt: input.publishAt ? new Date(input.publishAt) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      status: input.publishAt && new Date(input.publishAt) > clock() ? 'SCHEDULED' : 'DRAFT',
      createdById: request.user.id,
    }
    const announcement = await announcementRepository.announcement.create({
      data,
      select: announcementSelection,
    })
    if (auditRepository) {
      await writeAuditLog(auditRepository, {
        actorId: request.user.id,
        action: 'ANNOUNCEMENT_CREATED',
        entityType: 'Announcement',
        entityId: announcement.id,
        details: { title: announcement.title, status: announcement.status },
      })
    }
    return response.status(201).json({ announcement: safeAnnouncement(announcement) })
  })

  router.get('/:id', requireAuthentication, async (request, response) => {
    const parsedId = announcementIdSchema.safeParse(request.params.id)
    if (!parsedId.success) {
      return response.status(400).json({ error: { message: 'Invalid announcement ID.' } })
    }
    const announcement = await announcementRepository.announcement.findFirst({
      where: {
        id: parsedId.data,
        ...publicWhere(clock()),
      },
      select: announcementSelection,
    })
    if (!announcement) {
      return response.status(404).json({ error: { message: 'Announcement not found.' } })
    }
    return response.status(200).json({ announcement: safeAnnouncement(announcement) })
  })

  router.patch('/:id', requireAuthentication, requirePublisher, async (request, response) => {
    const parsedId = announcementIdSchema.safeParse(request.params.id)
    const parsed = announcementUpdateSchema.safeParse(request.body)
    if (!parsedId.success || !parsed.success) {
      return response.status(400).json({ error: { message: 'Invalid announcement update.' } })
    }
    const existing = await announcementRepository.announcement.findFirst({
      where: { id: parsedId.data, ...manageWhere(request.user) },
      select: {
        id: true,
        category: true,
        eventId: true,
        status: true,
        publishAt: true,
        expiresAt: true,
      },
    })
    if (!existing) return response.status(404).json({ error: { message: 'Announcement not found.' } })
    if (existing.status === 'ARCHIVED') {
      return response.status(409).json({ error: { message: 'Archived announcements cannot be edited.' } })
    }

    const nextCategory = parsed.data.category ?? existing.category
    const nextEventId = parsed.data.eventId === undefined ? existing.eventId : parsed.data.eventId
    if (nextEventId && nextCategory !== 'EVENTS') {
      return response.status(400).json({ error: { message: 'Only event announcements may reference an event.' } })
    }
    if (request.user.role === 'CLUB_COORDINATOR'
      && (nextCategory !== 'EVENTS' || !nextEventId)) {
      return response.status(403).json({ error: { message: 'Club coordinators may only manage announcements for their own events.' } })
    }
    if (request.user.role === 'FACULTY'
      && (!['GENERAL', 'ACADEMIC'].includes(nextCategory) || nextEventId)) {
      return response.status(403).json({ error: { message: 'Faculty may manage general or academic announcements only.' } })
    }
    if (nextEventId && (parsed.data.eventId !== undefined || request.user.role === 'CLUB_COORDINATOR')) {
      const event = await eventRepository.event.findFirst({
        where: {
          id: nextEventId,
          ...(request.user.role === 'CLUB_COORDINATOR' ? { createdById: request.user.id } : {}),
        },
        select: { id: true },
      })
      if (!event) {
        return response.status(400).json({ error: { message: 'The referenced event does not exist or is not managed by you.' } })
      }
    }

    const nextPublishAt = parsed.data.publishAt === undefined
      ? existing.publishAt
      : parsed.data.publishAt ? new Date(parsed.data.publishAt) : null
    const nextExpiresAt = parsed.data.expiresAt === undefined
      ? existing.expiresAt
      : parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null
    if (nextPublishAt && nextExpiresAt && nextExpiresAt <= nextPublishAt) {
      return response.status(400).json({ error: { message: 'The expiry time must be after the publication time.' } })
    }
    if (existing.status === 'SCHEDULED'
      && (!nextPublishAt || nextPublishAt <= clock())
      && nextExpiresAt
      && nextExpiresAt <= clock()) {
      return response.status(409).json({ error: { message: 'An expired announcement cannot be published.' } })
    }
    const data = {
      ...parsed.data,
      ...(parsed.data.eventId !== undefined ? { eventId: nextEventId } : {}),
      ...(parsed.data.publishAt !== undefined ? { publishAt: nextPublishAt } : {}),
      ...(parsed.data.expiresAt !== undefined ? { expiresAt: nextExpiresAt } : {}),
    }
    if (existing.status === 'PUBLISHED' && nextPublishAt && nextPublishAt > clock()) {
      data.status = 'SCHEDULED'
      data.publishedAt = null
    } else if (existing.status === 'SCHEDULED' && (!nextPublishAt || nextPublishAt <= clock())) {
      data.status = 'PUBLISHED'
      data.publishedAt = clock()
    }
    const updated = await announcementRepository.announcement.updateMany({
      where: { id: parsedId.data, ...manageWhere(request.user), status: existing.status },
      data,
    })
    if (updated.count === 0) {
      return response.status(409).json({ error: { message: 'Announcement changed while being updated. Reload and retry.' } })
    }
    const announcement = await announcementRepository.announcement.findFirst({
      where: { id: parsedId.data },
      select: announcementSelection,
    })
    if (existing.status === 'SCHEDULED' && announcement?.status === 'PUBLISHED') {
      await notifyAnnouncement({ announcement, userRepository, notificationRepository })
    }
    if (auditRepository && announcement) {
      await writeAuditLog(auditRepository, {
        actorId: request.user.id,
        action: 'ANNOUNCEMENT_UPDATED',
        entityType: 'Announcement',
        entityId: parsedId.data,
        details: { title: announcement.title, status: announcement.status },
      })
    }
    return response.status(200).json({ announcement: safeAnnouncement(announcement) })
  })

  router.post('/:id/publish', requireAuthentication, requirePublisher, async (request, response) => {
    const parsedId = announcementIdSchema.safeParse(request.params.id)
    const parsedBody = announcementPublishSchema.safeParse(request.body ?? {})
    if (!parsedId.success || !parsedBody.success) {
      return response.status(400).json({ error: { message: 'Invalid announcement publish request.' } })
    }
    const where = { id: parsedId.data, ...manageWhere(request.user) }
    const existing = await announcementRepository.announcement.findFirst({
      where,
      select: { id: true, status: true, publishAt: true, expiresAt: true },
    })
    if (!existing) return response.status(404).json({ error: { message: 'Announcement not found.' } })
    if (existing.status === 'ARCHIVED') {
      return response.status(409).json({ error: { message: 'Archived announcements cannot be published.' } })
    }
    if (existing.status === 'PUBLISHED') {
      const announcement = await announcementRepository.announcement.findFirst({
        where,
        select: announcementSelection,
      })
      return response.status(200).json({ announcement: safeAnnouncement(announcement) })
    }
    if (existing.expiresAt && existing.expiresAt <= clock()) {
      return response.status(409).json({ error: { message: 'An expired announcement cannot be published.' } })
    }

    const isScheduled = !parsedBody.data.publishNow
      && existing.publishAt
      && existing.publishAt > clock()
    const updated = await announcementRepository.announcement.updateMany({
      where: { ...where, status: existing.status },
      data: isScheduled
        ? { status: 'SCHEDULED', publishedAt: null }
        : {
          status: 'PUBLISHED',
          publishAt: parsedBody.data.publishNow ? null : existing.publishAt,
          publishedAt: clock(),
        },
    })
    if (updated.count === 0) {
      return response.status(409).json({ error: { message: 'Announcement changed while being published. Reload and retry.' } })
    }
    const announcement = await announcementRepository.announcement.findFirst({
      where,
      select: announcementSelection,
    })
    if (!isScheduled && announcement) {
      await notifyAnnouncement({ announcement, userRepository, notificationRepository })
    }
    if (auditRepository && announcement) {
      await writeAuditLog(auditRepository, {
        actorId: request.user.id,
        action: 'ANNOUNCEMENT_PUBLISHED',
        entityType: 'Announcement',
        entityId: announcement.id,
        details: { title: announcement.title, status: announcement.status },
      })
    }
    return response.status(200).json({ announcement: safeAnnouncement(announcement) })
  })

  router.post('/:id/archive', requireAuthentication, requirePublisher, async (request, response) => {
    const parsedId = announcementIdSchema.safeParse(request.params.id)
    if (!parsedId.success) {
      return response.status(400).json({ error: { message: 'Invalid announcement ID.' } })
    }
    const where = { id: parsedId.data, ...manageWhere(request.user) }
    const existing = await announcementRepository.announcement.findFirst({
      where,
      select: { id: true },
    })
    if (!existing) return response.status(404).json({ error: { message: 'Announcement not found.' } })
    await announcementRepository.announcement.updateMany({
      where,
      data: { status: 'ARCHIVED' },
    })
    const announcement = await announcementRepository.announcement.findFirst({
      where: { id: parsedId.data },
      select: announcementSelection,
    })
    if (auditRepository) {
      await writeAuditLog(auditRepository, {
        actorId: request.user.id,
        action: 'ANNOUNCEMENT_ARCHIVED',
        entityType: 'Announcement',
        entityId: parsedId.data,
      })
    }
    return response.status(200).json({ announcement: safeAnnouncement(announcement) })
  })

  return router
}
