import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createAccessToken } from '../src/auth/jwt.js'
import { createCertificatePdf } from '../src/certificates/pdf.js'
import { createApp } from '../src/app.js'

const jwtSecret = 'test-only-secret-that-is-never-used-outside-tests'
const adminId = 'cbdc0f80-d43a-4f2e-89ac-28686cfbdcb1'
const facultyId = '27ff8f5e-2bed-4ff5-bdc2-6af254e991f2'
const studentId = '1c6a5a70-c87d-48e1-a26d-d0c91232011e'
const facilityId = 'bb6c7506-43f9-4c54-aa60-1d5040a0a9db'
const sessionId = '7ee26f06-2af4-47f0-b624-22be0745a873'
const offeringId = '34f39ea4-68ce-493f-9f4f-72aa57442c67'
const now = new Date('2026-11-13T10:00:00.000Z')

const users = new Map([
  [adminId, { id: adminId, name: 'Admin User', role: 'ADMIN' }],
  [facultyId, { id: facultyId, name: 'Faculty User', role: 'FACULTY' }],
  [studentId, { id: studentId, name: 'Student User', role: 'STUDENT' }],
])

function createAcademicRepository() {
  const startsAt = new Date(now.getTime() + 5 * 60_000)
  const endsAt = new Date(now.getTime() + 65 * 60_000)
  const classSession = { id: sessionId, offeringId, startsAt, endsAt, status: 'SCHEDULED', location: 'Room 1' }
  const tokens = new Map()
  const records = []
  const emptyModel = {
    async findMany() { return [] },
    async findFirst() { return null },
    async findUnique() { return null },
    async create() { return null },
    async updateMany() { return { count: 0 } },
    async update() { return null },
    async count() { return 0 },
  }
  const repository = {
    academicTerm: emptyModel,
    course: emptyModel,
    courseOffering: emptyModel,
    enrollment: {
      ...emptyModel,
      async findUnique({ where }) {
        return where.studentId_offeringId.studentId === studentId
          && where.studentId_offeringId.offeringId === offeringId
          ? { id: randomUUID(), status: 'ACTIVE' }
          : null
      },
    },
    assignment: emptyModel,
    classSession: {
      ...emptyModel,
      async findUnique({ where }) {
        return where.id === sessionId ? classSession : null
      },
      async findMany() { return [classSession] },
    },
    attendanceQrToken: {
      async upsert({ create, update }) {
        tokens.set(classSession.id, { ...(tokens.get(classSession.id) ?? create), ...update, ...create })
      },
      async findUnique({ where }) {
        const token = [...tokens.values()].find((item) => item.tokenHash === where.tokenHash)
        return token ? {
          ...token,
          classSession: { ...classSession },
        } : null
      },
    },
    attendanceRecord: {
      async findMany() { return records },
      async findUnique({ where }) {
        const key = where.studentId_classSessionId
        return records.find((item) => item.studentId === key.studentId
          && item.classSessionId === key.classSessionId) ?? null
      },
      async create({ data }) {
        if (records.some((item) => item.studentId === data.studentId
          && item.classSessionId === data.classSessionId)) {
          const error = new Error('Unique attendance record')
          error.code = 'P2002'
          throw error
        }
        const record = { id: randomUUID(), ...data, status: data.status, recordedAt: now }
        records.push(record)
        return record
      },
    },
    async $transaction(callback) { return callback(repository) },
  }
  return repository
}

