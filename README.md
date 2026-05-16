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

Excel-compatible `.xls` and PDF exports use the same filtered dataset as the Employee Attendance Report page.

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

Admin can manage four company records and upload employees from **Master Data**.

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

## Attendance Management

The **Management** module turns the reporting app into an attendance operations system:

- Shift definitions with grace and overtime policy fields
- Company holiday calendar
- Leave request submission and Admin approval/rejection
- Attendance correction submission and Admin approval/rejection
- Approved corrections write back into `attendance_records`
- Operational counters for pending leaves and corrections
