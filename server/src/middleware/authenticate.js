import { verifyAccessToken } from '../auth/jwt.js'
import { readSessionCookie } from '../auth/sessionCookie.js'

export function authenticate({ userRepository, jwtSecret }) {
  return async function authenticateRequest(request, response, next) {
    const authorization = request.get('authorization')
    const bearerMatch = authorization?.match(/^Bearer\s+([^\s]+)$/i)
    const token = readSessionCookie(request) ?? bearerMatch?.[1]

    if (!token) {
      return response.status(401).json({ error: { message: 'Authentication required.' } })
    }

    let userId

    try {
      userId = await verifyAccessToken(token, jwtSecret)
    } catch {
      return response.status(401).json({ error: { message: 'Invalid or expired access token.' } })
    }

    const user = await userRepository.findUnique({ where: { id: userId } })

    if (!user) {
      return response.status(401).json({ error: { message: 'Invalid or expired access token.' } })
    }

    request.user = user
    return next()
  }
}
