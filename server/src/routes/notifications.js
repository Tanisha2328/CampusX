import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import { notificationIdSchema, notificationListSchema } from '../notifications/validation.js'

const notificationSelection = {
  id: true,
  title: true,
  message: true,
  category: true,
  relatedEntityId: true,
  relatedEntityType: true,
  isRead: true,
  readAt: true,
  createdAt: true,
}

function assertRepository(repository) {
  if (!['findMany', 'findFirst', 'count', 'updateMany'].every(
    (method) => typeof repository?.notification?.[method] === 'function',
  )) {
    throw new Error('A notification repository with findMany, findFirst, count, and updateMany is required.')
  }
}

export default function notificationsRouter({ userRepository, notificationRepository, jwtSecret }) {
  assertRepository(notificationRepository)
  const router = Router()
  const requireAuthentication = authenticate({ userRepository, jwtSecret })

  router.get('/unread-count', requireAuthentication, async (request, response) => {
    const count = await notificationRepository.notification.count({
      where: { recipientId: request.user.id, isRead: false },
    })
    return response.status(200).json({ count })
  })

  router.get('/', requireAuthentication, async (request, response) => {
    const parsed = notificationListSchema.safeParse(request.query)
    if (!parsed.success) {
      return response.status(400).json({ error: { message: 'Invalid notification filters or pagination.' } })
    }

    const { page, limit, category, unreadOnly } = parsed.data
    const where = {
      recipientId: request.user.id,
      ...(category ? { category } : {}),
      ...(unreadOnly ? { isRead: false } : {}),
    }
    const [items, total] = await Promise.all([
      notificationRepository.notification.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select: notificationSelection,
      }),
      notificationRepository.notification.count({ where }),
    ])
    return response.status(200).json({
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  })

  router.patch('/read-all', requireAuthentication, async (request, response) => {
    const result = await notificationRepository.notification.updateMany({
      where: { recipientId: request.user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    })
    return response.status(200).json({ updated: result.count })
  })

  router.patch('/:id/read', requireAuthentication, async (request, response) => {
    const parsedId = notificationIdSchema.safeParse(request.params.id)
    if (!parsedId.success) {
      return response.status(400).json({ error: { message: 'Invalid notification ID.' } })
    }

    const where = { id: parsedId.data, recipientId: request.user.id }
    const existing = await notificationRepository.notification.findFirst({
      where,
      select: { id: true, isRead: true, readAt: true },
    })
    if (!existing) {
      return response.status(404).json({ error: { message: 'Notification not found.' } })
    }
    if (!existing.isRead) {
      await notificationRepository.notification.updateMany({
        where: { ...where, isRead: false },
        data: { isRead: true, readAt: new Date() },
      })
    }
    const notification = await notificationRepository.notification.findFirst({
      where,
      select: notificationSelection,
    })
    return response.status(200).json({ notification })
  })

  return router
}
