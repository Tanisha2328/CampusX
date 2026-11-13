import { useEffect, useState } from 'react'
import { apiRequest } from './authApi.js'

const emptyForm = {
  title: '',
  description: '',
  venue: '',
  startsAt: '',
  endsAt: '',
  capacity: '50',
  registrationDeadline: '',
}

function formatEventDate(value) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function eventStatus(status) {
  return status.toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase())
}

function dateTimeLocal(value) {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export default function EventsPage({ user, search = '' }) {
  const isManager = ['ADMIN', 'CLUB_COORDINATOR'].includes(user.role)
  const [items, setItems] = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [detailError, setDetailError] = useState('')
  const [actionError, setActionError] = useState('')
  const [pendingId, setPendingId] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [editingEventId, setEditingEventId] = useState('')
  const [formError, setFormError] = useState('')
  const [creating, setCreating] = useState(false)
  const [studentView, setStudentView] = useState('upcoming')

  useEffect(() => {
    let active = true
    const endpoint = isManager
      ? '/events/manage'
      : user.role === 'STUDENT' && studentView === 'registrations'
        ? '/events/my-registrations'
        : '/events'
    apiRequest(`${endpoint}?page=${pagination.page}&limit=20`)
      .then((result) => {
        if (!active) return
        const items = studentView === 'registrations' && user.role === 'STUDENT'
          ? result.items.map(({ id, createdAt, event }) => ({
            ...event,
            isRegistered: true,
            registrationId: id,
            registrationCreatedAt: createdAt,
          }))
          : result.items
        setItems(items)
        setPagination(result.pagination)
        setLoadError('')
      })
      .catch((error) => {
        if (active) setLoadError(error.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [isManager, pagination.page, reload, studentView, user.role])

  function refreshEvents() {
    setLoadError('')
    setLoading(true)
    setReload((value) => value + 1)
  }

  async function showDetails(id) {
    setSelectedEvent(null)
    setDetailError('')
    try {
      const result = await apiRequest(`/events/${id}`)
      setSelectedEvent(result.event)
    } catch (error) {
      setDetailError(error.message)
    }
  }

  async function register(event) {
    setPendingId(event.id)
    setActionError('')
    try {
      await apiRequest(`/events/${event.id}/registrations`, { method: 'POST' })
      refreshEvents()
      if (selectedEvent?.id === event.id) await showDetails(event.id)
    } catch (error) {
      setActionError(error.message)
    } finally {
      setPendingId('')
    }
  }

  async function cancelRegistration(event) {
    setPendingId(event.id)
    setActionError('')
    try {
      await apiRequest(`/events/${event.id}/registrations/me`, { method: 'DELETE' })
      refreshEvents()
      if (selectedEvent?.id === event.id) await showDetails(event.id)
    } catch (error) {
      setActionError(error.message)
    } finally {
      setPendingId('')
    }
  }

  async function updateStatus(event, status) {
    setPendingId(event.id)
    setActionError('')
    try {
      await apiRequest(`/events/${event.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      refreshEvents()
    } catch (error) {
      setActionError(error.message)
    } finally {
      setPendingId('')
    }
  }

  async function createEvent(submitEvent) {
    submitEvent.preventDefault()
    setFormError('')
    setCreating(true)
    try {
      const result = await apiRequest(editingEventId ? `/events/${editingEventId}` : '/events', {
        method: editingEventId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...form,
          description: form.description.trim() || null,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
          registrationDeadline: new Date(form.registrationDeadline).toISOString(),
          capacity: Number(form.capacity),
        }),
      })
      setForm(emptyForm)
      setEditingEventId('')
      setPagination((current) => ({ ...current, page: 1 }))
      refreshEvents()
      setSelectedEvent(result.event)
    } catch (error) {
      setFormError(error.message)
    } finally {
      setCreating(false)
    }
  }

  function editEvent(event) {
    setEditingEventId(event.id)
    setForm({
      title: event.title,
      description: event.description ?? '',
      venue: event.venue,
      startsAt: dateTimeLocal(event.startsAt),
      endsAt: dateTimeLocal(event.endsAt),
      capacity: String(event.capacity),
      registrationDeadline: dateTimeLocal(event.registrationDeadline),
    })
    setFormError('')
  }

  function cancelEdit() {
    setEditingEventId('')
    setForm(emptyForm)
    setFormError('')
  }

  const query = search.trim().toLowerCase()
  const visibleEvents = items.filter((event) => (
    `${event.title} ${event.description ?? ''} ${event.venue}`.toLowerCase().includes(query)
  ))

  return (
    <section className="events-page" aria-labelledby="events-title">
      <header className="events-heading">
        <div>
          <div className="section-kicker">CAMPUS LIFE</div>
          <h1 id="events-title">{isManager ? 'Event management' : 'Campus events'}</h1>
          <p>{isManager
            ? 'Create events and manage publication for your campus community.'
            : 'Discover upcoming events and reserve your place.'}</p>
        </div>
        <span className="events-role-tag">{isManager ? 'Organizer view' : 'Upcoming events'}</span>
      </header>

      {isManager && (
        <form className="event-create panel" onSubmit={createEvent}>
          <div className="panel-heading">
            <div><div className="section-kicker">ORGANIZER TOOLS</div><h2>{editingEventId ? 'Edit event' : 'Create an event'}</h2></div>
            <span className="event-status status-draft">{editingEventId ? 'Changes save immediately' : 'Draft on creation'}</span>
          </div>
          <div className="event-form-grid">
            <label>Event title<input required maxLength="150" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
            <label>Venue<input required maxLength="200" value={form.venue} onChange={(event) => setForm({ ...form, venue: event.target.value })} /></label>
            <label>Starts at<input required type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></label>
            <label>Ends at<input required type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></label>
            <label>Registration deadline<input required type="datetime-local" value={form.registrationDeadline} onChange={(event) => setForm({ ...form, registrationDeadline: event.target.value })} /></label>
            <label>Capacity<input required type="number" min="1" max="10000" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} /></label>
            <label className="event-description-field">Description<textarea maxLength="5000" rows="3" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          </div>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <button className="event-primary-button" type="submit" disabled={creating}>{creating ? 'Saving…' : editingEventId ? 'Save event changes' : 'Create draft event'}</button>
          {editingEventId && <button className="event-secondary-button" type="button" onClick={cancelEdit}>Cancel edit</button>}
        </form>
      )}

      {actionError && <p className="form-error" role="alert">{actionError}</p>}
      {loadError && (
        <div className="event-message" role="alert">
          <p>Events couldn’t be loaded: {loadError}</p>
          <button type="button" onClick={refreshEvents}>Try again</button>
        </div>
      )}
      {detailError && <p className="form-error" role="alert">{detailError}</p>}

      {user.role === 'STUDENT' && (
        <div className="event-view-switch" aria-label="Event view">
          <button type="button" className={studentView === 'upcoming' ? 'event-view-active' : ''} onClick={() => {
            setStudentView('upcoming')
            setPagination((current) => ({ ...current, page: 1 }))
            setLoading(true)
          }}>Upcoming events</button>
          <button type="button" className={studentView === 'registrations' ? 'event-view-active' : ''} onClick={() => {
            setStudentView('registrations')
            setPagination((current) => ({ ...current, page: 1 }))
            setLoading(true)
          }}>My registrations</button>
        </div>
      )}

      {selectedEvent && (
        <article className="event-detail panel">
          <button className="event-close" type="button" onClick={() => setSelectedEvent(null)}>Close details</button>
          <div className="event-detail-heading">
            <div><span className={`event-status status-${selectedEvent.status.toLowerCase()}`}>{eventStatus(selectedEvent.status)}</span><h2>{selectedEvent.title}</h2></div>
            <span>{selectedEvent.registrationCount ?? selectedEvent._count?.registrations ?? 0} / {selectedEvent.capacity} registered</span>
          </div>
          {selectedEvent.description && <p>{selectedEvent.description}</p>}
          <dl className="event-facts">
            <div><dt>When</dt><dd>{formatEventDate(selectedEvent.startsAt)} – {formatEventDate(selectedEvent.endsAt)}</dd></div>
            <div><dt>Venue</dt><dd>{selectedEvent.venue}</dd></div>
            <div><dt>Registration closes</dt><dd>{formatEventDate(selectedEvent.registrationDeadline)}</dd></div>
          </dl>
          {user.role === 'STUDENT'
            && (selectedEvent.status === 'PUBLISHED' || (selectedEvent.status === 'CANCELLED' && selectedEvent.isRegistered)) && (
            <button
              className="event-primary-button"
              type="button"
              disabled={pendingId === selectedEvent.id || selectedEvent.startsAt <= new Date().toISOString()}
              onClick={() => selectedEvent.isRegistered
                ? cancelRegistration(selectedEvent)
                : register(selectedEvent)}
            >
              {pendingId === selectedEvent.id ? 'Please wait…' : selectedEvent.isRegistered ? 'Cancel my registration' : 'Register'}
            </button>
          )}
        </article>
      )}

      <div className="events-list-heading">
        <h2>{isManager ? 'Managed events' : studentView === 'registrations' ? 'Your registration history' : 'Upcoming events'}</h2>
        {!loading && !loadError && <span>{pagination.total} total</span>}
      </div>
      {loading
        ? <p className="event-message" aria-live="polite">Loading events…</p>
        : !loadError && visibleEvents.length === 0
          ? <p className="event-message">{query ? 'No events match your search.' : 'There are no events to show yet.'}</p>
          : (
            <div className="event-grid">
              {visibleEvents.map((event) => (
                <article className="event-card panel" key={event.id}>
                  <div className="event-card-top">
                    <span className={`event-status status-${event.status.toLowerCase()}`}>{eventStatus(event.status)}</span>
                    <span>{event.registrationCount} / {event.capacity} spots</span>
                  </div>
                  <h3>{event.title}</h3>
                  <p className="event-card-description">{event.description || 'Join the campus community for this event.'}</p>
                  <div className="event-card-fact"><span>When</span><strong>{formatEventDate(event.startsAt)}</strong></div>
                  <div className="event-card-fact"><span>Venue</span><strong>{event.venue}</strong></div>
                  <div className="event-card-actions">
                    <button className="event-secondary-button" type="button" onClick={() => showDetails(event.id)}>Details</button>
                    {studentView === 'registrations' && event.status === 'PUBLISHED'
                      && event.endsAt <= new Date().toISOString() && (
                      <a className="event-primary-button" href={`/api/certificates/events/${event.id}/download`}>Certificate PDF</a>
                    )}
                    {user.role === 'STUDENT' && event.status === 'PUBLISHED' && (
                      <button
                        className="event-primary-button"
                        type="button"
                        disabled={pendingId === event.id || event.startsAt <= new Date().toISOString()}
                        onClick={() => event.isRegistered ? cancelRegistration(event) : register(event)}
                      >
                        {pendingId === event.id ? 'Please wait…' : event.isRegistered ? 'Cancel registration' : 'Register'}
                      </button>
                    )}
                    {user.role === 'STUDENT' && studentView === 'registrations'
                      && event.status === 'CANCELLED' && event.isRegistered && (
                      <button className="event-secondary-button" type="button" disabled={pendingId === event.id || event.startsAt <= new Date().toISOString()} onClick={() => cancelRegistration(event)}>
                        Cancel registration
                      </button>
                    )}
                    {isManager && event.status === 'DRAFT' && (
                      <button className="event-primary-button" type="button" disabled={pendingId === event.id} onClick={() => updateStatus(event, 'PUBLISHED')}>Publish</button>
                    )}
                    {isManager && (
                      <button className="event-secondary-button" type="button" onClick={() => editEvent(event)}>Edit</button>
                    )}
                    {isManager && event.status === 'PUBLISHED' && (
                      <button className="event-secondary-button" type="button" disabled={pendingId === event.id} onClick={() => updateStatus(event, 'CANCELLED')}>Cancel event</button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

      {!loading && pagination.totalPages > 1 && (
        <nav className="event-pagination" aria-label="Event pages">
          <button type="button" disabled={pagination.page <= 1} onClick={() => { setLoadError(''); setLoading(true); setPagination((current) => ({ ...current, page: current.page - 1 })) }}>Previous</button>
          <span>Page {pagination.page} of {pagination.totalPages}</span>
          <button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => { setLoadError(''); setLoading(true); setPagination((current) => ({ ...current, page: current.page + 1 })) }}>Next</button>
        </nav>
      )}
    </section>
  )
}
