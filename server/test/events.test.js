import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createAccessToken } from '../src/auth/jwt.js'
import { createApp } from '../src/app.js'

const jwtSecret = 'test-only-secret-that-is-never-used-outside-tests'
const adminId = 'cbdc0f80-d43a-4f2e-89ac-28686cfbdcb1'
const studentId = '1c6a5a70-c87d-48e1-a26d-d0c91232011e'
const coordinatorId = '27ff8f5e-2bed-4ff5-bdc2-6af254e991f2'
const now = new Date('2026-10-29T00:00:00.000Z')
const eventInput = {
  title: 'Campus Showcase',
  description: 'Student projects and performances.',
  venue: 'Main Hall',
  startsAt: '2030-10-30T10:00:00.000Z',
  endsAt: '2030-10-30T12:00:00.000Z',
  capacity: 2,
  registrationDeadline: '2030-10-29T10:00:00.000Z',
}

function prismaError(code) {
  const error = new Error(`Simulated Prisma ${code}`)
  error.code = code
  return error
}

function createEventRepository({ initialEvents = [], initialRegistrations = [], transactionError } = {}) {
  const events = new Map(initialEvents.map((event) => [event.id, { ...event }]))
  const registrations = [...initialRegistrations]

  function projectEvent(event, select, userId) {
    if (!select) return { ...event }
    const result = Object.fromEntries(
      Object.keys(select)
        .filter((key) => select[key] === true)
        .map((key) => [key, event[key]]),
    )
    if (select._count) {
      result._count = { registrations: registrations.filter((item) => item.eventId === event.id).length }
    }
    if (select.registrations) {
      const student = select.registrations.where?.studentId ?? userId
      result.registrations = registrations
        .filter((item) => item.eventId === event.id && (!student || item.studentId === student))
        .slice(0, select.registrations.take ?? undefined)
        .map(({ id }) => ({ id }))
    }
    return result
  }

  function matches(event, where = {}) {
    if (where.id && event.id !== where.id) return false
    if (where.createdById && event.createdById !== where.createdById) return false
    if (where.status && event.status !== where.status) return false
    if (where.startsAt?.gt && !(event.startsAt > where.startsAt.gt)) return false
    return true
  }

  const repository = {
    event: {
      async findMany({ where, select }) {
        return [...events.values()]
          .filter((event) => matches(event, where))
          .map((event) => projectEvent(event, select))
      },
      async findFirst({ where, select }) {
        const event = [...events.values()].find((item) => matches(item, where))
        return event ? projectEvent(event, select) : null
      },
      async findUnique({ where, select }) {
        const event = events.get(where.id)
        return event ? projectEvent(event, select) : null
      },
      async create({ data, select }) {
        const event = {
          id: randomUUID(),
          ...data,
          createdAt: now,
          updatedAt: now,
        }
        events.set(event.id, event)
        return projectEvent(event, select)
      },
      async update({ where, data, select }) {
        const event = events.get(where.id)
        Object.assign(event, data)
        return projectEvent(event, select)
      },
      async count({ where }) {
        return [...events.values()].filter((event) => matches(event, where)).length
      },
    },
    eventRegistration: {
      async count({ where }) {
        return registrations.filter((item) => item.eventId === where.eventId).length
      },
      async create({ data, select }) {
        if (registrations.some((item) => item.eventId === data.eventId && item.studentId === data.studentId)) {
          throw prismaError('P2002')
        }
        const registration = { id: randomUUID(), ...data, createdAt: now }
        registrations.push(registration)
        return projectEvent(registration, select)
      },
      async findMany({ where, select }) {
        return registrations
          .filter((item) => item.studentId === where.studentId)
          .map((registration) => ({
            ...projectEvent(registration, select),
            event: projectEvent(events.get(registration.eventId), select.event.select),
          }))
      },
      async findUnique({ where }) {
        const key = where.eventId_studentId
        const registration = registrations.find(
          (item) => item.eventId === key.eventId && item.studentId === key.studentId,
        )
        return registration ? { id: registration.id } : null
      },
      async deleteMany({ where }) {
        const remaining = registrations.filter(
          (item) => item.eventId !== where.eventId || item.studentId !== where.studentId,
        )
        const count = registrations.length - remaining.length
        registrations.splice(0, registrations.length, ...remaining)
        return { count }
      },
    },
    async $transaction(callback) {
      if (transactionError) throw transactionError
      return callback(repository)
    },
    events,
    registrations,
  }
  return repository
}

