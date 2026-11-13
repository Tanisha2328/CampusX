import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { apiRequest, authRequest } from './authApi.js'
import EventsPage from './EventsPage.jsx'
import ServiceRequestsPage from './ServiceRequestsPage.jsx'
import NotificationsPage from './NotificationsPage.jsx'
import AnnouncementsPage from './AnnouncementsPage.jsx'
import AcademicManagementPage from './AcademicManagementPage.jsx'
import CampusOperationsPage from './CampusOperationsPage.jsx'
import StudentAcademicPage from './StudentAcademicPage.jsx'

const navigation = [
  { label: 'Dashboard', icon: 'grid', target: 'dashboard' },
  { label: 'Courses', icon: 'book', target: 'courses' },
  { label: 'Timetable', icon: 'calendar', target: 'timetable' },
  { label: 'Assignments', icon: 'clipboard', target: 'assignments' },
  { label: 'Attendance QR', icon: 'chart', target: 'attendance' },
  { label: 'Profile', icon: 'user', target: 'profile' },
  { label: 'Events', icon: 'calendar', target: 'events' },
  { label: 'Service Requests', icon: 'support', target: 'service-requests' },
  { label: 'Announcements', icon: 'announcement', target: 'announcements' },
  { label: 'Notifications', icon: 'bell', target: 'notifications' },
  { label: 'Academic Management', icon: 'book', target: 'academic-management' },
  { label: 'Facility Bookings', icon: 'calendar', target: 'facility-bookings' },
  { label: 'Certificates', icon: 'clipboard', target: 'certificates' },
  { label: 'Analytics', icon: 'chart', target: 'analytics' },
  { label: 'Audit Logs', icon: 'clipboard', target: 'audit-logs' },
]

const iconPaths = {
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z" /><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20M8 7h8M8 10h6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7M8.5 18h4" /></>,
  chart: <><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 6-7" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-1.5a7 7 0 0 1 14 0V21z" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
  bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  support: <><path d="M4 13v-2a8 8 0 0 1 16 0v2" /><path d="M4 13h3v6H6a2 2 0 0 1-2-2zM20 13h-3v6h1a2 2 0 0 0 2-2zM17 19a5 5 0 0 1-5 2" /></>,
  announcement: <><path d="M3 11v2a2 2 0 0 0 2 2h2l9 5V4l-9 5H5a2 2 0 0 0-2 2Z" /><path d="m7 15 2 6h4l-3-7M16 9a4 4 0 0 1 0 6" /></>,
  spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" /></>,
}

function Icon({ name, size = 20, className = '' }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconPaths[name]}
    </svg>
  )
}

