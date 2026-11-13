import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { createApp } from './app.js'
import { startAnnouncementScheduler } from './routes/announcements.js'

const port = Number.parseInt(process.env.PORT ?? '3000', 10)

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.')
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be configured.')
}

if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 bytes.')
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })
const academicRepository = {
  academicTerm: prisma.academicTerm,
  course: prisma.course,
  courseOffering: prisma.courseOffering,
  enrollment: prisma.enrollment,
  assignment: prisma.assignment,
  classSession: prisma.classSession,
  attendanceRecord: prisma.attendanceRecord,
  attendanceQrToken: prisma.attendanceQrToken,
  $transaction: prisma.$transaction.bind(prisma),
}
const eventRepository = {
  event: prisma.event,
  eventRegistration: prisma.eventRegistration,
  $transaction: prisma.$transaction.bind(prisma),
}
const serviceRequestRepository = {
  serviceRequest: prisma.serviceRequest,
  serviceRequestNote: prisma.serviceRequestNote,
  $transaction: prisma.$transaction.bind(prisma),
}
const notificationRepository = { notification: prisma.notification }
const announcementRepository = { announcement: prisma.announcement }
const facilityRepository = {
  facility: prisma.facility,
  facilityBooking: prisma.facilityBooking,
  $transaction: prisma.$transaction.bind(prisma),
}
const certificateRepository = {
  eventCertificate: prisma.eventCertificate,
  eventRegistration: prisma.eventRegistration,
}
const analyticsRepository = {
  user: prisma.user,
  event: prisma.event,
  eventRegistration: prisma.eventRegistration,
  attendanceRecord: prisma.attendanceRecord,
  serviceRequest: prisma.serviceRequest,
  facilityBooking: prisma.facilityBooking,
}
const auditRepository = { auditLog: prisma.auditLog }
const app = createApp({
  userRepository: prisma.user,
  academicRepository,
  eventRepository,
  serviceRequestRepository,
  notificationRepository,
  announcementRepository,
  facilityRepository,
  certificateRepository,
  analyticsRepository,
  auditRepository,
  jwtSecret: process.env.JWT_SECRET,
})
const stopAnnouncementScheduler = startAnnouncementScheduler({
  announcementRepository,
  userRepository: prisma.user,
  notificationRepository,
})
const server = app.listen(port, () => {
  console.log(`CampusX API listening on port ${port}`)
})

function shutdown(signal) {
  console.log(`${signal} received; closing HTTP server.`)
  stopAnnouncementScheduler()
  server.close((error) => {
    if (error) {
      console.error('Failed to close HTTP server cleanly.')
      process.exitCode = 1
    }

    prisma.$disconnect().catch(() => {
      console.error('Failed to disconnect from the database cleanly.')
      process.exitCode = 1
    })
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
