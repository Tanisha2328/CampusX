# CampusX

CampusX is a college campus management application with a React/Vite client, an Express API, PostgreSQL, Prisma, and cookie-based JWT sessions.

## Requirements

- Node.js 20.19+ (or a supported Node 22/24 release)
- PostgreSQL 14+
- npm

## Local setup

1. Create a PostgreSQL database for CampusX.
2. Copy `server/.env.example` to `server/.env` and set `DATABASE_URL` and a randomly generated `JWT_SECRET` of at least 32 bytes.
3. Install dependencies and generate Prisma Client:

   ```powershell
   cd server
   npm ci
   npm run db:generate
   ```

4. Apply the checked-in migrations without resetting existing data:

   ```powershell
   npx prisma migrate deploy
   ```

   This applies pending migrations only. Review migration SQL before deploying to a production database. Do not use `prisma migrate reset` on an existing database.

5. Start the API:

   ```powershell
   npm run dev
   ```

6. In another terminal, install and start the client:

   ```powershell
   cd client
   npm ci
   npm run dev
   ```

   Open the Vite URL (normally `http://localhost:5173`). The Vite development server proxies `/api` requests to `http://localhost:3000`.

New self-service registrations receive the `STUDENT` role. For an initial administrator account, register that person first, then promote exactly that account through a controlled PostgreSQL administrative session:

```sql
UPDATE "User" SET "role" = 'ADMIN' WHERE "email" = 'admin@example.edu';
```

Verify the affected row before continuing. Use the same process for any institution-approved `FACULTY` or `CLUB_COORDINATOR` account; public registration cannot assign elevated roles.

## Environment

`server/.env.example` contains placeholders only:

- `PORT` — API port (default `3000`)
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — random secret with at least 32 bytes

The API uses `HttpOnly`, `SameSite=Lax` cookies and enables `Secure` cookies in production. Never commit `server/.env`.

## Implemented modules

- Student registration/login, logout, current-user profile, role-based protected API routes.
- Academic terms, courses, offerings, enrollment, class sessions, assignments, student dashboard and attendance history.
- Event publishing, registration deadlines and capacity checks, duplicate registration protection, cancellation before an event starts, and registration history.
- Student/faculty/admin service-request workflows with assignment, progress notes, and notifications.
- Announcements, scheduled publication, role-scoped faculty announcements, and recipient-scoped read/unread notifications.
- Facility catalog and booking requests, availability checks, serialized overlap protection, administrator approval/rejection, owner cancellation of upcoming requests, booking history, and notifications.
- Short-lived QR check-in with one attendance record per enrolled student and class session; faculty/admin QR generation and student camera scanning where the browser supports `BarcodeDetector`.
- Event participation certificates with unique IDs, downloadable PDF files, and a public certificate verification endpoint.
- Database-backed administrator analytics for students, faculty, events, registrations, attendance, service requests, and facility bookings.
- Administrator audit history for event changes, facility creation/decisions, and academic term/course/offering/enrollment changes.

## Useful commands

From `server/`:

```powershell
npm test
npm test -- --test-concurrency=1
npm run db:validate
npm run db:generate
npx prisma migrate deploy
npm run dev
```

From `client/`:

```powershell
npm run lint
npm run build
npm run dev
```

Final source verification completed with 68 passing backend tests, a valid Prisma schema, a successful client lint and production build, and zero production dependency audit findings for both client and server. In addition, the live local-PostgreSQL check described below passed 48 API and permission checks.

## Database notes and limitations

- The migrations preserve existing data and add the campus-operations tables and constraints; the app does not seed facilities or demo analytics. An administrator adds real facilities in the UI.
- Facility booking notification enum values are added in migration `20261113130000_add_facility_booking_notifications`; migration `20261113140000_allow_facility_booking_notifications` updates the related-entity constraint so booking notifications can be stored.
- Facility reservations are checked transactionally for overlap; serialization conflicts return HTTP 409 so the user can retry with another time.
- Faculty session ownership is not represented in the existing course schema. Faculty can generate QR codes for listed scheduled sessions; student attendance is still restricted to an active enrollment.
- QR camera scanning requires a secure browser context and native `BarcodeDetector` support. The attendance page also accepts the text from a QR scanner as a fallback.
- Certificates are issued to event registrants after the event's end time. The event schema does not record event check-in, so issuance currently verifies registration rather than an attendance record.
- Final live verification connected to the configured local PostgreSQL database, confirmed all migrations were applied, and exercised 48 authenticated HTTP/API, database-backed workflow, and role-permission checks across student, faculty, club coordinator, and admin accounts. The checks covered academics, events and registration, bookings and approval, service requests, announcements and notifications, QR attendance, PDF certificates and verification, analytics, audit logs, and role denials. Temporary test records were cleaned up. The database was not reset.
- The live checks use temporary `.example.invalid` test accounts and records and were run from an ephemeral local script; the committed automated API tests use repository fakes. For repeatable database-backed checks, run the application against a dedicated test database and do not point automated test cleanup at production data.
- The production client dependency audit reports zero advisories. Four remaining moderate advisories are in the development-only ESLint `minimatch` dependency chain; npm's forced fix would downgrade ESLint across a major version, so it was not applied.
