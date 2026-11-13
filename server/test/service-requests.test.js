import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createAccessToken } from '../src/auth/jwt.js'
import { createApp } from '../src/app.js'
import { createEventRepository } from '../test-support/event-repository.js'

const jwtSecret = 'test-only-secret-that-is-never-used-outside-tests'
const adminId = 'cbdc0f80-d43a-4f2e-89ac-28686cfbdcb1'
const studentId = '1c6a5a70-c87d-48e1-a26d-d0c91232011e'
const otherStudentId = 'a4f5c817-a8d1-4a14-934e-7447d50b3e31'
const facultyId = '27ff8f5e-2bed-4ff5-bdc2-6af254e991f2'
const otherFacultyId = 'bb87531a-bbb7-4fe9-9b1c-51f27a8aeef7'
const coordinatorId = '6349ff9d-d7ba-4ec4-9973-61cc1e0f8b92'
const validInput = {
  category: 'IT_SUPPORT',
  priority: 'HIGH',
  title: 'Unable to access campus Wi-Fi',
  description: 'My account cannot connect to the campus wireless network.',
}

function createServiceRequestRepository(initialRequests = []) {
  const requests = new Map(initialRequests.map((item) => [item.id, { ...item }]))
  const notes = []
  function matches(request, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (key === 'category' || key === 'status' || key === 'studentId'
        || key === 'assignedToId' || key === 'id') return request[key] === value
      return true
    })
  }
  function project(request, select) {
    if (!request) return null
    const projected = { ...request }
    if (select?.student) projected.student = { id: request.studentId, name: 'Student', email: 'student@example.edu' }
    if (select?.assignedTo) {
      projected.assignedTo = request.assignedToId
        ? { id: request.assignedToId, name: 'Faculty', email: 'faculty@example.edu' }
        : null
    }
    if (select?.notes) {
      projected.notes = notes
        .filter((note) => note.serviceRequestId === request.id)
        .map((note) => ({
          ...note,
          author: {
            id: note.authorId,
            name: note.authorId === adminId ? 'Admin' : 'Faculty',
            role: note.authorId === adminId ? 'ADMIN' : 'FACULTY',
          },
        }))
    }
    return projected
  }

  const repository = {
    serviceRequest: {
      async findMany({ where, skip, take, select }) {
        return [...requests.values()].filter((item) => matches(item, where))
          .slice(skip, skip + take).map((item) => project(item, select))
      },
      async findFirst({ where, select }) {
        return project([...requests.values()].find((item) => matches(item, where)), select)
      },
      async create({ data, select }) {
        const request = {
          id: randomUUID(),
          ...data,
          status: 'SUBMITTED',
          createdAt: new Date(),
          updatedAt: new Date(),
          resolvedAt: null,
        }
        requests.set(request.id, request)
        return project(request, select)
      },
      async updateMany({ where, data }) {
        const request = requests.get(where.id)
        if (!request || (where.assignedToId && request.assignedToId !== where.assignedToId)) {
          return { count: 0 }
        }
        Object.assign(request, data, { updatedAt: new Date() })
        return { count: 1 }
      },
      async count({ where }) {
        return [...requests.values()].filter((item) => matches(item, where)).length
      },
    },
    serviceRequestNote: {
      async create({ data }) {
        const note = { id: randomUUID(), ...data, createdAt: new Date() }
        notes.push(note)
        return note
      },
    },
    async $transaction(callback) { return callback(repository) },
    requests,
    notes,
  }
  return repository
}

function createAcademicRepository() {
  const empty = {
    async findMany() { return [] },
    async findFirst() { return null },
    async findUnique() { return null },
    async create() { return null },
    async updateMany() { return { count: 0 } },
    async update() { return null },
    async count() { return 0 },
  }
  return {
    academicTerm: empty,
    course: empty,
    courseOffering: empty,
    enrollment: empty,
    assignment: empty,
    classSession: empty,
    attendanceRecord: empty,
    async $transaction(callback) { return callback(this) },
  }
}

