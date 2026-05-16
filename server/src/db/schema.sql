CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  username TEXT,
  employee_id INTEGER,
  employee_code TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('Admin','Viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX users_username_unique ON users (lower(username)) WHERE username IS NOT NULL;

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE companies (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employees (
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
);

CREATE TABLE attendance_records (
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
);

CREATE TABLE mobile_punches (
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
);

CREATE TABLE shifts (
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
);

CREATE TABLE holidays (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  holiday_date TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Public',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, holiday_date, name)
);

CREATE TABLE leave_requests (
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
);

CREATE TABLE attendance_corrections (
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
);

CREATE TABLE sync_runs (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  records_read INTEGER NOT NULL DEFAULT 0,
  records_upserted INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE TABLE error_logs (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  level TEXT NOT NULL,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT
);
