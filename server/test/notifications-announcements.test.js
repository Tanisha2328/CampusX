import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createAccessToken } from '../src/auth/jwt.js'
import { createApp } from '../src/app.js'
import { deliverNotification } from '../src/notifications/delivery.js'
import { publishDueAnnouncements } from '../src/routes/announcements.js'

const jwtSecret = 'test-only-secret-that-is-never-used-outside-tests'
const adminId = 'cbdc0f80-d43a-4f2e-89ac-28686cfbdcb1'
const studentId = '1c6a5a70-c87d-48e1-a26d-d0c91232011e'
const facultyId = '27ff8f5e-2bed-4ff5-bdc2-6af254e991f2'
const coordinatorId = 'bb87531a-bbb7-4fe9-9b1c-51f27a8aeef7'
const otherStudentId = 'a4f5c817-a8d1-4a14-934e-7447d50b3e31'
const now = new Date('2026-11-02T00:00:00.000Z')

function createUsers() {
  return new Map([
    [adminId, { id: adminId, name: 'Admin', email: 'admin@example.edu', role: 'ADMIN' }],
    [studentId, { id: studentId, name: 'Student', email: 'student@example.edu', role: 'STUDENT' }],
    [facultyId, { id: facultyId, name: 'Faculty', email: 'faculty@example.edu', role: 'FACULTY' }],
    [coordinatorId, { id: coordinatorId, name: 'Coordinator', email: 'coordinator@example.edu', role: 'CLUB_COORDINATOR' }],
    [otherStudentId, { id: otherStudentId, name: 'Other Student', email: 'other@example.edu', role: 'STUDENT' }],
  ])
}

function createNotificationRepository(initial = []) {
  const notifications = new Map(initial.map((item) => [item.id, { ...item }]))
  function matches(item, where = {}) {
    return Object.entries(where).every(([key, value]) => item[key] === value)
  }
  function project(item, select) {
    if (!item) return null
    if (!select) return { ...item }
    return Object.fromEntries(
      Object.keys(select).filter((key) => select[key] === true).map((key) => [key, item[key]]),
    )
  }
  return {
    notification: {
      async create({ data }) {
        if ([...notifications.values()].some((item) => item.dedupeKey === data.dedupeKey)) {
          const error = new Error('Duplicate notification key.')
          error.code = 'P2002'
          throw error
        }
        const item = {
          id: randomUUID(),
          ...data,
          isRead: false,
          readAt: null,
          createdAt: now,
        }
        notifications.set(item.id, item)
        return { id: item.id }
      },
      async createMany({ data, skipDuplicates }) {
        let count = 0
        for (const notification of data) {
          if (skipDuplicates && [...notifications.values()].some(
            (item) => item.dedupeKey === notification.dedupeKey,
          )) continue
          const item = {
            id: randomUUID(),
            ...notification,
            isRead: false,
            readAt: null,
            createdAt: now,
          }
          notifications.set(item.id, item)
          count += 1
        }
        return { count }
      },
      async findMany({ where, skip = 0, take = 100, select }) {
        return [...notifications.values()]
          .filter((item) => matches(item, where))
          .sort((left, right) => right.createdAt - left.createdAt)
          .slice(skip, skip + take)
          .map((item) => project(item, select))
      },
      async findFirst({ where, select }) {
        return project([...notifications.values()].find((item) => matches(item, where)), select)
      },
      async count({ where }) {
        return [...notifications.values()].filter((item) => matches(item, where)).length
      },
      async updateMany({ where, data }) {
        let count = 0
        for (const item of notifications.values()) {
          if (!matches(item, where)) continue
          Object.assign(item, data)
          count += 1
        }
        return { count }
      },
    },
    notifications,
  }
}

