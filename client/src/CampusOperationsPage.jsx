import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { apiRequest } from './authApi.js'
import './CampusOperationsPage.css'

function formatDate(value) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function ErrorMessage({ children }) {
  return children ? <p className="form-error" role="alert">{children}</p> : null
}

function BookingPage({ user }) {
  const isAdmin = user.role === 'ADMIN'
  const [facilities, setFacilities] = useState([])
  const [bookings, setBookings] = useState([])
  const [form, setForm] = useState({
    facilityId: '',
    title: '',
    purpose: '',
    startsAt: '',
    endsAt: '',
  })
  const [newFacility, setNewFacility] = useState({ name: '', location: '', capacity: '20', description: '' })
  const [availability, setAvailability] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    Promise.all([
      apiRequest('/facilities'),
      apiRequest(`/facilities/bookings${isAdmin ? '' : '/mine'}`),
    ]).then(([facilityResult, bookingResult]) => {
      if (!active) return
      setFacilities(facilityResult.items)
      setBookings(bookingResult.items)
      setForm((current) => ({
        ...current,
        facilityId: current.facilityId || facilityResult.items[0]?.id || '',
      }))
      setError('')
    }).catch((requestError) => {
      if (active) setError(requestError.message)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [isAdmin, reload])

  useEffect(() => {
    if (!form.facilityId || !form.startsAt || !form.endsAt
      || new Date(form.endsAt) <= new Date(form.startsAt)) {
      return undefined
    }
    let active = true
    const signature = `${form.facilityId}:${form.startsAt}:${form.endsAt}`
    const query = new URLSearchParams({
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
    })
    apiRequest(`/facilities/${form.facilityId}/availability?${query}`)
      .then((result) => { if (active) setAvailability({ signature, available: result.available }) })
      .catch(() => { if (active) setAvailability({ signature, available: false }) })
    return () => { active = false }
  }, [form.facilityId, form.startsAt, form.endsAt])
  const signature = `${form.facilityId}:${form.startsAt}:${form.endsAt}`
  const available = availability?.signature === signature ? availability.available : null

  async function submitBooking(event) {
    event.preventDefault()
    setPending(true)
    setError('')
    setMessage('')
    try {
      await apiRequest('/facilities/bookings', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
        }),
      })
      setMessage('Your booking request was submitted.')
      setForm((current) => ({ ...current, title: '', purpose: '', startsAt: '', endsAt: '' }))
      setReload((value) => value + 1)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setPending(false)
    }
  }

  async function createFacility(event) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      await apiRequest('/facilities', {
        method: 'POST',
        body: JSON.stringify({ ...newFacility, capacity: Number(newFacility.capacity) }),
      })
      setNewFacility({ name: '', location: '', capacity: '20', description: '' })
      setMessage('Facility added.')
      setReload((value) => value + 1)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setPending(false)
    }
  }

  async function reviewBooking(booking, status) {
    setPending(true)
    setError('')
    try {
      await apiRequest(`/facilities/bookings/${booking.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      setReload((value) => value + 1)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setPending(false)
    }
  }

  async function cancelBooking(booking) {
    setPending(true)
    setError('')
    setMessage('')
    try {
      await apiRequest(`/facilities/bookings/${booking.id}/cancel`, { method: 'POST' })
      setMessage('Your booking was cancelled.')
      setReload((value) => value + 1)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="operations-page">
      <header className="operations-heading">
        <div><div className="section-kicker">CAMPUS RESOURCES</div><h1>Facility bookings</h1>
          <p>Request a space, check availability, and track review status.</p></div>
      </header>
      <ErrorMessage>{error}</ErrorMessage>
      {message && <p className="success-message" role="status">{message}</p>}
      {isAdmin && <form className="panel operations-panel" onSubmit={createFacility}>
        <h2>Add a facility</h2>
        <div className="operations-form-grid">
          <label>Name<input required minLength="2" maxLength="120" value={newFacility.name} onChange={(event) => setNewFacility({ ...newFacility, name: event.target.value })} /></label>
          <label>Location<input required maxLength="200" value={newFacility.location} onChange={(event) => setNewFacility({ ...newFacility, location: event.target.value })} /></label>
          <label>Capacity<input required type="number" min="1" max="10000" value={newFacility.capacity} onChange={(event) => setNewFacility({ ...newFacility, capacity: event.target.value })} /></label>
          <label>Description<input maxLength="2000" value={newFacility.description} onChange={(event) => setNewFacility({ ...newFacility, description: event.target.value })} /></label>
        </div>
        <button className="event-primary-button" disabled={pending}>Add facility</button>
      </form>}
      <div className="operations-columns">
        <form className="panel operations-panel" onSubmit={submitBooking}>
          <h2>Request a booking</h2>
          <div className="operations-form-grid">
            <label>Facility<select required value={form.facilityId} onChange={(event) => setForm({ ...form, facilityId: event.target.value })}>
              <option value="">Select a facility</option>
              {facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name} · {facility.location}</option>)}
            </select></label>
            <label>Title<input required minLength="3" maxLength="150" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
            <label>Starts<input required type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></label>
            <label>Ends<input required type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></label>
            <label className="operations-wide">Purpose<textarea required minLength="3" maxLength="2000" rows="3" value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} /></label>
          </div>
          {available === true && <p className="success-message">This time slot is currently available.</p>}
          {available === false && <ErrorMessage>This time slot is unavailable or could not be checked.</ErrorMessage>}
          {facilities.length === 0 && !loading && <p className="empty-state">No facilities are listed yet.</p>}
          <button className="event-primary-button" disabled={pending || loading || facilities.length === 0 || available !== true}>
            {pending ? 'Submitting…' : 'Request facility'}
          </button>
        </form>
        <section className="panel operations-panel">
          <h2>{isAdmin ? 'Booking requests' : 'Your booking history'}</h2>
          {loading ? <p className="empty-state">Loading bookings…</p>
            : bookings.length === 0 ? <p className="empty-state">No booking history yet.</p>
              : <div className="operations-list">{bookings.map((booking) => (
                <article className="operations-record" key={booking.id}>
                  <div className="record-heading"><strong>{booking.title}</strong><span className={`event-status status-${booking.status.toLowerCase()}`}>{booking.status}</span></div>
                  <p>{booking.facility.name} · {booking.facility.location}</p>
                  <p>{formatDate(booking.startsAt)} – {formatDate(booking.endsAt)}</p>
                  {isAdmin && <p>Requested by {booking.requester.name}</p>}
                  {isAdmin && booking.status === 'PENDING' && <div className="record-actions">
                    <button className="event-primary-button" disabled={pending} onClick={() => reviewBooking(booking, 'APPROVED')}>Approve</button>
                    <button className="event-secondary-button" disabled={pending} onClick={() => reviewBooking(booking, 'REJECTED')}>Reject</button>
                  </div>}
                  {!isAdmin && ['PENDING', 'APPROVED'].includes(booking.status)
                    && new Date(booking.startsAt) > new Date() && (
                    <div className="record-actions">
                      <button className="event-secondary-button" disabled={pending} onClick={() => cancelBooking(booking)}>Cancel booking</button>
                    </div>
                  )}
                </article>
              ))}</div>}
        </section>
      </div>
    </section>
  )
}

function AttendancePage({ user }) {
  const staff = ['ADMIN', 'FACULTY'].includes(user.role)
  const [sessions, setSessions] = useState([])
  const [history, setHistory] = useState([])
  const [sessionId, setSessionId] = useState('')
  const [qr, setQr] = useState('')
  const [qrImage, setQrImage] = useState(null)
  const [scanValue, setScanValue] = useState('')
  const [scanning, setScanning] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const videoRef = useRef(null)

  useEffect(() => {
    let active = true
    const resource = staff
      ? apiRequest('/academic/sessions').then((result) => {
        if (active) setSessions(result.items)
      })
      : apiRequest('/attendance/mine').then((result) => {
        if (active) setHistory(result.items)
      })
    resource.catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [staff])

  useEffect(() => {
    if (!qr) return undefined
    let active = true
    QRCode.toDataURL(qr, { width: 280, margin: 2, errorCorrectionLevel: 'M' })
      .then((image) => { if (active) setQrImage({ token: qr, image }) })
      .catch((qrError) => { if (active) setError(qrError.message) })
    return () => { active = false }
  }, [qr])

  useEffect(() => {
    if (!scanning) return undefined
    let active = true
    let stream
    let frame
    async function startScanner() {
      if (!('BarcodeDetector' in window)) {
        setError('QR scanning is not supported by this browser. Paste the QR text below instead.')
        setScanning(false)
        return
      }
      try {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (!active || !videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        const scanFrame = async () => {
          if (!active || !videoRef.current) return
          const codes = await detector.detect(videoRef.current)
          if (codes[0]?.rawValue) {
            setScanValue(codes[0].rawValue)
            setScanning(false)
            return
          }
          frame = window.requestAnimationFrame(scanFrame)
        }
        frame = window.requestAnimationFrame(scanFrame)
      } catch (scanError) {
        setError(scanError.message || 'Unable to access the camera.')
        setScanning(false)
      }
    }
    startScanner()
    return () => {
      active = false
      if (frame) window.cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [scanning])

  async function createQr(event) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      const result = await apiRequest(`/attendance/sessions/${sessionId}/qr`, { method: 'POST' })
      setQr(result.token)
      setMessage(`QR is valid until ${formatDate(result.expiresAt)}.`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setPending(false)
    }
  }

  async function submitScan(event) {
    event.preventDefault()
    setPending(true)
    setError('')
    setMessage('')
    try {
      await apiRequest('/attendance/scan', {
        method: 'POST',
        body: JSON.stringify({ token: scanValue }),
      })
      setMessage('Attendance recorded successfully.')
      setScanValue('')
      const result = await apiRequest('/attendance/mine')
      setHistory(result.items)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="operations-page">
      <header className="operations-heading"><div><div className="section-kicker">ACADEMIC RECORDS</div>
        <h1>QR attendance</h1><p>{staff ? 'Create a short-lived class check-in QR code.' : 'Scan your class QR code and review your attendance history.'}</p>
      </div></header>
      <ErrorMessage>{error}</ErrorMessage>
      {message && <p className="success-message" role="status">{message}</p>}
      {staff ? <form className="panel operations-panel" onSubmit={createQr}>
        <h2>Create class QR</h2>
        {loading ? <p className="empty-state">Loading scheduled classes…</p> : <>
          <label className="operations-label">Class session<select required value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
            <option value="">Select an upcoming class</option>
            {sessions.map((session) => <option key={session.id} value={session.id}>
              {session.offering.course.code} · {session.offering.course.title} · {formatDate(session.startsAt)}
            </option>)}
          </select></label>
          <button className="event-primary-button" disabled={pending || !sessionId}>Generate QR code</button>
        </>}
        {qrImage?.token === qr && <div className="qr-display"><img src={qrImage.image} alt="Short-lived attendance QR code" /><p>Students must be enrolled and check in during the session window.</p></div>}
        {!loading && sessions.length === 0 && <p className="empty-state">No upcoming class sessions are available.</p>}
      </form> : <>
        <div className="panel operations-panel">
          <h2>Check in to a class</h2>
          <button className="event-secondary-button" type="button" onClick={() => { setError(''); setScanning((value) => !value) }}>
            {scanning ? 'Stop camera' : 'Scan QR with camera'}
          </button>
          {scanning && <video className="qr-camera" ref={videoRef} muted playsInline aria-label="Camera QR scanner" />}
          <form className="scan-form" onSubmit={submitScan}>
            <label className="operations-label">QR code text<input required value={scanValue} onChange={(event) => setScanValue(event.target.value)} placeholder="campusx-attendance:…" /></label>
            <button className="event-primary-button" disabled={pending || !scanValue}>{pending ? 'Checking in…' : 'Record attendance'}</button>
          </form>
        </div>
        <section className="panel operations-panel">
          <h2>Attendance history</h2>
          {loading ? <p className="empty-state">Loading attendance…</p>
            : history.length === 0 ? <p className="empty-state">No attendance records yet.</p>
              : <div className="operations-list">{history.map((item) => (
                <article className="operations-record" key={item.id}>
                  <div className="record-heading"><strong>{item.classSession.offering.course.code} · {item.classSession.offering.course.title}</strong><span className="event-status status-published">{item.status}</span></div>
                  <p>{formatDate(item.classSession.startsAt)} · {item.classSession.location || 'Location not set'}</p>
                </article>
              ))}</div>}
        </section>
      </>}
    </section>
  )
}

function CertificatesPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    apiRequest('/certificates/mine').then((result) => {
      if (active) setItems(result.items)
    }).catch((requestError) => {
      if (active) setError(requestError.message)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  return <section className="operations-page">
    <header className="operations-heading"><div><div className="section-kicker">CAMPUS ACHIEVEMENTS</div><h1>Certificates</h1><p>Download and verify event participation certificates.</p></div></header>
    <ErrorMessage>{error}</ErrorMessage>
    <section className="panel operations-panel"><h2>Event certificates</h2>
      {loading ? <p className="empty-state">Loading certificates…</p>
        : items.length === 0 ? <p className="empty-state">No certificates issued yet. Certificates become available after an event ends.</p>
          : <div className="operations-list">{items.map((item) => (
            <article className="operations-record" key={item.certificateId}>
              <div className="record-heading"><strong>{item.event.title}</strong><a className="event-primary-button" href={`/api/certificates/events/${item.event.id}/download`}>Download PDF</a></div>
              <p>Certificate ID: {item.certificateId}</p><p>Issued {formatDate(item.issuedAt)}</p>
              <a href={`/api/certificates/verify/${item.certificateId}`} target="_blank" rel="noreferrer">Verify certificate</a>
            </article>
          ))}</div>}
    </section>
  </section>
}

function AnalyticsPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    apiRequest('/admin/analytics').then((result) => {
      if (active) setData(result)
    }).catch((requestError) => {
      if (active) setError(requestError.message)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const cards = data ? [
    ['Students', data.students], ['Faculty', data.faculty], ['Events', data.events],
    ['Registrations', data.registrations], ['Attendance records', data.attendance],
    ['Pending service requests', data.pendingServiceRequests], ['Facility bookings', data.facilityBookings],
  ] : []
  const statuses = data ? Object.entries(data.attendanceByStatus) : []
  const max = Math.max(1, ...statuses.map(([, count]) => count))
  return <section className="operations-page">
    <header className="operations-heading"><div><div className="section-kicker">ADMINISTRATION</div><h1>Campus analytics</h1><p>Live totals from CampusX records.</p></div></header>
    <ErrorMessage>{error}</ErrorMessage>
    {loading ? <p className="empty-state">Loading analytics…</p>
      : data && <><div className="operations-stats">{cards.map(([label, value]) => <article className="panel operations-stat" key={label}><span>{label}</span><strong>{value.toLocaleString()}</strong></article>)}</div>
        <div className="operations-columns">
          <section className="panel operations-panel"><h2>Attendance status</h2>
            {statuses.length === 0 ? <p className="empty-state">No attendance records.</p> : statuses.map(([status, count]) => (
              <div className="chart-row" key={status}><span>{status}</span><div className="chart-track"><span style={{ width: `${(count / max) * 100}%` }} /></div><strong>{count}</strong></div>
            ))}
          </section>
          <section className="panel operations-panel"><h2>Facility booking status</h2>
            {Object.entries(data.facilityBookingsByStatus).length === 0 ? <p className="empty-state">No booking records.</p>
              : Object.entries(data.facilityBookingsByStatus).map(([status, count]) => <div className="chart-row" key={status}><span>{status}</span><div className="chart-track"><span style={{ width: `${(count / Math.max(1, data.facilityBookings)) * 100}%` }} /></div><strong>{count}</strong></div>)}
          </section>
        </div></>}
  </section>
}

function AuditLogsPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    apiRequest('/admin/audit-logs?page=1&limit=50').then((result) => {
      if (active) setItems(result.items)
    }).catch((requestError) => {
      if (active) setError(requestError.message)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  return <section className="operations-page">
    <header className="operations-heading"><div><div className="section-kicker">ADMINISTRATION</div><h1>Audit logs</h1><p>Administrative changes and decisions recorded by CampusX.</p></div></header>
    <ErrorMessage>{error}</ErrorMessage>
    <section className="panel operations-panel"><h2>Recent activity</h2>
      {loading ? <p className="empty-state">Loading audit history…</p>
        : items.length === 0 ? <p className="empty-state">No administrative activity has been recorded yet.</p>
          : <div className="operations-list">{items.map((item) => (
            <article className="operations-record" key={item.id}>
              <div className="record-heading"><strong>{item.action.replaceAll('_', ' ')}</strong><span>{formatDate(item.createdAt)}</span></div>
              <p>{item.actor.name} · {item.actor.role} · {item.entityType}</p>
              {item.details && <pre className="audit-details">{JSON.stringify(item.details, null, 2)}</pre>}
            </article>
          ))}</div>}
    </section>
  </section>
}

export default function CampusOperationsPage({ section, user }) {
  if (section === 'Facility Bookings') return <BookingPage user={user} />
  if (section === 'Attendance QR') return <AttendancePage user={user} />
  if (section === 'Certificates') return <CertificatesPage />
  if (section === 'Analytics') return <AnalyticsPage />
  return <AuditLogsPage />
}
