import { Router } from 'express'
import {
  serviceRequestCreateSchema,
  serviceRequestIdSchema,
  serviceRequestListSchema,
  serviceRequestUpdateSchema,
} from '../service-requests/validation.js'
import { authenticate } from '../middleware/authenticate.js'
import { authorizeRoles } from '../middleware/authorizeRoles.js'
import { deliverNotification } from '../notifications/delivery.js'

const requestSelection = {
  id: true,
  studentId: true,
  assignedToId: true,
  category: true,
  priority: true,
  status: true,
  title: true,
  description: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
  student: { select: { id: true, name: true, email: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  notes: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      type: true,
      content: true,
      createdAt: true,
      author: { select: { id: true, name: true, role: true } },
    },
  },
}

function assertRepository(repository) {
  if (!['findMany', 'findFirst', 'create', 'updateMany', 'count'].every(
    (method) => typeof repository?.serviceRequest?.[method] === 'function',
  ) || typeof repository?.serviceRequestNote?.create !== 'function'
    || typeof repository?.$transaction !== 'function') {
    throw new Error('A service request repository with serviceRequest, serviceRequestNote, and $transaction is required.')
  }
}

function parsePagination(request, response) {
  const parsed = serviceRequestListSchema.safeParse(request.query)
  if (!parsed.success) {
    response.status(400).json({ error: { message: 'Invalid service request filters or pagination.' } })
    return null
  }
  return {
    ...parsed.data,
    skip: (parsed.data.page - 1) * parsed.data.limit,
  }
}

function pageResult(items, total, { page, limit }) {
  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }
}

function visibilityWhere(user) {
  if (user.role === 'STUDENT') return { studentId: user.id }
  if (user.role === 'FACULTY') return { assignedToId: user.id }
  return {}
}

