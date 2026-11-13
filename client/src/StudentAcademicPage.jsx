import { useEffect, useState } from 'react'
import { apiRequest } from './authApi.js'
import './CampusOperationsPage.css'

const pageDetails = {
  Courses: { endpoint: '/academic/student/courses', title: 'My courses', subtitle: 'Your active course enrollments for this term.' },
  Timetable: { endpoint: '/academic/student/timetable', title: 'Class timetable', subtitle: 'Upcoming scheduled classes for your active courses.' },
  Assignments: { endpoint: '/academic/student/assignments', title: 'Assignments', subtitle: 'Published assignment deadlines for your courses.' },
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export default function StudentAcademicPage({ section, search = '' }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const page = pageDetails[section]

  useEffect(() => {
    let active = true
    apiRequest(`${page.endpoint}?page=1&limit=100`)
      .then((result) => {
        if (active) {
          setItems(result.items)
          setError('')
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [attempt, page.endpoint])

  const query = search.trim().toLowerCase()
  const filteredItems = items.filter((item) => {
    const course = item.offering?.course
    const text = section === 'Courses'
      ? `${course?.code ?? ''} ${course?.title ?? ''} ${item.offering?.sectionCode ?? ''}`
      : section === 'Timetable'
        ? `${course?.code ?? ''} ${course?.title ?? ''} ${item.location ?? ''}`
        : `${course?.code ?? ''} ${course?.title ?? ''} ${item.title ?? ''}`
    return text.toLowerCase().includes(query)
  })

  return <section className="operations-page">
    <header className="operations-heading"><div><div className="section-kicker">ACADEMIC RECORDS</div>
      <h1>{page.title}</h1><p>{page.subtitle}</p>
    </div></header>
    {error && <div className="event-message" role="alert">
      <p>Academic records could not be loaded: {error}</p>
      <button className="event-secondary-button" type="button" onClick={() => {
        setError('')
        setLoading(true)
        setAttempt((value) => value + 1)
      }}>Try again</button>
    </div>}
    <section className="panel operations-panel">
      <h2>{section}</h2>
      {loading ? <p className="empty-state">Loading your records…</p>
        : !error && filteredItems.length === 0
          ? <p className="empty-state">{query ? 'No records match your search.' : 'No records are available for this term.'}</p>
          : <div className="operations-list">{filteredItems.map((item) => {
            const course = item.offering.course
            return <article className="operations-record" key={item.id}>
              <div className="record-heading"><strong>{course.code} · {course.title}</strong>
                {section === 'Courses' && <span>{item.offering.sectionCode}</span>}
                {section === 'Timetable' && <span className="event-status status-published">{formatDate(item.startsAt)}</span>}
                {section === 'Assignments' && <span className="event-status status-pending">Due {formatDate(item.dueAt)}</span>}
              </div>
              {section === 'Courses' && <p>{item.offering.term.name} · Enrolled {formatDate(item.enrollment.enrolledAt)}</p>}
              {section === 'Timetable' && <p>{formatDate(item.endsAt)} · {item.location || 'Location not set'}</p>}
              {section === 'Assignments' && item.description && <p>{item.description}</p>}
            </article>
          })}</div>}
    </section>
  </section>
}