function createFacilityRepository() {
  const facility = { id: facilityId, name: 'Main Hall', location: 'North campus', capacity: 100, isActive: true }
  const bookings = []
  function overlaps(item, where) {
    if (where.id && (typeof where.id === 'string' ? item.id !== where.id : item.id === where.id.not)) return false
    if (where.facilityId && item.facilityId !== where.facilityId) return false
    if (where.requesterId && item.requesterId !== where.requesterId) return false
    if (typeof where.status === 'string' && item.status !== where.status) return false
    if (where.status?.in && !where.status.in.includes(item.status)) return false
    if (where.startsAt?.lt && item.startsAt >= where.startsAt.lt) return false
    if (where.endsAt?.gt && item.endsAt <= where.endsAt.gt) return false
    return true
  }
  const repository = {
    facility: {
      async findMany() { return [facility] },
      async findUnique({ where }) { return where.id === facility.id ? facility : null },
      async create() { return facility },
    },
    facilityBooking: {
      async findMany({ where = {} }) { return bookings.filter((item) => overlaps(item, where)) },
      async findFirst({ where = {} }) { return bookings.find((item) => overlaps(item, where)) ?? null },
      async create({ data }) {
        const booking = {
          id: randomUUID(),
          status: 'PENDING',
          ...data,
          facility,
          requester: { id: data.requesterId, name: users.get(data.requesterId).name },
          createdAt: now,
        }
        bookings.push(booking)
        return booking
      },
      async updateMany({ where, data }) {
        const booking = bookings.find((item) => item.id === where.id && item.status === where.status)
        if (!booking) return { count: 0 }
        Object.assign(booking, data)
        return { count: 1 }
      },
    },
    async $transaction(callback) { return callback(repository) },
  }
  return repository
}

function createEventRepository() {
  const model = {
    async findMany() { return [] },
    async findFirst() { return null },
    async findUnique() { return null },
    async create() { return null },
    async update() { return null },
    async count() { return 0 },
  }
  return {
    event: model,
    eventRegistration: {
      ...model,
      async deleteMany() { return { count: 0 } },
    },
    async $transaction(callback) { return callback(this) },
  }
}

