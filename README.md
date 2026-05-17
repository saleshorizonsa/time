# Time Attendance Reporting

Responsive intranet web application for attendance dashboards, employee reports, Microsoft Access synchronization, and PDF/Excel exports.

The backend uses **PostgreSQL** for the application database and ODBC only for optional Microsoft Access data import.

## Project Structure

```text
.
├─ client/                  React + Tailwind UI
│  ├─ src/components/       Shared UI components
│  ├─ src/pages/            Login, Dashboard, Reports, Admin Settings
│  └─ src/lib/api.js        API client and auth session helpers
├─ server/                  Node.js / Express API backed by PostgreSQL
│  ├─ src/config/           Environment configuration
│  ├─ src/db/               PostgreSQL schema and startup migration
│  ├─ src/middleware/       JWT auth and role checks
│  ├─ src/routes/           API endpoints
│  └─ src/services/         Access ODBC, sync, settings, exports
├─ docs/windows-setup.md    Windows deployment and ODBC setup
└─ .env.example             Example configuration
```

## API Endpoints

| Method | Endpoint | Role | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | Public | Sign in and receive JWT |
| `GET` | `/api/auth/me` | Admin, Viewer | Current user |
| `POST` | `/api/auth/users` | Admin | Create users |
| `GET` | `/api/dashboard/summary` | Admin, Viewer | Summary cards, late arrivals, department report |
| `GET` | `/api/attendance` | Admin, Viewer | Filtered attendance records |
| `GET` | `/api/attendance/filters` | Admin, Viewer | Employees, departments, shifts, statuses |
| `GET` | `/api/sync/status` | Admin, Viewer | Last sync, running state, error logs |
| `POST` | `/api/sync/pull-now` | Admin | Manual Access data pull |
| `POST` | `/api/sync/pull-zkteco-now` | Admin | Manual MB20 direct pull |
| `GET` | `/api/mobile-punch/workplace` | Admin, Viewer | Workplace geofence details |
| `POST` | `/api/mobile-punch` | Admin, Viewer | Mobile punch in/out with geofence validation |
| `GET` | `/api/mobile-punch/history` | Admin, Viewer | Current user's mobile punch history |
| `GET` | `/api/master-data/companies` | Admin, Viewer | Company master list |
| `PUT` | `/api/master-data/companies/:id` | Admin | Update one of four company records |
| `GET` | `/api/master-data/employees` | Admin, Viewer | Employee master list |
| `POST` | `/api/master-data/employees` | Admin | Create employee |
| `PUT` | `/api/master-data/employees/:id` | Admin | Update employee |
| `PATCH` | `/api/master-data/employees/:id/mobile-access` | Admin | Enable/disable employee mobile punch login |
| `POST` | `/api/master-data/employees/upload` | Admin | CSV employee upload |
| `GET` | `/api/management/overview` | Admin, Viewer | Management counters |
| `GET/POST/PUT` | `/api/management/shifts` | Admin for writes | Shift policies |
| `GET/POST` | `/api/management/holidays` | Admin for writes | Holiday calendar |
| `GET/POST/PATCH` | `/api/management/leave-requests` | Admin approves | Leave workflow |
| `GET/POST/PATCH` | `/api/management/corrections` | Admin approves | Attendance correction workflow |
| `GET` | `/api/reports/export?format=excel` | Admin, Viewer | Excel export |
| `GET` | `/api/reports/export?format=pdf` | Admin, Viewer | PDF export |
| `GET` | `/api/settings` | Admin, Viewer | Read current settings |
| `PUT` | `/api/settings` | Admin | Update Access, remote, and sync settings |
| `GET/POST` | `/iclock/cdata` | Device | ZKTeco MB20 ADMS push endpoint |
| `GET` | `/iclock/getrequest` | Device | ZKTeco MB20 command polling |
| `POST` | `/iclock/devicecmd` | Device | ZKTeco MB20 command response |

## Local Development

1. Install Node.js 20 LTS or newer.
2. Install the Microsoft Access Database Engine ODBC driver on the Windows server.
3. Configure PostgreSQL or Supabase using [postgres-setup.md](docs/postgres-setup.md).
4. Copy `.env.example` to `.env` and adjust database, UNC path, and credentials.
5. Install dependencies:

```powershell
npm install
npm run install:all
```

6. Start the app:

```powershell
npm run dev
```

The frontend runs at `http://localhost:5173` and proxies API requests to `http://localhost:5000`.

Database health check:

```text
http://localhost:5000/api/health/db
```

## Default Login

The first Admin user is created automatically from:

```env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=ChangeMe123!
```

Change these values before first production start.

## Access Database Notes

The backend connects to Microsoft Access using ODBC:

```text
Driver={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=\\REMOTE-PC\SharedFolder\attendance.accdb
```

Supported path examples:

```env
ACCESS_DB_PATH=\\\\REMOTE-PC\\SharedFolder\\attendance.accdb
ACCESS_DB_PATH=C:\\Attendance\\attendance.mdb
```

The server process account must have read access to the share and file. If running as a Windows service, use a domain or local account that can access `\\REMOTE-PC\SharedFolder`.

## ZKTeco MB20