function createEventRepository(users) {
  const events = new Map()
  const registrations = []
  function matches(event, where = {}) {
    if (!event) return false
    if (where.id && event.id !== where.id) return false
    if (where.createdById && event.createdById !== where.createdById) return false
    if (where.status && event.status !== where.status) return false
    if (where.startsAt?.gt && event.startsAt <= where.startsAt.gt) return false
    return true
  }
  function projectEvent(event, select) {
    if (!event) return null
    const output = select
      ? Object.fromEntries(Object.keys(select)
        .filter((key) => select[key] === true)
        .map((key) => [key, event[key]]))
      : { ...event }
    if (select?._count) {
      output._count = { registrations: registrations.filter((item) => item.eventId === event.id).length }
    }
    if (select?.registrations) {
      const student = select.registrations.where?.studentId
      output.registrations = registrations
        .filter((item) => item.eventId === event.id && (!student || item.studentId === student))
        .slice(0, select.registrations.take ?? undefined)
        .map((item) => ({ id: item.id }))
    }
    return output
  }
  const repository = {
    event: {
      async findMany({ where, select, skip = 0, take = 100 }) {
        return [...events.values()].filter((event) => matches(event, where))
          .slice(skip, skip + take).map((event) => projectEvent(event, select))
      },
      async findFirst({ where, select }) {
        return projectEvent([...events.values()].find((event) => matches(event, where)), select)
      },
      async findUnique({ where, select }) {
        return projectEvent(events.get(where.id), select)
      },
      async create({ data, select }) {
        const event = { id: randomUUID(), ...data, createdAt: now, updatedAt: now }
        events.set(event.id, event)
        return projectEvent(event, select)
      },
      async update({ where, data, select }) {
        const event = events.get(where.id)
        Object.assign(event, data, { updatedAt: now })
        return projectEvent(event, select)
      },
      async count({ where }) {
        return [...events.values()].filter((event) => matches(event, where)).length
      },
    },
    eventRegistration: {
      async count({ where }) { return registrations.filter((item) => item.eventId === where.eventId).length },
      async create({ data }) {
        const registration = { id: randomUUID(), ...data, createdAt: now }
        registrations.push(registration)
        return registration
      },
      async findMany({ where }) { return registrations.filter((item) => item.studentId === where.studentId) },
      async findUnique({ where }) {
        const key = where.eventId_studentId
        const item = registrations.find((registration) => (
          registration.eventId === key.eventId && registration.studentId === key.studentId
        ))
        return item ? { id: item.id } : null
      },
      async deleteMany({ where }) {
        const before = registrations.length
        for (let index = registrations.length - 1; index >= 0; index -= 1) {
          if (registrations[index].eventId === where.eventId
            && registrations[index].studentId === where.studentId) registrations.splice(index, 1)
        }
        return { count: before - registrations.length }
      },
    },
    async $transaction(callback) { return callback(repository) },
    events,
    registrations,
  }
  return repository
}

