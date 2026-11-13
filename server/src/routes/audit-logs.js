import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { authorizeRoles } from '../middleware/authorizeRoles.js'

const querySchema = z.object({
  page: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(1_000_000)).optional(),
  limit: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(100)).optional(),
}).strict().transform(({ page, limit }) => ({ page: page ?? 1, limit: limit ?? 50 }))

export default function auditLogsRouter({ userRepository, auditRepository, jwtSecret }) {
  if (!auditRepository?.auditLog?.findMany || !auditRepository.auditLog?.count) {
    throw new Error('An audit repository with auditLog.findMany() and count() is required.')
  }
  const router = Router()
  router.get('/', authenticate({ userRepository, jwtSecret }), authorizeRoles('ADMIN'), async (request, response) => {
    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) return response.status(400).json({ error: { message: 'Invalid audit log pagination.' } })
    const { page, limit } = parsed.data
    const where = {}
    const [items, total] = await Promise.all([
      auditRepository.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          details: true,
          createdAt: true,
          actor: { select: { id: true, name: true, role: true } },
        },
      }),
      auditRepository.auditLog.count({ where }),
    ])
    return response.status(200).json({
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  })
  return router
}
