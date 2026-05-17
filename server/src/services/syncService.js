const env = require("../config/env");
const { db, all, get, run } = require("../db/localDb");
const { queryAttendance, queryZktecoAttendance } = require("./accessService");
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

async function pullAttendanceData(options = {}) {
  if (isSyncing) {
    const error = new Error("A synchronization is already running.");
    error.code = "SYNC_IN_PROGRESS";
    throw error;
  }

  isSyncing = true;
  const syncRun = await run("INSERT INTO sync_runs (status) VALUES ('Running')");

  try {
    const settings = await getSettings();
    const isZkteco = String(settings.accessZktecoMode) === "true";
    const rows = await (isZkteco ? queryZktecoAttendance : queryAttendance)({ ...settings, ...options });
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

/**
 * High-throughput batch upsert for file-based Access import.
 * Uses 3 DB round-trips per batch (1 SELECT + 1 INSERT + 1 UPDATE)
 * instead of 2 queries per row.
 *
 * rows: array of { sourceId, employeeId, employeeName, department, shift,
 *                  checkIn, checkOut, status, lateMinutes, earlyOutMinutes, overtimeMinutes }
 */
async function batchUpsertMdbRows(rows) {
  const prepared = rows
    .map((row) => {
      const checkIn  = toIsoDateTime(row.checkIn);
      const checkOut = toIsoDateTime(row.checkOut);
      const date     = toIsoDate(row.checkIn || row.checkOut);
      if (!row.employeeId || !date) return null;
      return {
        sourceId:        row.sourceId,
        employeeId:      String(row.employeeId),
        employeeName:    row.employeeName    || "",
        department:      row.department      || "",
        shift:           row.shift           || "",
        date,
        checkIn,
        checkOut,
        status:          normalizeStatus(row),
        lateMinutes:     Number(row.lateMinutes     ?? 0),
        earlyOutMinutes: Number(row.earlyOutMinutes ?? 0),
        overtimeMinutes: Number(row.overtimeMinutes ?? 0)
      };
    })
    .filter(Boolean);

  if (!prepared.length) return 0;

  // 1. Find which source_ids already exist (single round-trip via ANY array)
  const sourceIds = prepared.map((r) => r.sourceId);
  const { rows: existingRows } = await db.query(
    "SELECT source_id FROM attendance_records WHERE source_id = ANY($1)",
    [sourceIds]
  );
  const existingSet = new Set(existingRows.map((r) => r.source_id));

  const toInsert = prepared.filter((r) => !existingSet.has(r.sourceId));
  const toUpdate = prepared.filter((r) =>  existingSet.has(r.sourceId));

  // 2. Batch INSERT all new rows in a single query
  if (toInsert.length) {
    const N = 13;
    const ph = toInsert.map((_, i) => {
      const b = i * N;
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},NOW())`;
    }).join(",");
    const params = toInsert.flatMap((r) => [
      r.sourceId, r.employeeId, r.employeeName, r.department, r.shift,
      r.date, r.checkIn, r.checkOut, r.status,
      r.overtimeMinutes, r.earlyOutMinutes, r.lateMinutes
    ]);
    await db.query(
      `INSERT INTO attendance_records
         (source_id, employee_id, employee_name, department, shift, attendance_date,
          check_in, check_out, status, overtime_minutes, early_out_minutes, late_minutes, synced_at)
       VALUES ${ph}`,
      params
    );
  }

  // 3. Batch UPDATE existing rows using unnest() — single round-trip
  if (toUpdate.length) {
    await db.query(
      `UPDATE attendance_records ar SET
         employee_name    = v.employee_name,
         department       = v.department,
         shift            = v.shift,
         check_in         = COALESCE(v.check_in,  ar.check_in),
         check_out        = COALESCE(v.check_out, ar.check_out),
         status           = v.status,
         overtime_minutes  = v.ot::int,
         early_out_minutes = v.eo::int,
         late_minutes      = v.lm::int,
         synced_at        = NOW()
       FROM (SELECT
         unnest($1::text[]) AS source_id,
         unnest($2::text[]) AS employee_name,
         unnest($3::text[]) AS department,
         unnest($4::text[]) AS shift,
         unnest($5::text[]) AS check_in,
         unnest($6::text[]) AS check_out,
         unnest($7::text[]) AS status,
         unnest($8::int[])  AS ot,
         unnest($9::int[])  AS eo,
         unnest($10::int[]) AS lm
       ) v
       WHERE ar.source_id = v.source_id`,
      [
        toUpdate.map((r) => r.sourceId),
        toUpdate.map((r) => r.employeeName),
        toUpdate.map((r) => r.department),
        toUpdate.map((r) => r.shift),
        toUpdate.map((r) => r.checkIn),
        toUpdate.map((r) => r.checkOut),
        toUpdate.map((r) => r.status),
        toUpdate.map((r) => r.overtimeMinutes),
        toUpdate.map((r) => r.earlyOutMinutes),
        toUpdate.map((r) => r.lateMinutes)
      ]
    );
  }

  return prepared.length;
}

module.exports = {
  pullAttendanceData,
  getSyncStatus,
  scheduleSync,
  upsertAttendance,
  upsertBySourceId,
  batchUpsertMdbRows,
  calculateShiftMetrics
};
