const fs = require("fs");
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
  const dbPath = sanitizePath(settings.accessDbPath || env.access.dbPath);
  const driver = settings.accessDriver || env.access.driver;
  const password = settings.accessDbPassword || env.access.password;
  const uid = settings.accessUid || env.access.uid;
  const pwd = settings.accessPwd || env.access.pwd;

  if (!dbPath) {
    throw new Error("Access database path is not configured.");
  }

  const parts = [`Driver=${driver}`, `DBQ=${dbPath}`];
  if (password) parts.push(`PWD=${password}`);
  if (uid) parts.push(`UID=${uid}`);
  if (pwd) parts.push(`PWD=${pwd}`);
  return parts.join(";");
}

function validateDbPath(dbPath) {
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
  validateDbPath(settings.accessDbPath || env.access.dbPath);

  for (const [label, settingKey] of requiredMappings) {
    if (!columns[label]) {
      const error = new Error(`Access mapping is missing required field: ${settingKey}`);
      error.code = "INVALID_MAPPING";
      throw error;
    }
  }

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
  validateDbPath(settings.accessDbPath || env.access.dbPath);

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

    return { tables };
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
  validateDbPath(settings.accessDbPath || env.access.dbPath);

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

module.exports = { autoMapColumns, buildConnectionString, discoverAccessSchema, getTablePreview, queryAttendance, validateDbPath };