async function startServer(t, { role = 'STUDENT', extra = {} } = {}) {
  const userId = role === 'ADMIN' ? adminId : role === 'FACULTY' ? facultyId : studentId
  const token = await createAccessToken(userId, jwtSecret)
  const app = createApp({
    userRepository: {
      async findUnique({ where }) { return users.get(where.id) ?? null },
      async create() { return null },
    },
    academicRepository: createAcademicRepository(),
    eventRepository: createEventRepository(),
    jwtSecret,
    clock: () => now,
    ...extra,
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
  return (path, options = {}) => fetch(`http://127.0.0.1:${address.port}${path}`, {
    ...options,
    headers: {
      cookie: `campusx_session=${token}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  })
}

test('facility bookings are authenticated, role-scoped, and reject overlapping slots', async (t) => {
  const facilityRepository = createFacilityRepository()
  const notifications = []
  const notificationRepository = {
    notification: {
      async create({ data }) { notifications.push(data) },
      async findMany() { return [] },
      async findFirst() { return null },
      async count() { return 0 },
      async updateMany() { return { count: 0 } },
    },
  }
  const request = await startServer(t, {
    extra: { facilityRepository, notificationRepository },
  })
  const startsAt = new Date(now.getTime() + 60 * 60_000).toISOString()
  const endsAt = new Date(now.getTime() + 2 * 60 * 60_000).toISOString()
  const booking = { facilityId, title: 'Club meeting', purpose: 'Plan the annual campus showcase.', startsAt, endsAt }

  const created = await request('/api/facilities/bookings', {
    method: 'POST',
    body: JSON.stringify(booking),
  })
  assert.equal(created.status, 201)
  const secondRequest = await request('/api/facilities/bookings', {
    method: 'POST',
    body: JSON.stringify(booking),
  })
  assert.equal(secondRequest.status, 409)

  const availability = await request(`/api/facilities/${facilityId}/availability?startsAt=${encodeURIComponent(startsAt)}&endsAt=${encodeURIComponent(endsAt)}`)
  assert.equal(availability.status, 200)
  assert.equal((await availability.json()).available, false)

  const adminQueue = await request('/api/facilities/bookings')
  assert.equal(adminQueue.status, 403)

  const auditLogs = []
  const adminRequest = await startServer(t, {
    role: 'ADMIN',
    extra: {
      facilityRepository,
      auditRepository: {
        auditLog: {
          async create({ data }) { auditLogs.push(data) },
          async findMany() { return [] },
          async count() { return 0 },
        },
      },
    },
  })
  const pending = await adminRequest('/api/facilities/bookings')
  assert.equal(pending.status, 200)
  const bookingId = (await pending.json()).items[0].id
  const approved = await adminRequest(`/api/facilities/bookings/${bookingId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'APPROVED' }),
  })
  assert.equal(approved.status, 200)
  assert.equal(auditLogs[0].action, 'FACILITY_BOOKING_APPROVED')

  const cancelled = await request(`/api/facilities/bookings/${bookingId}/cancel`, {
    method: 'POST',
  })
  assert.equal(cancelled.status, 204)
  assert.equal(notifications[0].category, 'FACILITY_BOOKING')

  const reopened = await request(`/api/facilities/${facilityId}/availability?startsAt=${encodeURIComponent(startsAt)}&endsAt=${encodeURIComponent(endsAt)}`)
  assert.equal((await reopened.json()).available, true)
})

test('attendance QR check-in requires active enrollment and prevents duplicate records', async (t) => {
  const academicRepository = createAcademicRepository()
  const request = await startServer(t, {
    role: 'STUDENT',
    extra: { academicRepository },
  })
  const forbidden = await request(`/api/attendance/sessions/${sessionId}/qr`, {
    method: 'POST',
  })
  assert.equal(forbidden.status, 403)

  const facultyRequest = await startServer(t, {
    role: 'FACULTY',
    extra: { academicRepository },
  })
  const createdQr = await facultyRequest(`/api/attendance/sessions/${sessionId}/qr`, { method: 'POST' })
  assert.equal(createdQr.status, 201)
  const { token } = await createdQr.json()

  const studentRequest = await startServer(t, {
    role: 'STUDENT',
    extra: { academicRepository },
  })
  const checkIn = await studentRequest('/api/attendance/scan', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
  assert.equal(checkIn.status, 201)

  const secondCheckIn = await studentRequest('/api/attendance/scan', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
  assert.equal(secondCheckIn.status, 409)
})

test('certificate PDFs are downloadable documents with verifiable certificate IDs', async () => {
  const pdf = createCertificatePdf({
    studentName: 'Campus Student',
    eventTitle: 'Campus Showcase',
    eventDate: 'November 13, 2026',
    certificateId: 'CX-0123456789ABCDEF0123456789ABCDEF',
  })
  assert.equal(pdf.subarray(0, 8).toString('ascii'), '%PDF-1.4')
  assert.ok(pdf.toString('ascii').includes('Campus Showcase'))
  assert.ok(pdf.toString('ascii').includes('CX-0123456789ABCDEF0123456789ABCDEF'))
})

test('certificate verification is public and returns the event and recipient', async (t) => {
  const certificateId = 'CX-0123456789ABCDEF0123456789ABCDEF'
  const certificateRepository = {
    eventCertificate: {
      async findMany() { return [] },
      async create() { return null },
      async findUnique({ where }) {
        if (where.certificateId !== certificateId) return null
        return {
          certificateId,
          issuedAt: now,
          event: { title: 'Campus Showcase', startsAt: now, endsAt: now },
          student: { name: 'Student User' },
        }
      },
    },
    eventRegistration: { async findUnique() { return null } },
  }
  const request = await startServer(t, { extra: { certificateRepository } })
  const response = await request(`/api/certificates/verify/${certificateId}`)
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.certificate.event.title, 'Campus Showcase')
  assert.equal(result.certificate.student.name, 'Student User')
  assert.equal((await request('/api/certificates/verify/not-a-certificate')).status, 400)
})

test('admin analytics reads real aggregate counts and denies students', async (t) => {
  const analyticsRepository = {
    user: { async count({ where }) { return where.role === 'STUDENT' ? 42 : 7 } },
    event: { async count() { return 9 } },
    eventRegistration: { async count() { return 18 } },
    attendanceRecord: {
      async count() { return 55 },
      async groupBy() { return [{ status: 'PRESENT', _count: { _all: 50 } }] },
    },
    serviceRequest: { async count() { return 2 } },
    facilityBooking: {
      async count() { return 3 },
      async groupBy() { return [{ status: 'APPROVED', _count: { _all: 3 } }] },
    },
  }
  const studentRequest = await startServer(t, {
    extra: { analyticsRepository },
  })
  assert.equal((await studentRequest('/api/admin/analytics')).status, 403)

  const adminRequest = await startServer(t, {
    role: 'ADMIN',
    extra: { analyticsRepository },
  })
  const response = await adminRequest('/api/admin/analytics')
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.students, 42)
  assert.equal(result.events, 9)
  assert.equal(result.attendanceByStatus.PRESENT, 50)
})