For a remote MB20 with no PC on site, use **ADMS / Cloud Server** mode. Configure the device to point to your server:

```text
Server Address: attendance.yourdomain.com
Server Port: 443
HTTPS: Enabled if available
```

The backend receives device calls under:

```text
https://attendance.yourdomain.com/iclock/cdata
```

Direct pull on port `4370` is also available as a backup, but it requires VPN or remote router port forwarding. Do not expose `4370` publicly without a firewall allowlist.

## Reports

Excel (`.xlsx`) and PDF exports use the same filtered dataset as the Employee Attendance Report page. Both include all filtered rows, column totals, date range, and a generated timestamp. The exported filenames include the selected date range.

## Mobile Punch Geofence

Admin can configure the workplace location and accepted radius in **Settings -> Mobile Punch Geofence**.

Example:

```env
WORKPLACE_NAME=Main Workplace
WORKPLACE_LATITUDE=24.713552
WORKPLACE_LONGITUDE=46.675296
WORKPLACE_RADIUS_METERS=500
```

Employees use the **Punch** page from mobile. The browser asks for location permission, then the backend calculates the distance and accepts only punches inside the configured radius.

## Employee Master Upload

Admin can create up to four company records and upload employees from **Master Data**. No mock company, employee, attendance, or shift data is seeded automatically.

CSV header:

```csv
companyCode,employeeCode,fullName,department,shift,email,phone,status
```

Example:

```csv
COMP1,1001,Ahmed Ali,Operations,Day,ahmed@example.com,0500000001,Active
COMP2,2001,Sara Omar,Finance,Night,sara@example.com,0500000002,Active
```

Each employee row has a **Mobile Punch** toggle. When enabled, the system creates a Viewer login for the employee:

- Login with personal email if available
- Or login with Employee ID
- The Admin sees a one-time temporary password when access is first created

If mobile access is later disabled, that employee cannot log in for mobile punch.

## Microsoft Access Mapping

Admin Settings includes Access table discovery and field mapping. The app syncs only these mapped fields:

- Employee ID
- Employee Name
- Department
- Shift
- Check In
- Check Out
- Status
- Overtime Minutes

Use a server-visible local path or UNC path such as `\\REMOTE-PC\SharedFolder\attendance.accdb`. Browser file selection can show the file name, but production sync requires the backend server to access the path directly.

## Attendance Management

The **Management** module turns the reporting app into an attendance operations system:

- Shift definitions with grace and overtime policy fields
- Company holiday calendar
- Leave request submission and Admin approval/rejection — approved leaves auto-create attendance rows with status `Leave` for each calendar day in the range
- Attendance correction submission and Admin approval/rejection — approved corrections recalculate late/early-out/overtime from the shift policy and write back to `attendance_records`
- Overlap validation: submitting a leave request that overlaps an existing pending/approved leave is rejected with a clear error
- Operational counters for pending leaves and corrections

## Manual Test Checklist

Run these after `npm install` + `npm start` with valid env vars:

### Auth
- [ ] Login with correct credentials → JWT returned, dashboard loads
- [ ] Login with wrong password → 401 with clear message
- [ ] Empty email/password → 400 validation error
- [ ] Viewer URL-typing `/settings` or `/master` in hash → redirected to `/dashboard`

### Mobile Punch (Issue 1)
- [ ] Employee A punches IN → one row in `attendance_records` with `check_in` set, `check_out` NULL, `source_id = mobile-{empId}-{date}`
- [ ] Same employee punches OUT same day → same row updated, `check_out` now set
- [ ] Punching IN again overwrites `check_in` on the same row (re-punch allowed)
- [ ] `mobile_punches` table always gains a new audit row per punch regardless

### Shift Calculations (Issue 2)
- [ ] Create shift 08:00–17:00, grace 10 min. Access/mobile record with check_in 08:05 → `late_minutes = 0`
- [ ] Same shift, check_in 08:20 → `late_minutes = 10`
- [ ] Check_out 16:30 → `early_out_minutes = 30`
- [ ] Check_out 18:30 with `overtime_after_minutes = 60` → `overtime_minutes = 30`

### Reports (Issue 3)
- [ ] Export with date range → `.xlsx` file opens in Excel with header, all rows, totals row
- [ ] Export → `.pdf` file opens, shows report title, date range, all pages, totals footer
- [ ] Filename contains the selected date range

### Leave Approval (Issue 7)
- [ ] Approve a leave request spanning 3 days → 3 rows in `attendance_records` with status `Leave`
- [ ] Reject a leave → no attendance rows created
- [ ] Overlapping leave submission → 409 error

### Correction Approval (Issue 7)
- [ ] Submit correction for employee on a given date with check_in/check_out
- [ ] Approve → row in `attendance_records` has correct `late_minutes`/`overtime_minutes` based on shift

### ZKTeco ADMS (Issue 8)
- [ ] POST to `/iclock/cdata` with ATTLOG containing 2 lines (IN + OUT) for same employee+day → one row in `attendance_records` with both times
- [ ] Second POST with OUT punch only → same row updated with `check_out`, `check_in` preserved

### Unit Tests
- [ ] `npm test` (inside `server/`) passes all shift calculation assertions
