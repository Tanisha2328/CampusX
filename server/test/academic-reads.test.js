import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAccessToken } from '../src/auth/jwt.js'
import { createApp } from '../src/app.js'
import { createEventRepository } from '../test-support/event-repository.js'

const jwtSecret = 'test-only-secret-that-is-never-used-outside-tests'
const adminId = 'cbdc0f80-d43a-4f2e-89ac-28686cfbdcb1'
const studentId = '1c6a5a70-c87d-48e1-a26d-d0c91232011e'
const termId = '60c8a9e3-300d-4433-b398-e509311b6e08'
const courseId = '2aa69f03-7c5e-45c1-8f33-e6b1f02f42de'
const offeringId = 'dbbe9864-9ed8-428b-a9a9-141a73ba0182'

function createAcademicRepository() {
  const calls = []
  const recorded = (model, method, result) => async (query) => {
    calls.push({ model, method, query })
    return result
  }
  const offering = {
    id: offeringId,
    sectionCode: 'A',
    course: { id: courseId, code: 'CS101', title: 'Introduction to Computing' },
    term: { id: termId, code: '2026-FALL', name: 'Fall Semester 2026', isActive: true },
  }
  return {
    calls,
    academicTerm: {
      findFirst: recorded('academicTerm', 'findFirst', null),
      findMany: recorded('academicTerm', 'findMany', [{
        id: termId,
        code: '2026-FALL',
        name: 'Fall Semester 2026',
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-12-20T00:00:00.000Z'),
        isActive: true,
      }]),
      count: recorded('academicTerm', 'count', 1),
      findUnique: recorded('academicTerm', 'findUnique', null),
      create: recorded('academicTerm', 'create', null),
      updateMany: recorded('academicTerm', 'updateMany', { count: 0 }),
      update: recorded('academicTerm', 'update', null),
    },
    course: {
      findUnique: recorded('course', 'findUnique', null),
      create: recorded('course', 'create', null),
      findMany: recorded('course', 'findMany', [{
        id: courseId,
        code: 'CS101',
        title: 'Introduction to Computing',
        description: null,
        offerings: [{ id: offeringId, sectionCode: 'A', term: offering.term }],
      }]),
      count: recorded('course', 'count', 1),
    },
    courseOffering: {
      findUnique: recorded('courseOffering', 'findUnique', null),
      create: recorded('courseOffering', 'create', null),
      findMany: recorded('courseOffering', 'findMany', [{
        ...offering,
        _count: { enrollments: 1 },
      }]),
      count: recorded('courseOffering', 'count', 1),
    },
    enrollment: {
      findMany: recorded('enrollment', 'findMany', [{
        id: 'enrollment-id',
        status: 'ACTIVE',
        enrolledAt: new Date('2026-08-01T00:00:00.000Z'),
        student: { id: studentId, name: 'Test Student', email: 'student@example.edu' },
        offering,
      }]),
      findUnique: recorded('enrollment', 'findUnique', null),
      create: recorded('enrollment', 'create', null),
      count: recorded('enrollment', 'count', 1),
    },
    assignment: {
      findMany: recorded('assignment', 'findMany', []),
      count: recorded('assignment', 'count', 0),
    },
    classSession: {
      findMany: recorded('classSession', 'findMany', []),
      count: recorded('classSession', 'count', 0),
    },
    attendanceRecord: { findMany: recorded('attendanceRecord', 'findMany', []) },
    async $transaction(callback) { return callback(this) },
  }
}