function createAnnouncementRepository(users, eventRepository) {
  const announcements = new Map()
  function matchesValue(actual, expected) {
    if (expected instanceof Date) return actual?.getTime() === expected.getTime()
    if (expected === null || typeof expected !== 'object') return actual === expected
    if (Object.hasOwn(expected, 'is')) return matches(actual, expected.is)
    if (Object.hasOwn(expected, 'gt') && !(actual > expected.gt)) return false
    if (Object.hasOwn(expected, 'lte') && !(actual <= expected.lte)) return false
    if (Object.hasOwn(expected, 'not') && actual === expected.not) return false
    return true
  }
  function matches(item, where = {}) {
    if (!item) return false
    return Object.entries(where).every(([key, value]) => {
      if (key === 'OR') return value.some((entry) => matches(item, entry))
      if (key === 'AND') return value.every((entry) => matches(item, entry))
      if (key === 'event') {
        const event = item.eventId ? eventRepository.events.get(item.eventId) : null
        return matchesValue(event, value)
      }
      return matchesValue(item[key], value)
    })
  }
  function project(item, select) {
    if (!item) return null
    const output = {
      ...item,
      createdBy: users.get(item.createdById),
      event: item.eventId ? eventRepository.events.get(item.eventId) ?? null : null,
    }
    if (!select) return output
    const selected = {}
    for (const [key, value] of Object.entries(select)) {
      if (value === true) selected[key] = output[key]
      if (key === 'createdBy' && value) selected.createdBy = {
        id: output.createdBy.id,
        name: output.createdBy.name,
      }
      if (key === 'event' && value) selected.event = output.event
        ? { id: output.event.id, title: output.event.title }
        : null
    }
    return selected
  }
  return {
    announcement: {
      async findMany({ where, select, skip = 0, take = 100 }) {
        return [...announcements.values()].filter((item) => matches(item, where))
          .slice(skip, skip + take).map((item) => project(item, select))
      },
      async findFirst({ where, select }) {
        return project([...announcements.values()].find((item) => matches(item, where)), select)
      },
      async create({ data, select }) {
        const item = {
          id: randomUUID(),
          ...data,
          createdAt: now,
          updatedAt: now,
        }
        announcements.set(item.id, item)
        return project(item, select)
      },
      async updateMany({ where, data }) {
        let count = 0
        for (const item of announcements.values()) {
          if (!matches(item, where)) continue
          Object.assign(item, data, { updatedAt: now })
          count += 1
        }
        return { count }
      },
      async count({ where }) {
        return [...announcements.values()].filter((item) => matches(item, where)).length
      },
    },
    announcements,
  }
}

