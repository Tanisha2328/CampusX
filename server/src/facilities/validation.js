import { z } from 'zod'

const timestamp = z.iso.datetime({ offset: true })

export const facilityIdSchema = z.string().uuid()

export const facilityCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  location: z.string().trim().min(2).max(200),
  capacity: z.number().int().min(1).max(10000),
}).strict()

export const facilityBookingCreateSchema = z.object({
  facilityId: z.string().uuid(),
  title: z.string().trim().min(3).max(150),
  purpose: z.string().trim().min(3).max(2000),
  startsAt: timestamp,
  endsAt: timestamp,
}).strict().superRefine(({ startsAt, endsAt }, context) => {
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    context.addIssue({ code: 'custom', path: ['endsAt'], message: 'End time must be after start time.' })
  }
})

export const facilityBookingDecisionSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
}).strict()

export const facilityAvailabilitySchema = z.object({
  startsAt: timestamp,
  endsAt: timestamp,
}).strict().refine(({ startsAt, endsAt }) => Date.parse(endsAt) > Date.parse(startsAt))
