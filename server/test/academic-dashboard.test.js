import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAccessToken } from '../src/auth/jwt.js'
import { getKolkataDayBounds } from '../src/academic/dashboard.js'
import { createApp } from '../src/app.js'
import { createEventRepository } from '../test-support/event-repository.js'

const jwtSecret = 'test-only-secret-that-is-never-used-outside-tests'
const studentId = 'cbdc0f80-d43a-4f2e-89ac-28686cfbdcb1'
const activeTerm = {
  id: '60c8a9e3-300d-4433-b398-e509311b6e08',
  code: '2026-FALL',
  name: 'Fall Semester 2026',
}
const fixedNow = new Date('2026-10-28T19:00:00.000Z')

function createAcademicRepository({
  term = activeTerm,
  enrollments = [],
  assignments = [],
  classes = [],
  attendance = [],
} = {}) {
  const calls = []
  const record = (model, method, result) => async (query) => {
    calls.push({ model, method, query })
    return result
  }

  return {
    calls,
    academicTerm: {
      findFirst: record('academicTerm', 'findFirst', term),
      findMany: record('academicTerm', 'findMany', []),
      count: record('academicTerm', 'count', 0),
      create: record('academicTerm', 'create', null),
      findUnique: record('academicTerm', 'findUnique', null),
      updateMany: record('academicTerm', 'updateMany', { count: 0 }),
      update: record('academicTerm', 'update', null),
    },
    course: {
      findUnique: record('course', 'findUnique', null),
      create: record('course', 'create', null),
      findMany: record('course', 'findMany', []),
      count: record('course', 'count', 0),
    },
    courseOffering: {
      findUnique: record('courseOffering', 'findUnique', null),
      create: record('courseOffering', 'create', null),
      findMany: record('courseOffering', 'findMany', []),
      count: record('courseOffering', 'count', 0),
    },
    enrollment: {
      findMany: record('enrollment', 'findMany', enrollments),
      findUnique: record('enrollment', 'findUnique', null),
      create: record('enrollment', 'create', null),
      count: record('enrollment', 'count', 0),
    },
    assignment: {
      findMany: record('assignment', 'findMany', assignments),
      count: record('assignment', 'count', 0),
    },
    classSession: {
      findMany: record('classSession', 'findMany', classes),
      count: record('classSession', 'count', 0),
    },
    attendanceRecord: { findMany: record('attendanceRecord', 'findMany', attendance) },
    async $transaction(callback) { return callback(this) },
  }
}

async function startTestServer(t, {
  academicRepository = createAcademicRepository(),
  role = 'STUDENT',
  clock = () => fixedNow,
} = {}) {
  const user = { id: studentId, role }
  const userRepository = {
    async findUnique({ where }) {
      return where.id === studentId ? user : null
    },
    async create() {
      return user
    },
  }
  const token = await createAccessToken(studentId, jwtSecret)
  const server = createApp({
    userRepository,
    academicRepository,
    eventRepository: createEventRepository(),
    jwtSecret,
    clock,
  }).listen(0, '127.0.0.1')

  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  }))

  const address = server.address()
  return {
    academicRepository,
    request: (path, options = {}) => fetch(`http://127.0.0.1:${address.port}${path}`, {
      ...options,
      headers: {
        authorization: `Bearer ${token}`,
        ...options.headers,
      },
    }),
  }
}

test('rejects unauthenticated requests and denies non-student accounts', async (t) => {
  const { request } = await startTestServer(t)
  const unauthenticated = await request('/api/academic/dashboard', {
    headers: { authorization: '' },
  })
  assert.equal(unauthenticated.status, 401)

  const server = await startTestServer(t, { role: 'FACULTY' })
  const denied = await server.request('/api/academic/dashboard')
  assert.equal(denied.status, 403)
})

