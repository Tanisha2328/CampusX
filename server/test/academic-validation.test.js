import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AcademicValidationError,
  academicTermInputSchema,
  classSessionInputSchema,
  validateAttendanceOwnership,
} from '../src/academic/validation.js'

test('validates academic term calendar dates and date ordering', () => {
  const valid = academicTermInputSchema.safeParse({
    code: '2026-FALL',
    name: 'Fall Semester 2026',
    startDate: '2026-08-01',
    endDate: '2026-12-20',
  })
  const reversed = academicTermInputSchema.safeParse({
    code: '2026-FALL',
    name: 'Fall Semester 2026',
    startDate: '2026-12-20',
    endDate: '2026-08-01',
  })
  const invalidDate = academicTermInputSchema.safeParse({
    code: '2026-FALL',
    name: 'Fall Semester 2026',
    startDate: '2026-02-30',
    endDate: '2026-12-20',
  })

  assert.equal(valid.success, true)
  assert.equal(reversed.success, false)
  assert.equal(invalidDate.success, false)
})

test('validates class session timestamps and requires the end after the start', () => {
  const valid = classSessionInputSchema.safeParse({
    offeringId: '4d0a2ddf-4994-43c6-bc13-800b03e1f4b4',
    startsAt: '2026-10-28T09:00:00+05:30',
    endsAt: '2026-10-28T10:30:00+05:30',
  })
  const reversed = classSessionInputSchema.safeParse({
    offeringId: '4d0a2ddf-4994-43c6-bc13-800b03e1f4b4',
    startsAt: '2026-10-28T10:30:00+05:30',
    endsAt: '2026-10-28T09:00:00+05:30',
  })
  const missingOffset = classSessionInputSchema.safeParse({
    offeringId: '4d0a2ddf-4994-43c6-bc13-800b03e1f4b4',
    startsAt: '2026-10-28T09:00:00',
    endsAt: '2026-10-28T10:30:00',
  })
  const invalidDate = classSessionInputSchema.safeParse({
    offeringId: '4d0a2ddf-4994-43c6-bc13-800b03e1f4b4',
    startsAt: '2026-02-30T09:00:00+05:30',
    endsAt: '2026-03-01T10:30:00+05:30',
  })

  assert.equal(valid.success, true)
  assert.equal(reversed.success, false)
  assert.equal(missingOffset.success, false)
  assert.equal(invalidDate.success, false)
})

test('validates that the student is enrolled in the class session offering', async () => {
  const calls = []
  const classSessionRepository = {
    async findUnique(query) {
      calls.push(['session', query])
      return { id: query.where.id, offeringId: 'offering-1' }
    },
  }
  const enrollmentRepository = {
    async findUnique(query) {
      calls.push(['enrollment', query])
      return { id: 'enrollment-1' }
    },
  }

  const result = await validateAttendanceOwnership({
    studentId: 'student-1',
    classSessionId: 'session-1',
    enrollmentRepository,
    classSessionRepository,
  })

  assert.equal(result.classSession.offeringId, 'offering-1')
  assert.equal(calls[1][1].where.studentId_offeringId.studentId, 'student-1')
  assert.equal(calls[1][1].where.studentId_offeringId.offeringId, 'offering-1')
})

test('rejects attendance for a student without an enrollment', async () => {
  await assert.rejects(
    validateAttendanceOwnership({
      studentId: 'student-1',
      classSessionId: 'session-1',
      classSessionRepository: {
        async findUnique() {
          return { id: 'session-1', offeringId: 'offering-1' }
        },
      },
      enrollmentRepository: {
        async findUnique() {
          return null
        },
      },
    }),
    (error) => error instanceof AcademicValidationError && error.status === 403,
  )
})

test('reports missing class sessions during attendance validation', async () => {
  await assert.rejects(
    validateAttendanceOwnership({
      studentId: 'student-1',
      classSessionId: 'missing',
      classSessionRepository: {
        async findUnique() {
          return null
        },
      },
      enrollmentRepository: {
        async findUnique() {
          assert.fail('Enrollment lookup should not run when the session is missing.')
        },
      },
    }),
    (error) => error instanceof AcademicValidationError && error.status === 404,
  )
})
