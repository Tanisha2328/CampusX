import { useEffect, useState } from 'react'
import { apiRequest } from './authApi.js'

const emptyTerm = { name: '', code: '', startDate: '', endDate: '' }
const emptyCourse = { code: '', title: '', description: '' }
const emptyOffering = { courseId: '', termId: '', sectionCode: '' }
const emptyEnrollment = { studentEmail: '', offeringId: '' }

async function getAllItems(path) {
  const items = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const result = await apiRequest(`${path}?page=${page}&limit=100`)
    items.push(...result.items)
    totalPages = result.pagination.totalPages
    page += 1
  }

  return items
}

function displayDate(value) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value))
}

export default function AcademicManagementPage({ user }) {
  const [terms, setTerms] = useState([])
  const [courses, setCourses] = useState([])
  const [offerings, setOfferings] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [termForm, setTermForm] = useState(emptyTerm)
  const [courseForm, setCourseForm] = useState(emptyCourse)
  const [offeringForm, setOfferingForm] = useState(emptyOffering)
  const [enrollmentForm, setEnrollmentForm] = useState(emptyEnrollment)
  const [pendingAction, setPendingAction] = useState('')
  const [formErrors, setFormErrors] = useState({})
  const [success, setSuccess] = useState({})

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError('')
    Promise.all([
      getAllItems('/academic/terms'),
      getAllItems('/academic/courses'),
      getAllItems('/academic/offerings'),
      getAllItems('/academic/enrollments'),
    ])
      .then(([termItems, courseItems, offeringItems, enrollmentItems]) => {
        if (!active) return
        setTerms(termItems)
        setCourses(courseItems)
        setOfferings(offeringItems)
        setEnrollments(enrollmentItems)
      })
      .catch((error) => {
        if (!active) return
        if (error.status === 401) {
          window.location.replace('/login')
          return
        }
        setLoadError(error.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [reload])

  function startAction(action) {
    setPendingAction(action)
    setFormErrors((current) => ({ ...current, [action]: '' }))
    setSuccess((current) => ({ ...current, [action]: '' }))
  }

  function finishAction(action, message) {
    setSuccess((current) => ({ ...current, [action]: message }))
    setReload((current) => current + 1)
  }

  async function createTerm(event) {
    event.preventDefault()
    startAction('term')
    if (termForm.endDate < termForm.startDate) {
      setFormErrors((current) => ({ ...current, term: 'End date must be on or after the start date.' }))
      setPendingAction('')
      return
    }

    try {
      await apiRequest('/academic/terms', {
        method: 'POST',
        body: JSON.stringify(termForm),
      })
      setTermForm(emptyTerm)
      finishAction('term', 'Academic term created.')
    } catch (error) {
      setFormErrors((current) => ({ ...current, term: error.message }))
    } finally {
      setPendingAction('')
    }
  }

  async function activateTerm(term) {
    startAction(`activate-${term.id}`)
    try {
      await apiRequest(`/academic/terms/${term.id}/activate`, { method: 'POST' })
      finishAction(`activate-${term.id}`, `${term.name} is now the active term.`)
    } catch (error) {
      setFormErrors((current) => ({ ...current, [`activate-${term.id}`]: error.message }))
    } finally {
      setPendingAction('')
    }
  }

  async function createCourse(event) {
    event.preventDefault()
    startAction('course')
    try {
      await apiRequest('/academic/courses', {
        method: 'POST',
        body: JSON.stringify({
          ...courseForm,
          description: courseForm.description.trim() || undefined,
        }),
      })
      setCourseForm(emptyCourse)
      finishAction('course', 'Course created.')
    } catch (error) {
      setFormErrors((current) => ({ ...current, course: error.message }))
    } finally {
      setPendingAction('')
    }
  }

  async function createOffering(event) {
    event.preventDefault()
    startAction('offering')
    try {
      await apiRequest('/academic/offerings', {
        method: 'POST',
        body: JSON.stringify(offeringForm),
      })
      setOfferingForm(emptyOffering)
      finishAction('offering', 'Course offering created.')
    } catch (error) {
      setFormErrors((current) => ({ ...current, offering: error.message }))
    } finally {
      setPendingAction('')
    }
  }

  async function enrollStudent(event) {
    event.preventDefault()
    startAction('enrollment')
    try {
      await apiRequest('/academic/enrollments', {
        method: 'POST',
        body: JSON.stringify({
          studentEmail: enrollmentForm.studentEmail.trim(),
          offeringId: enrollmentForm.offeringId,
        }),
      })
      setEnrollmentForm(emptyEnrollment)
      finishAction('enrollment', 'Student enrolled successfully.')
    } catch (error) {
      setFormErrors((current) => ({ ...current, enrollment: error.message }))
    } finally {
      setPendingAction('')
    }
  }

  const activeTerm = terms.find((term) => term.isActive)

  if (user.role !== 'ADMIN') {
    return <p className="academic-message academic-error" role="alert">Academic Management is available to Admins only.</p>
  }

  return (
    <section className="academic-page" aria-labelledby="academic-title">
      <header className="academic-heading">
        <div>
          <div className="section-kicker">ADMINISTRATION</div>
          <h1 id="academic-title">Academic Management</h1>
          <p>Manage academic terms, courses, offerings and student enrollments.</p>
        </div>
        <span className="academic-role-tag">Admin workspace</span>
      </header>

      {loading && <p className="academic-message" role="status">Loading academic records…</p>}
      {loadError && (
        <div className="academic-message academic-error" role="alert">
          <span>Couldn’t load academic records: {loadError}</span>
          <button className="event-secondary-button" type="button" onClick={() => setReload((value) => value + 1)}>Try again</button>
        </div>
      )}

      {!loading && !loadError && (
        <>
          <section className="academic-stats" aria-label="Academic overview">
            <article className="academic-stat panel">
              <span>Active academic term</span>
              <strong>{activeTerm?.name ?? 'None active'}</strong>
              {activeTerm && <small>{activeTerm.code}</small>}
            </article>
            <article className="academic-stat panel"><span>Total courses</span><strong>{courses.length}</strong></article>
            <article className="academic-stat panel"><span>Course offerings</span><strong>{offerings.length}</strong></article>
            <article className="academic-stat panel"><span>Student enrollments</span><strong>{enrollments.length}</strong></article>
          </section>

          {!terms.length && <p className="academic-empty">No academic terms yet. Create a term to start setting up offerings.</p>}

          <section className="academic-grid">
            <form className="academic-card panel" onSubmit={createTerm}>
              <div className="panel-heading"><div><div className="section-kicker">ACADEMIC CALENDAR</div><h2>Create a term</h2></div></div>
              <div className="academic-form-grid">
                <label>Term name<input required maxLength="100" value={termForm.name} onChange={(event) => setTermForm({ ...termForm, name: event.target.value })} /></label>
                <label>Term code<input required maxLength="50" value={termForm.code} onChange={(event) => setTermForm({ ...termForm, code: event.target.value })} /></label>
                <label>Start date<input required type="date" value={termForm.startDate} onChange={(event) => setTermForm({ ...termForm, startDate: event.target.value })} /></label>
                <label>End date<input required type="date" min={termForm.startDate || undefined} value={termForm.endDate} onChange={(event) => setTermForm({ ...termForm, endDate: event.target.value })} /></label>
              </div>
              {formErrors.term && <p className="academic-inline-error" role="alert">{formErrors.term}</p>}
              {success.term && <p className="academic-success" role="status">{success.term}</p>}
              <button className="event-primary-button" type="submit" disabled={pendingAction === 'term'}>{pendingAction === 'term' ? 'Creating…' : 'Create term'}</button>
            </form>

            <section className="academic-card panel">
              <div className="panel-heading"><div><div className="section-kicker">TERM DIRECTORY</div><h2>Academic terms</h2></div><span className="academic-count">{terms.length}</span></div>
              {!terms.length
                ? <p className="academic-empty">No terms to display.</p>
                : <div className="academic-record-list">
                  {terms.map((term) => (
                    <article className="academic-record" key={term.id}>
                      <div><div className="academic-record-title">{term.name} <span className={term.isActive ? 'academic-active-badge' : 'academic-muted-badge'}>{term.isActive ? 'Active' : term.code}</span></div><p>{displayDate(term.startDate)} – {displayDate(term.endDate)}</p></div>
                      {!term.isActive && <button className="event-secondary-button" type="button" disabled={pendingAction === `activate-${term.id}`} onClick={() => activateTerm(term)}>{pendingAction === `activate-${term.id}` ? 'Activating…' : 'Activate'}</button>}
                      {formErrors[`activate-${term.id}`] && <p className="academic-inline-error" role="alert">{formErrors[`activate-${term.id}`]}</p>}
                      {success[`activate-${term.id}`] && <p className="academic-success" role="status">{success[`activate-${term.id}`]}</p>}
                    </article>
                  ))}
                </div>}
            </section>

            <form className="academic-card panel" onSubmit={createCourse}>
              <div className="panel-heading"><div><div className="section-kicker">COURSE CATALOG</div><h2>Create a course</h2></div></div>
              <div className="academic-form-grid">
                <label>Course code<input required maxLength="50" value={courseForm.code} onChange={(event) => setCourseForm({ ...courseForm, code: event.target.value })} /></label>
                <label>Course title<input required maxLength="150" value={courseForm.title} onChange={(event) => setCourseForm({ ...courseForm, title: event.target.value })} /></label>
                <label className="academic-wide">Description<textarea maxLength="2000" rows="3" value={courseForm.description} onChange={(event) => setCourseForm({ ...courseForm, description: event.target.value })} /></label>
              </div>
              {formErrors.course && <p className="academic-inline-error" role="alert">{formErrors.course}</p>}
              {success.course && <p className="academic-success" role="status">{success.course}</p>}
              <button className="event-primary-button" type="submit" disabled={pendingAction === 'course'}>{pendingAction === 'course' ? 'Creating…' : 'Create course'}</button>
            </form>

            <section className="academic-card panel">
              <div className="panel-heading"><div><div className="section-kicker">COURSE CATALOG</div><h2>Courses</h2></div><span className="academic-count">{courses.length}</span></div>
              {!courses.length
                ? <p className="academic-empty">No courses yet. Create a course to make it available for offerings.</p>
                : <div className="academic-record-list">
                  {courses.map((course) => (
                    <article className="academic-record" key={course.id}>
                      <div><div className="academic-record-title">{course.title}</div><p>{course.code}</p>{course.description && <p>{course.description}</p>}</div>
                    </article>
                  ))}
                </div>}
            </section>

            <form className="academic-card panel" onSubmit={createOffering}>
              <div className="panel-heading"><div><div className="section-kicker">SECTION SETUP</div><h2>Create a course offering</h2></div></div>
              <div className="academic-form-grid">
                <label>Course<select required value={offeringForm.courseId} onChange={(event) => setOfferingForm({ ...offeringForm, courseId: event.target.value })}>
                  <option value="">Select a course</option>
                  {courses.map((course) => <option value={course.id} key={course.id}>{course.code} — {course.title}</option>)}
                </select></label>
                <label>Academic term<select required value={offeringForm.termId} onChange={(event) => setOfferingForm({ ...offeringForm, termId: event.target.value })}>
                  <option value="">Select a term</option>
                  {terms.map((term) => <option value={term.id} key={term.id}>{term.name}{term.isActive ? ' (Active)' : ''}</option>)}
                </select></label>
                <label>Section code<input required maxLength="50" value={offeringForm.sectionCode} onChange={(event) => setOfferingForm({ ...offeringForm, sectionCode: event.target.value })} /></label>
              </div>
              {formErrors.offering && <p className="academic-inline-error" role="alert">{formErrors.offering}</p>}
              {success.offering && <p className="academic-success" role="status">{success.offering}</p>}
              <button className="event-primary-button" type="submit" disabled={pendingAction === 'offering' || !courses.length || !terms.length}>{pendingAction === 'offering' ? 'Creating…' : 'Create offering'}</button>
              {(!courses.length || !terms.length) && <p className="academic-hint">Add at least one course and one term before creating an offering.</p>}
            </form>

            <section className="academic-card panel">
              <div className="panel-heading"><div><div className="section-kicker">OFFERING DIRECTORY</div><h2>Course offerings</h2></div><span className="academic-count">{offerings.length}</span></div>
              {!offerings.length
                ? <p className="academic-empty">No offerings yet.</p>
                : <div className="academic-record-list">
                  {offerings.map((offering) => (
                    <article className="academic-record" key={offering.id}>
                      <div><div className="academic-record-title">{offering.course.code} · Section {offering.sectionCode}</div><p>{offering.course.title} · {offering.term.name}</p></div>
                      <span className="academic-muted-badge">{offering._count.enrollments} enrolled</span>
                    </article>
                  ))}
                </div>}
            </section>

            <form className="academic-card panel" onSubmit={enrollStudent}>
              <div className="panel-heading"><div><div className="section-kicker">STUDENT REGISTRATION</div><h2>Enroll a student</h2></div></div>
              <div className="academic-form-grid">
                <label>Registered student email<input required type="email" autoComplete="email" value={enrollmentForm.studentEmail} onChange={(event) => setEnrollmentForm({ ...enrollmentForm, studentEmail: event.target.value })} /></label>
                <label>Course offering<select required value={enrollmentForm.offeringId} onChange={(event) => setEnrollmentForm({ ...enrollmentForm, offeringId: event.target.value })}>
                  <option value="">Select an offering</option>
                  {offerings.map((offering) => <option value={offering.id} key={offering.id}>{offering.course.code} · {offering.sectionCode} · {offering.term.code}</option>)}
                </select></label>
              </div>
              {formErrors.enrollment && <p className="academic-inline-error" role="alert">{formErrors.enrollment}</p>}
              {success.enrollment && <p className="academic-success" role="status">{success.enrollment}</p>}
              <button className="event-primary-button" type="submit" disabled={pendingAction === 'enrollment' || !offerings.length}>{pendingAction === 'enrollment' ? 'Enrolling…' : 'Enroll student'}</button>
              {!offerings.length && <p className="academic-hint">Create an offering before enrolling a student.</p>}
            </form>

            <section className="academic-card panel">
              <div className="panel-heading"><div><div className="section-kicker">ENROLLMENT DIRECTORY</div><h2>Student enrollments</h2></div><span className="academic-count">{enrollments.length}</span></div>
              {!enrollments.length
                ? <p className="academic-empty">No student enrollments yet.</p>
                : <div className="academic-record-list">
                  {enrollments.map((enrollment) => (
                    <article className="academic-record" key={enrollment.id}>
                      <div><div className="academic-record-title">{enrollment.student.name}</div><p>{enrollment.student.email}</p><p>{enrollment.offering.course.code} · Section {enrollment.offering.sectionCode} · {enrollment.offering.term.name}</p></div>
                      <span className={enrollment.status === 'ACTIVE' ? 'academic-active-badge' : 'academic-muted-badge'}>{enrollment.status}</span>
                    </article>
                  ))}
                </div>}
            </section>
          </section>
        </>
      )}
    </section>
  )
}
