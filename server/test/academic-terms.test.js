import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createAccessToken } from '../src/auth/jwt.js'
import { createApp } from '../src/app.js'
import { createEventRepository } from '../test-support/event-repository.js'

const jwtSecret = 'test-only-secret-that-is-never-used-outside-tests'
const adminId = 'cbdc0f80-d43a-4f2e-89ac-28686cfbdcb1'
const otherTermId = '60c8a9e3-300d-4433-b398-e509311b6e08'
const input = {
  code: '2026-FALL',
  name: 'Fall Semester 2026',
  startDate: '2026-08-01',
  endDate: '2026-12-20',
}

function createAcademicRepository({ initialTerms = [], transactionError } = {}) {
  const terms = new Map(initialTerms.map((term) => [term.id, { ...term }]))
  const calls = []

  const academicTerm = {
    async findMany({ skip, take, orderBy, select }) {
      calls.push({ method: 'findMany', skip, take, orderBy, select })
      return [...terms.values()]
        .sort((left, right) => new Date(right.startDate) - new Date(left.startDate))
        .slice(skip, skip + take)
        .map((term) => selected(term, select))
    },
    async count() {
      return terms.size
    },
    async findFirst(query) {
      calls.push({ method: 'findFirst', query })
      return [...terms.values()].find((term) => term.isActive) ?? null
    },
    async create({ data, select }) {
      calls.push({ method: 'create', data, select })
      const term = { id: randomUUID(), ...data }
      terms.set(term.id, term)
      return selected(term, select)
    },
    async findUnique({ where, select }) {
      calls.push({ method: 'findUnique', where, select })
      const term = terms.get(where.id)
      return term ? selected(term, select) : null
    },
    async updateMany({ where, data }) {
      calls.push({ method: 'updateMany', where, data })
      let count = 0
      for (const term of terms.values()) {
        if (term.isActive && term.id !== where.id.not) {
          Object.assign(term, data)
          count += 1
        }
      }
      return { count }
    },
    async update({ where, data, select }) {
      calls.push({ method: 'update', where, data, select })
      const term = terms.get(where.id)
      if (!term) {
        const error = new Error('Record not found')
        error.code = 'P2025'
        throw error
      }
      Object.assign(term, data)
      return selected(term, select)
    },
  }

  return {
    calls,
    academicTerm,
    course: {
      async findUnique() { return null },
      async create() { return null },
      async findMany() { return [] },
      async count() { return 0 },
    },
    courseOffering: {
      async findUnique() { return null },
      async create() { return null },
      async findMany() { return [] },
      async count() { return 0 },
    },
    enrollment: {
      async findMany() { return [] },
      async findUnique() { return null },
      async create() { return null },
      async count() { return 0 },
    },
    assignment: { async findMany() { return [] }, async count() { return 0 } },
    classSession: { async findMany() { return [] }, async count() { return 0 } },
    attendanceRecord: { async findMany() { return [] } },
    getTerm(id) { return terms.get(id) },
    async $transaction(callback, options) {
      calls.push({ method: '$transaction', options })
      if (transactionError) throw transactionError
      return callback({ academicTerm })
    },
  }
}

function selected(record, selection) {
  if (!selection) return { ...record }
  return Object.fromEntries(
    Object.keys(selection).filter((key) => selection[key]).map((key) => [key, record[key]]),
  )
}

