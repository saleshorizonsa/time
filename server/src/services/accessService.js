const fs = require("fs");
const { execSync } = require("child_process");
const env = require("../config/env");

const COLUMN_PATTERNS = {
  employeeId:      [/^employee.?id$/i, /^emp.?id$/i, /^emp.?no$/i, /^staff.?id$/i, /^badge/i],
  employeeName:    [/^employee.?name$/i, /^emp.?name$/i, /^full.?name$/i, /^staff.?name$/i, /^name$/i],
  department:      [/^dep(art)?t?ment$/i, /^dept$/i, /^section$/i],
  shift:           [/^shift/i, /^schedule/i],
  checkIn:         [/^check.?in$/i, /^time.?in$/i, /^in.?time$/i, /^clock.?in$/i, /^arrival/i],
  checkOut:        [/^check.?out$/i, /^time.?out$/i, /^out.?time$/i, /^clock.?out$/i, /^departure/i],
  status:          [/^status$/i, /^att.?status$/i, /^att$/i],
  overtimeMinutes: [/^overtime/i, /^ot.?min/i, /^over.?time/i]
};

function autoMapColumns(columns) {
  const mapping = {};
  for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
    for (const col of columns) {
      if (patterns.some((p) => p.test(col))) { mapping[field] = col; break; }
    }
  }
  return mapping;
}

const requiredMappings = [
  ["employeeId", "accessEmployeeIdColumn"],
  ["employeeName", "accessEmployeeNameColumn"],
  ["department", "accessDepartmentColumn"],
  ["shift", "accessShiftColumn"],
  ["checkIn", "accessCheckInColumn"],
  ["checkOut", "accessCheckOutColumn"],
  ["status", "accessStatusColumn"],
  ["overtimeMinutes", "accessOvertimeMinutesColumn"]
];

function loadOdbc() {
  try {
    return require("odbc");
  } catch (error) {
    const wrapped = new Error("ODBC is not available in this runtime. Run Access sync on a Windows server with the Microsoft Access ODBC driver installed.");
    wrapped.code = "ODBC_UNAVAILABLE";
    wrapped.cause = error;
    throw wrapped;
  }
}

// Strip invisible Unicode control/formatting characters that copy-paste can introduce
function sanitizePath(raw) {
  return String(raw || "").replace(/[​-‏‪-‮﻿­]/g, "").trim();
}

function buildConnectionString(settings = {}) {
  const uid = settings.accessUid || env.access.uid;
  const password = settings.accessDbPassword || env.access.password;
  const pwd = settings.accessPwd || env.access.pwd;

  // DSN-based connection — no path or driver needed
  if (settings.accessDsn) {
    const parts = [`DSN=${settings.accessDsn}`];
    if (uid) parts.push(`UID=${uid}`);
    if (password) parts.push(`PWD=${password}`);
    else if (pwd) parts.push(`PWD=${pwd}`);
    return parts.join(";");
  }

  const dbPath = sanitizePath(settings.accessDbPath || env.access.dbPath);
  const driver = settings.accessDriver || env.access.driver;

  if (!dbPath) {
    throw new Error("Access database path is not configured.");
  }

  const parts = [`Driver=${driver}`, `DBQ=${dbPath}`];
  if (password) parts.push(`PWD=${password}`);
  if (uid) parts.push(`UID=${uid}`);
  if (pwd) parts.push(`PWD=${pwd}`);
  return parts.join(";");
}

function validateDbPath(dbPath, hasDsn = false) {
  if (hasDsn) return ""; // DSN handles its own connectivity
  const clean = sanitizePath(dbPath);

  if (!clean) {
    const error = new Error("Access database path is empty.");
    error.code = "INVALID_PATH";
    throw error;
  }

  if (!/\.accdb$|\.mdb$/i.test(clean)) {
    const error = new Error("Access database path must point to an .accdb or .mdb file.");
    error.code = "INVALID_PATH";
    throw error;
  }

  const isUncOrMapped = clean.startsWith("\\\\") || /^[a-zA-Z]:\\/.test(clean) === false;
  if (isUncOrMapped) {
    // Skip fs.existsSync for UNC/network paths — Node's fs check often fails even when
    // the ODBC driver can reach the share (different credential context). Let ODBC report
    // its own error if the path is truly unreachable.
    return clean;
  }

  if (!fs.existsSync(clean)) {
    const error = new Error(`Access database file not found: ${clean}`);
    error.code = "INVALID_PATH";
    throw error;
  }

  return clean;
}

