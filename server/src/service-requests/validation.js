import { z } from 'zod'

export const serviceRequestCategories = [
  'FACILITIES',
  'IT_SUPPORT',
  'ACADEMIC',
  'FINANCIAL',
  'LIBRARY',
  'OTHER',
]

const priorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT']
const statuses = ['SUBMITTED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED']

export const serviceRequestIdSchema = z.string().uuid()

export const serviceRequestCreateSchema = z.object({
  category: z.enum(serviceRequestCategories),
  priority: z.enum(priorities).optional(),
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10).max(5000),
}).strict()

export const serviceRequestUpdateSchema = z.object({
  status: z.enum(statuses).optional(),
  assignedToId: z.union([z.string().uuid(), z.null()]).optional(),
  note: z.string().trim().min(1).max(2000).optional(),
}).strict().superRefine((data, context) => {
  if (Object.keys(data).length === 0) {
    context.addIssue({ code: 'custom', message: 'At least one update must be provided.' })
  }
  if (['RESOLVED', 'REJECTED'].includes(data.status) && !data.note) {
    context.addIssue({
      code: 'custom',
      path: ['note'],
      message: 'A resolution note is required when resolving or rejecting a request.',
    })
  }
})

export const serviceRequestListSchema = z.object({
  page: z.string().regex(/^[1-9]\d*$/).transform(Number)
    .pipe(z.number().int().max(1_000_000)).optional(),
  limit: z.string().regex(/^[1-9]\d*$/).transform(Number)
    .pipe(z.number().int().max(100)).optional(),
  category: z.enum(serviceRequestCategories).optional(),
  status: z.enum(statuses).optional(),
}).strict().transform(({ page, limit, ...filters }) => ({
  ...filters,
  page: page ?? 1,
  limit: limit ?? 20,
}))
