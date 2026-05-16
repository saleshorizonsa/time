# PostgreSQL / Supabase Setup

The application uses PostgreSQL for production-ready storage. SQLite is not used.

## Supabase Setup

Your Supabase project URL:

```text
https://ldkudwluqfupxngdnvcd.supabase.co
```

Set these environment variables in Vercel and local `.env`:

```env
SUPABASE_URL=https://ldkudwluqfupxngdnvcd.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_PROJECT_REF=ldkudwluqfupxngdnvcd
SUPABASE_DB_PASSWORD=your-supabase-database-password
SUPABASE_DB_HOST=aws-1-ap-northeast-1.pooler.supabase.com
SUPABASE_DB_PORT=5432
SUPABASE_DB_USER=postgres.ldkudwluqfupxngdnvcd
SUPABASE_DB_NAME=postgres
DATABASE_SSL=true
```

If you prefer, paste Supabase's complete pooled connection string instead:

```env
DATABASE_URL=postgresql://postgres.ldkudwluqfupxngdnvcd:YOUR_PASSWORD@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres
DATABASE_SSL=true
```

The project URL alone cannot connect to the database. The backend also needs the Supabase database password or full `DATABASE_URL`.

## Local PostgreSQL Setup

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