async function startTestServer(t, { role = 'STUDENT', userId, authenticated = true, serviceRequestRepository } = {}) {
  const users = new Map([
    [adminId, { id: adminId, name: 'Admin', role: 'ADMIN' }],
    [studentId, { id: studentId, name: 'Student', role: 'STUDENT' }],
    [otherStudentId, { id: otherStudentId, name: 'Other Student', role: 'STUDENT' }],
    [facultyId, { id: facultyId, name: 'Faculty', role: 'FACULTY' }],
    [otherFacultyId, { id: otherFacultyId, name: 'Other Faculty', role: 'FACULTY' }],
    [coordinatorId, { id: coordinatorId, name: 'Coordinator', role: 'CLUB_COORDINATOR' }],
  ])
  const effectiveUserId = userId ?? ({
    ADMIN: adminId,
    FACULTY: facultyId,
    STUDENT: studentId,
    CLUB_COORDINATOR: coordinatorId,
  }[role])
  const userRepository = {
    async findUnique({ where }) { return users.get(where.id) ?? null },
    async create() { return null },
    async findMany() {
      return [...users.values()].filter((user) => user.role === 'FACULTY')
        .map(({ id, name, email = `${name.toLowerCase().replaceAll(' ', '.')}@example.edu` }) => ({ id, name, email }))
    },
  }
  const token = authenticated ? await createAccessToken(effectiveUserId, jwtSecret) : null
  const app = createApp({
    userRepository,
    academicRepository: createAcademicRepository(),
    eventRepository: createEventRepository(),
    serviceRequestRepository,
    jwtSecret,
  })
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  }))
  const address = server.address()
  return {
    request: (path, options = {}) => fetch(`http://127.0.0.1:${address.port}${path}`, {
      ...options,
      headers: {
        ...(token ? { cookie: `campusx_session=${token}` } : {}),
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...options.headers,
      },
    }),
  }
}

function seededRequest(overrides = {}) {
  return {
    id: 'b63278f2-aa57-478f-9d95-056f648c32bb',
    studentId,
    assignedToId: facultyId,
    category: 'IT_SUPPORT',
    priority: 'HIGH',
    status: 'SUBMITTED',
    title: validInput.title,
    description: validInput.description,
    createdAt: new Date(),
    updatedAt: new Date(),
    resolvedAt: null,
    ...overrides,
  }
}

test('requires authentication and applies student, faculty, and admin roles', async (t) => {
  const repository = createServiceRequestRepository()
  const anonymous = await startTestServer(t, { authenticated: false, serviceRequestRepository: repository })
  assert.equal((await anonymous.request('/api/service-requests/mine')).status, 401)

  const faculty = await startTestServer(t, { role: 'FACULTY', serviceRequestRepository: repository })
  assert.equal((await faculty.request('/api/service-requests/mine')).status, 403)
  assert.equal((await faculty.request('/api/service-requests', { method: 'POST', body: JSON.stringify(validInput) })).status, 403)

  const student = await startTestServer(t, { serviceRequestRepository: repository })
  assert.equal((await student.request('/api/service-requests')).status, 403)
  assert.equal((await student.request('/api/service-requests', {
    method: 'POST',
    body: JSON.stringify(validInput),
  })).status, 201)
})

test('validates request submissions and pagination filters', async (t) => {
  const server = await startTestServer(t, { serviceRequestRepository: createServiceRequestRepository() })
  assert.equal((await server.request('/api/service-requests', {
    method: 'POST',
    body: JSON.stringify({ ...validInput, category: 'UNKNOWN' }),
  })).status, 400)
  assert.equal((await server.request('/api/service-requests/mine?page=0')).status, 400)
  assert.equal((await server.request('/api/service-requests/mine?status=UNKNOWN')).status, 400)
})

