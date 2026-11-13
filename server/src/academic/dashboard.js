const attendanceStatuses = ['PRESENT', 'ABSENT', 'LATE']
const kolkataTimeZone = 'Asia/Kolkata'
const kolkataOffsetMilliseconds = (5 * 60 + 30) * 60 * 1000
const millisecondsPerDay = 24 * 60 * 60 * 1000

export function getKolkataDayBounds(now) {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: kolkataTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const parts = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]))
  const dayStart = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
      - kolkataOffsetMilliseconds,
  )

  return {
    start: dayStart,
    end: new Date(dayStart.getTime() + millisecondsPerDay),
  }
}

export async function getAcademicDashboard({
  academicRepository,
  studentId,
  now = new Date(),
}) {
  const term = await academicRepository.academicTerm.findFirst({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
  })

  if (!term) {
    return {
      term: null,
      enrolledCourseCount: 0,
      upcomingAssignments: [],
      todaysClasses: [],
      attendancePercentage: null,
    }
  }

  const activeEnrollmentWhere = {
    studentId,
    status: 'ACTIVE',
    offering: { is: { termId: term.id } },
  }
  const { start, end } = getKolkataDayBounds(now)

  const [enrollments, upcomingAssignments, todaysClasses, attendanceRecords] = await Promise.all([
    academicRepository.enrollment.findMany({
      where: activeEnrollmentWhere,
      select: { offering: { select: { courseId: true } } },
    }),
    academicRepository.assignment.findMany({
      where: {
        status: 'PUBLISHED',
        dueAt: { gt: now },
        offering: {
          is: {
            termId: term.id,
            enrollments: { some: { studentId, status: 'ACTIVE' } },
          },
        },
      },
      orderBy: { dueAt: 'asc' },
      select: {
        id: true,
        title: true,
        description: true,
        dueAt: true,
        offering: {
          select: {
            sectionCode: true,
            course: { select: { code: true, title: true } },
          },
        },
      },
    }),
    academicRepository.classSession.findMany({
      where: {
        status: 'SCHEDULED',
        startsAt: { gte: start, lt: end },
        offering: {
          is: {
            termId: term.id,
            enrollments: { some: { studentId, status: 'ACTIVE' } },
          },
        },
      },
      orderBy: { startsAt: 'asc' },
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
    }),
    academicRepository.attendanceRecord.findMany({
      where: {
        studentId,
        status: { in: attendanceStatuses },
        enrollment: {
          is: {
            status: 'ACTIVE',
            offering: { is: { termId: term.id } },
          },
        },
        classSession: { is: { status: 'SCHEDULED' } },
      },
      select: { status: true },
    }),
  ])

  const enrolledCourseCount = new Set(enrollments.map(({ offering }) => offering.courseId)).size
  let attendedCount = 0
  let countableAttendance = 0

  for (const { status } of attendanceRecords) {
    if (status === 'PRESENT' || status === 'LATE') {
      attendedCount += 1
      countableAttendance += 1
    } else if (status === 'ABSENT') {
      countableAttendance += 1
    }
  }

  return {
    term,
    enrolledCourseCount,
    upcomingAssignments,
    todaysClasses,
    attendancePercentage: countableAttendance === 0
      ? null
      : (attendedCount / countableAttendance) * 100,
  }
}