function createAcademicRepository() {
  const emptyModel = {
    async findMany() { return [] },
    async findFirst() { return null },
    async findUnique() { return null },
    async create() { return null },
    async updateMany() { return { count: 0 } },
    async update() { return null },
    async count() { return 0 },
  }
  return {
    academicTerm: emptyModel,
    course: emptyModel,
    courseOffering: emptyModel,
    enrollment: emptyModel,
    assignment: emptyModel,
    classSession: emptyModel,
    attendanceRecord: emptyModel,
    async $transaction(callback) { return callback(this) },
  }
}

async function startTestServer(t, {
  role = 'ADMIN',
  authenticated = true,
  eventRepository = createEventRepository(),
  userId = role === 'STUDENT' ? studentId : role === 'CLUB_COORDINATOR' ? coordinatorId : adminId,
} = {}) {
  const users = new Map([
    [adminId, { id: adminId, name: 'Admin', role: 'ADMIN', passwordHash: 'never-return-this' }],
    [studentId, { id: studentId, name: 'Student', role: 'STUDENT', passwordHash: 'never-return-this' }],
    [coordinatorId, { id: coordinatorId, name: 'Coordinator', role: 'CLUB_COORDINATOR', passwordHash: 'never-return-this' }],
  ])
  const userRepository = {
    async findUnique({ where }) { return users.get(where.id) ?? null },
    async create() { return null },
  }
  const token = authenticated ? await createAccessToken(userId, jwtSecret) : null
  const server = createApp({
    userRepository,
    academicRepository: createAcademicRepository(),
    eventRepository,
    jwtSecret,
    clock: () => now,
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
    eventRepository,
    request: (path, options = {}) => fetch(`http://127.0.0.1:${address.port}${path}`, {
      ...options,
      headers: {
        ...(token ? { cookie: 'campusx_session=' + token } : {}),
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...options.headers,
      },
    }),
  }
}

function publishedEvent(overrides = {}) {
  return {
    id: 'b63278f2-aa57-478f-9d95-056f648c32bb',
    ...eventInput,
    startsAt: new Date(eventInput.startsAt),
    endsAt: new Date(eventInput.endsAt),
    registrationDeadline: new Date(eventInput.registrationDeadline),
    status: 'PUBLISHED',
    createdById: adminId,
    ...overrides,
  }
}

test('requires authentication and restricts event management to ADMIN or CLUB_COORDINATOR', async (t) => {
  const anonymous = await startTestServer(t, { authenticated: false })
  assert.equal((await anonymous.request('/api/events')).status, 401)

  const student = await startTestServer(t, { role: 'STUDENT' })
  assert.equal((await student.request('/api/events', {
    method: 'POST',
    body: JSON.stringify(eventInput),
  })).status, 403)
  assert.equal((await student.request('/api/events/manage')).status, 403)

  const admin = await startTestServer(t)
  assert.equal((await admin.request('/api/events', {
    method: 'POST',
    body: JSON.stringify(eventInput),
  })).status, 201)
})

test('validates event data and always creates new events as drafts', async (t) => {
  const { request } = await startTestServer(t)
  const invalidTime = await request('/api/events', {
    method: 'POST',
    body: JSON.stringify({ ...eventInput, endsAt: eventInput.startsAt }),
  })
  assert.equal(invalidTime.status, 400)

  const extraField = await request('/api/events', {
    method: 'POST',
    body: JSON.stringify({ ...eventInput, studentId }),
  })
  assert.equal(extraField.status, 400)

  const created = await request('/api/events', {
    method: 'POST',
    body: JSON.stringify(eventInput),
  })
  assert.equal(created.status, 201)
  const body = await created.json()
  assert.equal(body.event.status, 'DRAFT')
  assert.equal(body.event.createdById, undefined)
  assert.equal(body.event.passwordHash, undefined)
})

test('coordinators can manage only their own events', async (t) => {
  const unrelatedEvent = publishedEvent()
  const repository = createEventRepository({ initialEvents: [unrelatedEvent] })
  const { request } = await startTestServer(t, {
    role: 'CLUB_COORDINATOR',
    eventRepository: repository,
  })

  const denied = await request(`/api/events/${unrelatedEvent.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title: 'Changed by another organizer' }),
  })
  assert.equal(denied.status, 404)

  const created = await request('/api/events', {
    method: 'POST',
    body: JSON.stringify(eventInput),
  })
  assert.equal(created.status, 201)
  const eventId = (await created.json()).event.id
  assert.equal(repository.events.get(eventId).createdById, coordinatorId)

  const updated = await request(`/api/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'PUBLISHED' }),
  })
  assert.equal(updated.status, 200)

  const managed = await request('/api/events/manage')
  assert.equal(managed.status, 200)
  const managedEvents = await managed.json()
  assert.equal(managedEvents.pagination.total, 1)
  assert.equal(managedEvents.items[0].id, eventId)
  assert.equal(managedEvents.items[0].status, 'PUBLISHED')
})