function createServiceRequestRepository() {
  const requestId = 'b63278f2-aa57-478f-9d95-056f648c32bb'
  const requests = new Map([[requestId, {
    id: requestId,
    studentId,
    assignedToId: null,
    title: 'Campus Wi-Fi problem',
    description: 'Unable to connect to the campus wireless network.',
    category: 'IT_SUPPORT',
    priority: 'NORMAL',
    status: 'SUBMITTED',
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
  }]])
  const notes = []
  function matches(item, where = {}) {
    return Object.entries(where).every(([key, value]) => item[key] === value)
  }
  function project(item, select) {
    if (!item) return null
    const output = { ...item }
    if (select?.student) output.student = users.get(item.studentId)
    if (select?.assignedTo) output.assignedTo = item.assignedToId ? users.get(item.assignedToId) : null
    if (select?.notes) output.notes = notes.filter((note) => note.serviceRequestId === item.id)
      .map((note) => ({ ...note, author: users.get(note.authorId) }))
    return output
  }
  const users = createUsers()
  const repository = {
    serviceRequest: {
      async findMany({ where }) { return [...requests.values()].filter((item) => matches(item, where)) },
      async findFirst({ where, select }) {
        return project([...requests.values()].find((item) => matches(item, where)), select)
      },
      async create() { return null },
      async updateMany({ where, data }) {
        const item = requests.get(where.id)
        if (!item || !matches(item, where)) return { count: 0 }
        Object.assign(item, data, { updatedAt: now })
        return { count: 1 }
      },
      async count({ where }) { return [...requests.values()].filter((item) => matches(item, where)).length },
    },
    serviceRequestNote: {
      async create({ data }) {
        notes.push({ id: randomUUID(), ...data, createdAt: now })
      },
    },
    async $transaction(callback) { return callback(repository) },
    requests,
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

async function startServer(t, { role = 'STUDENT', clock = () => now, repositories = {} } = {}) {
  const users = repositories.users ?? createUsers()
  const userRepository = {
    async findUnique({ where }) { return users.get(where.id) ?? null },
    async create() { return null },
    async findMany({ where = {} } = {}) {
      return [...users.values()].filter((user) => {
        if (where.id?.not && user.id === where.id.not) return false
        if (where.role && user.role !== where.role) return false
        return true
      })
    },
  }
  const eventRepository = repositories.eventRepository ?? createEventRepository(users)
  const notificationRepository = repositories.notificationRepository ?? createNotificationRepository()
  const serviceRequestRepository = repositories.serviceRequestRepository ?? createServiceRequestRepository()
  const announcementRepository = repositories.announcementRepository
    ?? createAnnouncementRepository(users, eventRepository)
  const roleUser = [...users.values()].find((user) => user.role === role)
  const token = await createAccessToken(roleUser.id, jwtSecret)
  const app = createApp({
    userRepository,
    academicRepository: createAcademicRepository(),
    eventRepository,
    serviceRequestRepository,
    notificationRepository,
    announcementRepository,
    jwtSecret,
    clock,
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
    users,
    eventRepository,
    notificationRepository,
    serviceRequestRepository,
    announcementRepository,
    request: (path, options = {}) => fetch(`http://127.0.0.1:${address.port}${path}`, {
      ...options,
      headers: {
        cookie: `campusx_session=${token}`,
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...options.headers,
      },
    }),
  }
}

test('notification API enforces ownership and keeps unread counts accurate', async (t) => {
  const notifications = createNotificationRepository([
    {
      id: randomUUID(), recipientId: studentId, title: 'One', message: 'First',
      category: 'EVENT', relatedEntityId: null, relatedEntityType: null,
      isRead: false, readAt: null, dedupeKey: null, createdAt: now,
    },
    {
      id: randomUUID(), recipientId: studentId, title: 'Two', message: 'Second',
      category: 'ANNOUNCEMENT', relatedEntityId: null, relatedEntityType: null,
      isRead: false, readAt: null, dedupeKey: null, createdAt: now,
    },
    {
      id: randomUUID(), recipientId: otherStudentId, title: 'Private', message: 'Not yours',
      category: 'EVENT', relatedEntityId: null, relatedEntityType: null,
      isRead: false, readAt: null, dedupeKey: null, createdAt: now,
    },
  ])
  const server = await startServer(t, {
    role: 'STUDENT',
    repositories: { notificationRepository: notifications },
  })
  const listed = await server.request('/api/notifications?limit=1')
  assert.equal(listed.status, 200)
  assert.equal((await listed.json()).pagination.total, 2)
  assert.equal((await (await server.request('/api/notifications/unread-count')).json()).count, 2)

  const otherNotification = [...notifications.notifications.values()]
    .find((item) => item.recipientId === otherStudentId)
  assert.equal((await server.request(`/api/notifications/${otherNotification.id}/read`, {
    method: 'PATCH',
  })).status, 404)

  const ownNotification = [...notifications.notifications.values()]
    .find((item) => item.recipientId === studentId)
  assert.equal((await server.request(`/api/notifications/${ownNotification.id}/read`, {
    method: 'PATCH',
  })).status, 200)
  assert.equal((await (await server.request('/api/notifications/unread-count')).json()).count, 1)
  assert.equal((await server.request('/api/notifications/read-all', { method: 'PATCH' })).status, 200)
  assert.equal((await (await server.request('/api/notifications/unread-count')).json()).count, 0)
  assert.equal((await server.request('/api/notifications?page=0')).status, 400)
})

test('notification delivery is idempotent and tolerates duplicate keys', async () => {
  const repository = createNotificationRepository()
  const notification = {
    recipientId: studentId,
    title: 'Update',
    message: 'A new update.',
    category: 'ANNOUNCEMENT',
    relatedEntityId: null,
    relatedEntityType: null,
    dedupeKey: 'announcement:example:student',
  }
  await deliverNotification(repository, notification)
  await deliverNotification(repository, notification)
  assert.equal(repository.notifications.size, 1)
})

test('notification delivery retries idempotently and logs exhausted failures without throwing', async () => {
  const notification = {
    recipientId: studentId,
    title: 'Update',
    message: 'A new update.',
    category: 'ANNOUNCEMENT',
    relatedEntityId: null,
    relatedEntityType: null,
    dedupeKey: 'announcement:retry:student',
  }
  let attempts = 0
  let delivered = 0
  const repository = {
    notification: {
      async create() {
        attempts += 1
        if (attempts === 1) throw new Error('Temporary database failure.')
        delivered += 1
      },
    },
  }

  assert.equal(await deliverNotification(repository, notification), true)
  assert.equal(attempts, 2)
  assert.equal(delivered, 1)

  const committedRepository = createNotificationRepository()
  let committedAttempts = 0
  const ambiguousRepository = {
    notification: {
      async create({ data }) {
        committedAttempts += 1
        if (committedAttempts === 1) {
          await committedRepository.notification.create({ data })
          throw new Error('Connection lost after commit.')
        }
        return committedRepository.notification.create({ data })
      },
    },
  }
  assert.equal(await deliverNotification(ambiguousRepository, {
    ...notification,
    dedupeKey: 'announcement:committed-before-retry:student',
  }), true)
  assert.equal(committedAttempts, 2)
  assert.equal(committedRepository.notifications.size, 1)

  const errors = []
  const originalError = console.error
  console.error = (...args) => errors.push(args)
  try {
    const failed = await deliverNotification({
      notification: {
        async create() {
          throw new Error('Database unavailable.')
        },
      },
    }, { ...notification, dedupeKey: 'announcement:failure:student' })
    assert.equal(failed, false)
  } finally {
    console.error = originalError
  }
  assert.equal(errors.length, 1)
  assert.equal(errors[0][0], 'Notification delivery failed.')
  assert.equal(errors[0][1].attempts, 2)
})

test('admins publish announcements once; public reads exclude drafts and expired announcements', async (t) => {
  const admin = await startServer(t, { role: 'ADMIN' })
  const create = await admin.request('/api/announcements', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Library hours update',
      message: 'The library will open earlier next week.',
      category: 'GENERAL',
      priority: 'NORMAL',
    }),
  })
  assert.equal(create.status, 201)
  const draft = (await create.json()).announcement
  assert.equal(draft.status, 'DRAFT')
  assert.equal((await admin.request('/api/announcements')).status, 200)
  assert.equal((await admin.request(`/api/announcements/${draft.id}`)).status, 404)

  const publish = await admin.request(`/api/announcements/${draft.id}/publish`, { method: 'POST' })
  assert.equal(publish.status, 200)
  assert.equal((await publish.json()).announcement.status, 'PUBLISHED')
  assert.equal(admin.notificationRepository.notifications.size, 4)
  await admin.request(`/api/announcements/${draft.id}/publish`, { method: 'POST' })
  assert.equal(admin.notificationRepository.notifications.size, 4)

  const publicItems = await admin.request('/api/announcements?category=GENERAL')
  assert.equal((await publicItems.json()).pagination.total, 1)
  assert.equal((await admin.request('/api/announcements?category=INVALID')).status, 400)
})

