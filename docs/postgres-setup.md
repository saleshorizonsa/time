# Local PostgreSQL Setup

The application now uses PostgreSQL for production-ready local storage. SQLite is no longer used.

## Create Database

Install PostgreSQL locally, then create a database:

```powershell
createdb -U postgres time_attendance
```

Or from `psql`:

```sql
CREATE DATABASE time_attendance;
```

## Environment

Set this in `.env`:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/time_attendance
DATABASE_SSL=false
DATABASE_POOL_MAX=10
```

Adjust username, password, host, and port to match your local PostgreSQL installation.

## Startup Migration

On server start, the backend creates required tables and baseline data:

- Admin user
- Four default companies
- Default day shift
- Attendance, sync, employee, leave, correction, and mobile punch tables

## Health Check

Use:

```text
GET /api/health
GET /api/health/db
```

`/api/health/db` confirms PostgreSQL connectivity.

## Production Notes

- Use a strong `JWT_SECRET`.
- Change `ADMIN_PASSWORD` before the first production start.
- Use a dedicated database user with privileges only on the app database.
- Back up PostgreSQL using `pg_dump`.
- Serve the frontend/backend over HTTPS so mobile geolocation works reliably.
