import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import { authorizeRoles } from '../middleware/authorizeRoles.js'

export default function analyticsRouter({ userRepository, analyticsRepository, jwtSecret }) {
  const required = ['user', 'event', 'eventRegistration', 'attendanceRecord', 'serviceRequest', 'facilityBooking']
  if (required.some((model) => typeof analyticsRepository?.[model]?.count !== 'function')) {
    throw new Error('An analytics repository with count-capable models is required.')
  }
  const router = Router()
  router.get('/', authenticate({ userRepository, jwtSecret }), authorizeRoles('ADMIN'), async (_request, response) => {
    const [
      students,
      faculty,
      events,
      registrations,
      attendance,
      attendanceByStatus,
      pendingServiceRequests,
      facilityBookings,
      bookingsByStatus,
    ] = await Promise.all([
      analyticsRepository.user.count({ where: { role: 'STUDENT' } }),
      analyticsRepository.user.count({ where: { role: 'FACULTY' } }),
      analyticsRepository.event.count(),
      analyticsRepository.eventRegistration.count(),
      analyticsRepository.attendanceRecord.count(),
      analyticsRepository.attendanceRecord.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      analyticsRepository.serviceRequest.count({ where: { status: { in: ['SUBMITTED', 'IN_PROGRESS'] } } }),
      analyticsRepository.facilityBooking.count(),
      analyticsRepository.facilityBooking.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ])
    return response.status(200).json({
      students,
      faculty,
      events,
      registrations,
      attendance,
      attendanceByStatus: Object.fromEntries(attendanceByStatus.map((row) => [row.status, row._count._all])),
      pendingServiceRequests,
      facilityBookings,
      facilityBookingsByStatus: Object.fromEntries(bookingsByStatus.map((row) => [row.status, row._count._all])),
    })
  })
  return router
}