function Sidebar({ activeItem, onNavigate, isOpen, onClose, assignmentCount, user }) {
  const items = user.role === 'STUDENT'
    ? navigation.filter((item) => !['Academic Management', 'Analytics', 'Audit Logs'].includes(item.label))
    : user.role === 'ADMIN'
      ? navigation.filter((item) => !['Courses', 'Timetable', 'Assignments', 'Certificates', 'Profile'].includes(item.label))
      : user.role === 'FACULTY'
        ? navigation.filter((item) => ['Dashboard', 'Events', 'Service Requests', 'Announcements', 'Notifications', 'Attendance QR', 'Facility Bookings'].includes(item.label))
        : navigation.filter((item) => ['Dashboard', 'Events', 'Announcements', 'Notifications', 'Facility Bookings'].includes(item.label))
  return (
    <>
      {isOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        <a className="brand" href="#dashboard" onClick={() => onNavigate(user.role === 'STUDENT' ? 'Dashboard' : 'Events')}>
          <span className="brand-mark"><Icon name="spark" size={23} /></span>
          <span>campus<span className="brand-light">x</span></span>
        </a>

        <div className="sidebar-label">MENU</div>
        <nav className="side-nav" aria-label="Main navigation">
          {items.map((item) => (
            <a
              className={`nav-link ${activeItem === item.label ? 'nav-link-active' : ''}`}
              href={`#${item.target}`}
              key={item.label}
              onClick={() => {
                onNavigate(item.label)
                onClose()
              }}
            >
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
              {item.label === 'Assignments' && assignmentCount !== null && (
                <span className="nav-count">{assignmentCount}</span>
              )}
            </a>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon"><Icon name="spark" size={18} /></div>
            <strong>Need a hand?</strong>
            <p>Our student support team is here for you.</p>
            <a href="mailto:support@campusx.edu">Get support <Icon name="arrow" size={14} /></a>
          </div>
          <div className="sidebar-version">CampusX · Student portal</div>
        </div>
      </aside>
    </>
  )
}

function Topbar({
  search,
  setSearch,
  onMenuClick,
  onNavigate,
  user,
  unreadCount,
  notificationVersion,
  onNotificationsUpdated,
}) {
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [notificationsError, setNotificationsError] = useState('')
  const [notificationPending, setNotificationPending] = useState('')
  const [logoutPending, setLogoutPending] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const initials = user.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  const role = user.role.toLowerCase().replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

  useEffect(() => {
    if (!notificationsOpen) return undefined
    let active = true
    apiRequest('/notifications?page=1&limit=5')
      .then((result) => {
        if (active) {
          setNotifications(result.items)
          setNotificationsError('')
        }
      })
      .catch((error) => {
        if (!active) return
        if (error.status === 401) {
          window.location.replace('/login')
          return
        }
        setNotificationsError(error.message)
      })
      .finally(() => {
        if (active) setNotificationsLoading(false)
      })
    return () => { active = false }
  }, [notificationVersion, notificationsOpen])

  async function markNotificationRead(notification) {
    if (notification.isRead) {
      setNotificationsOpen(false)
      onNavigate('Notifications')
      return
    }
    setNotificationPending(notification.id)
    setNotificationsLoading(true)
    setNotificationsError('')
    try {
      const result = await apiRequest(`/notifications/${notification.id}/read`, { method: 'PATCH' })
      setNotifications((current) => current.map((item) => (
        item.id === notification.id ? result.notification : item
      )))
      onNotificationsUpdated()
      setNotificationsOpen(false)
      onNavigate('Notifications')
    } catch (error) {
      setNotificationsError(error.message)
    } finally {
      setNotificationPending('')
      setNotificationsLoading(false)
    }
  }

  async function markAllNotificationsRead() {
    setNotificationPending('all')
    setNotificationsLoading(true)
    setNotificationsError('')
    try {
      await apiRequest('/notifications/read-all', { method: 'PATCH' })
      const readAt = new Date().toISOString()
      setNotifications((current) => current.map((item) => ({
        ...item,
        isRead: true,
        readAt: item.readAt ?? readAt,
      })))
      onNotificationsUpdated()
    } catch (error) {
      setNotificationsError(error.message)
    } finally {
      setNotificationPending('')
      setNotificationsLoading(false)
    }
  }

  async function logout() {
    setLogoutPending(true)
    setLogoutError('')

    try {
      await authRequest('/logout', { method: 'POST' })
      window.location.replace('/login')
    } catch (error) {
      setLogoutError(error.message)
      setLogoutPending(false)
    }
  }

  return (
    <header className="topbar">
      <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={onMenuClick}>
        <Icon name="menu" />
      </button>
      <label className="search-box">
        <Icon name="search" size={19} />
        <input
          aria-label="Search courses and assignments"
          placeholder="Search anything..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <kbd>⌘ K</kbd>
      </label>
      <div className="topbar-actions">
        <div className="notification-wrap">
          <button
            className={`icon-button notification-button ${notificationsOpen ? 'icon-button-selected' : ''}`}
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
            onClick={() => {
              if (!notificationsOpen) {
                setNotificationsLoading(true)
                setNotificationsError('')
              }
              setNotificationsOpen(!notificationsOpen)
            }}
          >
            <Icon name="bell" size={20} />
            {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </button>
          {notificationsOpen && (
            <div className="notification-popover">
              <div className="notification-popover-heading">
                <strong>Notifications{unreadCount > 0 ? ` (${unreadCount} unread)` : ''}</strong>
                <button
                  type="button"
                  disabled={notificationPending === 'all' || !notifications.some((item) => !item.isRead)}
                  onClick={markAllNotificationsRead}
                >
                  {notificationPending === 'all' ? 'Saving…' : 'Mark all read'}
                </button>
              </div>
              {notificationsLoading
                ? <p className="notification-popover-message">Loading notifications…</p>
                : notificationsError
                  ? <p className="notification-popover-error" role="alert">{notificationsError}</p>
                  : notifications.length
                    ? notifications.map((notification) => (
                      <button
                        className={`notification-preview ${notification.isRead ? '' : 'notification-preview-unread'}`}
                        type="button"
                        key={notification.id}
                        disabled={notificationPending === notification.id}
                        onClick={() => markNotificationRead(notification)}
                      >
                        <strong>{notification.title}</strong>
                        <span>{notification.message}</span>
                      </button>
                    ))
                    : <p className="notification-popover-message">You have no notifications yet.</p>}
              <button
                className="notification-center-link"
                type="button"
                onClick={() => {
                  setNotificationsOpen(false)
                  onNavigate('Notifications')
                }}
              >
                Open notification center
              </button>
            </div>
          )}
        </div>
        <span className="topbar-divider" />
        <div className="user-menu">
          <span className="avatar">{initials}</span>
          <span className="user-details"><strong>{user.name}</strong><small>{role}</small></span>
          <button className="logout-button" type="button" onClick={logout} disabled={logoutPending}>
            {logoutPending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
      {logoutError && <p className="logout-error" role="alert">{logoutError}</p>}
    </header>
  )
}

function AuthPage({ mode }) {
  const isRegister = mode === 'register'
  const [values, setValues] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState(false)

  function updateField(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setFieldErrors((current) => ({ ...current, [name]: '' }))
    setFormError('')
  }

  async function submit(event) {
    event.preventDefault()
    const nextErrors = {}
    const email = values.email.trim()

    if (isRegister && values.name.trim().length < 2) {
      nextErrors.name = 'Enter your name (at least 2 characters).'
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = 'Enter a valid email address.'
    }
    if (isRegister && values.password.length < 12) {
      nextErrors.password = 'Use at least 12 characters for your password.'
    } else if (new TextEncoder().encode(values.password).byteLength > 72) {
      nextErrors.password = 'Your password must be no more than 72 bytes.'
    } else if (!isRegister && values.password.length === 0) {
      nextErrors.password = 'Enter your password.'
    }
    if (isRegister && values.confirmPassword !== values.password) {
      nextErrors.confirmPassword = 'The passwords do not match.'
    }

    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    setPending(true)
    setFormError('')

    try {
      await authRequest(isRegister ? '/register' : '/login', {
        method: 'POST',
        body: JSON.stringify(isRegister
          ? { name: values.name.trim(), email, password: values.password }
          : { email, password: values.password }),
      })
      window.location.assign('/')
    } catch (error) {
      setFormError(error.message)
      setPending(false)
    }
  }

  return (
    <main className="auth-page">
      <a className="brand auth-brand" href="/login" aria-label="CampusX home">
        <span className="brand-mark"><Icon name="spark" size={23} /></span>
        <span>campus<span className="brand-light">x</span></span>
      </a>
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-card-heading">
          <span className="auth-kicker">CAMPUSX STUDENT PORTAL</span>
          <h1 id="auth-title">{isRegister ? 'Create your account' : 'Welcome back'}</h1>
          <p>{isRegister ? 'Get started with your CampusX account.' : 'Sign in to continue to your dashboard.'}</p>
        </div>
        <form className="auth-form" onSubmit={submit} noValidate>
          {isRegister && (
            <label className="auth-field">
              <span>Full name</span>
              <input
                autoComplete="name"
                name="name"
                value={values.name}
                onChange={updateField}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? 'name-error' : undefined}
                required
              />
              {fieldErrors.name && <small id="name-error" className="field-error">{fieldErrors.name}</small>}
            </label>
          )}
          <label className="auth-field">
            <span>Email address</span>
            <input
              type="email"
              autoComplete="email"
              name="email"
              value={values.email}
              onChange={updateField}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              required
            />
            {fieldErrors.email && <small id="email-error" className="field-error">{fieldErrors.email}</small>}
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              name="password"
              value={values.password}
              onChange={updateField}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'password-error' : undefined}
              required
            />
            {fieldErrors.password && <small id="password-error" className="field-error">{fieldErrors.password}</small>}
          </label>
          {isRegister && (
            <label className="auth-field">
              <span>Confirm password</span>
              <input
                type="password"
                autoComplete="new-password"
                name="confirmPassword"
                value={values.confirmPassword}
                onChange={updateField}
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
                aria-describedby={fieldErrors.confirmPassword ? 'confirm-password-error' : undefined}
                required
              />
              {fieldErrors.confirmPassword && (
                <small id="confirm-password-error" className="field-error">{fieldErrors.confirmPassword}</small>
              )}
            </label>
          )}
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <button className="auth-submit" type="submit" disabled={pending}>
            {pending ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <p className="auth-switch">
          {isRegister ? 'Already have an account?' : 'New to CampusX?'}{' '}
          <a href={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</a>
        </p>
      </section>
      <p className="auth-footer">© 2026 CampusX University</p>
    </main>
  )
}

function AuthLoading({ error, onRetry }) {
  return (
    <main className="auth-page">
      <a className="brand auth-brand" href="/" aria-label="CampusX home">
        <span className="brand-mark"><Icon name="spark" size={23} /></span>
        <span>campus<span className="brand-light">x</span></span>
      </a>
      <section className="auth-card auth-status" aria-live="polite">
        {error
          ? <><h1>We couldn’t load your profile</h1><p>{error}</p><button className="auth-submit" type="button" onClick={onRetry}>Try again</button></>
          : <p>Loading your CampusX profile…</p>}
      </section>
    </main>
  )
}

function StatCard({ icon, label, value, note, className, children }) {
  return (
    <article className={`stat-card ${className}`}>
      <div className="stat-top">
        <span className={`stat-icon ${className}`}><Icon name={icon} size={19} /></span>
        {children}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-note">{note}</div>
    </article>
  )
}

function ScheduleRow({ item, onNavigate }) {
  return (
    <article className="schedule-row">
      <div className="schedule-time">
        <strong>{item.time}</strong>
        <span>{item.end}</span>
      </div>
      <span className={`schedule-marker ${item.color}`} />
      <div className="schedule-info">
        <strong>{item.name}</strong>
        <span>{item.code}</span>
      </div>
      <div className="schedule-location"><Icon name="pin" size={15} />{item.location}</div>
      <button className="row-arrow" aria-label={`View ${item.name}`} onClick={onNavigate}><Icon name="chevron" size={18} /></button>
    </article>
  )
}

function DeadlineRow({ item }) {
  return (
    <article className="deadline-row">
      <span className={`deadline-icon ${item.color}`}><Icon name="clipboard" size={17} /></span>
      <div className="deadline-info">
        <span>{item.subject}</span>
        <strong>{item.title}</strong>
        <small><Icon name="clock" size={13} />Due {item.due}</small>
      </div>
      <span className={`due-badge ${item.days === 'Today' ? 'due-today' : ''}`}>{item.days}</span>
    </article>
  )
}

const timezone = 'Asia/Kolkata'
const itemColors = ['blue', 'purple', 'orange']

function getKolkataDateKey(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const date = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]))
  return `${date.year}-${date.month}-${date.day}`
}

function formatKolkataDate(value, options) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: timezone, ...options }).format(new Date(value))
}