async function startTestServer(t, {
  role = 'ADMIN',
  authenticated = true,
  academicRepository = createAcademicRepository(),
} = {}) {
  const user = { id: adminId, role }
  const userRepository = {
    async findUnique({ where }) {
      return where.id === adminId ? user : null
    },
    async create() {
      return user
    },
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

test('requires authentication and denies STUDENT access to term management', async (t) => {
  const unauthenticated = await startTestServer(t, { authenticated: false })
  const unauthenticatedResponse = await unauthenticated.request('/api/academic/terms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  assert.equal(unauthenticatedResponse.status, 401)

  const student = await startTestServer(t, { role: 'STUDENT' })
  const studentResponse = await student.request('/api/academic/terms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  assert.equal(studentResponse.status, 403)
})

test('lists terms with safe fields and pagination', async (t) => {
  const activeTerm = {
    id: otherTermId,
    ...input,
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-12-20T00:00:00.000Z'),
    isActive: true,
  }
  const { request, academicRepository } = await startTestServer(t, {
    academicRepository: createAcademicRepository({ initialTerms: [activeTerm] }),
  })

  const response = await request('/api/academic/terms?page=1&limit=5')
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.items[0].id, otherTermId)
  assert.equal(result.items[0].isActive, true)
  assert.deepEqual(result.pagination, { page: 1, limit: 5, total: 1, totalPages: 1 })
  assert.equal(JSON.stringify(result).includes('passwordHash'), false)
  assert.equal(academicRepository.calls.find(({ method }) => method === 'findMany').take, 5)
})

test('ADMIN creates validated terms inactive and rejects privileged input fields', async (t) => {
  const { request, academicRepository } = await startTestServer(t)
  const response = await request('/api/academic/terms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })

  assert.equal(response.status, 201)
  const body = await response.json()
  assert.equal(body.term.code, input.code)
  assert.equal(body.term.isActive, false)
  const createCall = academicRepository.calls.find(({ method }) => method === 'create')
  assert.equal(createCall.data.isActive, false)
  assert.equal(createCall.data.startDate.toISOString(), '2026-08-01T00:00:00.000Z')

  const privilegedInput = await request('/api/academic/terms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...input, isActive: true, role: 'ADMIN', userId: adminId }),
  })
  assert.equal(privilegedInput.status, 400)
})

test('rejects invalid term dates and malformed input', async (t) => {
  const { request } = await startTestServer(t)
  for (const body of [
    { ...input, startDate: '2026-12-21' },
    { ...input, startDate: '2026-02-30' },
    { ...input, name: '' },
    { ...input, unexpected: true },
  ]) {
    const response = await request('/api/academic/terms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    assert.equal(response.status, 400)
  }
})

test('ADMIN activates a term atomically at serializable isolation', async (t) => {
  const oldTerm = {
    id: otherTermId,
    code: '2026-SPRING',
    name: 'Spring Semester 2026',
    isActive: true,
  }
  const newTerm = {
    id: adminId,
    code: input.code,
    name: input.name,
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-12-20T00:00:00.000Z'),
    isActive: false,
  }
  const academicRepository = createAcademicRepository({ initialTerms: [oldTerm, newTerm] })
  const { request } = await startTestServer(t, { academicRepository })
  const response = await request(`/api/academic/terms/${newTerm.id}/activate`, { method: 'POST' })

  assert.equal(response.status, 200)
  assert.equal((await response.json()).term.isActive, true)
  assert.equal(academicRepository.calls.find(({ method }) => method === '$transaction').options.isolationLevel, 'Serializable')
  assert.equal(academicRepository.calls.find(({ method }) => method === 'updateMany').where.isActive, true)
  assert.equal(academicRepository.calls.find(({ method }) => method === 'update').data.isActive, true)
  assert.equal(academicRepository.getTerm(oldTerm.id).isActive, false)
  assert.equal(academicRepository.getTerm(newTerm.id).isActive, true)
})

test('returns 404 for a missing term and 400 for an invalid term UUID', async (t) => {
  const { request, academicRepository } = await startTestServer(t)
  const missing = await request(`/api/academic/terms/${randomUUID()}/activate`, { method: 'POST' })
  assert.equal(missing.status, 404)
  assert.equal(academicRepository.calls.some(({ method }) => method === 'update'), false)

  const invalid = await request('/api/academic/terms/not-a-uuid/activate', { method: 'POST' })
  assert.equal(invalid.status, 400)
})

test('maps serialization and partial-unique-index conflicts to 409', async (t) => {
  for (const code of ['P2034', 'P2002']) {
    const error = new Error('Simulated concurrent activation conflict')
    error.code = code
    const { request, academicRepository } = await startTestServer(t, {
      academicRepository: createAcademicRepository({ transactionError: error }),
    })
    const response = await request(`/api/academic/terms/${otherTermId}/activate`, { method: 'POST' })

    assert.equal(response.status, 409)
    assert.equal(academicRepository.calls.find(({ method }) => method === '$transaction').options.isolationLevel, 'Serializable')
  }
})