export default function serviceRequestsRouter({
  userRepository,
  serviceRequestRepository,
  notificationRepository,
  jwtSecret,
}) {
  assertRepository(serviceRequestRepository)
  const router = Router()
  const requireAuthentication = authenticate({ userRepository, jwtSecret })
  const requireStudent = authorizeRoles('STUDENT')
  const requireFaculty = authorizeRoles('FACULTY')
  const requireAdmin = authorizeRoles('ADMIN')
  const requireStaff = authorizeRoles('ADMIN', 'FACULTY')
  const requireDetailViewer = authorizeRoles('STUDENT', 'FACULTY', 'ADMIN')

  router.get('/assignees', requireAuthentication, requireAdmin, async (_request, response) => {
    const users = await userRepository.findMany({
      where: { role: 'FACULTY' },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, email: true },
    })
    return response.status(200).json({ items: users })
  })

  router.get('/', requireAuthentication, requireStaff, async (request, response) => {
    const pagination = parsePagination(request, response)
    if (!pagination) return

    const where = {
      ...visibilityWhere(request.user),
      ...(pagination.category ? { category: pagination.category } : {}),
      ...(pagination.status ? { status: pagination.status } : {}),
    }
    const [items, total] = await Promise.all([
      serviceRequestRepository.serviceRequest.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select: requestSelection,
      }),
      serviceRequestRepository.serviceRequest.count({ where }),
    ])
    return response.status(200).json({ ...pageResult(items, total, pagination) })
  })

  router.get('/mine', requireAuthentication, requireStudent, async (request, response) => {
    const pagination = parsePagination(request, response)
    if (!pagination) return

    const where = {
      studentId: request.user.id,
      ...(pagination.category ? { category: pagination.category } : {}),
      ...(pagination.status ? { status: pagination.status } : {}),
    }
    const [items, total] = await Promise.all([
      serviceRequestRepository.serviceRequest.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select: requestSelection,
      }),
      serviceRequestRepository.serviceRequest.count({ where }),
    ])
    return response.status(200).json(pageResult(items, total, pagination))
  })

  router.post('/', requireAuthentication, requireStudent, async (request, response) => {
    const parsed = serviceRequestCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      return response.status(400).json({ error: { message: 'Invalid service request details.' } })
    }
    const serviceRequest = await serviceRequestRepository.serviceRequest.create({
      data: { ...parsed.data, studentId: request.user.id },
      select: requestSelection,
    })
    return response.status(201).json({ serviceRequest })
  })

  router.get('/:id', requireAuthentication, requireDetailViewer, async (request, response) => {
    const parsedId = serviceRequestIdSchema.safeParse(request.params.id)
    if (!parsedId.success) {
      return response.status(400).json({ error: { message: 'Invalid service request ID.' } })
    }
    const serviceRequest = await serviceRequestRepository.serviceRequest.findFirst({
      where: { id: parsedId.data, ...visibilityWhere(request.user) },
      select: requestSelection,
    })
    if (!serviceRequest) {
      return response.status(404).json({ error: { message: 'Service request not found.' } })
    }
    return response.status(200).json({ serviceRequest })
  })

  router.patch('/:id', requireAuthentication, requireStaff, async (request, response) => {
    const parsedId = serviceRequestIdSchema.safeParse(request.params.id)
    const parsed = serviceRequestUpdateSchema.safeParse(request.body)
    if (!parsedId.success || !parsed.success) {
      return response.status(400).json({ error: { message: 'Invalid service request update.' } })
    }
    if (request.user.role === 'FACULTY') {
      if (parsed.data.assignedToId !== undefined
        || (parsed.data.status && !['IN_PROGRESS', 'RESOLVED'].includes(parsed.data.status))) {
        return response.status(403).json({ error: { message: 'Faculty may only update the status and notes of assigned requests.' } })
      }
    }

    const current = await serviceRequestRepository.serviceRequest.findFirst({
      where: {
        id: parsedId.data,
        ...(request.user.role === 'FACULTY' ? { assignedToId: request.user.id } : {}),
      },
      select: {
        id: true,
        status: true,
        assignedToId: true,
        studentId: true,
        title: true,
        updatedAt: true,
      },
    })
    if (!current) {
      return response.status(404).json({ error: { message: 'Service request not found.' } })
    }

    if (request.user.role === 'ADMIN' && parsed.data.assignedToId) {
      const assignee = await userRepository.findUnique({
        where: { id: parsed.data.assignedToId },
        select: { id: true, role: true },
      })
      if (!assignee || assignee.role !== 'FACULTY') {
        return response.status(400).json({ error: { message: 'Assignee must be an existing faculty member.' } })
      }
    }

    const { note, ...changes } = parsed.data
    const updateData = { ...changes }
    if (changes.status === 'RESOLVED' || changes.status === 'REJECTED') {
      updateData.resolvedAt = new Date()
    } else if (changes.status) {
      updateData.resolvedAt = null
    }
    const updated = await serviceRequestRepository.$transaction(async (transaction) => {
      const updateResult = await transaction.serviceRequest.updateMany({
        where: {
          id: parsedId.data,
          status: current.status,
          assignedToId: current.assignedToId,
          ...(request.user.role === 'FACULTY' ? { assignedToId: request.user.id } : {}),
        },
        data: updateData,
      })
      if (updateResult.count === 0) return null
      if (note) {
        await transaction.serviceRequestNote.create({
          data: {
            serviceRequestId: parsedId.data,
            authorId: request.user.id,
            type: ['RESOLVED', 'REJECTED'].includes(changes.status ?? current.status)
              ? 'RESOLUTION'
              : 'PROGRESS',
            content: note,
          },
        })
      }
      return transaction.serviceRequest.findFirst({
        where: { id: parsedId.data },
        select: requestSelection,
      })
    })
    if (!updated) {
      return response.status(404).json({ error: { message: 'Service request not found.' } })
    }
    if (changes.assignedToId && changes.assignedToId !== current.assignedToId) {
      await deliverNotification(notificationRepository, {
        recipientId: changes.assignedToId,
        title: 'Service request assigned to you',
        message: current.title,
        category: 'SERVICE_REQUEST',
        relatedEntityId: parsedId.data,
        relatedEntityType: 'SERVICE_REQUEST',
        dedupeKey: `service-request:${parsedId.data}:assigned:${changes.assignedToId}:${current.updatedAt.toISOString()}`,
      })
    }
    if (changes.status && changes.status !== current.status) {
      const isResolved = changes.status === 'RESOLVED'
      await deliverNotification(notificationRepository, {
        recipientId: current.studentId,
        title: isResolved ? 'Service request resolved' : 'Service request status updated',
        message: `${current.title}: ${changes.status.toLowerCase().replaceAll('_', ' ')}.`,
        category: 'SERVICE_REQUEST',
        relatedEntityId: parsedId.data,
        relatedEntityType: 'SERVICE_REQUEST',
        dedupeKey: `service-request:${parsedId.data}:status:${changes.status}:${current.updatedAt.toISOString()}`,
      })
    }
    return response.status(200).json({ serviceRequest: updated })
  })

  return router
}
