const { run } = require("../db/localDb");
const { upsertAttendance } = require("./syncService");

function normalizeBody(body) {
  if (!body) return "";
  if (Buffer.isBuffer(body)) return body.toString("utf8");
  if (typeof body === "string") return body;
  return String(body);
}

function parseAttLogLine(line, serialNumber) {
  const parts = line.trim().split(/\t+/);
  if (parts.length < 2) return null;

  const employeeId = parts[0];
  const punchTime = parts[1];
  const punchState = parts[2] || "0";
  const verifyMode = parts[3] || "";
  const workCode = parts[4] || "";

  const status = punchState === "4" || punchState === "5" ? "Overtime" : "Present";

  return {
    sourceId: `zk-${serialNumber || "unknown"}-${employeeId}-${punchTime}`,
    employeeId,
    employeeName: "",
    department: "",
    shift: "",
    checkIn: punchTime,
    checkOut: "",
    status,
    overtimeMinutes: status === "Overtime" ? 1 : 0,
    meta: { serialNumber, punchState, verifyMode, workCode }
  };
}

async function ingestAttLog({ serialNumber, body }) {
  const text = normalizeBody(body);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let upserted = 0;
  let read = 0;

  for (const line of lines) {
    const record = parseAttLogLine(line, serialNumber);
    if (!record) continue;
    read += 1;
    upserted += await upsertAttendance(record);
  }

  await run(
    "INSERT INTO sync_runs (status, finished_at, records_read, records_upserted) VALUES ('Success', CURRENT_TIMESTAMP, ?, ?)",
    [read, upserted]
  );

  return { read, upserted };
}

async function logDeviceRequest(source, message, details = {}) {
  await run("INSERT INTO error_logs (level, source, message, details) VALUES ('info', ?, ?, ?)", [
    source,
    message,
    JSON.stringify(details)
  ]);
}

function buildDeviceOptions(serialNumber) {
  return [
    `GET OPTION FROM: ${serialNumber || ""}`,
    "ATTLOGStamp=None",
    "OPERLOGStamp=None",
    "ATTPHOTOStamp=None",
    "ErrorDelay=30",
    "Delay=10",
    "TransTimes=00:00;14:05",
    "TransInterval=1",
    "TransFlag=1111000000",
    "TimeZone=3",
    "Realtime=1",
    "Encrypt=0"
  ].join("\n");
}

module.exports = { buildDeviceOptions, ingestAttLog, logDeviceRequest, parseAttLogLine };
