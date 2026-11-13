import { z } from 'zod'

const categories = ['ANNOUNCEMENT', 'EVENT', 'EVENT_REGISTRATION', 'SERVICE_REQUEST', 'ASSIGNMENT']

export const notificationIdSchema = z.string().uuid()

export const notificationListSchema = z.object({
  page: z.string().regex(/^[1-9]\d*$/).transform(Number)
    .pipe(z.number().int().max(1_000_000)).optional(),
  limit: z.string().regex(/^[1-9]\d*$/).transform(Number)
    .pipe(z.number().int().max(100)).optional(),
  category: z.enum(categories).optional(),
  unreadOnly: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
}).strict().transform(({ page, limit, ...filters }) => ({
  ...filters,
  page: page ?? 1,
  limit: limit ?? 20,
}))
