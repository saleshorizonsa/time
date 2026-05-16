const fs = require("fs");
const odbc = require("odbc");
const env = require("../config/env");

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

function buildConnectionString(settings = {}) {
  const dbPath = settings.accessDbPath || env.access.dbPath;
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
  if (!dbPath) {
    const error = new Error("Access database path is empty.");
    error.code = "INVALID_PATH";
    throw error;
  }

  if (!/\.accdb$|\.mdb$/i.test(dbPath)) {
    const error = new Error("Access database path must point to an .accdb or .mdb file.");
    error.code = "INVALID_PATH";
    throw error;
  }

  if (!fs.existsSync(dbPath)) {
    const error = new Error(`Access database is unavailable: ${dbPath}`);
    error.code = dbPath.startsWith("\\\\") ? "REMOTE_UNAVAILABLE" : "INVALID_PATH";
    throw error;
  }
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
  const dbPath = settings.accessDbPath || env.access.dbPath;
  validateDbPath(dbPath);

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
  const dbPath = settings.accessDbPath || env.access.dbPath;
  validateDbPath(dbPath);

  let connection;
  try {
    connection = await odbc.connect(buildConnectionString(settings));
    const tableRows = await connection.tables(null, null, null, "TABLE");
    const tables = [];

    for (const tableRow of tableRows) {
      const tableName = tableRow.TABLE_NAME || tableRow.table_name;
      if (!tableName || String(tableName).startsWith("MSys")) continue;
      const columnRows = await connection.columns(null, null, tableName, null);
      tables.push({
        name: tableName,
        columns: columnRows
          .map((column) => column.COLUMN_NAME || column.column_name)
          .filter(Boolean)
      });
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

module.exports = { buildConnectionString, discoverAccessSchema, queryAttendance, validateDbPath };
