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
const courseInput = { code: 'CS101', title: 'Introduction to Computing' }
const offeringInput = { termId, courseId, sectionCode: 'A' }
const enrollmentInput = { studentId, offeringId }

function prismaError(code) {
  const error = new Error(`Simulated Prisma ${code}`)
  error.code = code
  return error
}

function createAcademicRepository({
  term = { id: termId },
  course = { id: courseId },
  offering = { id: offeringId },
  courseCreateError,
  offeringCreateError,
  enrollmentCreateError,
} = {}) {
  const calls = []
  return {
    calls,
    academicTerm: {
      async findFirst() { return null },
      async findMany() { return [] },
      async count() { return 0 },
      async findUnique({ where }) {
        calls.push({ model: 'academicTerm', method: 'findUnique', where })
        return where.id === termId ? term : null
      },
      async create({ data }) { return { id: termId, ...data } },
      async updateMany() { return { count: 0 } },
      async update() { return null },
    },
    course: {
      async findUnique({ where }) {
        calls.push({ model: 'course', method: 'findUnique', where })
        return where.id === courseId ? course : null
      },
      async create({ data }) {
        calls.push({ model: 'course', method: 'create', data })
        if (courseCreateError) throw courseCreateError
        return { id: courseId, ...data }
      },
      async findMany() { return [] },
      async count() { return 0 },
    },
    courseOffering: {
      async findUnique({ where }) {
        calls.push({ model: 'courseOffering', method: 'findUnique', where })
        return where.id === offeringId ? offering : null
      },
      async create({ data }) {
        calls.push({ model: 'courseOffering', method: 'create', data })
        if (offeringCreateError) throw offeringCreateError
        return { id: offeringId, ...data }
      },
      async findMany() { return [] },
      async count() { return 0 },
    },
    enrollment: {
      async findMany() { return [] },
      async findUnique() { return null },
      async create({ data }) {
        calls.push({ model: 'enrollment', method: 'create', data })
        if (enrollmentCreateError) throw enrollmentCreateError
        return { id: 'enrollment-id', ...data }
      },
      async count() { return 0 },
    },
    assignment: { async findMany() { return [] }, async count() { return 0 } },
    classSession: { async findMany() { return [] }, async count() { return 0 } },
    attendanceRecord: { async findMany() { return [] } },
    async $transaction(callback) { return callback(this) },
  }
}

async function startTestServer(t, {
  role = 'ADMIN',
  authenticated = true,
  targetStudent = { id: studentId, role: 'STUDENT' },
  academicRepository = createAcademicRepository(),
} = {}) {
  const requester = { id: adminId, role }
  const userRepository = {
    async findUnique({ where }) {
      if (where.id === adminId) return requester
      if (where.id === studentId) return targetStudent
      if (where.email === 'student@example.edu') return targetStudent
      return null
    },
    async create() { return requester },
  }
  const token = authenticated ? await createAccessToken(adminId, jwtSecret) : null
  const server = createApp({
    userRepository,
    academicRepository,
    eventRepository: createEventRepository(),
    jwtSecret,
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
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    }),
  }
}