async function queryAttendance(settings = {}) {
  const table = settings.accessTable || env.access.table;
  const columns = {
    employeeId: settings.accessEmployeeIdColumn || env.access.columns.employeeId,
    employeeName: settings.accessEmployeeNameColumn || env.access.columns.employeeName,
    department: settings.accessDepartmentColumn || env.access.columns.department,
    shift: settings.accessShiftColumn || env.access.columns.shift,
    checkIn: settings.accessCheckInColumn || env.access.columns.checkIn,
    checkOut: settings.accessCheckOutColumn || env.access.columns.checkOut,
    status: settings.accessStatusColumn || env.access.columns.status,
    overtimeMinutes: settings.accessOvertimeMinutesColumn || env.access.columns.overtimeMinutes
  };
  validateDbPath(settings.accessDbPath || env.access.dbPath, Boolean(settings.accessDsn));

  for (const [label, settingKey] of requiredMappings) {
    if (!columns[label]) {
      const error = new Error(`Access mapping is missing required field: ${settingKey}`);
      error.code = "INVALID_MAPPING";
      throw error;
    }
  }

  // Build optional date-range WHERE clause (Access uses #date# literals)
  const conditions = [];
  if (settings.dateFrom) conditions.push(`[${columns.checkIn}] >= #${settings.dateFrom}#`);
  if (settings.dateTo) {
    // Add one day so the upper bound is inclusive of the selected date
    const d = new Date(settings.dateTo);
    d.setDate(d.getDate() + 1);
    conditions.push(`[${columns.checkIn}] < #${d.toISOString().slice(0, 10)}#`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT
      [${columns.employeeId}] AS employeeId,
      [${columns.employeeName}] AS employeeName,
      [${columns.department}] AS department,
      [${columns.shift}] AS shift,
      [${columns.checkIn}] AS checkIn,
      [${columns.checkOut}] AS checkOut,
      [${columns.status}] AS status,
      [${columns.overtimeMinutes}] AS overtimeMinutes
    FROM [${table}]
    ${where}
  `;

  let connection;
  try {
    const odbc = loadOdbc();
    connection = await odbc.connect(buildConnectionString(settings));
    return await connection.query(sql);
  } catch (error) {
    if (/locked|already opened|could not use/i.test(error.message)) {
      error.code = "DB_LOCKED";
    } else if (/permission|denied|not a valid password/i.test(error.message)) {
      error.code = "PERMISSION_DENIED";
    } else if (/not a valid path|not found|network/i.test(error.message)) {
      error.code = "REMOTE_UNAVAILABLE";
    }
    throw error;
  } finally {
    if (connection) await connection.close().catch(() => {});
  }
}

async function discoverAccessSchema(settings = {}) {
  validateDbPath(settings.accessDbPath || env.access.dbPath, Boolean(settings.accessDsn));

  let connection;
  try {
    const odbc = loadOdbc();
    connection = await odbc.connect(buildConnectionString(settings));
    const tableRows = await connection.tables(null, null, null, "TABLE");
    const tables = [];

    for (const tableRow of tableRows) {
      const tableName = tableRow.TABLE_NAME || tableRow.table_name;
      if (!tableName || String(tableName).startsWith("MSys")) continue;
      const columnRows = await connection.columns(null, null, tableName, null);
      const cols = columnRows
        .map((column) => column.COLUMN_NAME || column.column_name)
        .filter(Boolean);
      tables.push({ name: tableName, columns: cols, suggestedMapping: autoMapColumns(cols) });
    }

    return { tables, isZktecoSchema: isZktecoSchema(tables.map((t) => t.name)) };
  } catch (error) {
    if (/permission|denied|not a valid password/i.test(error.message)) {
      error.code = "PERMISSION_DENIED";
    } else if (/not a valid path|not found|network/i.test(error.message)) {
      error.code = "REMOTE_UNAVAILABLE";
    }
    throw error;
  } finally {
    if (connection) await connection.close().catch(() => {});
  }
}

async function getTablePreview(settings = {}, limit = 10) {
  const table = settings.accessTable || env.access.table;
  if (!table) throw Object.assign(new Error("No table selected."), { code: "INVALID_MAPPING" });
  validateDbPath(settings.accessDbPath || env.access.dbPath, Boolean(settings.accessDsn));

  let connection;
  try {
    const odbc = loadOdbc();
    connection = await odbc.connect(buildConnectionString(settings));
    const rows = await connection.query(`SELECT TOP ${Number(limit)} * FROM [${table}]`);
    const columns = rows.length ? Object.keys(rows[0]).filter((k) => !k.startsWith("_")) : [];
    return { columns, rows: rows.map((r) => columns.map((c) => r[c])) };
  } catch (error) {
    if (/permission|denied/i.test(error.message)) error.code = "PERMISSION_DENIED";
    throw error;
  } finally {
    if (connection) await connection.close().catch(() => {});
  }
}

// Detect the ZKTeco att2000.mdb schema by table names
function isZktecoSchema(tableNames) {
  const upper = tableNames.map((n) => n.toUpperCase());
  return upper.includes("USERINFO") && upper.includes("CHECKINOUT");
}

/**
 * JOIN query for ZKTeco att2000.mdb:
 *   CHECKINOUT → USERINFO (USERID = Badgenumber)
 *              → DEPARTMENTS (DEFAULTDEPTID = DEPTID)
 * Aggregates each employee's punches into one row per day:
 *   checkIn  = first punch of the day
 *   checkOut = last punch (Null when only one punch recorded)
 */
async function queryZktecoAttendance(settings = {}) {
  validateDbPath(settings.accessDbPath || env.access.dbPath, Boolean(settings.accessDsn));

  const conditions = [];
  if (settings.dateFrom) conditions.push(`ci.CHECKTIME >= #${settings.dateFrom}#`);
  if (settings.dateTo) {
    const d = new Date(settings.dateTo);
    d.setDate(d.getDate() + 1);
    conditions.push(`ci.CHECKTIME < #${d.toISOString().slice(0, 10)}#`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  // Access SQL requires parentheses around multi-table JOINs.
  // IIf returns Null for checkOut when Min = Max (single-punch days).
  const sql = `
    SELECT
      u.Badgenumber     AS employeeId,
      u.Name            AS employeeName,
      d.DEPTNAME        AS department,
      Format(ci.CHECKTIME,'yyyy-mm-dd') AS attendanceDate,
      Min(ci.CHECKTIME) AS checkIn,
      IIf(Min(ci.CHECKTIME)=Max(ci.CHECKTIME),Null,Max(ci.CHECKTIME)) AS checkOut
    FROM (CHECKINOUT ci
      INNER JOIN USERINFO u ON ci.USERID = u.Badgenumber)
      LEFT JOIN DEPARTMENTS d ON u.DEFAULTDEPTID = d.DEPTID
    ${where}
    GROUP BY u.Badgenumber, u.Name, d.DEPTNAME, Format(ci.CHECKTIME,'yyyy-mm-dd')
  `;

  let connection;
  try {
    const odbc = loadOdbc();
    connection = await odbc.connect(buildConnectionString(settings));
    const rows = await connection.query(sql);
    return rows.map((r) => {
      // Access ODBC drivers return column names in varying case — normalise to lowercase
      const row = {};
      for (const [k, v] of Object.entries(r)) row[k.toLowerCase()] = v;

      const employeeId = String(row.employeeid   ?? row.badgenumber  ?? "");
      const checkIn    = row.checkin  ?? null;
      // Derive date string for the sourceId from the Format() alias or the checkIn value
      const dateStr    = row.attendancedate
        ?? (checkIn instanceof Date ? checkIn.toISOString().slice(0, 10) : "");

      return {
        sourceId:        `zkteco-${employeeId}-${dateStr}`,
        employeeId,
        employeeName:    String(row.employeename ?? row.name    ?? ""),
        department:      String(row.department   ?? row.deptname ?? ""),
        shift:           "",
        checkIn,
        checkOut:        row.checkout ?? null,
        status:          "Present",
        overtimeMinutes: 0
      };
    });
  } catch (error) {
    if (/locked|already opened|could not use/i.test(error.message)) error.code = "DB_LOCKED";
    throw error;
  } finally {
    if (connection) await connection.close().catch(() => {});
  }
}

// Read installed ODBC drivers from Windows registry (Access-related only)
function getInstalledAccessDrivers() {
  if (process.platform !== "win32") return [];
  try {
    const out = execSync(
      'reg query "HKLM\\SOFTWARE\\ODBC\\ODBCINST.INI\\ODBC Drivers"',
      { encoding: "utf8", windowsHide: true, timeout: 3000 }
    );
    return out.split(/\r?\n/)
      .filter((l) => /access/i.test(l) && /REG_SZ/i.test(l))
      .map((l) => {
        const m = l.trim().match(/^(.+?)\s{2,}REG_SZ\s{2,}Installed$/i);
        return m ? m[1].trim() : null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Enumerate all Access ODBC drivers installed and DSNs configured on this machine
async function discoverOdbcSources() {
  const odbc = loadOdbc(); // throws ODBC_UNAVAILABLE if package missing
  const drivers = getInstalledAccessDrivers();

  let allDsns = [];
  try {
    allDsns = await odbc.datasources();
  } catch { /* datasources() may not be supported in all odbc builds */ }

  const ACCESS_RE = /access/i;
  const dsns = allDsns
    .map((d) => ({ name: d.name || d.server || "", description: d.description || "" }))
    .filter((d) => d.name && (ACCESS_RE.test(d.description) || ACCESS_RE.test(d.name)));

  return { dsns, drivers };
}

module.exports = { autoMapColumns, buildConnectionString, discoverAccessSchema, discoverOdbcSources, getTablePreview, queryAttendance, queryZktecoAttendance, validateDbPath };
