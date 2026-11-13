import { SignJWT, jwtVerify } from 'jose'

const issuer = 'campusx-api'
const audience = 'campusx-client'

export async function createAccessToken(userId, secret) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret))
}

export async function verifyAccessToken(token, secret) {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: ['HS256'],
    issuer,
    audience,
  })

  if (!payload.sub) {
    throw new Error('Invalid token subject.')
  }

  return payload.sub
}
