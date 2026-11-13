export const sessionCookieName = 'campusx_session'

const sessionMaxAgeSeconds = 60 * 60

export function setSessionCookie(response, token, secure) {
  const attributes = [
    `${sessionCookieName}=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/api',
    `Max-Age=${sessionMaxAgeSeconds}`,
  ]

  if (secure) attributes.push('Secure')

  response.setHeader('Set-Cookie', attributes.join('; '))
}

export function clearSessionCookie(response, secure) {
  const attributes = [
    `${sessionCookieName}=`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/api',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ]

  if (secure) attributes.push('Secure')

  response.setHeader('Set-Cookie', attributes.join('; '))
}

export function readSessionCookie(request) {
  const match = request.get('cookie')?.match(
    new RegExp(`(?:^|;\\s*)${sessionCookieName}=([^;]*)`),
  )

  return match?.[1]
}
