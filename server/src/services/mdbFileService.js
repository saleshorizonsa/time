const { autoMapColumns } = require("./accessService");

function loadReader() {
  try {
    const mod = require("mdb-reader");
    return mod.default || mod;
  } catch {
    const err = new Error(
      "mdb-reader is not installed. Run: npm install mdb-reader in the server directory."
    );
    err.code = "MDB_READER_UNAVAILABLE";
    throw err;
  }
}

function openDb(buffer) {
  const MDBReader = loadReader();
  return new MDBReader(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
}

/** Returns tables + columns + auto-suggested column mapping. */
function discoverMdbSchema(buffer) {
  const reader = openDb(buffer);
  const tables = reader.getTableNames().map((name) => {
    const columns = reader.getTable(name).getColumnNames();
    return { name, columns, suggestedMapping: autoMapColumns(columns) };
  });
  return { tables };
}

/** Returns first `limit` raw rows of a table as column-array pairs for display. */
function previewMdbTable(buffer, tableName, limit = 10) {
  const reader = openDb(buffer);
  const table = reader.getTable(tableName);
  const columns = table.getColumnNames();
  const rows = table
    .getData()
    .slice(0, limit)
    .map((r) => columns.map((c) => (r[c] == null ? null : String(r[c]))));
  return { columns, rows };
}

/**
 * Returns all rows mapped to the attendance field names.
 * mapping: { employeeId, employeeName, department, shift, checkIn, checkOut, status, overtimeMinutes }
 *          values are Access column names.
 */
function readMdbTable(buffer, tableName, mapping) {
  const reader = openDb(buffer);
  const table = reader.getTable(tableName);
  return table.getData().map((row) => ({
    employeeId:      row[mapping.employeeId]      ?? null,
    employeeName:    row[mapping.employeeName]    ?? null,
    department:      row[mapping.department]      ?? null,
    shift:           row[mapping.shift]           ?? null,
    checkIn:         row[mapping.checkIn]         ?? null,
    checkOut:        row[mapping.checkOut]        ?? null,
    status:          row[mapping.status]          ?? null,
    overtimeMinutes: row[mapping.overtimeMinutes] ?? 0
  }));
}

module.exports = { discoverMdbSchema, previewMdbTable, readMdbTable };
