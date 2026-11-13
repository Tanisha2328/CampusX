import { Router } from 'express'
import { getAcademicDashboard } from '../academic/dashboard.js'
import {
  academicTermIdSchema,
  academicTermInputSchema,
  courseInputSchema,
  courseOfferingInputSchema,
  enrollmentInputSchema,
  paginationQuerySchema,
} from '../academic/validation.js'
import { authenticate } from '../middleware/authenticate.js'
import { authorizeRoles } from '../middleware/authorizeRoles.js'
import { writeAuditLog } from '../audit/log.js'

const requiredMethods = {
  academicTerm: ['findFirst', 'findMany', 'count', 'create', 'findUnique', 'updateMany', 'update'],
  course: ['findUnique', 'create', 'findMany', 'count'],
  courseOffering: ['findUnique', 'create', 'findMany', 'count'],
  enrollment: ['findMany', 'findUnique', 'create', 'count'],
  assignment: ['findMany', 'count'],
  classSession: ['findMany', 'count'],
  attendanceRecord: ['findMany'],
  $transaction: [],
}

function assertAcademicRepository(academicRepository) {
  for (const [model, methods] of Object.entries(requiredMethods)) {
    if (model === '$transaction') {
      if (typeof academicRepository?.$transaction !== 'function') {
        throw new Error('An academic repository with $transaction is required.')
      }
    } else if (methods.some((method) => typeof academicRepository?.[model]?.[method] !== 'function')) {
      throw new Error(`An academic repository with ${model}.${methods.join(', ')} is required.`)
    }
  }
}

function isAcademicTermConflict(error) {
  return error?.code === 'P2002' || error?.code === 'P2034'
}

function getPagination(request, response) {
  const parsed = paginationQuerySchema.safeParse(request.query)

  if (!parsed.success) {
    response.status(400).json({ error: { message: 'Invalid pagination parameters.' } })
    return null
  }

  return {
    ...parsed.data,
    skip: (parsed.data.page - 1) * parsed.data.limit,
  }
}

