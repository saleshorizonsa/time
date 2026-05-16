# Attendance Management

The application includes operational attendance management modules in addition to device sync and reporting.

## Modules

### Shift Management

Admin can maintain:

- Shift code
- Shift name
- Start time
- End time
- Late grace minutes
- Early-out grace minutes
- Overtime threshold minutes
- Active/inactive status

### Holiday Calendar

Admin can create holidays for:

- All companies
- A specific company

### Leave Requests

Employees or Admin can create leave requests. Admin reviews and marks:

- Approved
- Rejected

### Attendance Corrections

Employees or Admin can request attendance corrections for missing or wrong punch records.

When Admin approves a correction, the system writes the corrected record into `attendance_records`, so it appears in reports and exports.

## API

```text
GET   /api/management/overview
GET   /api/management/shifts
POST  /api/management/shifts
PUT   /api/management/shifts/:id
GET   /api/management/holidays
POST  /api/management/holidays
GET   /api/management/leave-requests
POST  /api/management/leave-requests
PATCH /api/management/leave-requests/:id/review
GET   /api/management/corrections
POST  /api/management/corrections
PATCH /api/management/corrections/:id/review
```
