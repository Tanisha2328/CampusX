import { z } from 'zod'

const eventFields = {
  title: z.string().trim().min(1).max(150),
  description: z.string().trim().max(5000).nullable().optional(),
  venue: z.string().trim().min(1).max(200),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  capacity: z.number().int().min(1).max(10000),
  registrationDeadline: z.iso.datetime({ offset: true }),
}

function validateEventTimes({ startsAt, endsAt, registrationDeadline }, context) {
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    context.addIssue({
      code: 'custom',
      path: ['endsAt'],
      message: 'The event end time must be after its start time.',
    })
  }

  if (Date.parse(registrationDeadline) > Date.parse(startsAt)) {
    context.addIssue({
      code: 'custom',
      path: ['registrationDeadline'],
      message: 'The registration deadline must be on or before the event start time.',
    })
  }
}

export const eventIdSchema = z.string().uuid()

export const eventCreateSchema = z.object({
  ...eventFields,
  status: z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED']).optional(),
}).strict().superRefine(validateEventTimes)

export const eventUpdateSchema = z.object({
  ...Object.fromEntries(
    Object.entries(eventFields).map(([field, schema]) => [field, schema.optional()]),
  ),
  status: z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED']).optional(),
}).strict().superRefine((data, context) => {
  if (Object.keys(data).length === 0) {
    context.addIssue({
      code: 'custom',
      message: 'At least one event field must be provided.',
    })
  }

  if (data.startsAt && data.endsAt && Date.parse(data.endsAt) <= Date.parse(data.startsAt)) {
    context.addIssue({
      code: 'custom',
      path: ['endsAt'],
      message: 'The event end time must be after its start time.',
    })
  }

  if (data.registrationDeadline && data.startsAt
    && Date.parse(data.registrationDeadline) > Date.parse(data.startsAt)) {
    context.addIssue({
      code: 'custom',
      path: ['registrationDeadline'],
      message: 'The registration deadline must be on or before the event start time.',
    })
  }
})

export const eventPaginationSchema = z.object({
  page: z.string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().max(1_000_000))
    .optional(),
  limit: z.string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().max(100))
    .optional(),
}).strict().transform(({ page, limit }) => ({
  page: page ?? 1,
  limit: limit ?? 20,
}))
