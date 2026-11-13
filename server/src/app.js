import express from 'express'
import healthRouter from './routes/health.js'
import authRouter from './routes/auth.js'
import academicRouter from './routes/academic.js'
import eventsRouter from './routes/events.js'
import serviceRequestsRouter from './routes/service-requests.js'
import notificationsRouter from './routes/notifications.js'
import announcementsRouter from './routes/announcements.js'
import facilitiesRouter from './routes/facilities.js'
import attendanceRouter from './routes/attendance.js'
import certificatesRouter from './routes/certificates.js'
import analyticsRouter from './routes/analytics.js'
import auditLogsRouter from './routes/audit-logs.js'
import errorHandler from './middleware/errorHandler.js'
import notFound from './middleware/notFound.js'

export function createApp({
  userRepository,
  academicRepository,
  eventRepository,
  serviceRequestRepository,
  notificationRepository,
  announcementRepository,
  facilityRepository,
  certificateRepository,
  analyticsRepository,
  auditRepository,
  jwtSecret,
  secureCookies = process.env.NODE_ENV === 'production',
  clock,
}) {
  const app = express()

  app.disable('x-powered-by')
  app.use(express.json({ limit: '16kb' }))
  app.use('/api/health', healthRouter)
  app.use('/api/auth', authRouter({ userRepository, jwtSecret, secureCookies }))
  app.use('/api/academic', academicRouter({
    userRepository,
    academicRepository,
    auditRepository,
    jwtSecret,
    clock,
  }))
  if (academicRepository.attendanceQrToken) {
    app.use('/api/attendance', attendanceRouter({
      userRepository,
      academicRepository,
      jwtSecret,
      clock,
    }))
  }
  app.use('/api/events', eventsRouter({
    userRepository,
    eventRepository,
    notificationRepository,
    auditRepository,
    jwtSecret,
    clock,
  }))
  if (serviceRequestRepository) {
    app.use('/api/service-requests', serviceRequestsRouter({
      userRepository,
      serviceRequestRepository,
      notificationRepository,
      jwtSecret,
    }))
  }
  if (notificationRepository) {
    app.use('/api/notifications', notificationsRouter({
      userRepository,
      notificationRepository,
      jwtSecret,
    }))
  }
  if (announcementRepository) {
    app.use('/api/announcements', announcementsRouter({
      userRepository,
      announcementRepository,
      eventRepository,
      notificationRepository,
      auditRepository,
      jwtSecret,
      clock,
    }))
  }
  if (facilityRepository) {
    app.use('/api/facilities', facilitiesRouter({
      userRepository,
      facilityRepository,
      auditRepository,
      notificationRepository,
      jwtSecret,
      clock,
    }))
  }
  if (certificateRepository) {
    app.use('/api/certificates', certificatesRouter({
      userRepository,
      certificateRepository,
      jwtSecret,
      clock,
    }))
  }
  if (analyticsRepository) {
    app.use('/api/admin/analytics', analyticsRouter({ userRepository, analyticsRepository, jwtSecret }))
  }
  if (auditRepository) {
    app.use('/api/admin/audit-logs', auditLogsRouter({ userRepository, auditRepository, jwtSecret }))
  }
  app.use(notFound)
  app.use(errorHandler)

  return app
}