async function postJson(request, path, body) {
  return request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('requires authentication and ADMIN role on course, offering, and enrollment creation', async (t) => {
  const unauthenticated = await startTestServer(t, { authenticated: false })
  for (const [path, body] of [
    ['/api/academic/courses', courseInput],
    ['/api/academic/offerings', offeringInput],
    ['/api/academic/enrollments', enrollmentInput],
  ]) {
    assert.equal((await postJson(unauthenticated.request, path, body)).status, 401)
  }

  const student = await startTestServer(t, { role: 'STUDENT' })
  for (const [path, body] of [
    ['/api/academic/courses', courseInput],
    ['/api/academic/offerings', offeringInput],
    ['/api/academic/enrollments', enrollmentInput],
  ]) {
    assert.equal((await postJson(student.request, path, body)).status, 403)
  }
})

test('ADMIN creates validated courses and rejects unexpected fields', async (t) => {
  const { request, academicRepository } = await startTestServer(t)
  const response = await postJson(request, '/api/academic/courses', {
    ...courseInput,
    description: 'Core course',
  })

  assert.equal(response.status, 201)
  assert.deepEqual((await response.json()).course, {
    id: courseId,
    ...courseInput,
    description: 'Core course',
  })
  assert.deepEqual(academicRepository.calls.find(({ method }) => method === 'create').data, {
    ...courseInput,
    description: 'Core course',
  })

  for (const body of [
    { code: '', title: 'Valid title' },
    { code: 'CS102', title: ' ' },
    { ...courseInput, unexpected: true },
    { ...courseInput, userId: studentId },
  ]) {
    assert.equal((await postJson(request, '/api/academic/courses', body)).status, 400)
  }
})

test('returns conflict for duplicate course codes', async (t) => {
  const { request } = await startTestServer(t, {
    academicRepository: createAcademicRepository({ courseCreateError: prismaError('P2002') }),
  })
  assert.equal((await postJson(request, '/api/academic/courses', courseInput)).status, 409)
})

test('creates offerings only when both references exist and rejects invalid input', async (t) => {
  const { request, academicRepository } = await startTestServer(t)
  const created = await postJson(request, '/api/academic/offerings', offeringInput)
  assert.equal(created.status, 201)
  assert.deepEqual((await created.json()).offering, { id: offeringId, ...offeringInput })

  assert.equal((await postJson(request, '/api/academic/offerings', {
    ...offeringInput,
    sectionCode: ' ',
  })).status, 400)
  assert.equal((await postJson(request, '/api/academic/offerings', {
    ...offeringInput,
    termId: 'not-a-uuid',
  })).status, 400)
  assert.equal((await postJson(request, '/api/academic/offerings', {
    ...offeringInput,
    status: 'ACTIVE',
  })).status, 400)
  assert.equal(
    academicRepository.calls.filter(({ method }) => method === 'findUnique').length >= 2,
    true,
  )
})

test('returns 404 when an offering term or course does not exist', async (t) => {
  const missingTerm = await startTestServer(t, {
    academicRepository: createAcademicRepository({ term: null }),
  })
  assert.equal((await postJson(missingTerm.request, '/api/academic/offerings', offeringInput)).status, 404)

  const missingCourse = await startTestServer(t, {
    academicRepository: createAcademicRepository({ course: null }),
  })
  assert.equal((await postJson(missingCourse.request, '/api/academic/offerings', offeringInput)).status, 404)
})

test('returns conflict for duplicate offerings and missing-reference races', async (t) => {
  const duplicate = await startTestServer(t, {
    academicRepository: createAcademicRepository({ offeringCreateError: prismaError('P2002') }),
  })
  assert.equal((await postJson(duplicate.request, '/api/academic/offerings', offeringInput)).status, 409)

  const referenceDeleted = await startTestServer(t, {
    academicRepository: createAcademicRepository({ offeringCreateError: prismaError('P2003') }),
  })
  assert.equal((await postJson(referenceDeleted.request, '/api/academic/offerings', offeringInput)).status, 404)
})

test('enrolls only existing STUDENT users and offerings with ACTIVE status', async (t) => {
  const { request, academicRepository } = await startTestServer(t)
  const response = await postJson(request, '/api/academic/enrollments', enrollmentInput)

  assert.equal(response.status, 201)
  assert.deepEqual((await response.json()).enrollment, {
    id: 'enrollment-id',
    ...enrollmentInput,
    status: 'ACTIVE',
  })
  assert.deepEqual(academicRepository.calls.find(({ method }) => method === 'create').data, {
    ...enrollmentInput,
    status: 'ACTIVE',
  })

  const emailEnrollment = await postJson(request, '/api/academic/enrollments', {
    studentEmail: ' Student@Example.edu ',
    offeringId,
  })
  assert.equal(emailEnrollment.status, 201)
  assert.deepEqual((await emailEnrollment.json()).enrollment, {
    id: 'enrollment-id',
    studentId,
    offeringId,
    status: 'ACTIVE',
  })

  assert.equal((await postJson(request, '/api/academic/enrollments', {
    ...enrollmentInput,
    status: 'DROPPED',
  })).status, 400)
  assert.equal((await postJson(request, '/api/academic/enrollments', {
    ...enrollmentInput,
    studentId: 'invalid',
  })).status, 400)
  assert.equal((await postJson(request, '/api/academic/enrollments', {
    studentEmail: 'not-an-email',
    offeringId,
  })).status, 400)
})

test('returns 404 for missing users, non-students, and missing offerings', async (t) => {
  const missingStudent = await startTestServer(t, { targetStudent: null })
  assert.equal((await postJson(missingStudent.request, '/api/academic/enrollments', enrollmentInput)).status, 404)

  const nonStudent = await startTestServer(t, {
    targetStudent: { id: studentId, role: 'ADMIN' },
  })
  assert.equal((await postJson(nonStudent.request, '/api/academic/enrollments', enrollmentInput)).status, 404)

  const missingOffering = await startTestServer(t, {
    academicRepository: createAcademicRepository({ offering: null }),
  })
  assert.equal((await postJson(missingOffering.request, '/api/academic/enrollments', enrollmentInput)).status, 404)
})

test('returns conflict for duplicate enrollments and missing-reference races', async (t) => {
  const duplicate = await startTestServer(t, {
    academicRepository: createAcademicRepository({ enrollmentCreateError: prismaError('P2002') }),
  })
  assert.equal((await postJson(duplicate.request, '/api/academic/enrollments', enrollmentInput)).status, 409)

  const referenceDeleted = await startTestServer(t, {
    academicRepository: createAcademicRepository({ enrollmentCreateError: prismaError('P2003') }),
  })
  assert.equal((await postJson(referenceDeleted.request, '/api/academic/enrollments', enrollmentInput)).status, 404)
})
