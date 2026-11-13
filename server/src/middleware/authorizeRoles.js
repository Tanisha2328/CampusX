const userRoles = new Set(['STUDENT', 'FACULTY', 'CLUB_COORDINATOR', 'ADMIN'])

export function authorizeRoles(...roles) {
  if (roles.length === 0 || roles.some((role) => !userRoles.has(role))) {
    throw new Error('authorizeRoles requires one or more valid user roles.')
  }

  return function authorizeRequest(request, response, next) {
    if (!request.user) {
      return response.status(401).json({ error: { message: 'Authentication required.' } })
    }

    if (!roles.includes(request.user.role)) {
      return response.status(403).json({ error: { message: 'You are not authorized to access this resource.' } })
    }

    return next()
  }
}
