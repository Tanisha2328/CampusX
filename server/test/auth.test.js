import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import { authorizeRoles } from '../src/middleware/authorizeRoles.js'
import { createEventRepository } from '../test-support/event-repository.js'

const jwtSecret = 'test-only-secret-that-is-never-used-outside-tests'

function createMemoryUserRepository() {
  const usersByEmail = new Map()
  const usersById = new Map()

  return {
    async findUnique({ where }) {
      return where.email ? usersByEmail.get(where.email) ?? null : usersById.get(where.id) ?? null
    },
    async create({ data }) {
      if (usersByEmail.has(data.email)) {
        const error = new Error('Unique constraint violation')
        error.code = 'P2002'
        throw error
      }

      const now = new Date()
      const user = {
        id: randomUUID(),
        ...data,
        createdAt: now,
        updatedAt: now,
      }
      usersByEmail.set(user.email, user)
      usersById.set(user.id, user)
      return user
    },
  }
}

function createMemoryAcademicRepository() {
  return {
    academicTerm: {
      async findFirst() { return null },
      async findMany() { return [] },
      async count() { return 0 },
      async create() { return null },
      async findUnique() { return null },
      async updateMany() { return { count: 0 } },
      async update() { return null },
    },
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
    async $transaction(callback) { return callback(this) },
  }
}

async function startTestServer(t, userRepository = createMemoryUserRepository(), appOptions = {}) {
  const server = createApp({
    userRepository,
    academicRepository: createMemoryAcademicRepository(),
    eventRepository: createEventRepository(),
    jwtSecret,
    ...appOptions,
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
    userRepository,
    request: (path, options) => fetch(`http://127.0.0.1:${address.port}${path}`, options),
  }
}

const registration = {
  name: 'Tanisha Student',
  email: 'tanisha@example.edu',
  password: 'a-strong-test-password-2026',
}

test('registers and logs in with an HttpOnly session cookie and returns a safe profile', async (t) => {
  const { request } = await startTestServer(t)
  const registered = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(registration),
  })

  assert.equal(registered.status, 201)
  const registeredBody = await registered.json()
  assert.equal(registeredBody.user.role, 'STUDENT')
  assert.equal('passwordHash' in registeredBody.user, false)
  assert.equal('token' in registeredBody, false)
  const registrationCookie = registered.headers.get('set-cookie')
  assert.match(registrationCookie, /HttpOnly/i)
  assert.match(registrationCookie, /SameSite=Lax/i)
  assert.match(registrationCookie, /Path=\/api(?:;|$)/i)

  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: registration.email, password: registration.password }),
  })

  assert.equal(login.status, 200)
  const loginBody = await login.json()
  assert.equal(loginBody.user.email, registration.email)
  assert.equal('passwordHash' in loginBody.user, false)
  assert.equal('token' in loginBody, false)
  const loginCookie = login.headers.get('set-cookie')
  assert.match(loginCookie, /HttpOnly/i)

  const profile = await request('/api/auth/me', {
    headers: { cookie: loginCookie.split(';')[0] },
  })
  assert.equal(profile.status, 200)
  const profileBody = await profile.json()
  assert.equal(profileBody.user.id, registeredBody.user.id)
  assert.equal(profileBody.user.role, 'STUDENT')
  assert.equal('passwordHash' in profileBody.user, false)

  const bearerProfile = await request('/api/auth/me', {
    headers: { authorization: `Bearer ${loginCookie.split(';')[0].split('=')[1]}` },
  })
  assert.equal(bearerProfile.status, 200)
})

test('clears the session cookie on logout', async (t) => {
  const { request } = await startTestServer(t)
  const response = await request('/api/auth/logout', { method: 'POST' })

  assert.equal(response.status, 204)
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/i)
  assert.match(response.headers.get('set-cookie'), /HttpOnly/i)
  assert.match(response.headers.get('set-cookie'), /Path=\/api(?:;|$)/i)
})

test('sets the Secure attribute when secure cookies are configured', async (t) => {
  const { request } = await startTestServer(t, createMemoryUserRepository(), { secureCookies: true })
  const response = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(registration),
  })

  assert.match(response.headers.get('set-cookie'), /Secure/i)
})

test('rejects invalid passwords with a generic login error', async (t) => {
  const { request } = await startTestServer(t)
  await request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(registration),
  })

  const response = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: registration.email, password: 'incorrect-password' }),
  })
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: { message: 'Invalid email or password.' } })
})

test('rejects duplicate student registration', async (t) => {
  const { request } = await startTestServer(t)
  const options = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(registration),
  }

  assert.equal((await request('/api/auth/register', options)).status, 201)
  const duplicate = await request('/api/auth/register', options)
  assert.equal(duplicate.status, 409)
})

test('rejects registration attempts to assign an elevated role', async (t) => {
  const { request } = await startTestServer(t)
  const response = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...registration, role: 'ADMIN' }),
  })
  assert.equal(response.status, 400)
})

test('rejects requests to the protected profile endpoint without a session', async (t) => {
  const { request } = await startTestServer(t)
  const response = await request('/api/auth/me')
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: { message: 'Authentication required.' } })
})

test('does not reflect query strings in not-found responses', async (t) => {
  const { request } = await startTestServer(t)
  const response = await request('/api/unknown?token=do-not-reflect')
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: { message: 'Route not found.' } })
})

test('denies access when a valid user role is not authorized', () => {
  let nextCalled = false
  const request = { user: { role: 'FACULTY' } }
  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }

  authorizeRoles('ADMIN')(request, response, () => {
    nextCalled = true
  })

  assert.equal(response.statusCode, 403)
  assert.equal(nextCalled, false)
  assert.deepEqual(response.body, {
    error: { message: 'You are not authorized to access this resource.' },
  })
})

test('supports authorization for every configured user role', () => {
  for (const role of ['STUDENT', 'FACULTY', 'CLUB_COORDINATOR', 'ADMIN']) {
    let nextCalled = false
    authorizeRoles(role)(
      { user: { role } },
      {},
      () => {
        nextCalled = true
      },
    )
    assert.equal(nextCalled, true, `${role} should be authorizable`)
  }
})
