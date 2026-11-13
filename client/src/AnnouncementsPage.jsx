import { useEffect, useState } from 'react'
import { apiRequest } from './authApi.js'

const categories = ['GENERAL', 'ACADEMIC', 'EVENTS', 'URGENT']
const priorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT']
const statuses = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']
const emptyForm = {
  title: '',
  message: '',
  category: 'GENERAL',
  priority: 'NORMAL',
  eventId: '',
  publishAt: '',
  expiresAt: '',
}

function humanize(value) {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^\w/, (letter) => letter.toUpperCase())
}

function formatDate(value) {
  if (!value) return 'Not set'
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function dateTimeLocal(value) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function toIso(value) {
  return value ? new Date(value).toISOString() : null
}

export default function AnnouncementsPage({ user }) {
  const isManager = ['ADMIN', 'FACULTY', 'CLUB_COORDINATOR'].includes(user.role)
  const isEventManager = ['ADMIN', 'CLUB_COORDINATOR'].includes(user.role)
  const isCoordinator = user.role === 'CLUB_COORDINATOR'
  const isFaculty = user.role === 'FACULTY'
  const [items, setItems] = useState([])
  const [events, setEvents] = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingId, setPendingId] = useState('')

  useEffect(() => {
    let active = true
    const query = new URLSearchParams({ page: String(pagination.page), limit: '20' })
    if (categoryFilter) query.set('category', categoryFilter)
    if (isManager && statusFilter) query.set('status', statusFilter)
    const endpoint = isManager ? '/announcements/manage' : '/announcements'
    const requests = [apiRequest(`${endpoint}?${query}`)]
    if (isEventManager) requests.push(apiRequest('/events/manage?page=1&limit=100'))
    Promise.all(requests)
      .then(([result, eventResult]) => {
        if (!active) return
        setItems(result.items)
        setPagination(result.pagination)
        if (eventResult) setEvents(eventResult.items)
        setError('')
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [categoryFilter, isEventManager, isManager, pagination.page, reload, statusFilter])

  function refresh() {
    setLoading(true)
    setReload((value) => value + 1)
  }

  function resetForm() {
    setForm(emptyForm)
    setEditingId('')
    setFormError('')
  }

  function editAnnouncement(item) {
    setEditingId(item.id)
    setForm({
      title: item.title,
      message: item.message,
      category: item.category,
      priority: item.priority,
      eventId: item.eventId ?? '',
      publishAt: dateTimeLocal(item.publishAt),
      expiresAt: dateTimeLocal(item.expiresAt),
    })
    setFormError('')
  }

  async function saveAnnouncement(event) {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    const body = {
      title: form.title.trim(),
      message: form.message.trim(),
      category: form.category,
      priority: form.priority,
      eventId: form.eventId || null,
      publishAt: toIso(form.publishAt),
      expiresAt: toIso(form.expiresAt),
    }
    try {
      await apiRequest(editingId ? `/announcements/${editingId}` : '/announcements', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      })
      resetForm()
      refresh()
    } catch (requestError) {
      setFormError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(item, action) {
    setPendingId(item.id)
    setError('')
    try {
      await apiRequest(
        `/announcements/${item.id}/${action === 'publish-now' ? 'publish' : action}`,
        {
          method: 'POST',
          ...(action === 'publish-now' ? { body: JSON.stringify({ publishNow: true }) } : {}),
        },
      )
      refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setPendingId('')
    }
  }

  return (
    <section className="announcements-page" aria-labelledby="announcements-title">
      <header className="announcements-heading">
        <div>
          <div className="section-kicker">CAMPUS BULLETIN</div>
          <h1 id="announcements-title">{isManager ? 'Announcement management' : 'Announcements'}</h1>
          <p>{isManager
            ? 'Publish campus updates and manage scheduled announcements.'
            : 'Important updates from across the campus community.'}</p>
        </div>
        <span className="announcement-role-tag">{isCoordinator ? 'Your event announcements' : isFaculty ? 'Faculty publishing' : isManager ? 'Administrator view' : 'Campus updates'}</span>
      </header>

      {isManager && (
        <form className="announcement-form panel" onSubmit={saveAnnouncement}>
          <div className="panel-heading">
            <div><div className="section-kicker">ANNOUNCEMENT TOOLS</div><h2>{editingId ? 'Edit announcement' : 'Create an announcement'}</h2></div>
            {editingId && <button className="event-secondary-button" type="button" onClick={resetForm}>Cancel edit</button>}
          </div>
          <div className="announcement-form-grid">
            <label className="announcement-wide">Title
              <input required minLength="3" maxLength="150" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </label>
            <label>Category
              <select value={isCoordinator ? 'EVENTS' : form.category} disabled={isCoordinator} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                {(isCoordinator ? ['EVENTS'] : isFaculty ? ['GENERAL', 'ACADEMIC'] : categories).map((category) => <option value={category} key={category}>{humanize(category)}</option>)}
              </select>
            </label>
            <label>Priority
              <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                {priorities.map((priority) => <option value={priority} key={priority}>{humanize(priority)}</option>)}
              </select>
            </label>
            {(form.category === 'EVENTS' || isCoordinator) && !isFaculty && (
              <label className="announcement-wide">Related event {isCoordinator ? '(required)' : '(optional)'}
                <select required={isCoordinator} value={form.eventId} onChange={(event) => setForm({ ...form, eventId: event.target.value })}>
                  <option value="">Select an event</option>
                  {events.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
                </select>
              </label>
            )}
            <label>Publication time (optional)
              <input type="datetime-local" value={form.publishAt} onChange={(event) => setForm({ ...form, publishAt: event.target.value })} />
            </label>
            <label>Expiry time (optional)
              <input type="datetime-local" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} />
            </label>
            <label className="announcement-wide">Message
              <textarea required minLength="1" maxLength="5000" rows="4" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} />
            </label>
          </div>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <button className="event-primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create draft'}</button>
        </form>
      )}

      <section className="announcement-list panel" aria-label="Announcement list">
        <div className="announcement-list-heading">
          <div><div className="section-kicker">{isManager ? 'PUBLISHING QUEUE' : 'CAMPUS UPDATES'}</div><h2>{isManager ? 'Announcements' : 'Latest announcements'}</h2></div>
          <div className="announcement-filters">
            <label>Category
              <select value={categoryFilter} onChange={(event) => {
                setCategoryFilter(event.target.value)
                setPagination((current) => ({ ...current, page: 1 }))
              }}>
                <option value="">All categories</option>
                {categories.map((category) => <option value={category} key={category}>{humanize(category)}</option>)}
              </select>
            </label>
            {isManager && (
              <label>Status
                <select value={statusFilter} onChange={(event) => {
                  setStatusFilter(event.target.value)
                  setPagination((current) => ({ ...current, page: 1 }))
                }}>
                  <option value="">All statuses</option>
                  {statuses.map((status) => <option value={status} key={status}>{humanize(status)}</option>)}
                </select>
              </label>
            )}
          </div>
        </div>
        {error && (
          <div className="event-message" role="alert">
            <p>Announcements couldn’t be loaded or updated: {error}</p>
            <button className="event-secondary-button" type="button" onClick={refresh}>Try again</button>
          </div>
        )}
        {loading
          ? <p className="event-message" aria-live="polite">Loading announcements…</p>
          : !error && items.length === 0
            ? <p className="event-message">There are no announcements to show.</p>
            : !error && (
              <div className="announcement-items">
                {items.map((item) => (
                  <article className="announcement-item" key={item.id}>
                    <div className="announcement-item-top">
                      <div>
                        <span className={`announcement-status announcement-${item.status.toLowerCase()}`}>{humanize(item.status)}</span>
                        <span className="announcement-category">{humanize(item.category)} · {humanize(item.priority)}</span>
                      </div>
                      {isManager && item.status !== 'ARCHIVED' && (
                        <div className="announcement-actions">
                          <button className="event-secondary-button" type="button" onClick={() => editAnnouncement(item)}>Edit</button>
                          {item.status !== 'PUBLISHED' && (
                            <button className="event-primary-button" type="button" disabled={pendingId === item.id} onClick={() => changeStatus(item, item.status === 'SCHEDULED' ? 'publish-now' : 'publish')}>{item.status === 'SCHEDULED' ? 'Publish now' : 'Publish'}</button>
                          )}
                          <button className="event-secondary-button" type="button" disabled={pendingId === item.id} onClick={() => changeStatus(item, 'archive')}>Archive</button>
                        </div>
                      )}
                    </div>
                    <h3>{item.title}</h3>
                    <p className="announcement-message">{item.message}</p>
                    {item.event && <p className="announcement-related-event">Related event: {item.event.title}</p>}
                    <div className="announcement-dates">
                      <span>Published: {formatDate(item.publishedAt ?? item.publishAt)}</span>
                      {item.expiresAt && <span>Expires: {formatDate(item.expiresAt)}</span>}
                      {item.createdBy && <span>By {item.createdBy.name}</span>}
                    </div>
                  </article>
                ))}
              </div>
            )}
        {!loading && !error && pagination.totalPages > 1 && (
          <nav className="event-pagination" aria-label="Announcement pages">
            <button type="button" disabled={pagination.page <= 1} onClick={() => {
              setLoading(true)
              setPagination((current) => ({ ...current, page: current.page - 1 }))
            }}>Previous</button>
            <span>Page {pagination.page} of {pagination.totalPages} · {pagination.total} total</span>
            <button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => {
              setLoading(true)
              setPagination((current) => ({ ...current, page: current.page + 1 }))
            }}>Next</button>
          </nav>
        )}
      </section>
    </section>
  )
}
