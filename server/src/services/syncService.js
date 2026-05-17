const env = require("../config/env");
const { all, get, run } = require("../db/localDb");
const { queryAttendance } = require("./accessService");
const { getSettings } = require("./settingsService");
const { computeShiftMetrics, getTimeOfDayMinutes } = require("../utils/shiftCalc");

let isSyncing = false;
let scheduledTask = null;

function cronToIntervalMs(expression) {
  const first = String(expression || "").trim().split(/\s+/)[0] || "*/15";
  const everyMatch = first.match(/^\*\/(\d+)$/);
  if (everyMatch) return Math.max(Number(everyMatch[1]), 1) * 60 * 1000;
  if (first === "*") return 60 * 1000;
  return 15 * 60 * 1000;
}

function toIsoDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toIsoDateTime(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeStatus(row) {
  const status = String(row.status || "Present").trim();
  const known = ["Present", "Absent", "Late", "Early Out", "Overtime", "Leave"];
  return known.find((item) => item.toLowerCase() === status.toLowerCase()) || status;
}

/**
 * Look up the shift policy for a given shift code/name, then compute metrics.
 * Returns { lateMinutes, earlyOutMinutes, overtimeMinutes, status }.
 */
async function calculateShiftMetrics(shiftCode, checkIn, checkOut) {
  const defaults = { lateMinutes: 0, earlyOutMinutes: 0, overtimeMinutes: 0, status: "Present" };
  if (!shiftCode || !checkIn) return defaults;

  const shift = await get(
    "SELECT * FROM shifts WHERE (code = ? OR name = ?) AND is_active = 1 LIMIT 1",
    [shiftCode, shiftCode]
  );
  if (!shift) return defaults;

  const checkInMin = getTimeOfDayMinutes(checkIn);
  const checkOutMin = checkOut ? getTimeOfDayMinutes(checkOut) : null;
  return computeShiftMetrics(shift, checkInMin, checkOutMin);
}

/**
 * Original upsert — uses the 4-column composite unique key.
 * Still used by the Access ODBC sync path where source_id is already stable per punch row.
 * Accepts optional explicit lateMinutes / earlyOutMinutes in row to override status-based fallback.
 */
async function upsertAttendance(row) {
  const checkIn = toIsoDateTime(row.checkIn);
  const attendanceDate = toIsoDate(row.checkIn || row.checkOut);
  if (!row.employeeId || !attendanceDate) return 0;

  const sourceId = row.sourceId || `${row.employeeId}-${attendanceDate}-${checkIn || "no-checkin"}`;
  const lateMin = row.lateMinutes !== undefined ? Number(row.lateMinutes) : 0;
  const earlyOutMin = row.earlyOutMinutes !== undefined ? Number(row.earlyOutMinutes) : 0;

  const result = await run(
    `INSERT INTO attendance_records (
      source_id, employee_id, employee_name, department, shift, attendance_date,
      check_in, check_out, status, overtime_minutes, early_out_minutes, late_minutes, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(source_id, employee_id, attendance_date, check_in) DO UPDATE SET
      employee_name = excluded.employee_name,
      department = excluded.department,
      shift = excluded.shift,
      check_out = excluded.check_out,
      status = excluded.status,
      overtime_minutes = excluded.overtime_minutes,
      early_out_minutes = excluded.early_out_minutes,
      late_minutes = excluded.late_minutes,
      synced_at = CURRENT_TIMESTAMP`,
    [
      sourceId,
      String(row.employeeId),
      row.employeeName || "",
      row.department || "",
      row.shift || "",
      attendanceDate,
      checkIn,
      toIsoDateTime(row.checkOut),
      normalizeStatus(row),
      Number(row.overtimeMinutes || 0),
      earlyOutMin,
      lateMin
    ]
  );
  return result.changes;
}

/**
 * Upsert by source_id alone — SELECT then INSERT/UPDATE.
 * Used for stable source_ids (mobile, ZKTeco grouped, corrections, leaves).
 * When checkIn/checkOut is null in the new row, the existing value is preserved.
 */
async function upsertBySourceId(row) {
  const checkIn = row.checkIn ? toIsoDateTime(row.checkIn) : null;
  const checkOut = row.checkOut ? toIsoDateTime(row.checkOut) : null;
  const attendanceDate = toIsoDate(row.checkIn || row.checkOut);
  if (!row.employeeId || !attendanceDate || !row.sourceId) return 0;

  const status = normalizeStatus(row);
  const lateMin = Number(row.lateMinutes ?? 0);
  const earlyOutMin = Number(row.earlyOutMinutes ?? 0);
  const otMin = Number(row.overtimeMinutes ?? 0);

  const existing = await get(
    "SELECT id, check_in, check_out FROM attendance_records WHERE source_id = ?",
    [row.sourceId]
  );

  if (!existing) {
    await run(
      `INSERT INTO attendance_records
        (source_id, employee_id, employee_name, department, shift, attendance_date,
         check_in, check_out, status, overtime_minutes, early_out_minutes, late_minutes, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        row.sourceId, String(row.employeeId), row.employeeName || "",
        row.department || "", row.shift || "", attendanceDate,
        checkIn, checkOut, status, otMin, earlyOutMin, lateMin
      ]
    );
    return 1;
  }

  // Preserve existing check_in / check_out when the new value is null
  const newCheckIn = checkIn !== null ? checkIn : existing.check_in;
  const newCheckOut = checkOut !== null ? checkOut : existing.check_out;

  await run(
    `UPDATE attendance_records SET
       employee_name = COALESCE(?, employee_name),
       department    = COALESCE(NULLIF(?, ''), department),
       shift         = COALESCE(NULLIF(?, ''), shift),
       check_in      = ?,
       check_out     = ?,
       status        = ?,
       overtime_minutes  = ?,
       early_out_minutes = ?,
       late_minutes      = ?,
       synced_at         = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      row.employeeName || null, row.department || null, row.shift || null,
      newCheckIn, newCheckOut, status,
      otMin, earlyOutMin, lateMin, existing.id
    ]
  );
  return 1;
}

async function pullAttendanceData() {
  if (isSyncing) {
    const error = new Error("A synchronization is already running.");
    error.code = "SYNC_IN_PROGRESS";
    throw error;
  }

  isSyncing = true;
  const syncRun = await run("INSERT INTO sync_runs (status) VALUES ('Running')");

  try {
    const settings = await getSettings();
    const rows = await queryAttendance(settings);
    let upserted = 0;
    for (const row of rows) {
      // Apply shift metrics when the Access row already knows the shift name
      if (row.shift && row.checkIn) {
        const metrics = await calculateShiftMetrics(row.shift, row.checkIn, row.checkOut);
        row.lateMinutes = metrics.lateMinutes;
        row.earlyOutMinutes = metrics.earlyOutMinutes;
        row.overtimeMinutes = metrics.overtimeMinutes;
        row.status = metrics.status;
      }
      upserted += await upsertAttendance(row);
    }

    await run(
      "UPDATE sync_runs SET status = 'Success', finished_at = CURRENT_TIMESTAMP, records_read = ?, records_upserted = ? WHERE id = ?",
      [rows.length, upserted, syncRun.id]
    );
    return { status: "Success", recordsRead: rows.length, recordsUpserted: upserted };
  } catch (error) {
    await run(
      "UPDATE sync_runs SET status = 'Failed', finished_at = CURRENT_TIMESTAMP, error_message = ? WHERE id = ?",
      [error.message, syncRun.id]
    );
    await run("INSERT INTO error_logs (level, source, message, details) VALUES ('error', 'sync', ?, ?)", [
      error.message,
      JSON.stringify({ code: error.code || "UNKNOWN" })
    ]);
    throw error;
  } finally {
    isSyncing = false;
  }
}

async function getSyncStatus() {
  const latest = await get("SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1");
  const errors = await all("SELECT * FROM error_logs ORDER BY id DESC LIMIT 20");
  return { isSyncing, latest, errors };
}

function scheduleSync() {
  if (scheduledTask) clearInterval(scheduledTask);
  scheduledTask = setInterval(() => {
    pullAttendanceData().catch(() => {});
  }, cronToIntervalMs(env.syncFrequencyCron));
}

module.exports = {
  pullAttendanceData,
  getSyncStatus,
  scheduleSync,
  upsertAttendance,
  upsertBySourceId,
  calculateShiftMetrics
};