test('prevents student registration after deadline, at capacity, and when already registered', async (t) => {
  const event = publishedEvent()
  const fullRepository = createEventRepository({
    initialEvents: [event],
    initialRegistrations: [
      { id: randomUUID(), eventId: event.id, studentId: adminId },
      { id: randomUUID(), eventId: event.id, studentId: coordinatorId },
    ],
  })
  const fullServer = await startTestServer(t, { role: 'STUDENT', eventRepository: fullRepository })
  assert.equal((await fullServer.request(`/api/events/${event.id}/registrations`, { method: 'POST' })).status, 409)

  const registeredRepository = createEventRepository({
    initialEvents: [event],
    initialRegistrations: [{ id: randomUUID(), eventId: event.id, studentId }],
  })
  const registeredServer = await startTestServer(t, { role: 'STUDENT', eventRepository: registeredRepository })
  const duplicate = await registeredServer.request(`/api/events/${event.id}/registrations`, { method: 'POST' })
  assert.equal(duplicate.status, 409)
  assert.match((await duplicate.json()).error.message, /already registered/i)

  const expired = publishedEvent({ registrationDeadline: new Date('2026-10-28T00:00:00.000Z') })
  const deadlineServer = await startTestServer(t, {
    role: 'STUDENT',
    eventRepository: createEventRepository({ initialEvents: [expired] }),
  })
  assert.equal((await deadlineServer.request(`/api/events/${expired.id}/registrations`, { method: 'POST' })).status, 409)

  const unpublished = publishedEvent({ status: 'DRAFT' })
  const unpublishedServer = await startTestServer(t, {
    role: 'STUDENT',
    eventRepository: createEventRepository({ initialEvents: [unpublished] }),
  })
  assert.equal((await unpublishedServer.request('/api/events')).status, 200)
  assert.equal((await unpublishedServer.request(`/api/events/${unpublished.id}`)).status, 404)
  assert.equal((await unpublishedServer.request(`/api/events/${unpublished.id}/registrations`, { method: 'POST' })).status, 404)
})

test('students can register and cancel only their own registration without exposing user records', async (t) => {
  const event = publishedEvent({ capacity: 3 })
  const repository = createEventRepository({ initialEvents: [event] })
  const { request } = await startTestServer(t, { role: 'STUDENT', eventRepository: repository })
  const response = await request(`/api/events/${event.id}/registrations`, { method: 'POST' })
  assert.equal(response.status, 201)
  const body = await response.json()
  assert.equal(body.registration.studentId, studentId)
  assert.equal(body.registration.passwordHash, undefined)

  const visible = await request('/api/events')
  assert.equal(visible.status, 200)
  assert.equal((await visible.json()).items[0].isRegistered, true)

  const cancelled = await request(`/api/events/${event.id}/registrations/me`, { method: 'DELETE' })
  assert.equal(cancelled.status, 204)
  assert.equal(repository.registrations.length, 0)
})

test('maps serializable transaction conflicts to a retryable conflict response', async (t) => {
  const event = publishedEvent()
  const { request } = await startTestServer(t, {
    role: 'STUDENT',
    eventRepository: createEventRepository({
      initialEvents: [event],
      transactionError: prismaError('P2034'),
    }),
  })
  const response = await request(`/api/events/${event.id}/registrations`, { method: 'POST' })
  assert.equal(response.status, 409)
  assert.match((await response.json()).error.message, /retry/i)
})
