const { autoMapColumns } = require("./accessService");

// ── CSV parsing ───────────────────────────────────────────────────────────────

function bufferToText(buffer) {
  // UTF-16 LE BOM (common from Windows/Excel/Access saves)
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) return buffer.slice(2).toString("utf16le");
  // UTF-8 BOM
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) return buffer.slice(3).toString("utf8");
  return buffer.toString("utf8");
}

function parseCsvText(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field.trim()); field = "";
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && next === '\n') i++; // CRLF → skip \n
        row.push(field.trim()); field = "";
        if (row.some((f) => f !== "")) rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
  }
  // Final field / row
  if (field || row.length) {
    row.push(field.trim());
    if (row.some((f) => f !== "")) rows.push(row);
  }
  return rows;
}

// ── Public functions ──────────────────────────────────────────────────────────

/**
 * Detect columns and suggest mapping.
 * Returns { columns, suggestedMapping, totalRows, preview: { columns, rows } }
 */
function discoverCsvSchema(buffer) {
  const rows = parseCsvText(bufferToText(buffer));
  if (!rows.length) throw Object.assign(new Error("CSV file is empty."), { code: "INVALID_CSV" });

  const headers = rows[0];
  const dataRows = rows.slice(1);
  const suggestedMapping = autoMapColumns(headers);
  const previewRows = dataRows.slice(0, 10).map((r) => headers.map((_, i) => r[i] ?? ""));

  return {
    columns: headers,
    suggestedMapping,
    totalRows: dataRows.length,
    preview: { columns: headers, rows: previewRows }
  };
}

/**
 * Read CSV rows into attendance record objects.
 *
 * mapping: { employeeId, employeeName, department, shift, checkIn, checkOut, status, overtimeMinutes }
 * groupByDay: when true (ZKTeco punch format) the checkIn column is treated as a punch timestamp
 *             and rows are aggregated per employee+day (min=check-in, max=check-out).
 */
function readCsvRows(buffer, mapping = {}, groupByDay = false) {
  const rows = parseCsvText(bufferToText(buffer));
  if (rows.length < 2) return [];

  const headers = rows[0];
  const dataRows = rows.slice(1);

  // Build a map from field name → column index (case-insensitive)
  const colIdx = {};
  for (const [field, colName] of Object.entries(mapping)) {
    if (!colName) continue;
    const idx = headers.findIndex((h) => h.toLowerCase() === colName.toLowerCase());
    if (idx >= 0) colIdx[field] = idx;
  }

  const get = (row, field) => (colIdx[field] !== undefined ? (row[colIdx[field]] ?? "") : "");

  if (!groupByDay) {
    return dataRows.map((row) => ({
      employeeId:      get(row, "employeeId"),
      employeeName:    get(row, "employeeName"),
      department:      get(row, "department"),
      shift:           get(row, "shift"),
      checkIn:         get(row, "checkIn")  || null,
      checkOut:        get(row, "checkOut") || null,
      status:          get(row, "status")   || "Present",
      overtimeMinutes: Number(get(row, "overtimeMinutes")) || 0
    }));
  }

  // ZKTeco punch format: aggregate one punch per row → one record per employee+day
  const punchMap = new Map();
  for (const row of dataRows) {
    const empId = get(row, "employeeId");
    if (!empId) continue;
    const timeStr = get(row, "checkIn"); // the single CHECKTIME column is mapped to checkIn
    if (!timeStr) continue;
    const dt = new Date(timeStr);
    if (Number.isNaN(dt.getTime())) continue;

    const dateStr = dt.toISOString().slice(0, 10);
    const key = `${empId}::${dateStr}`;
    const existing = punchMap.get(key);
    if (!existing) {
      punchMap.set(key, {
        employeeId:   empId,
        employeeName: get(row, "employeeName"),
        department:   get(row, "department"),
        shift:        get(row, "shift"),
        first: dt, last: dt
      });
    } else {
      if (dt < existing.first) existing.first = dt;
      if (dt > existing.last)  existing.last  = dt;
      // Keep first-seen name/dept if later rows have them blank
      if (!existing.employeeName) existing.employeeName = get(row, "employeeName");
      if (!existing.department)   existing.department   = get(row, "department");
    }
  }

  return Array.from(punchMap.values()).map((p) => ({
    employeeId:      p.employeeId,
    employeeName:    p.employeeName,
    department:      p.department,
    shift:           p.shift,
    checkIn:         p.first.toISOString(),
    checkOut:        p.first.getTime() !== p.last.getTime() ? p.last.toISOString() : null,
    status:          "Present",
    overtimeMinutes: 0
  }));
}

module.exports = { discoverCsvSchema, readCsvRows };