test('returns active-term dashboard data scoped to the authenticated student', async (t) => {
  const academicRepository = createAcademicRepository({
    enrollments: [
      { offering: { courseId: 'course-1' } },
      { offering: { courseId: 'course-1' } },
      { offering: { courseId: 'course-2' } },
    ],
    assignments: [{
      id: 'assignment-1',
      title: 'Project',
      description: null,
      dueAt: new Date('2026-10-30T12:00:00.000Z'),
      offering: {
        sectionCode: 'A',
        course: { code: 'CS101', title: 'Computer Science' },
      },
    }],
    classes: [{
      id: 'session-1',
      startsAt: new Date('2026-10-29T04:00:00.000Z'),
      endsAt: new Date('2026-10-29T05:30:00.000Z'),
      location: 'Room 1',
      offering: {
        sectionCode: 'A',
        course: { code: 'CS101', title: 'Computer Science' },
      },
    }],
    attendance: [
      { status: 'PRESENT' },
      { status: 'LATE' },
      { status: 'ABSENT' },
      { status: 'EXCUSED' },
    ],
  })
  const { request } = await startTestServer(t, { academicRepository })
  const response = await request('/api/academic/dashboard?studentId=00000000-0000-0000-0000-000000000000')

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const body = await response.json()
  assert.equal(body.term.id, activeTerm.id)
  assert.equal(body.enrolledCourseCount, 2)
  assert.equal(body.upcomingAssignments.length, 1)
  assert.equal(body.todaysClasses.length, 1)
  assert.equal(body.attendancePercentage, (2 / 3) * 100)

  const queries = Object.fromEntries(academicRepository.calls.map(({ model, query }) => [model, query]))
  assert.equal(queries.enrollment.where.studentId, studentId)
  assert.equal(queries.enrollment.where.status, 'ACTIVE')
  assert.equal(queries.enrollment.where.offering.is.termId, activeTerm.id)
  assert.equal(queries.assignment.where.status, 'PUBLISHED')
  assert.equal(queries.assignment.where.dueAt.gt, fixedNow)
  assert.equal(
    queries.assignment.where.offering.is.enrollments.some.studentId,
    studentId,
  )
  assert.equal(queries.assignment.where.offering.is.termId, activeTerm.id)
  assert.equal(queries.classSession.where.status, 'SCHEDULED')
  assert.equal(
    queries.classSession.where.offering.is.enrollments.some.studentId,
    studentId,
  )
  assert.equal(queries.classSession.where.offering.is.termId, activeTerm.id)
  assert.deepEqual(queries.attendanceRecord.where.studentId, studentId)
  assert.deepEqual(queries.attendanceRecord.where.status.in, ['PRESENT', 'ABSENT', 'LATE'])
  assert.equal(queries.attendanceRecord.where.enrollment.is.status, 'ACTIVE')
  assert.equal(queries.attendanceRecord.where.enrollment.is.offering.is.termId, activeTerm.id)
  assert.equal(queries.attendanceRecord.where.classSession.is.status, 'SCHEDULED')
})

test('returns zero courses and empty lists when the student has no active enrollments', async (t) => {
  const { request } = await startTestServer(t, {
    academicRepository: createAcademicRepository(),
  })
  const response = await request('/api/academic/dashboard')
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.enrolledCourseCount, 0)
  assert.deepEqual(body.upcomingAssignments, [])
  assert.deepEqual(body.todaysClasses, [])
  assert.equal(body.attendancePercentage, null)
})

test('returns empty academic data without an active term and skips academic queries', async (t) => {
  const academicRepository = createAcademicRepository({ term: null })
  const { request } = await startTestServer(t, { academicRepository })
  const response = await request('/api/academic/dashboard')

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    term: null,
    enrolledCourseCount: 0,
    upcomingAssignments: [],
    todaysClasses: [],
    attendancePercentage: null,
  })
  assert.deepEqual(academicRepository.calls.map(({ model }) => model), ['academicTerm'])
})

test('returns null attendance when there are no countable attendance records', async (t) => {
  const academicRepository = createAcademicRepository({ attendance: [] })
  const { request } = await startTestServer(t, { academicRepository })
  const response = await request('/api/academic/dashboard')
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.attendancePercentage, null)
})

test('uses Asia/Kolkata calendar-day bounds for the today schedule query', async (t) => {
  const { start, end } = getKolkataDayBounds(fixedNow)
  assert.equal(start.toISOString(), '2026-10-28T18:30:00.000Z')
  assert.equal(end.toISOString(), '2026-10-29T18:30:00.000Z')

  const academicRepository = createAcademicRepository()
  const { request } = await startTestServer(t, { academicRepository })
  await request('/api/academic/dashboard')

  const classQuery = academicRepository.calls.find(({ model }) => model === 'classSession').query
  assert.equal(classQuery.where.startsAt.gte.toISOString(), start.toISOString())
  assert.equal(classQuery.where.startsAt.lt.toISOString(), end.toISOString())
})
