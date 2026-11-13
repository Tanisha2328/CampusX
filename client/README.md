# CampusX client

The CampusX frontend is a React application built with Vite.

## Development

Start the Express API on port `3000`, then run the frontend:

```sh
npm run dev
```

The Vite development server proxies `/api` requests to `http://localhost:3000`, allowing the browser to use the API and its session cookie on the frontend origin.

## Authentication

Use `/login` to sign in or `/register` to create a student account. The frontend submits credentials to the real `/api/auth` endpoints and does not store bearer tokens. The API sets an HttpOnly, SameSite=Lax session cookie, which the browser sends with profile and logout requests. In production the API sets the cookie's Secure attribute.

The dashboard route loads the signed-in user's profile from `GET /api/auth/me`; unauthenticated visits are redirected to `/login`.

## Service requests

The Service Requests section uses authenticated API data. Students can submit and track their own requests; faculty can view and update requests assigned to them; administrators can filter, assign, and manage all requests. Request progress and resolution notes are shown in the request details.

The API is mounted at `/api/service-requests`:

- `POST /` — student request submission
- `GET /mine` — the authenticated student's requests
- `GET /` — admin request queue or faculty assigned queue, with `page`, `limit`, `category`, and `status` filters
- `GET /:id` — role-scoped request details
- `PATCH /:id` — admin assignment/status updates or assigned-faculty status/note updates
- `GET /assignees` — faculty assignment options for administrators

The matching Prisma migration is in `server/prisma/migrations`; it must be applied through the normal deployment process before enabling this API against a database.

## Notifications and announcements

The notification center and bell use authenticated, recipient-scoped API data. Notifications can be paginated with `GET /api/notifications?page=1&limit=20`; unread totals are available at `GET /api/notifications/unread-count`. Use `PATCH /api/notifications/:id/read` or `PATCH /api/notifications/read-all` to mark notifications as read.

Notification types include campus announcements and event publication, event registration confirmation, service-request assignment/status changes, and assignments. The current academic API has no assignment creation or publication endpoint, so assignment publication notifications are not yet triggered.

Students and faculty can view active published announcements at `GET /api/announcements`, with optional category and pagination filters; `GET /:id` returns active announcement details. Administrators and faculty can use `GET /manage`, `POST /`, `PATCH /:id`, `POST /:id/publish`, and `POST /:id/archive`; faculty announcements are limited to general and academic categories. Club coordinators are restricted to event announcements linked to events they own. Scheduled announcements are published by the server's one-minute scheduler; expired and archived announcements are excluded from public reads.

Notification and announcement tables are added by migration `20261102110000_add_notifications_and_announcements`. Run migrations only after reviewing all pending migrations for the target database; `npx prisma migrate deploy` applies every pending migration in order, not just this one.

## Academic and campus operations

Student course, timetable, assignment, and attendance history views read from the academic APIs. The campus operations navigation connects facility availability and booking requests, administrator approval, student event registration history/cancellation, QR attendance, certificates, and administrator analytics/audit history to the API. The new campus operations tables are added by migration `20261113120000_add_campus_operations`; no sample facilities or analytics are seeded.

Attendance QR scans use the browser's native `BarcodeDetector` when available. The UI also accepts QR payload text from an external scanner. Certificate PDFs can be downloaded after a published event ends by a registered student, and can be verified through the public certificate verification endpoint.

## Checks

```sh
npm run lint
npm run build
```