async function startTestServer(t, { role = 'ADMIN', authenticated = true } = {}) {
  const user = { id: role === 'STUDENT' ? studentId : adminId, role }
  const userRepository = {
    async findUnique({ where }) {
      if (where.id === adminId) return { id: adminId, role: 'ADMIN' }
      if (where.id === studentId) return { id: studentId, name: 'Test Student', email: 'student@example.edu', role: 'STUDENT' }
      return null
    },
    async create() { return user },
  }
  const academicRepository = createAcademicRepository()
  const token = authenticated ? await createAccessToken(user.id, jwtSecret) : null
  const server = createApp({
    userRepository,
    academicRepository,
    eventRepository: createEventRepository(),
    jwtSecret,
    clock: () => new Date('2026-10-29T00:00:00.000Z'),
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
    request: (path) => fetch(`http://127.0.0.1:${address.port}${path}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  }
}

test('admin catalog read endpoints return nested details and safe enrollment profiles', async (t) => {
  const { request, academicRepository } = await startTestServer(t)

  const terms = await request('/api/academic/terms?page=1&limit=5')
  assert.equal(terms.status, 200)
  const termPage = await terms.json()
  assert.equal(termPage.items[0].code, '2026-FALL')
  assert.equal(termPage.items[0].isActive, true)
  assert.deepEqual(termPage.pagination, { page: 1, limit: 5, total: 1, totalPages: 1 })

  const courses = await request('/api/academic/courses?page=1&limit=5')
  assert.equal(courses.status, 200)
  const coursePage = await courses.json()
  assert.equal(coursePage.items[0].offerings[0].term.code, '2026-FALL')
  assert.deepEqual(coursePage.pagination, { page: 1, limit: 5, total: 1, totalPages: 1 })

  const offerings = await request('/api/academic/offerings')
  assert.equal(offerings.status, 200)
  const offeringPage = await offerings.json()
  assert.equal(offeringPage.items[0].course.code, 'CS101')
  assert.equal(offeringPage.items[0].term.code, '2026-FALL')
  assert.equal(offeringPage.items[0]._count.enrollments, 1)

  const enrollments = await request('/api/academic/enrollments')
  assert.equal(enrollments.status, 200)
  const enrollmentPage = await enrollments.json()
  assert.equal(enrollmentPage.items[0].student.email, 'student@example.edu')
  assert.equal(enrollmentPage.items[0].offering.course.code, 'CS101')
  assert.equal(JSON.stringify(enrollmentPage).includes('passwordHash'), false)

  const enrollmentCall = academicRepository.calls.find(
    ({ model, method }) => model === 'enrollment' && method === 'findMany',
  )
  assert.deepEqual(enrollmentCall.query.select.student, { select: { id: true, name: true, email: true } })
})

test('academic term listing is restricted to admins and rejects invalid pagination', async (t) => {
  const student = await startTestServer(t, { role: 'STUDENT' })
  assert.equal((await student.request('/api/academic/terms')).status, 403)

  const admin = await startTestServer(t)
  assert.equal((await admin.request('/api/academic/terms?page=0')).status, 400)
})

test('student read endpoints scope to authenticated active enrollments and active term', async (t) => {
  const { request, academicRepository } = await startTestServer(t, { role: 'STUDENT' })
  for (const route of ['/student/courses', '/student/timetable', '/student/assignments']) {
    const response = await request(`/api/academic${route}?page=2&limit=10`)
    assert.equal(response.status, 200)
    assert.deepEqual((await response.json()).pagination, {
      page: 2,
      limit: 10,
      total: route === '/student/courses' ? 1 : 0,
      totalPages: route === '/student/courses' ? 1 : 0,
    })
  }

  const queries = academicRepository.calls.filter(({ method }) => method === 'findMany')
  const studentCourses = queries.find(({ model }) => model === 'enrollment').query
  assert.equal(studentCourses.where.studentId, studentId)
  assert.equal(studentCourses.where.status, 'ACTIVE')
  assert.equal(studentCourses.where.offering.is.term.is.isActive, true)
  assert.equal(studentCourses.skip, 10)
  assert.equal(studentCourses.take, 10)

  const timetable = queries.find(({ model }) => model === 'classSession').query
  assert.equal(timetable.where.status, 'SCHEDULED')
  assert.equal(timetable.where.offering.is.enrollments.some.studentId, studentId)
  assert.equal(timetable.where.offering.is.enrollments.some.status, 'ACTIVE')
  assert.equal(timetable.where.offering.is.term.is.isActive, true)

  const assignments = queries.find(({ model }) => model === 'assignment').query
  assert.equal(assignments.where.status, 'PUBLISHED')
  assert.equal(assignments.where.offering.is.enrollments.some.studentId, studentId)
  assert.equal(assignments.where.offering.is.enrollments.some.status, 'ACTIVE')
  assert.equal(assignments.where.offering.is.term.is.isActive, true)
})

test('student endpoints reject invalid pagination and do not accept client student IDs', async (t) => {
  const { request, academicRepository } = await startTestServer(t, { role: 'STUDENT' })

  assert.equal((await request('/api/academic/student/courses?page=0')).status, 400)
  assert.equal((await request('/api/academic/student/timetable?limit=101')).status, 400)
  assert.equal((await request(`/api/academic/student/assignments?studentId=${studentId}`)).status, 400)
  assert.equal(academicRepository.calls.some(({ method }) => method === 'findMany'), false)
})

test('admin endpoints require ADMIN and student endpoints require STUDENT', async (t) => {
  const unauthenticated = await startTestServer(t, { authenticated: false })
  assert.equal((await unauthenticated.request('/api/academic/courses')).status, 401)
  assert.equal((await unauthenticated.request('/api/academic/student/courses')).status, 401)

  const student = await startTestServer(t, { role: 'STUDENT' })
  assert.equal((await student.request('/api/academic/courses')).status, 403)

  const admin = await startTestServer(t)
  assert.equal((await admin.request('/api/academic/student/courses')).status, 403)
})