test('admins can publish a future-scheduled announcement immediately or keep it scheduled', async (t) => {
  const futurePublishAt = '2026-11-03T00:00:00.000Z'
  const admin = await startServer(t, { role: 'ADMIN' })
  const createAnnouncement = async (title) => {
    const response = await admin.request('/api/announcements', {
      method: 'POST',
      body: JSON.stringify({
        title,
        message: 'A notice scheduled for a future date.',
        category: 'GENERAL',
        publishAt: futurePublishAt,
      }),
    })
    assert.equal(response.status, 201)
    return (await response.json()).announcement
  }

  const immediate = await createAnnouncement('Publish this now')
  assert.equal(immediate.status, 'SCHEDULED')
  const publishedResponse = await admin.request(`/api/announcements/${immediate.id}/publish`, {
    method: 'POST',
    body: JSON.stringify({ publishNow: true }),
  })
  assert.equal(publishedResponse.status, 200)
  const published = (await publishedResponse.json()).announcement
  assert.equal(published.status, 'PUBLISHED')
  assert.equal(published.publishAt, null)
  assert.ok(published.publishedAt)
  assert.equal((await admin.request(`/api/announcements/${immediate.id}`)).status, 200)

  const scheduled = await createAnnouncement('Keep this scheduled')
  const scheduledResponse = await admin.request(`/api/announcements/${scheduled.id}/publish`, {
    method: 'POST',
  })
  assert.equal(scheduledResponse.status, 200)
  const keptScheduled = (await scheduledResponse.json()).announcement
  assert.equal(keptScheduled.status, 'SCHEDULED')
  assert.equal(new Date(keptScheduled.publishAt).toISOString(), futurePublishAt)
  assert.equal((await admin.request(`/api/announcements/${scheduled.id}`)).status, 404)
})

