import { z } from 'zod'

const categories = ['GENERAL', 'ACADEMIC', 'EVENTS', 'URGENT']
const priorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT']

const announcementFields = {
  title: z.string().trim().min(3).max(150),
  message: z.string().trim().min(1).max(5000),
  category: z.enum(categories),
  priority: z.enum(priorities).optional(),
  eventId: z.string().uuid().nullable().optional(),
  publishAt: z.iso.datetime({ offset: true }).nullable().optional(),
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
}

function validateDates({ publishAt, expiresAt }, context) {
  if (publishAt && expiresAt && Date.parse(expiresAt) <= Date.parse(publishAt)) {
    context.addIssue({
      code: 'custom',
      path: ['expiresAt'],
      message: 'The expiry time must be after the publication time.',
    })
  }
}

export const announcementIdSchema = z.string().uuid()

export const announcementPublishSchema = z.object({
  publishNow: z.boolean().optional(),
}).strict()

export const announcementCreateSchema = z.object(announcementFields)
  .strict()
  .superRefine(validateDates)

export const announcementUpdateSchema = z.object({
  ...Object.fromEntries(
    Object.entries(announcementFields).map(([field, schema]) => [
      field,
      field === 'priority' ? schema : schema.optional(),
    ]),
  ),
}).strict().superRefine((data, context) => {
  if (Object.keys(data).length === 0) {
    context.addIssue({ code: 'custom', message: 'At least one announcement field must be provided.' })
  }
  validateDates(data, context)
})

export const announcementListSchema = z.object({
  page: z.string().regex(/^[1-9]\d*$/).transform(Number)
    .pipe(z.number().int().max(1_000_000)).optional(),
  limit: z.string().regex(/^[1-9]\d*$/).transform(Number)
    .pipe(z.number().int().max(100)).optional(),
  category: z.enum(categories).optional(),
  status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']).optional(),
}).strict().transform(({ page, limit, ...filters }) => ({
  ...filters,
  page: page ?? 1,
  limit: limit ?? 20,
}))
