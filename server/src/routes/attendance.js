import { createHash, randomBytes } from 'node:crypto'
import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import { authorizeRoles } from '../middleware/authorizeRoles.js'
import { z } from 'zod'

const fiveMinutes = 5 * 60_000
const earlyCheckInWindow = 15 * 60_000

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function assertRepository(repository) {
  if (!repository?.classSession?.findUnique
    || !repository?.attendanceQrToken?.upsert
    || !repository?.attendanceQrToken?.findUnique
    || !repository?.enrollment?.findUnique
    || !repository?.attendanceRecord?.findUnique
    || !repository?.attendanceRecord?.create
    || !repository?.attendanceRecord?.findMany) {
    throw new Error('An attendance repository with classSession, attendanceQrToken, enrollment, and attendanceRecord is required.')
  }
}

export default function attendanceRouter({
  userRepository,
  academicRepository,
  jwtSecret,
  clock = () => new Date(),
}) {
  assertRepository(academicRepository)
  const router = Router()
  const authenticated = authenticate({ userRepository, jwtSecret })
  const staff = authorizeRoles('ADMIN', 'FACULTY')
  const student = authorizeRoles('STUDENT')

  router.get('/mine', authenticated, student, async (request, response) => {
    const items = await academicRepository.attendanceRecord.findMany({
      where: { studentId: request.user.id },
      orderBy: [{ recordedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        status: true,
        recordedAt: true,
        classSession: {
          select: {
            startsAt: true,
            endsAt: true,
            location: true,
            offering: { select: { course: { select: { code: true, title: true } } } },
          },
        },
      },
    })
    return response.status(200).json({ items })
  })

  router.post('/sessions/:id/qr', authenticated, staff, async (request, response) => {
    const parsedSessionId = z.string().uuid().safeParse(request.params.id)
    if (!parsedSessionId.success) {
      return response.status(400).json({ error: { message: 'Invalid class session ID.' } })
    }
    const sessionId = parsedSessionId.data
    const now = clock()
    const session = await academicRepository.classSession.findUnique({
      where: { id: sessionId },
      select: { id: true, startsAt: true, endsAt: true, status: true },
    })
    if (!session) return response.status(404).json({ error: { message: 'Class session not found.' } })
    if (session.status !== 'SCHEDULED' || session.endsAt <= now) {
      return response.status(409).json({ error: { message: 'Attendance is not available for this class session.' } })
    }
    if (session.startsAt.getTime() - now.getTime() > earlyCheckInWindow) {
      return response.status(409).json({ error: { message: 'Attendance QR codes can be issued up to 15 minutes before class.' } })
    }
    const validFrom = new Date(Math.max(now.getTime(), session.startsAt.getTime() - earlyCheckInWindow))
    const expiresAt = new Date(Math.min(session.endsAt.getTime(), now.getTime() + fiveMinutes))
    const token = randomBytes(32).toString('base64url')
    await academicRepository.attendanceQrToken.upsert({
      where: { classSessionId: session.id },
      create: {
        classSessionId: session.id,
        tokenHash: hashToken(token),
        validFrom,
        expiresAt,
      },
      update: {
        tokenHash: hashToken(token),
        validFrom,
        expiresAt,
      },
    })
    return response.status(201).json({
      token: `campusx-attendance:${token}`,
      validFrom,
      expiresAt,
    })
  })

  router.post('/scan', authenticated, student, async (request, response) => {
    const tokenInput = typeof request.body?.token === 'string' ? request.body.token.trim() : ''
    const token = tokenInput.startsWith('campusx-attendance:')
      ? tokenInput.slice('campusx-attendance:'.length)
      : tokenInput
    if (!/^[\w-]{40,60}$/.test(token)) {
      return response.status(400).json({ error: { message: 'Invalid attendance QR code.' } })
    }
    const now = clock()
    const qr = await academicRepository.attendanceQrToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        classSessionId: true,
        validFrom: true,
        expiresAt: true,
        classSession: {
          select: { id: true, offeringId: true, startsAt: true, endsAt: true, status: true },
        },
      },
    })
    if (!qr || qr.validFrom > now || qr.expiresAt <= now
      || qr.classSession.status !== 'SCHEDULED'
      || qr.classSession.startsAt.getTime() - earlyCheckInWindow > now.getTime()
      || qr.classSession.endsAt <= now) {
      return response.status(410).json({ error: { message: 'This attendance QR code has expired or is not active.' } })
    }
    const enrollment = await academicRepository.enrollment.findUnique({
      where: {
        studentId_offeringId: {
          studentId: request.user.id,
          offeringId: qr.classSession.offeringId,
        },
      },
      select: { id: true, status: true },
    })
    if (!enrollment || enrollment.status !== 'ACTIVE') {
      return response.status(403).json({ error: { message: 'You are not actively enrolled in this class.' } })
    }
    const existing = await academicRepository.attendanceRecord.findUnique({
      where: {
        studentId_classSessionId: {
          studentId: request.user.id,
          classSessionId: qr.classSessionId,
        },
      },
      select: { id: true },
    })
    if (existing) return response.status(409).json({ error: { message: 'Attendance has already been recorded.' } })
    try {
      const attendance = await academicRepository.attendanceRecord.create({
        data: {
          studentId: request.user.id,
          offeringId: qr.classSession.offeringId,
          classSessionId: qr.classSessionId,
          status: 'PRESENT',
        },
        select: { id: true, status: true, recordedAt: true },
      })
      return response.status(201).json({ attendance })
    } catch (error) {
      if (error?.code === 'P2002') {
        return response.status(409).json({ error: { message: 'Attendance has already been recorded.' } })
      }
      throw error
    }
  })

  return router
}