function presentClass(item, index) {
  return {
    time: formatKolkataDate(item.startsAt, { hour: '2-digit', minute: '2-digit', hour12: true }),
    end: formatKolkataDate(item.endsAt, { hour: '2-digit', minute: '2-digit', hour12: true }),
    name: item.offering.course.title,
    code: item.offering.course.code,
    location: item.location || 'Location not set',
    color: itemColors[index % itemColors.length],
  }
}

function presentAssignment(item, index) {
  const dueAt = new Date(item.dueAt)
  const todayKey = getKolkataDateKey(new Date())
  const dueDateKey = getKolkataDateKey(dueAt)
  const daysUntil = Math.round(
    (Date.parse(`${dueDateKey}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`))
      / (24 * 60 * 60 * 1000),
  )

  return {
    subject: item.offering.course.title,
    title: item.title,
    due: formatKolkataDate(dueAt, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }),
    days: daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : formatKolkataDate(dueAt, {
      month: 'short',
      day: 'numeric',
    }),
    color: itemColors[index % itemColors.length],
  }
}

function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  const [user, setUser] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState('')
  const [profileAttempt, setProfileAttempt] = useState(0)
  const [dashboard, setDashboard] = useState(null)
  const [dashboardLoading, setDashboardLoading] = useState(true)
  const [dashboardError, setDashboardError] = useState('')
  const [dashboardAttempt, setDashboardAttempt] = useState(0)
  const [search, setSearch] = useState('')
  const [activeItem, setActiveItem] = useState('Dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notificationVersion, setNotificationVersion] = useState(0)
  const [unreadCount, setUnreadCount] = useState(null)

  useEffect(() => {
    if (path === '/login' || path === '/register') {
      return undefined
    }
    let active = true
    authRequest('/me')
      .then((profile) => {
        if (active) {
          setUser(profile.user)
          if (profile.user.role !== 'STUDENT') setActiveItem('Events')
        }
      })
      .catch((error) => {
        if (!active) return
        if (error.status === 401) {
          window.location.replace('/login')
          return
        }
        setProfileError(error.message)
      })
      .finally(() => {
        if (active) setProfileLoading(false)
      })

    return () => {
      active = false
    }
  }, [path, profileAttempt])

  useEffect(() => {
    if (!user || user.role !== 'STUDENT' || path === '/login' || path === '/register') {
      return undefined
    }

    let active = true
    apiRequest('/academic/dashboard')
      .then((result) => {
        if (active) setDashboard(result)
      })
      .catch((error) => {
        if (!active) return
        if (error.status === 401) {
          window.location.replace('/login')
          return
        }
        setDashboardError(error.message)
      })
      .finally(() => {
        if (active) setDashboardLoading(false)
      })

    return () => {
      active = false
    }
  }, [path, user, dashboardAttempt])

  useEffect(() => {
    if (!user || path === '/login' || path === '/register') return undefined
    let active = true
    apiRequest('/notifications/unread-count')
      .then((result) => {
        if (active) setUnreadCount(result.count)
      })
      .catch((error) => {
        if (!active) return
        if (error.status === 401) {
          window.location.replace('/login')
          return
        }
        setUnreadCount(null)
      })
    return () => { active = false }
  }, [notificationVersion, path, user])

  const query = search.trim().toLowerCase()
  const classes = useMemo(
    () => dashboard?.todaysClasses.map((item, index) => presentClass(item, index)) ?? [],
    [dashboard],
  )
  const assignments = useMemo(
    () => dashboard?.upcomingAssignments.map((item, index) => presentAssignment(item, index)) ?? [],
    [dashboard],
  )
  const assignmentsDueToday = assignments.filter((assignment) => assignment.days === 'Today').length

  const filteredClasses = useMemo(
    () => classes.filter((item) => `${item.name} ${item.code} ${item.location}`.toLowerCase().includes(query)),
    [classes, query],
  )
  const filteredDeadlines = useMemo(
    () => assignments.filter((item) => `${item.subject} ${item.title}`.toLowerCase().includes(query)),
    [assignments, query],
  )
  const today = new Date()
  const attendanceValue = dashboard?.attendancePercentage === null || dashboard?.attendancePercentage === undefined
    ? '—'
    : `${dashboard.attendancePercentage.toFixed(1)}%`
  const assignmentCount = dashboardLoading || dashboardError ? null : dashboard?.upcomingAssignments.length ?? 0

  if (path === '/login') return <AuthPage mode="login" />
  if (path === '/register') return <AuthPage mode="register" />
  if (profileLoading || !user) {
    return (
      <AuthLoading
        error={profileError}
        onRetry={() => {
          setProfileError('')
          setProfileLoading(true)
          setProfileAttempt((attempt) => attempt + 1)
        }}
      />
    )
  }

  return (
    <div className="app-shell" id="dashboard">
      <Sidebar
        activeItem={activeItem}
        onNavigate={setActiveItem}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        assignmentCount={assignmentCount}
        user={user}
      />
      <main className="main-area">
        <Topbar
          search={search}
          setSearch={setSearch}
          onMenuClick={() => setSidebarOpen(true)}
          onNavigate={setActiveItem}
          user={user}
          unreadCount={unreadCount}
          notificationVersion={notificationVersion}
          onNotificationsUpdated={() => setNotificationVersion((value) => value + 1)}
        />
        {activeItem === 'Academic Management' && user.role === 'ADMIN'
          ? <div className="dashboard-content"><AcademicManagementPage user={user} /></div>
          : ['Facility Bookings', 'Attendance QR', 'Certificates', 'Analytics', 'Audit Logs'].includes(activeItem)
            ? <div className="dashboard-content"><CampusOperationsPage section={activeItem} user={user} /></div>
          : ['Courses', 'Timetable', 'Assignments'].includes(activeItem) && user.role === 'STUDENT'
            ? <div className="dashboard-content"><StudentAcademicPage section={activeItem} search={search} /></div>
          : activeItem === 'Profile' && user.role === 'STUDENT'
            ? <div className="dashboard-content"><section className="operations-page"><header className="operations-heading"><div><div className="section-kicker">ACCOUNT</div><h1>Your profile</h1><p>Your CampusX account details.</p></div></header><section className="panel operations-panel"><h2>Personal information</h2><p><strong>Name</strong> · {user.name}</p><p><strong>Email</strong> · {user.email}</p><p><strong>Role</strong> · {user.role}</p><p>For profile changes, contact your campus administrator.</p></section></section></div>
          : activeItem === 'Events'
          ? <div className="dashboard-content"><EventsPage user={user} search={search} /></div>
          : activeItem === 'Service Requests'
            ? <div className="dashboard-content"><ServiceRequestsPage user={user} search={search} /></div>
            : activeItem === 'Announcements'
              ? <div className="dashboard-content"><AnnouncementsPage user={user} /></div>
              : activeItem === 'Notifications'
                ? <div className="dashboard-content"><NotificationsPage onNotificationsUpdated={() => setNotificationVersion((value) => value + 1)} /></div>
              : activeItem === 'Dashboard' && user.role === 'ADMIN'
                ? <div className="dashboard-content"><CampusOperationsPage section="Analytics" user={user} /></div>
          : <div className="dashboard-content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><span className="live-dot" /> {formatKolkataDate(today, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              }).toUpperCase()}</div>
              <h1>Welcome, {user.name} <span className="wave">✦</span></h1>
              <p>Your academic overview and schedule for today.</p>
            </div>
            <div className="term-select dashboard-term">
              <span className="term-dot" />
              {dashboard?.term?.name ?? (dashboardLoading ? 'Loading academic term…' : 'No active term')}
            </div>
          </section>

          {dashboardError && (
            <p className="form-error" role="alert">
              Couldn’t load your academic dashboard: {dashboardError}{' '}
              <button
                className="dashboard-retry"
                type="button"
                onClick={() => {
                  setDashboardError('')
                  setDashboardLoading(true)
                  setDashboardAttempt((attempt) => attempt + 1)
                }}
              >
                Try again
              </button>
            </p>
          )}

          <section className="stats-grid" aria-label="Academic overview">
            <StatCard icon="book" label="Enrolled courses" value={dashboardLoading || dashboardError ? '—' : dashboard.enrolledCourseCount} note={dashboardLoading ? 'Loading courses' : dashboardError ? 'Courses unavailable' : dashboard?.term?.name ?? 'No active term'} className="stat-blue">
              <span className="stat-trend">{dashboardLoading ? 'Loading' : 'This term'}</span>
            </StatCard>
            <StatCard icon="clipboard" label="Upcoming assignments" value={dashboardLoading || dashboardError ? '—' : assignments.length} note={dashboardLoading ? 'Loading assignments' : `${assignmentsDueToday} due today`} className="stat-purple">
              <span className="stat-trend">{dashboardLoading ? 'Loading' : 'Published'}</span>
            </StatCard>
            <StatCard
              icon="chart"
              label="Attendance rate"
              value={dashboardLoading || dashboardError ? '—' : attendanceValue}
              note={dashboardLoading
                ? 'Loading attendance'
                : dashboardError
                  ? 'Attendance unavailable'
                  : dashboard?.attendancePercentage === null || dashboard?.attendancePercentage === undefined
                    ? 'No attendance recorded'
                    : 'Current term'}
              className="stat-green"
            >
              {dashboard?.attendancePercentage !== null
                && dashboard?.attendancePercentage !== undefined
                && !dashboardLoading
                && !dashboardError && (
                <span className="attendance-ring"><span>{Math.round(dashboard.attendancePercentage)}</span></span>
              )}
            </StatCard>
            <StatCard icon="calendar" label="Classes today" value={dashboardLoading || dashboardError ? '—' : classes.length} note={dashboardLoading ? 'Loading schedule' : 'Scheduled today'} className="stat-orange">
              <span className="stat-trend">{dashboardLoading ? 'Loading' : 'Today'}</span>
            </StatCard>
          </section>

          <section className="content-grid">
            <section className="panel schedule-panel" id="timetable">
              <div className="panel-heading">
                <div>
                  <div className="section-kicker">YOUR SCHEDULE</div>
                  <h2>Today’s classes <span className="heading-count">{dashboardLoading || dashboardError ? '—' : classes.length}</span></h2>
                </div>
                <a className="text-link" href="#timetable" onClick={() => setActiveItem('Timetable')}>Full timetable <Icon name="arrow" size={15} /></a>
              </div>
              <div className="schedule-date"><span>{formatKolkataDate(today, { weekday: 'short' }).toUpperCase()}</span><strong>{formatKolkataDate(today, { month: 'long', day: 'numeric' })}</strong><span className="date-line" /><span className="today-tag">TODAY</span></div>
              <div className="schedule-list">
                {dashboardLoading
                  ? <p className="empty-state">Loading today’s classes…</p>
                  : dashboardError
                    ? <p className="empty-state">Today’s classes are unavailable.</p>
                    : filteredClasses.length
                      ? filteredClasses.map((item, index) => <ScheduleRow item={item} key={`${item.code}-${index}`} onNavigate={() => setActiveItem('Timetable')} />)
                      : <p className="empty-state">{classes.length && query ? `No classes match “${search}”.` : 'No classes scheduled for today.'}</p>}
              </div>
            </section>

            <section className="panel deadlines-panel" id="assignments">
              <div className="panel-heading">
                <div>
                  <div className="section-kicker">STAY ON TRACK</div>
                  <h2>Upcoming deadlines</h2>
                </div>
                <a className="text-link" href="#assignments" onClick={() => setActiveItem('Assignments')}>View all <Icon name="arrow" size={15} /></a>
              </div>
              <div className="deadline-list">
                {dashboardLoading
                  ? <p className="empty-state">Loading upcoming assignments…</p>
                  : dashboardError
                    ? <p className="empty-state">Upcoming assignments are unavailable.</p>
                    : filteredDeadlines.length
                      ? filteredDeadlines.map((item, index) => <DeadlineRow item={item} key={`${item.title}-${index}`} />)
                      : <p className="empty-state">{assignments.length && query ? `No deadlines match “${search}”.` : 'No upcoming assignments.'}</p>}
              </div>
              <a className="all-assignments" href="#assignments" onClick={() => setActiveItem('Assignments')}>See all assignments <Icon name="arrow" size={15} /></a>
            </section>
          </section>

          <footer className="dashboard-footer" id="attendance">
            <span>© 2026 CampusX University</span>
            <span>Made for your next big thing <span className="footer-spark">✦</span></span>
            <span id="profile">Need help? <a href="mailto:support@campusx.edu">Contact support</a></span>
          </footer>
        </div>}
      </main>
    </div>
  )
}

export default App