function pageResult(items, total, { page, limit }) {
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

const adminCourseSelection = {
  id: true,
  code: true,
  title: true,
  description: true,
  offerings: {
    orderBy: { sectionCode: 'asc' },
    select: {
      id: true,
      sectionCode: true,
      term: {
        select: {
          id: true,
          code: true,
          name: true,
          startDate: true,
          endDate: true,
          isActive: true,
        },
      },
    },
  },
}

const studentOfferingSelection = {
  id: true,
  sectionCode: true,
  course: { select: { id: true, code: true, title: true } },
  term: { select: { id: true, code: true, name: true, isActive: true } },
}

export default function academicRouter({
  userRepository,
  academicRepository,
  auditRepository,
  jwtSecret,
  clock = () => new Date(),
}) {
  assertAcademicRepository(academicRepository)
  const router = Router()
  const requireAuthentication = authenticate({ userRepository, jwtSecret })
  const requireStudent = authorizeRoles('STUDENT')
  const requireAdmin = authorizeRoles('ADMIN')
  const requireTeachingStaff = authorizeRoles('ADMIN', 'FACULTY')

  router.get('/sessions', requireAuthentication, requireTeachingStaff, async (request, response) => {
    const sessions = await academicRepository.classSession.findMany({
      where: { status: 'SCHEDULED', endsAt: { gt: clock() } },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: 100,
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        location: true,
        offering: {
          select: {
            sectionCode: true,
            course: { select: { code: true, title: true } },
          },
        },
      },
    })
    return response.status(200).json({ items: sessions })
  })

  router.get('/terms', requireAuthentication, requireAdmin, async (request, response) => {
    const pagination = getPagination(request, response)
    if (!pagination) return

    const [terms, total] = await Promise.all([
      academicRepository.academicTerm.findMany({
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: [{ startDate: 'desc' }, { code: 'asc' }],
        select: {
          id: true,
          code: true,
          name: true,
          startDate: true,
          endDate: true,
          isActive: true,
        },
      }),
      academicRepository.academicTerm.count(),
    ])

    return response.status(200).json(pageResult(terms, total, pagination))
  })

  router.get('/courses', requireAuthentication, requireAdmin, async (request, response) => {
    const pagination = getPagination(request, response)
    if (!pagination) return

    const [courses, total] = await Promise.all([
      academicRepository.course.findMany({
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { code: 'asc' },
        select: adminCourseSelection,
      }),
      academicRepository.course.count(),
    ])

    return response.status(200).json(pageResult(courses, total, pagination))
  })

  router.get('/offerings', requireAuthentication, requireAdmin, async (request, response) => {
    const pagination = getPagination(request, response)
    if (!pagination) return

    const [offerings, total] = await Promise.all([
      academicRepository.courseOffering.findMany({
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select: {
          id: true,
          sectionCode: true,
          course: { select: { id: true, code: true, title: true } },
          term: { select: { id: true, code: true, name: true, isActive: true } },
          _count: { select: { enrollments: true } },
        },
      }),
      academicRepository.courseOffering.count(),
    ])

    return response.status(200).json(pageResult(offerings, total, pagination))
  })

  router.get('/enrollments', requireAuthentication, requireAdmin, async (request, response) => {
    const pagination = getPagination(request, response)
    if (!pagination) return

    const [enrollments, total] = await Promise.all([
      academicRepository.enrollment.findMany({
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: [{ enrolledAt: 'desc' }, { id: 'asc' }],
        select: {
          id: true,
          status: true,
          enrolledAt: true,
          student: { select: { id: true, name: true, email: true } },
          offering: { select: studentOfferingSelection },
        },
      }),
      academicRepository.enrollment.count(),
    ])

    return response.status(200).json(pageResult(enrollments, total, pagination))
  })

  router.get('/student/courses', requireAuthentication, requireStudent, async (request, response) => {
    const pagination = getPagination(request, response)
    if (!pagination) return

    const where = {
      studentId: request.user.id,
      status: 'ACTIVE',
      offering: { is: { term: { is: { isActive: true } } } },
    }
    const [enrollments, total] = await Promise.all([
      academicRepository.enrollment.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { enrolledAt: 'desc' },
        select: {
          id: true,
          enrolledAt: true,
          offering: { select: studentOfferingSelection },
        },
      }),
      academicRepository.enrollment.count({ where }),
    ])

    const courses = enrollments.map(({ id, enrolledAt, offering }) => ({
      ...offering,
      enrollment: { id, enrolledAt },
    }))

    return response.status(200).json(pageResult(courses, total, pagination))
  })

  router.get('/student/timetable', requireAuthentication, requireStudent, async (request, response) => {
    const pagination = getPagination(request, response)
    if (!pagination) return

    const where = {
      status: 'SCHEDULED',
      offering: {
        is: {
          term: { is: { isActive: true } },
          enrollments: { some: { studentId: request.user.id, status: 'ACTIVE' } },
        },
      },
    }
    const [sessions, total] = await Promise.all([
      academicRepository.classSession.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          location: true,
          offering: { select: studentOfferingSelection },
        },
      }),
      academicRepository.classSession.count({ where }),
    ])

    return response.status(200).json(pageResult(sessions, total, pagination))
  })

  router.get('/student/assignments', requireAuthentication, requireStudent, async (request, response) => {
    const pagination = getPagination(request, response)
    if (!pagination) return

    const where = {
      status: 'PUBLISHED',
      dueAt: { gt: clock() },
      offering: {
        is: {
          term: { is: { isActive: true } },
          enrollments: { some: { studentId: request.user.id, status: 'ACTIVE' } },
        },
      },
    }
    const [assignments, total] = await Promise.all([
      academicRepository.assignment.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          title: true,
          description: true,
          dueAt: true,
          offering: { select: studentOfferingSelection },
        },
      }),
      academicRepository.assignment.count({ where }),
    ])

    return response.status(200).json(pageResult(assignments, total, pagination))
  })

  router.post('/courses', requireAuthentication, requireAdmin, async (request, response) => {
    const parsed = courseInputSchema.safeParse(request.body)

    if (!parsed.success) {
      return response.status(400).json({ error: { message: 'Invalid course details.' } })
    }

    try {
      const course = await academicRepository.course.create({
        data: parsed.data,
        select: { id: true, code: true, title: true, description: true },
      })
      if (auditRepository) {
        await writeAuditLog(auditRepository, {
          actorId: request.user.id,
          action: 'ACADEMIC_COURSE_CREATED',
          entityType: 'Course',
          entityId: course.id,
          details: { code: course.code, title: course.title },
        })
      }
      return response.status(201).json({ course })
    } catch (error) {
      if (error?.code === 'P2002') {
        return response.status(409).json({ error: { message: 'A course with this code already exists.' } })
      }
      throw error
    }
  })

  router.post('/offerings', requireAuthentication, requireAdmin, async (request, response) => {
    const parsed = courseOfferingInputSchema.safeParse(request.body)

    if (!parsed.success) {
      return response.status(400).json({ error: { message: 'Invalid course offering details.' } })
    }

    const [term, course] = await Promise.all([
      academicRepository.academicTerm.findUnique({
        where: { id: parsed.data.termId },
        select: { id: true },
      }),
      academicRepository.course.findUnique({
        where: { id: parsed.data.courseId },
        select: { id: true },
      }),
    ])

    if (!term || !course) {
      return response.status(404).json({ error: { message: 'Academic term or course not found.' } })
    }

    try {
      const offering = await academicRepository.courseOffering.create({
        data: parsed.data,
        select: {
          id: true,
          termId: true,
          courseId: true,
          sectionCode: true,
        },
      })
      if (auditRepository) {
        await writeAuditLog(auditRepository, {
          actorId: request.user.id,
          action: 'ACADEMIC_OFFERING_CREATED',
          entityType: 'CourseOffering',
          entityId: offering.id,
          details: { termId: offering.termId, courseId: offering.courseId },
        })
      }
      return response.status(201).json({ offering })
    } catch (error) {
      if (error?.code === 'P2002') {
        return response.status(409).json({ error: { message: 'This course offering already exists.' } })
      }
      if (error?.code === 'P2003') {
        return response.status(404).json({ error: { message: 'Academic term or course not found.' } })
      }
      throw error
    }
  })

  router.post('/enrollments', requireAuthentication, requireAdmin, async (request, response) => {
    const parsed = enrollmentInputSchema.safeParse(request.body)

    if (!parsed.success) {
      return response.status(400).json({ error: { message: 'Invalid enrollment details.' } })
    }

    const [student, offering] = await Promise.all([
      userRepository.findUnique({
        where: parsed.data.studentId
          ? { id: parsed.data.studentId }
          : { email: parsed.data.studentEmail },
        select: { id: true, role: true },
      }),
      academicRepository.courseOffering.findUnique({
        where: { id: parsed.data.offeringId },
        select: { id: true },
      }),
    ])

    if (!student || student.role !== 'STUDENT' || !offering) {
      return response.status(404).json({
        error: { message: 'Student or course offering not found.' },
      })
    }

    try {
      const enrollment = await academicRepository.enrollment.create({
        data: {
          studentId: student.id,
          offeringId: parsed.data.offeringId,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          studentId: true,
          offeringId: true,
          status: true,
        },
      })
      if (auditRepository) {
        await writeAuditLog(auditRepository, {
          actorId: request.user.id,
          action: 'ACADEMIC_ENROLLMENT_CREATED',
          entityType: 'Enrollment',
          entityId: enrollment.id,
          details: { studentId: enrollment.studentId, offeringId: enrollment.offeringId },
        })
      }
      return response.status(201).json({ enrollment })
    } catch (error) {
      if (error?.code === 'P2002') {
        return response.status(409).json({ error: { message: 'This student is already enrolled in the course offering.' } })
      }
      if (error?.code === 'P2003') {
        return response.status(404).json({ error: { message: 'Student or course offering not found.' } })
      }
      throw error
    }
  })

  router.post('/terms', requireAuthentication, requireAdmin, async (request, response) => {
    const parsed = academicTermInputSchema.safeParse(request.body)

    if (!parsed.success) {
      return response.status(400).json({ error: { message: 'Invalid academic term details.' } })
    }

    try {
      const term = await academicRepository.academicTerm.create({
        data: {
          ...parsed.data,
          startDate: new Date(`${parsed.data.startDate}T00:00:00.000Z`),
          endDate: new Date(`${parsed.data.endDate}T00:00:00.000Z`),
          isActive: false,
        },
        select: {
          id: true,
          code: true,
          name: true,
          startDate: true,
          endDate: true,
          isActive: true,
        },
      })

      if (auditRepository) {
        await writeAuditLog(auditRepository, {
          actorId: request.user.id,
          action: 'ACADEMIC_TERM_CREATED',
          entityType: 'AcademicTerm',
          entityId: term.id,
          details: { code: term.code, name: term.name },
        })
      }
      return response.status(201).json({ term })
    } catch (error) {
      if (error?.code === 'P2002') {
        return response.status(409).json({ error: { message: 'An academic term with this code already exists.' } })
      }
      throw error
    }
  })

  router.post('/terms/:id/activate', requireAuthentication, requireAdmin, async (request, response) => {
    const parsedId = academicTermIdSchema.safeParse(request.params.id)

    if (!parsedId.success) {
      return response.status(400).json({ error: { message: 'Invalid academic term ID.' } })
    }

    try {
      const term = await academicRepository.$transaction(async (transaction) => {
        const existingTerm = await transaction.academicTerm.findUnique({
          where: { id: parsedId.data },
          select: { id: true },
        })

        if (!existingTerm) return null

        await transaction.academicTerm.updateMany({
          where: { isActive: true, id: { not: parsedId.data } },
          data: { isActive: false },
        })

        return transaction.academicTerm.update({
          where: { id: parsedId.data },
          data: { isActive: true },
          select: {
            id: true,
            code: true,
            name: true,
            startDate: true,
            endDate: true,
            isActive: true,
          },
        })
      }, { isolationLevel: 'Serializable' })

      if (!term) {
        return response.status(404).json({ error: { message: 'Academic term not found.' } })
      }

      if (auditRepository) {
        await writeAuditLog(auditRepository, {
          actorId: request.user.id,
          action: 'ACADEMIC_TERM_ACTIVATED',
          entityType: 'AcademicTerm',
          entityId: term.id,
          details: { code: term.code },
        })
      }
      return response.status(200).json({ term })
    } catch (error) {
      if (isAcademicTermConflict(error)) {
        return response.status(409).json({
          error: { message: 'Academic term activation conflicted with another update. Please retry.' },
        })
      }
      throw error
    }
  })

  router.get('/dashboard', requireAuthentication, requireStudent, async (request, response) => {
    const dashboard = await getAcademicDashboard({
      academicRepository,
      studentId: request.user.id,
      now: clock(),
    })

    response.setHeader('Cache-Control', 'no-store')
    return response.status(200).json(dashboard)
  })

  return router
}
