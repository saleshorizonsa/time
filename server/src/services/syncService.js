const cron = require("node-cron");
const env = require("../config/env");
const { all, get, run } = require("../db/localDb");
const { queryAttendance } = require("./accessService");
const { getSettings } = require("./settingsService");

let isSyncing = false;
let scheduledTask = null;

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
  const known = ["Present", "Absent", "Late", "Early Out", "Overtime"];
  return known.find((item) => item.toLowerCase() === status.toLowerCase()) || status;
}

function lateMinutes(row) {
  return normalizeStatus(row) === "Late" ? 1 : 0;
}

function earlyOutMinutes(row) {
  return normalizeStatus(row) === "Early Out" ? 1 : 0;
}

async function upsertAttendance(row) {
  const checkIn = toIsoDateTime(row.checkIn);
  const attendanceDate = toIsoDate(row.checkIn || row.checkOut);
  if (!row.employeeId || !attendanceDate) return 0;

  const sourceId = row.sourceId || `${row.employeeId}-${attendanceDate}-${checkIn || "no-checkin"}`;
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
      earlyOutMinutes(row),
      lateMinutes(row)
    ]
  );
  return result.changes;
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
  if (scheduledTask) scheduledTask.stop();
  scheduledTask = cron.schedule(env.syncFrequencyCron, () => {
    pullAttendanceData().catch(() => {});
  });
}

module.exports = { pullAttendanceData, getSyncStatus, scheduleSync, upsertAttendance };
