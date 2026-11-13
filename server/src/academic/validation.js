import { z } from 'zod'

const calendarDateSchema = z.iso.date()
const timestampSchema = z.iso.datetime({ offset: true })

export const academicTermInputSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(100),
  startDate: calendarDateSchema,
  endDate: calendarDateSchema,
}).strict().superRefine(({ startDate, endDate }, context) => {
  if (endDate < startDate) {
    context.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: 'The term end date must be on or after its start date.',
    })
  }
})

export const academicTermIdSchema = z.string().uuid()

export const courseInputSchema = z.object({
  code: z.string().trim().min(1).max(50),
  title: z.string().trim().min(1).max(150),
  description: z.string().trim().max(2000).optional(),
}).strict()

export const courseOfferingInputSchema = z.object({
  termId: z.string().uuid(),
  courseId: z.string().uuid(),
  sectionCode: z.string().trim().min(1).max(50),
}).strict()

export const enrollmentInputSchema = z.union([
  z.object({
    studentId: z.string().uuid(),
    offeringId: z.string().uuid(),
  }).strict(),
  z.object({
    studentEmail: z.string().trim().email().transform((email) => email.toLowerCase()),
    offeringId: z.string().uuid(),
  }).strict(),
])

const paginationNumberSchema = z.string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().max(100))

export const paginationQuerySchema = z.object({
  page: z.string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().max(1_000_000))
    .optional(),
  limit: paginationNumberSchema.optional(),
}).strict().transform(({ page, limit }) => ({
  page: page ?? 1,
  limit: limit ?? 20,
}))

export const classSessionInputSchema = z.object({
  offeringId: z.string().uuid(),
  startsAt: timestampSchema,
  endsAt: timestampSchema,
  location: z.string().trim().max(200).nullable().optional(),
}).superRefine(({ startsAt, endsAt }, context) => {
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    context.addIssue({
      code: 'custom',
      path: ['endsAt'],
      message: 'The session end time must be after its start time.',
    })
  }
})

export class AcademicValidationError extends Error {
  constructor(message, statusCode) {
    super(message)
    this.name = 'AcademicValidationError'
    this.status = statusCode
  }
}

export async function validateAttendanceOwnership({
  studentId,
  classSessionId,
  enrollmentRepository,
  classSessionRepository,
}) {
  const classSession = await classSessionRepository.findUnique({
    where: { id: classSessionId },
    select: { id: true, offeringId: true },
  })

  if (!classSession) {
    throw new AcademicValidationError('Class session not found.', 404)
  }

  const enrollment = await enrollmentRepository.findUnique({
    where: {
      studentId_offeringId: {
        studentId,
        offeringId: classSession.offeringId,
      },
    },
    select: { id: true },
  })

  if (!enrollment) {
    throw new AcademicValidationError(
      'Student is not enrolled in the course offering for this session.',
      403,
    )
  }

  return { classSession, enrollment }
}