test('club coordinators can only create event announcements tied to events they own', async (t) => {
  const admin = await startServer(t, { role: 'ADMIN' })
  const input = {
    title: 'Owner event notice',
    message: 'Details for this event are available here.',
    category: 'EVENTS',
  }
  const event = await admin.eventRepository.event.create({
    data: {
      title: 'Coordinator Event',
      description: 'Event description',
      venue: 'Hall',
      startsAt: new Date('2030-11-03T10:00:00.000Z'),
      endsAt: new Date('2030-11-03T12:00:00.000Z'),
      capacity: 50,
      registrationDeadline: new Date('2030-11-02T10:00:00.000Z'),
      status: 'PUBLISHED',
      createdById: coordinatorId,
    },
  })
  const coordinator = await startServer(t, {
    role: 'CLUB_COORDINATOR',
    repositories: {
      eventRepository: admin.eventRepository,
      notificationRepository: admin.notificationRepository,
      announcementRepository: admin.announcementRepository,
    },
  })
  const allowed = await coordinator.request('/api/announcements', {
    method: 'POST',
    body: JSON.stringify({ ...input, eventId: event.id }),
  })
  assert.equal(allowed.status, 201)
  assert.equal((await coordinator.request('/api/announcements', {
    method: 'POST',
    body: JSON.stringify({ ...input, eventId: randomUUID() }),
  })).status, 400)
  assert.equal((await coordinator.request('/api/announcements', {
    method: 'POST',
    body: JSON.stringify({ ...input, category: 'GENERAL' }),
  })).status, 403)

  const student = await startServer(t, {
    role: 'STUDENT',
    repositories: {
      eventRepository: admin.eventRepository,
      notificationRepository: admin.notificationRepository,
      announcementRepository: admin.announcementRepository,
    },
  })
  assert.equal((await student.request('/api/announcements', {
    method: 'POST',
    body: JSON.stringify({ ...input, eventId: event.id }),
  })).status, 403)
})

test('scheduled announcements publish at their date and notify campus users', async () => {
  const users = createUsers()
  const eventRepository = createEventRepository(users)
  const notificationRepository = createNotificationRepository()
  const announcementRepository = createAnnouncementRepository(users, eventRepository)
  const scheduledAt = new Date('2026-11-03T00:00:00.000Z')
  const item = await announcementRepository.announcement.create({
    data: {
      title: 'Scheduled notice',
      message: 'This announcement will be published later.',
      category: 'ACADEMIC',
      priority: 'HIGH',
      status: 'SCHEDULED',
      publishAt: scheduledAt,
      publishedAt: null,
      expiresAt: null,
      createdById: adminId,
      eventId: null,
    },
  })
  let time = new Date('2026-11-02T23:59:00.000Z')
  const options = {
    announcementRepository,
    notificationRepository,
    userRepository: {
      async findMany({ where }) {
        return [...users.values()].filter((user) => user.id !== where.id.not)
      },
    },
    clock: () => time,
  }
  await publishDueAnnouncements(options)
  assert.equal(notificationRepository.notifications.size, 0)
  time = new Date('2026-11-03T00:00:00.000Z')
  await publishDueAnnouncements(options)
  await publishDueAnnouncements(options)
  assert.equal((await announcementRepository.announcement.findFirst({
    where: { id: item.id },
  })).status, 'PUBLISHED')
  assert.equal(notificationRepository.notifications.size, 4)
})

