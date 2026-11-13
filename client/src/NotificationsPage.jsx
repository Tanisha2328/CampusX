import { useEffect, useState } from 'react'
import { apiRequest } from './authApi.js'

function humanize(value) {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^\w/, (letter) => letter.toUpperCase())
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function NotificationsPage({ onNotificationsUpdated }) {
  const [items, setItems] = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [pendingId, setPendingId] = useState('')
  const [markingAll, setMarkingAll] = useState(false)

  useEffect(() => {
    let active = true
    apiRequest(`/notifications?page=${pagination.page}&limit=20`)
      .then((result) => {
        if (!active) return
        setItems(result.items)
        setPagination(result.pagination)
        setError('')
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [pagination.page, reload])

  async function markAsRead(id) {
    setPendingId(id)
    setError('')
    try {
      const result = await apiRequest(`/notifications/${id}/read`, { method: 'PATCH' })
      setItems((current) => current.map((item) => item.id === id ? result.notification : item))
      onNotificationsUpdated()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setPendingId('')
    }
  }

  async function markAllAsRead() {
    setMarkingAll(true)
    setError('')
    try {
      await apiRequest('/notifications/read-all', { method: 'PATCH' })
      const readAt = new Date().toISOString()
      setItems((current) => current.map((item) => ({ ...item, isRead: true, readAt: item.readAt ?? readAt })))
      onNotificationsUpdated()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setMarkingAll(false)
    }
  }

  function refresh() {
    setLoading(true)
    setReload((value) => value + 1)
  }

  return (
    <section className="notifications-page" aria-labelledby="notifications-title">
      <header className="notifications-heading">
        <div>
          <div className="section-kicker">YOUR UPDATES</div>
          <h1 id="notifications-title">Notifications</h1>
          <p>Updates about announcements, events, and your service requests.</p>
        </div>
        <button
          className="event-secondary-button"
          type="button"
          disabled={markingAll || !items.some((item) => !item.isRead)}
          onClick={markAllAsRead}
        >
          {markingAll ? 'Marking…' : 'Mark all as read'}
        </button>
      </header>

      {error && (
        <div className="event-message" role="alert">
          <p>Notifications couldn’t be loaded or updated: {error}</p>
          <button className="event-secondary-button" type="button" onClick={refresh}>Try again</button>
        </div>
      )}

      {loading
        ? <p className="event-message" aria-live="polite">Loading notifications…</p>
        : !error && items.length === 0
          ? <p className="event-message">You have no notifications yet.</p>
          : !error && (
            <div className="notifications-list panel">
              {items.map((item) => (
                <article className={`notification-item ${item.isRead ? '' : 'notification-item-unread'}`} key={item.id}>
                  <div className="notification-item-content">
                    <span className="notification-category">{humanize(item.category)} · {formatDate(item.createdAt)}</span>
                    <h2>{item.title}</h2>
                    <p>{item.message}</p>
                  </div>
                  {!item.isRead && (
                    <button
                      className="event-secondary-button"
                      type="button"
                      disabled={pendingId === item.id}
                      onClick={() => markAsRead(item.id)}
                    >
                      {pendingId === item.id ? 'Saving…' : 'Mark as read'}
                    </button>
                  )}
                  {item.isRead && <span className="notification-read-label">Read</span>}
                </article>
              ))}
            </div>
          )}

      {!loading && !error && pagination.totalPages > 1 && (
        <nav className="event-pagination" aria-label="Notification pages">
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
  )
}
