import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { createAccessToken } from '../auth/jwt.js'
import { toSafeProfile } from '../auth/profile.js'
import { loginSchema, registerSchema } from '../auth/validation.js'
import { authenticate } from '../middleware/authenticate.js'
import { clearSessionCookie, setSessionCookie } from '../auth/sessionCookie.js'

const passwordCost = 12

function isDuplicateEmailError(error) {
  return error?.code === 'P2002'
}

export default function authRouter({ userRepository, jwtSecret, secureCookies }) {
  if (!userRepository || typeof userRepository.findUnique !== 'function' || typeof userRepository.create !== 'function') {
    throw new Error('A user repository is required to configure authentication routes.')
  }

  if (!jwtSecret || Buffer.byteLength(jwtSecret) < 32) {
    throw new Error('A JWT secret of at least 32 bytes is required.')
  }

  const router = Router()
  const requireAuthentication = authenticate({ userRepository, jwtSecret })

  router.post('/register', async (request, response) => {
    const parsed = registerSchema.safeParse(request.body)

    if (!parsed.success) {
      return response.status(400).json({ error: { message: 'Invalid registration details.' } })
    }

    const { name, email, password } = parsed.data
    const existingUser = await userRepository.findUnique({ where: { email } })

    if (existingUser) {
      return response.status(409).json({ error: { message: 'An account with this email already exists.' } })
    }

    const passwordHash = await bcrypt.hash(password, passwordCost)
    let user

    try {
      user = await userRepository.create({
        data: { name, email, passwordHash, role: 'STUDENT' },
      })
    } catch (error) {
      if (isDuplicateEmailError(error)) {
        return response.status(409).json({ error: { message: 'An account with this email already exists.' } })
      }

      throw error
    }

    const token = await createAccessToken(user.id, jwtSecret)
    setSessionCookie(response, token, secureCookies)
    response.setHeader('Cache-Control', 'no-store')
    return response.status(201).json({ user: toSafeProfile(user) })
  })

  router.post('/login', async (request, response) => {
    const parsed = loginSchema.safeParse(request.body)

    if (!parsed.success) {
      return response.status(400).json({ error: { message: 'Invalid login details.' } })
    }

    const { email, password } = parsed.data
    const user = await userRepository.findUnique({ where: { email } })

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return response.status(401).json({ error: { message: 'Invalid email or password.' } })
    }

    const token = await createAccessToken(user.id, jwtSecret)
    setSessionCookie(response, token, secureCookies)
    response.setHeader('Cache-Control', 'no-store')
    return response.status(200).json({ user: toSafeProfile(user) })
  })

  router.get('/me', requireAuthentication, (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    return response.status(200).json({ user: toSafeProfile(request.user) })
  })

  router.post('/logout', (_request, response) => {
    clearSessionCookie(response, secureCookies)
    response.setHeader('Cache-Control', 'no-store')
    return response.status(204).end()
  })

  return router
}
