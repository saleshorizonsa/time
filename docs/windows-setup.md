# Windows Setup

## Prerequisites

- Windows Server or Windows 10/11 machine on the same network as the Access database.
- Node.js 20 LTS or newer.
- Microsoft Access Database Engine Redistributable with the ODBC driver matching your Node.js architecture.
- Network permissions for the service account that runs the API.

## Install Microsoft Access ODBC Driver

1. Install Microsoft Access Database Engine 2016 Redistributable or a newer supported version.
2. Open **ODBC Data Sources (64-bit)**.
3. Confirm that `Microsoft Access Driver (*.mdb, *.accdb)` appears in the Drivers tab.
4. Use the same bitness for Node.js and the ODBC driver.

## Configure UNC Path Access

Use a UNC path instead of a mapped drive for server deployments:

```env
ACCESS_DB_PATH=\\\\REMOTE-PC\\SharedFolder\\attendance.accdb
REMOTE_HOST=REMOTE-PC
REMOTE_SHARE=\\\\REMOTE-PC\\SharedFolder
```

Mapped drives like `Z:\attendance.accdb` are usually unavailable to Windows services. Grant read permission to the exact account running the Node.js service.

## Environment Setup

Create `.env` in the project root:

```env
NODE_ENV=production
PORT=5000
CLIENT_ORIGIN=http://your-intranet-server:5000
JWT_SECRET=replace-with-a-long-random-secret

DATABASE_URL=postgres://postgres:postgres@localhost:5432/time_attendance
DATABASE_SSL=false
DATABASE_POOL_MAX=10

ADMIN_EMAIL=admin@company.local
ADMIN_PASSWORD=replace-before-first-start

ACCESS_DB_PATH=\\\\REMOTE-PC\\SharedFolder\\attendance.accdb
ACCESS_DRIVER={Microsoft Access Driver (*.mdb, *.accdb)}
ACCESS_TABLE=AttendanceLog
ACCESS_DB_PASSWORD=
ACCESS_UID=
ACCESS_PWD=

REMOTE_HOST=REMOTE-PC
REMOTE_SHARE=\\\\REMOTE-PC\\SharedFolder
SYNC_FREQUENCY_CRON=*/15 * * * *
SYNC_LOOKBACK_DAYS=30

ZK_MODE=adms
ZK_ADMS_SERVER_ADDRESS=attendance.yourdomain.com
ZK_ADMS_SERVER_PORT=443
ZK_ADMS_HTTPS=true
ZK_DEVICE_HOST=
ZK_DEVICE_PORT=4370

WORKPLACE_NAME=Main Workplace
WORKPLACE_LATITUDE=24.713552
WORKPLACE_LONGITUDE=46.675296
WORKPLACE_RADIUS_METERS=500
```

## Install and Run

```powershell
npm install
npm run install:all
npm run build
npm start
```

If dependency installation fails in a synced cloud folder with `EBADF`, `EPERM`, or repeated tar write errors, move or copy the project to a normal local path such as `C:\Apps\TimeAttendance`, install there, then deploy from that folder. Google Drive and OneDrive can lock files while npm is extracting packages.

## Production Service Option

Use a process manager such as NSSM or PM2 for Windows. The service account must have:

- Read access to `\\REMOTE-PC\SharedFolder`.
- Network access to the local or internal PostgreSQL server configured in `DATABASE_URL`.
- Permission to bind to the configured API port.

## Common Errors

| Error | Likely Cause | Fix |
| --- | --- | --- |
| `REMOTE_UNAVAILABLE` | Remote machine is offline or UNC path is wrong | Test `Test-Path "\\REMOTE-PC\SharedFolder\attendance.accdb"` |
| `INVALID_PATH` | File extension or configured path is invalid | Use `.accdb` or `.mdb` path |
| `DB_LOCKED` | Access file is opened exclusively or locked | Close exclusive Access sessions and retry |
| `PERMISSION_DENIED` | Service account cannot read the share or DB password is wrong | Grant permissions or update credentials |
| ODBC driver not found | Driver bitness mismatch or missing install | Install the matching Access Database Engine |

## Access Source Mapping

Admin Settings can discover Access tables/columns through ODBC and map only the fields required by the application. By default the API expects these Access table columns:

```env
ACCESS_EMPLOYEE_ID_COLUMN=EmployeeID
ACCESS_EMPLOYEE_NAME_COLUMN=EmployeeName
ACCESS_DEPARTMENT_COLUMN=Department
ACCESS_SHIFT_COLUMN=ShiftName
ACCESS_CHECK_IN_COLUMN=CheckInTime
ACCESS_CHECK_OUT_COLUMN=CheckOutTime
ACCESS_STATUS_COLUMN=Status
ACCESS_OVERTIME_MINUTES_COLUMN=OvertimeMinutes
```

Adjust these values if the attendance device exports different column names.
