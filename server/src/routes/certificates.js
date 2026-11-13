import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { authorizeRoles } from '../middleware/authorizeRoles.js'
import { createCertificatePdf } from '../certificates/pdf.js'

function assertRepository(repository) {
  if (!repository?.eventCertificate?.findMany
    || !repository.eventCertificate?.findUnique
    || !repository.eventCertificate?.create
    || !repository.eventRegistration?.findUnique) {
    throw new Error('A certificate repository with eventCertificate and eventRegistration is required.')
  }
}

function certificateId() {
  return `CX-${randomUUID().replaceAll('-', '').toUpperCase()}`
}

export default function certificatesRouter({
  userRepository,
  certificateRepository,
  jwtSecret,
  clock = () => new Date(),
}) {
  assertRepository(certificateRepository)
  const router = Router()
  const authenticated = authenticate({ userRepository, jwtSecret })
  const student = authorizeRoles('STUDENT')

  router.get('/verify/:certificateId', async (request, response) => {
    const id = request.params.certificateId
    if (!/^CX-[A-F0-9]{32}$/.test(id)) {
      return response.status(400).json({ error: { message: 'Invalid certificate ID.' } })
    }
    const certificate = await certificateRepository.eventCertificate.findUnique({
      where: { certificateId: id },
      select: {
        certificateId: true,
        issuedAt: true,
        event: { select: { title: true, startsAt: true, endsAt: true } },
        student: { select: { name: true } },
      },
    })
    if (!certificate) return response.status(404).json({ error: { message: 'Certificate not found.' } })
    return response.status(200).json({ certificate })
  })

  router.get('/mine', authenticated, student, async (request, response) => {
    const items = await certificateRepository.eventCertificate.findMany({
      where: { studentId: request.user.id },
      orderBy: [{ issuedAt: 'desc' }, { id: 'asc' }],
      select: {
        certificateId: true,
        issuedAt: true,
        event: { select: { id: true, title: true, startsAt: true, endsAt: true, status: true } },
      },
    })
    return response.status(200).json({ items })
  })

  router.get('/events/:eventId/download', authenticated, student, async (request, response) => {
    const parsedEventId = z.string().uuid().safeParse(request.params.eventId)
    if (!parsedEventId.success) {
      return response.status(400).json({ error: { message: 'Invalid event ID.' } })
    }
    const registration = await certificateRepository.eventRegistration.findUnique({
      where: {
        eventId_studentId: {
          eventId: parsedEventId.data,
          studentId: request.user.id,
        },
      },
      select: {
        event: {
          select: { id: true, title: true, startsAt: true, endsAt: true, status: true },
        },
        student: { select: { name: true } },
      },
    })
    if (!registration) return response.status(404).json({ error: { message: 'Event registration not found.' } })
    if (registration.event.endsAt > clock() || registration.event.status !== 'PUBLISHED') {
      return response.status(409).json({ error: { message: 'Certificates are available only after a published event has ended.' } })
    }

    let certificate = await certificateRepository.eventCertificate.findUnique({
      where: {
        eventId_studentId: {
          eventId: registration.event.id,
          studentId: request.user.id,
        },
      },
      select: { certificateId: true, issuedAt: true },
    })
    if (!certificate) {
      try {
        certificate = await certificateRepository.eventCertificate.create({
          data: {
            certificateId: certificateId(),
            eventId: registration.event.id,
            studentId: request.user.id,
          },
          select: { certificateId: true, issuedAt: true },
        })
      } catch (error) {
        if (error?.code !== 'P2002') throw error
        certificate = await certificateRepository.eventCertificate.findUnique({
          where: {
            eventId_studentId: {
              eventId: registration.event.id,
              studentId: request.user.id,
            },
          },
          select: { certificateId: true, issuedAt: true },
        })
        if (!certificate) throw error
      }
    }

    const pdf = createCertificatePdf({
      studentName: registration.student.name,
      eventTitle: registration.event.title,
      eventDate: new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'long',
        timeZone: 'Asia/Kolkata',
      }).format(registration.event.startsAt),
      certificateId: certificate.certificateId,
    })
    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${certificate.certificateId}.pdf"`,
      'Content-Length': pdf.length,
      'Cache-Control': 'private, no-store',
    })
    return response.status(200).send(pdf)
  })

  return router
}
