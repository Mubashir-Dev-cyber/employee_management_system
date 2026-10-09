# EMS backend

Express 5 + Prisma 7 + PostgreSQL API for the Employee Management System.

## Set up

```bash
npm install
cp .env.example .env          # then fill in DATABASE_URL and JWT_SECRET
npm run migrate:deploy        # create or update the tables
npm run create-admin          # an HR_ADMIN account, or a MANAGER linked to an employee
npm run seed                  # optional: sample leave requests and six weeks of attendance
npm start                     # http://localhost:5000
```

`create-admin` asks for a role. A `MANAGER` account also needs the **database id** of the
employee it belongs to; that manager then sees the employees whose `managerId` is that id.

## Who can do what

| Route | Who |
|---|---|
| `POST /api/auth/login`, `GET /api/auth/me` | anyone / any signed-in account |
| `/api/employees` (list with `?page=&pageSize=`, get, create, update, delete) | `HR_ADMIN` |
| `/api/manager/...` (team, team member, leave requests, approve/reject, attendance, correction requests) | `MANAGER`, own team only |
| `/api/attendance-corrections` (list, approve/reject) | `HR_ADMIN` |
| `GET /health` | anyone; `{ "status": "ok" }` or 503 when the database is unreachable |

## Attendance

Employees check themselves in and out (the Employee app, still to be built). Until then
`npm run seed` fills the last six weeks with sample check-ins. Managers **can't change**
attendance: when a record is wrong they ask HR for a correction, and only an HR approval changes it.

One shift for everyone, Monday to Friday, set in `.env`: `SHIFT_START` (09:00), `SHIFT_END`
(17:00), `LATE_GRACE_MINUTES` (5) and `COMPANY_TIMEZONE` (Asia/Karachi). Times in requests and
responses are `"HH:MM"` in that timezone; days are `"YYYY-MM-DD"`.

A day's status, checked in this order:

| Status | When |
|---|---|
| `OFF` | Saturday, Sunday, or before the hire date |
| `ON_LEAVE` | an approved leave request covers the day |
| `PRESENT` / `LATE` | checked in; late if more than the grace minutes after the shift start |
| `NOT_IN` | no check-in yet today, and the shift hasn't ended |
| `ABSENT` | no check-in |

Manager routes (own team only):

| Route | Does |
|---|---|
| `GET /api/manager/attendance?date=YYYY-MM-DD` | the team's day (default today; no future dates): `{ date, workday, shift, rows: [{ employee, record }], counts }` |
| `GET /api/manager/team/:id/attendance?days=7` | one member's last 1–31 days, newest first |
| `POST /api/manager/attendance-corrections` | ask HR to fix a day: `{ employeeId, date, checkIn, checkOut?, reason }` (201) |
| `GET /api/manager/attendance-corrections?status=` | the team's requests |

A record is `{ date, status, checkIn, checkOut, correction: { id, status } | null, correctable }`.
`correctable` says whether the manager may ask for a correction now. Requests are allowed for
today and the 6 days before it, on work days, not on approved leave, and one waiting request per
person and day (409 otherwise). Leaving out `checkOut` keeps the recorded check-out.

### For the HR app: attendance corrections

`GET /api/attendance-corrections?status=PENDING` (status optional) returns `{ corrections }`,
waiting ones first:

```json
{
  "id": 3, "employeeId": "EMP002", "employeeDbId": 1, "employeeName": "Second User",
  "department": "Sales", "date": "2026-10-08",
  "requested": { "checkIn": "09:00", "checkOut": "17:00" },
  "before": { "checkIn": "09:40", "checkOut": "17:30" },
  "reason": "Fingerprint machine was down", "status": "PENDING",
  "requestedBy": "Test UI", "requestedAt": "2026-10-09T06:12:00.000Z",
  "decidedBy": null, "decidedAt": null, "decisionNote": null
}
```

`before` is the record as it is now (null if there is none); once approved, it is what the
record said before the change.

`PATCH /api/attendance-corrections/:id` with `{ "status": "APPROVED" | "REJECTED", "note": "optional" }`
decides a waiting request and returns `{ correction }`. Approving writes the requested times
into the attendance record; rejecting changes nothing. A request can only be decided once (409).

An HR screen needs: a list of waiting requests (name, day, before → requested times, reason,
who asked), and Approve / Reject buttons with an optional note.

## Tests

`npm test` runs the API tests against a **separate** database, set in `.env` as
`TEST_DATABASE_URL` (its name must end in `_test`; it is created if missing and wiped on every
run). The script refuses to run against `DATABASE_URL`.

## Production checklist

- Serve the API over **HTTPS** only, behind a reverse proxy (nginx, a load balancer), and set
  `TRUST_PROXY=1` so rate limits see the real client IP.
- `NODE_ENV=production`, a random `JWT_SECRET` of 32+ characters (the server refuses to start
  otherwise), and `CORS_ORIGINS` set to the web app's origin if there is one.
- Connect with a database user that can only read and write the EMS tables, not a superuser.
  Run `npm run migrate:deploy` on each release.
- Keep `.env` out of git (it is ignored). Run with a process manager (systemd, pm2, Docker) that
  restarts the server; it shuts down cleanly on `SIGTERM`.

Built in: security headers (helmet), a CORS allow list, 100 kB JSON bodies, 10 failed sign-ins per
15 minutes and 300 requests per minute per IP, bcrypt passwords, 8-hour tokens, role checks on
every route, and input validation with length limits.

### `npm audit`

The packages the API runs on have no known vulnerabilities. `npm audit` still reports issues in
the `prisma` CLI (a dev tool used for migrations: `mysql2` and `deepmerge-ts`, neither used by the
running API). They go away when Prisma ships updated dependencies; don't run
`npm audit fix --force`, which downgrades Prisma to 6.