test('students can only view their own requests and faculty only see assigned requests', async (t) => {
  const repository = createServiceRequestRepository([
    seededRequest(),
    seededRequest({
      id: randomUUID(),
      studentId: otherStudentId,
      assignedToId: otherFacultyId,
    }),
  ])
  const student = await startTestServer(t, { serviceRequestRepository: repository })
  assert.equal((await student.request(`/api/service-requests/${repository.requests.keys().next().value}`)).status, 200)
  const otherRequest = [...repository.requests.values()].find((item) => item.studentId === otherStudentId)
  assert.equal((await student.request(`/api/service-requests/${otherRequest.id}`)).status, 404)
  assert.equal((await student.request('/api/service-requests/not-a-uuid')).status, 400)

  const faculty = await startTestServer(t, { role: 'FACULTY', serviceRequestRepository: repository })
  const assigned = await faculty.request('/api/service-requests')
  assert.equal(assigned.status, 200)
  assert.equal((await assigned.json()).pagination.total, 1)
  assert.equal((await faculty.request(`/api/service-requests/${otherRequest.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'IN_PROGRESS' }),
  })).status, 404)
})

test('club coordinators cannot read service request details or private student information', async (t) => {
  const repository = createServiceRequestRepository([seededRequest({
    description: 'Private description that must not be disclosed.',
  })])
  const requestId = [...repository.requests.keys()][0]
  repository.notes.push({
    id: randomUUID(),
    serviceRequestId: requestId,
    authorId: adminId,
    type: 'PROGRESS',
    content: 'Private progress note that must not be disclosed.',
    createdAt: new Date(),
  })

  const coordinator = await startTestServer(t, {
    role: 'CLUB_COORDINATOR',
    serviceRequestRepository: repository,
  })
  const response = await coordinator.request(`/api/service-requests/${requestId}`)
  const responseBody = await response.text()

  assert.equal(response.status, 403)
  assert.doesNotMatch(responseBody, /Private description|Private progress note|student@example\.edu/)
})

test('admins can assign and filter requests; only faculty users may be assigned', async (t) => {
  const repository = createServiceRequestRepository([seededRequest()])
  const admin = await startTestServer(t, { role: 'ADMIN', serviceRequestRepository: repository })
  const requestId = [...repository.requests.keys()][0]
  const assigned = await admin.request(`/api/service-requests/${requestId}`, {
    method: 'PATCH',
    body: JSON.stringify({ assignedToId: otherFacultyId }),
  })
  assert.equal(assigned.status, 200)
  assert.equal((await assigned.json()).serviceRequest.assignedToId, otherFacultyId)
  assert.equal((await admin.request('/api/service-requests?category=ACADEMIC')).status, 200)
  assert.equal((await admin.request(`/api/service-requests/${requestId}`, {
    method: 'PATCH',
    body: JSON.stringify({ assignedToId: studentId }),
  })).status, 400)
})

test('faculty can update assigned request status and add progress and resolution notes', async (t) => {
  const repository = createServiceRequestRepository([seededRequest()])
  const faculty = await startTestServer(t, { role: 'FACULTY', serviceRequestRepository: repository })
  const requestId = [...repository.requests.keys()][0]
  const progress = await faculty.request(`/api/service-requests/${requestId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'IN_PROGRESS', note: 'I am investigating the network issue.' }),
  })
  assert.equal(progress.status, 200)
  assert.equal((await progress.json()).serviceRequest.notes[0].type, 'PROGRESS')

  assert.equal((await faculty.request(`/api/service-requests/${requestId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'RESOLVED' }),
  })).status, 400)
  const resolved = await faculty.request(`/api/service-requests/${requestId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'RESOLVED', note: 'Network access has been restored.' }),
  })
  const body = await resolved.json()
  assert.equal(resolved.status, 200)
  assert.equal(body.serviceRequest.status, 'RESOLVED')
  assert.ok(body.serviceRequest.resolvedAt)
  assert.equal(body.serviceRequest.notes[1].type, 'RESOLUTION')
})
