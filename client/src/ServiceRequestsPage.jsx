import { useEffect, useState } from 'react'
import { apiRequest } from './authApi.js'

const categories = [
  ['FACILITIES', 'Facilities'],
  ['IT_SUPPORT', 'IT support'],
  ['ACADEMIC', 'Academic'],
  ['FINANCIAL', 'Financial'],
  ['LIBRARY', 'Library'],
  ['OTHER', 'Other'],
]
const statuses = ['SUBMITTED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED']
const priorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT']
const emptyForm = { category: '', priority: 'NORMAL', title: '', description: '' }

function humanize(value) {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^\w/, (letter) => letter.toUpperCase())
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function ServiceRequestsPage({ user, search = '' }) {
  const isStudent = user.role === 'STUDENT'
  const isAdmin = user.role === 'ADMIN'
  const [items, setItems] = useState([])
  const [assignees, setAssignees] = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [detailError, setDetailError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionPending, setActionPending] = useState(false)
  const [nextStatus, setNextStatus] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    let active = true
    const query = new URLSearchParams({ page: String(pagination.page), limit: '20' })
    if (categoryFilter) query.set('category', categoryFilter)
    if (statusFilter) query.set('status', statusFilter)
    const listPath = isStudent ? '/service-requests/mine' : '/service-requests'
    const requests = [apiRequest(`${listPath}?${query}`)]
    if (isAdmin) requests.push(apiRequest('/service-requests/assignees'))

    Promise.all(requests)
      .then(([result, assigneeResult]) => {
        if (!active) return
        setItems(result.items)
        setPagination(result.pagination)
        if (assigneeResult) setAssignees(assigneeResult.items)
        setLoadError('')
      })
      .catch((error) => {
        if (active) setLoadError(error.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [categoryFilter, isAdmin, isStudent, pagination.page, reload, statusFilter])

  async function showDetails(id) {
    setSelectedRequest(null)
    setDetailError('')
    setActionError('')
    setNote('')
    try {
      const result = await apiRequest(`/service-requests/${id}`)
      setSelectedRequest(result.serviceRequest)
      setNextStatus(result.serviceRequest.status)
      setAssigneeId(result.serviceRequest.assignedToId ?? '')
    } catch (error) {
      setDetailError(error.message)
    }
  }

  function refresh() {
    setLoadError('')
    setLoading(true)
    setReload((value) => value + 1)
  }

  async function submitRequest(event) {
    event.preventDefault()
    setFormError('')
    setSubmitting(true)
    try {
      const result = await apiRequest('/service-requests', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          title: form.title.trim(),
          description: form.description.trim(),
        }),
      })
      setForm(emptyForm)
      setPagination((current) => ({ ...current, page: 1 }))
      refresh()
      setSelectedRequest(result.serviceRequest)
    } catch (error) {
      setFormError(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function updateRequest(event) {
    event.preventDefault()
    if (!selectedRequest) return
    setActionError('')
    setActionPending(true)
    try {
      const body = {}
      if (nextStatus !== selectedRequest.status) body.status = nextStatus
      if (isAdmin && assigneeId !== (selectedRequest.assignedToId ?? '')) {
        body.assignedToId = assigneeId || null
      }
      if (note.trim()) body.note = note.trim()
      const result = await apiRequest(`/service-requests/${selectedRequest.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      setSelectedRequest(result.serviceRequest)
      setNextStatus(result.serviceRequest.status)
      setAssigneeId(result.serviceRequest.assignedToId ?? '')
      setNote('')
      refresh()
    } catch (error) {
      setActionError(error.message)
    } finally {
      setActionPending(false)
    }
  }

  const query = search.trim().toLowerCase()
  const visibleItems = items.filter((item) => (
    `${item.title} ${item.description} ${item.category} ${item.status} ${item.student?.name ?? ''}`
      .toLowerCase().includes(query)
  ))
  const canSubmitUpdate = selectedRequest && (
    nextStatus !== selectedRequest.status
    || (isAdmin && assigneeId !== (selectedRequest.assignedToId ?? ''))
    || note.trim().length > 0
  )

  return (
    <section className="service-requests-page" aria-labelledby="service-requests-title">
      <header className="service-requests-heading">
        <div>
          <div className="section-kicker">CAMPUS SUPPORT</div>
          <h1 id="service-requests-title">{isStudent ? 'My service requests' : isAdmin ? 'Service request management' : 'Assigned requests'}</h1>
          <p>{isStudent
            ? 'Submit an issue and follow its progress through resolution.'
            : isAdmin
              ? 'Review, assign, and resolve requests from across campus.'
              : 'Track requests assigned to you and keep students informed.'}</p>
        </div>
        <span className="service-request-tag">{isStudent ? 'Student support' : isAdmin ? 'Administrator view' : 'Faculty view'}</span>
      </header>

      {isStudent && (
        <form className="service-request-form panel" onSubmit={submitRequest}>
          <div className="panel-heading">
            <div><div className="section-kicker">NEW REQUEST</div><h2>Tell us what you need</h2></div>
          </div>
          <div className="service-request-form-grid">
            <label>Category
              <select required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                <option value="">Choose a category</option>
                {categories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label>Priority
              <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                {priorities.map((value) => <option value={value} key={value}>{humanize(value)}</option>)}
              </select>
            </label>
            <label className="service-request-wide">Title
              <input required minLength="3" maxLength="150" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </label>
            <label className="service-request-wide">Description
              <textarea required minLength="10" maxLength="5000" rows="4" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </label>
          </div>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <button className="event-primary-button" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit request'}</button>
        </form>
      )}

      <section className="service-request-list panel" aria-label="Service request list">
        <div className="service-request-list-heading">
          <div><div className="section-kicker">{isStudent ? 'REQUEST HISTORY' : 'REQUEST QUEUE'}</div><h2>{isStudent ? 'Your requests' : 'Requests'}</h2></div>
          <div className="service-request-filters">
            <label>Category
              <select value={categoryFilter} onChange={(event) => {
                setCategoryFilter(event.target.value)
                setPagination((current) => ({ ...current, page: 1 }))
              }}>
                <option value="">All categories</option>
                {categories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label>Status
              <select value={statusFilter} onChange={(event) => {
                setStatusFilter(event.target.value)
                setPagination((current) => ({ ...current, page: 1 }))
              }}>
                <option value="">All statuses</option>
                {statuses.map((status) => <option value={status} key={status}>{humanize(status)}</option>)}
              </select>
            </label>
          </div>
        </div>

        {loadError && (
          <div className="event-message" role="alert">
            <p>Requests couldn’t be loaded: {loadError}</p>
            <button type="button" className="event-secondary-button" onClick={refresh}>Try again</button>
          </div>
        )}
        {detailError && <p className="form-error" role="alert">{detailError}</p>}

        {selectedRequest && (
          <article className="service-request-detail">
            <div className="service-request-detail-top">
              <div>
                <span className={`service-request-status status-${selectedRequest.status.toLowerCase()}`}>{humanize(selectedRequest.status)}</span>
                <h3>{selectedRequest.title}</h3>
                <p>{selectedRequest.description}</p>
              </div>
              <button className="event-close" type="button" onClick={() => setSelectedRequest(null)}>Close</button>
            </div>
            <dl className="service-request-facts">
              <div><dt>Category</dt><dd>{humanize(selectedRequest.category)}</dd></div>
              <div><dt>Priority</dt><dd>{humanize(selectedRequest.priority)}</dd></div>
              <div><dt>Submitted</dt><dd>{formatDate(selectedRequest.createdAt)}</dd></div>
              {!isStudent && <div><dt>Student</dt><dd>{selectedRequest.student?.name}</dd></div>}
              <div><dt>Assigned to</dt><dd>{selectedRequest.assignedTo?.name ?? 'Unassigned'}</dd></div>
              {selectedRequest.resolvedAt && <div><dt>Resolved</dt><dd>{formatDate(selectedRequest.resolvedAt)}</dd></div>}
            </dl>

            {selectedRequest.notes.length > 0 && (
              <div className="service-request-notes">
                <h4>Progress and resolution notes</h4>
                {selectedRequest.notes.map((item) => (
                  <article className="service-request-note" key={item.id}>
                    <div><strong>{item.author.name}</strong><span>{humanize(item.type)} · {formatDate(item.createdAt)}</span></div>
                    <p>{item.content}</p>
                  </article>
                ))}
              </div>
            )}

            {!isStudent && (
              <form className="service-request-update" onSubmit={updateRequest}>
                <h4>Update request</h4>
                <div className="service-request-form-grid">
                  <label>Status
                    <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
                      {(isAdmin
                        ? statuses
                        : [...new Set([selectedRequest.status, 'IN_PROGRESS', 'RESOLVED'])]).map((status) => (
                        <option value={status} key={status}>{humanize(status)}</option>
                      ))}
                    </select>
                  </label>
                  {isAdmin && (
                    <label>Assign to faculty
                      <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                        <option value="">Unassigned</option>
                        {assignees.map((person) => <option value={person.id} key={person.id}>{person.name} · {person.email}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="service-request-wide">Progress or resolution note
                    <textarea maxLength="2000" rows="3" value={note} onChange={(event) => setNote(event.target.value)} />
                  </label>
                </div>
                {actionError && <p className="form-error" role="alert">{actionError}</p>}
                <button className="event-primary-button" type="submit" disabled={actionPending || !canSubmitUpdate}>
                  {actionPending ? 'Saving…' : 'Save update'}
                </button>
              </form>
            )}
          </article>
        )}

        {loading
          ? <p className="event-message" aria-live="polite">Loading service requests…</p>
          : !loadError && visibleItems.length === 0
            ? <p className="event-message">{query ? 'No requests match your search.' : isStudent ? 'You have not submitted any service requests yet.' : 'There are no requests to show.'}</p>
            : !loadError && (
              <div className="service-request-items">
                {visibleItems.map((item) => (
                  <article className="service-request-item" key={item.id}>
                    <div className="service-request-item-main">
                      <span className={`service-request-status status-${item.status.toLowerCase()}`}>{humanize(item.status)}</span>
                      <h3>{item.title}</h3>
                      <p>{humanize(item.category)} · {humanize(item.priority)} · {formatDate(item.createdAt)}</p>
                      {!isStudent && <small>{item.student?.name} · {item.assignedTo?.name ?? 'Unassigned'}</small>}
                    </div>
                    <button className="event-secondary-button" type="button" onClick={() => showDetails(item.id)}>View details</button>
                  </article>
                ))}
              </div>
            )}
        {!loading && !loadError && pagination.totalPages > 1 && (
          <nav className="event-pagination" aria-label="Service request pages">
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
