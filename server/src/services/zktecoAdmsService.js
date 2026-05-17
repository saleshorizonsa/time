const { run } = require("../db/localDb");
const { upsertBySourceId } = require("./syncService");

function normalizeBody(body) {
  if (!body) return "";
  if (Buffer.isBuffer(body)) return body.toString("utf8");
  if (typeof body === "string") return body;
  return String(body);
}

/**
 * Parse a single ATTLOG line from the ZKTeco ADMS push.
 * Returns null if the line is malformed.
 * punchState:  0=CheckIn  1=CheckOut  2=BreakOut  3=BreakIn  4=OTIn  5=OTOut
 */
function parseAttLogLine(line, serialNumber) {
  const parts = line.trim().split(/\t+/);
  if (parts.length < 2) return null;

  const employeeId = parts[0];
  const punchTime = parts[1];
  const punchState = parts[2] || "0";
  const verifyMode = parts[3] || "";
  const workCode = parts[4] || "";

  return {
    employeeId,
    punchTime,
    meta: { serialNumber, punchState, verifyMode, workCode }
  };
}

/**
 * Ingest a batch of ATTLOG lines.
 * Punches are grouped by employee + date. Within each group the earliest
 * IN-type punch becomes check_in and the latest OUT-type punch becomes check_out.
 * The stable source_id `zk-{serial}-{employeeId}-{date}` ensures incremental
 * updates from multiple ADMS pushes accumulate correctly in one daily row.
 */
async function ingestAttLog({ serialNumber, body }) {
  const text = normalizeBody(body);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // punchStates that represent an OUT event
  const OUT_STATES = new Set(["1", "3", "5"]);

  // Group punches by employee + date
  const groups = new Map();
  let read = 0;

  for (const line of lines) {
    const parsed = parseAttLogLine(line, serialNumber);
    if (!parsed) continue;
    read += 1;

    const punchDate = new Date(parsed.punchTime);
    if (Number.isNaN(punchDate.getTime())) continue;

    const date = punchDate.toISOString().slice(0, 10);
    const key = `${parsed.employeeId}||${date}`;

    if (!groups.has(key)) {
      groups.set(key, {
        sourceId: `zk-${serialNumber || "unknown"}-${parsed.employeeId}-${date}`,
        employeeId: parsed.employeeId,
        date,
        checkIn: null,
        checkOut: null
      });
    }

    const group = groups.get(key);
    const isOut = OUT_STATES.has(String(parsed.meta.punchState));
    const ts = punchDate.toISOString();

    if (isOut) {
      // Keep the latest OUT timestamp
      if (!group.checkOut || ts > group.checkOut) group.checkOut = ts;
    } else {
      // Keep the earliest IN timestamp
      if (!group.checkIn || ts < group.checkIn) group.checkIn = ts;
    }
  }

  let upserted = 0;
  for (const group of groups.values()) {
    // upsertBySourceId preserves existing check_in/checkOut when new value is null
    upserted += await upsertBySourceId({
      sourceId: group.sourceId,
      employeeId: group.employeeId,
      employeeName: "",
      department: "",
      shift: "",
      checkIn: group.checkIn,
      checkOut: group.checkOut,
      status: "Present",
      overtimeMinutes: 0,
      lateMinutes: 0,
      earlyOutMinutes: 0
    });
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
