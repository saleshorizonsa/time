/**
 * Pure shift calculation helpers — no DB dependencies, fully unit-testable.
 *
 * All "minutes" values are integer minutes. Times are represented as minutes
 * since midnight (0–1439). ISO 8601 strings are used for timestamps.
 */

function parseTimeHHMM(timeStr) {
  if (!timeStr) return null;
  const parts = String(timeStr).split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function getTimeOfDayMinutes(isoDateTime) {
  if (!isoDateTime) return null;
  const d = new Date(isoDateTime);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * Compute late/earlyOut/overtime purely from shift definition + observed minutes.
 *
 * @param {object} shift - row from shifts table
 * @param {number} checkInMin  - minutes-since-midnight for check-in  (or null)
 * @param {number} checkOutMin - minutes-since-midnight for check-out (or null)
 * @returns {{ lateMinutes, earlyOutMinutes, overtimeMinutes, status }}
 */
function computeShiftMetrics(shift, checkInMin, checkOutMin) {
  const result = { lateMinutes: 0, earlyOutMinutes: 0, overtimeMinutes: 0, status: "Present" };
  if (!shift || checkInMin === null || checkInMin === undefined) return result;

  const shiftStart = parseTimeHHMM(shift.start_time);
  const shiftEnd = parseTimeHHMM(shift.end_time);
  if (shiftStart === null || shiftEnd === null) return result;

  const isOvernight = shiftEnd <= shiftStart;
  const grace = Number(shift.grace_minutes || 0);
  const earlyGrace = Number(shift.early_out_grace_minutes || 0);
  const otAfter = Number(shift.overtime_after_minutes || 0);

  // --- Late ---
  const graceEnd = shiftStart + grace;
  if (checkInMin > graceEnd) {
    let late = checkInMin - graceEnd;
    // For overnight shifts avoid flagging an "early next day" arrival as late
    if (isOvernight && checkInMin < shiftEnd) late = 0;
    result.lateMinutes = Math.round(Math.max(0, late));
  }

  // --- Early out / Overtime ---
  if (checkOutMin !== null && checkOutMin !== undefined) {
    // For overnight shifts, checkout before midnight on the next day needs +1440
    let adjustedCheckOut = checkOutMin;
    if (isOvernight && checkOutMin < shiftStart) {
      adjustedCheckOut = checkOutMin + 1440;
    }
    const effectiveShiftEnd = isOvernight ? shiftEnd + 1440 : shiftEnd;

    const earlyThreshold = effectiveShiftEnd - earlyGrace;
    if (adjustedCheckOut < earlyThreshold) {
      result.earlyOutMinutes = Math.round(earlyThreshold - adjustedCheckOut);
    }

    const otThreshold = effectiveShiftEnd + otAfter;
    if (adjustedCheckOut > otThreshold) {
      result.overtimeMinutes = Math.round(adjustedCheckOut - otThreshold);
    }
  }

  if (result.lateMinutes > 0) result.status = "Late";
  if (result.earlyOutMinutes > 0) result.status = result.lateMinutes > 0 ? "Late" : "Early Out";
  if (result.overtimeMinutes > 0) result.status = "Overtime";

  return result;
}

module.exports = { parseTimeHHMM, getTimeOfDayMinutes, computeShiftMetrics };