test('event publication, event registration, and service request transitions notify the right users', async (t) => {
  const notificationRepository = createNotificationRepository()
  const admin = await startServer(t, {
    role: 'ADMIN',
    repositories: { notificationRepository },
  })
  const eventInput = {
    title: 'Campus event',
    description: 'A campus-wide event.',
    venue: 'Main Hall',
    startsAt: '2030-11-03T10:00:00.000Z',
    endsAt: '2030-11-03T12:00:00.000Z',
    capacity: 20,
    registrationDeadline: '2030-11-02T10:00:00.000Z',
    status: 'PUBLISHED',
  }
  const publishedEvent = await admin.request('/api/events', {
    method: 'POST',
    body: JSON.stringify(eventInput),
  })
  assert.equal(publishedEvent.status, 201)
  const eventId = (await publishedEvent.json()).event.id
  assert.equal(notificationRepository.notifications.size, 4)

  const student = await startServer(t, {
    role: 'STUDENT',
    repositories: {
      notificationRepository,
      eventRepository: admin.eventRepository,
      announcementRepository: admin.announcementRepository,
      serviceRequestRepository: admin.serviceRequestRepository,
    },
  })
  assert.equal((await student.request(`/api/events/${eventId}/registrations`, {
    method: 'POST',
  })).status, 201)
  assert.equal(notificationRepository.notifications.size, 5)

  const requestId = [...admin.serviceRequestRepository.requests.keys()][0]
  const assignmentUpdate = {
    assignedToId: facultyId,
    status: 'IN_PROGRESS',
    note: 'We are investigating the issue.',
  }
  assert.equal((await admin.request(`/api/service-requests/${requestId}`, {
    method: 'PATCH',
    body: JSON.stringify(assignmentUpdate),
  })).status, 200)
  assert.equal(notificationRepository.notifications.size, 7)
  await admin.request(`/api/service-requests/${requestId}`, {
    method: 'PATCH',
    body: JSON.stringify(assignmentUpdate),
  })
  assert.equal(notificationRepository.notifications.size, 7)

  assert.equal((await admin.request(`/api/service-requests/${requestId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'RESOLVED', note: 'The issue is resolved.' }),
  })).status, 200)
  assert.equal(notificationRepository.notifications.size, 8)
  const facultyNotifications = [...notificationRepository.notifications.values()]
    .filter((item) => item.recipientId === facultyId && item.category === 'SERVICE_REQUEST')
  assert.equal(facultyNotifications.length, 1)
  assert.match(facultyNotifications[0].title, /assigned/i)
})

test('faculty can publish general and academic announcements but not restricted categories', async (t) => {
  const admin = await startServer(t, { role: 'ADMIN' })
  const faculty = await startServer(t, {
    role: 'FACULTY',
    repositories: {
      eventRepository: admin.eventRepository,
      notificationRepository: admin.notificationRepository,
      announcementRepository: admin.announcementRepository,
    },
  })
  const allowed = await faculty.request('/api/announcements', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Academic update',
      message: 'A new academic calendar is available.',
      category: 'ACADEMIC',
    }),
  })
  assert.equal(allowed.status, 201)
  const announcement = (await allowed.json()).announcement
  assert.equal((await faculty.request(`/api/announcements/${announcement.id}/publish`, {
    method: 'POST',
  })).status, 200)

  const restricted = await faculty.request('/api/announcements', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Urgent update',
      message: 'This category is administrator controlled.',
      category: 'URGENT',
    }),
  })
  assert.equal(restricted.status, 403)
})
