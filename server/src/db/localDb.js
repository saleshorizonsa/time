const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const env = require("../config/env");

if (!env.databaseUrl) {
  throw new Error("DATABASE_URL is required. Example: postgres://postgres:postgres@localhost:5432/time_attendance");
}

const db = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
  max: env.databasePoolMax,
  idleTimeoutMillis: 30000
});

function toPostgresSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function withReturningId(sql) {
  const trimmed = sql.trim();
  if (!/^insert\s/i.test(trimmed) || /\breturning\b/i.test(trimmed)) return sql;
  if (/^insert\s+into\s+settings\b/i.test(trimmed)) return sql;
  return `${sql} RETURNING id`;
}

async function run(sql, params = []) {
  const result = await db.query(toPostgresSql(withReturningId(sql)), params);
  return { id: result.rows[0]?.id, changes: result.rowCount };
}

async function get(sql, params = []) {
  const result = await db.query(toPostgresSql(sql), params);
  return result.rows[0];
}

async function all(sql, params = []) {
  const result = await db.query(toPostgresSql(sql), params);
  return result.rows;
}

async function ensureColumn(table, column, definition) {
  const existing = await get(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  if (!existing) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function initDb() {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('Admin','Viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await ensureColumn("users", "username", "TEXT");
  await ensureColumn("users", "employee_id", "INTEGER");
  await ensureColumn("users", "employee_code", "TEXT");
  await ensureColumn("users", "auth_provider", "TEXT NOT NULL DEFAULT 'local'");
  await ensureColumn("users", "supabase_user_id", "TEXT");

  await run("CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (lower(username)) WHERE username IS NOT NULL");
  await run("CREATE UNIQUE INDEX IF NOT EXISTS users_supabase_user_id_unique ON users (supabase_user_id) WHERE supabase_user_id IS NOT NULL");

  await run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    employee_code TEXT NOT NULL,
    full_name TEXT NOT NULL,
    department TEXT,
    shift TEXT,
    email TEXT,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'Active',
    mobile_access_enabled INTEGER NOT NULL DEFAULT 0,
    user_id INTEGER REFERENCES users(id),
    mobile_login_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, employee_code)
  )`);

  await ensureColumn("employees", "mobile_access_enabled", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("employees", "user_id", "INTEGER");
  await ensureColumn("employees", "mobile_login_id", "TEXT");

  await run(`CREATE TABLE IF NOT EXISTS attendance_records (
    id SERIAL PRIMARY KEY,
    source_id TEXT,
    employee_id TEXT NOT NULL,
    employee_name TEXT,
    department TEXT,
    shift TEXT,
    attendance_date TEXT NOT NULL,
    check_in TEXT,
    check_out TEXT,
    status TEXT NOT NULL,
    overtime_minutes INTEGER NOT NULL DEFAULT 0,
    early_out_minutes INTEGER NOT NULL DEFAULT 0,
    late_minutes INTEGER NOT NULL DEFAULT 0,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_id, employee_id, attendance_date, check_in)
  )`);

  await run("CREATE INDEX IF NOT EXISTS attendance_records_date_idx ON attendance_records (attendance_date)");
  await run("CREATE INDEX IF NOT EXISTS attendance_records_employee_idx ON attendance_records (employee_id)");
  await run("CREATE INDEX IF NOT EXISTS attendance_records_dept_idx ON attendance_records (department)");
  await run("CREATE INDEX IF NOT EXISTS attendance_records_status_idx ON attendance_records (status)");
  await run("CREATE INDEX IF NOT EXISTS attendance_records_date_emp_idx ON attendance_records (attendance_date, employee_id)");

  await run(`CREATE TABLE IF NOT EXISTS mobile_punches (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    employee_id TEXT NOT NULL,
    punch_type TEXT NOT NULL CHECK(punch_type IN ('IN','OUT')),
    punch_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy_meters DOUBLE PRECISION,
    distance_meters DOUBLE PRECISION NOT NULL,
    accepted INTEGER NOT NULL,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS shifts (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    grace_minutes INTEGER NOT NULL DEFAULT 0,
    early_out_grace_minutes INTEGER NOT NULL DEFAULT 0,
    overtime_after_minutes INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS holidays (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id),
    holiday_date TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'Public',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, holiday_date, name)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS leave_requests (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    leave_type TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'Pending',
    requested_by INTEGER NOT NULL REFERENCES users(id),
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    review_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS attendance_corrections (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    attendance_date TEXT NOT NULL,
    check_in TEXT,
    check_out TEXT,
    status TEXT NOT NULL DEFAULT 'Pending',
    reason TEXT,
    requested_by INTEGER NOT NULL REFERENCES users(id),
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    review_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS sync_runs (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL,
    records_read INTEGER NOT NULL DEFAULT 0,
    records_upserted INTEGER NOT NULL DEFAULT 0,
    error_message TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS error_logs (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    level TEXT NOT NULL,
    source TEXT NOT NULL,
    message TEXT NOT NULL,
    details TEXT
  )`);

  const admin = await get("SELECT id FROM users WHERE email = ?", [env.adminEmail]);
  if (!admin) {
    const hash = await bcrypt.hash(env.adminPassword, 10);
    await run("INSERT INTO users (email, username, password_hash, role) VALUES (?, ?, ?, 'Admin')", [
      env.adminEmail,
      env.adminEmail,
      hash
    ]);
  }

  // No sample company, employee, shift, or attendance data is seeded in production.
}

async function closeDb() {
  await db.end();
}

module.exports = { db, run, get, all, initDb, closeDb };
