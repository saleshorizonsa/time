const env = require("../config/env");
const { getSettings } = require("./settingsService");
const { upsertAttendance } = require("./syncService");
const { run } = require("../db/localDb");

function mapDeviceLog(log, host) {
  const employeeId = log.deviceUserId || log.userId || log.uid || log.id;
  const punchTime = log.recordTime || log.timestamp || log.time;
  return {
    sourceId: `zk-pull-${host}-${employeeId}-${punchTime}`,
    employeeId: String(employeeId || ""),
    employeeName: "",
    department: "",
    shift: "",
    checkIn: punchTime,
    checkOut: "",
    status: "Present",
    overtimeMinutes: 0
  };
}

async function pullFromZktecoDevice() {
  const settings = await getSettings();
  const host = settings.zkDeviceHost || env.zkteco.deviceHost;
  const port = Number(settings.zkDevicePort || env.zkteco.devicePort);
  const timeout = Number(settings.zkDeviceTimeoutMs || env.zkteco.timeoutMs);
  const inPort = Number(settings.zkDeviceInPort || env.zkteco.inPort);

  if (!host) {
    const error = new Error("ZKTeco device host is not configured.");
    error.code = "INVALID_PATH";
    throw error;
  }

  let ZKLib;
  try {
    ZKLib = require("node-zklib");
  } catch (error) {
    error.message = "node-zklib is not installed. Run npm install in the server folder.";
    throw error;
  }

  const syncRun = await run("INSERT INTO sync_runs (status) VALUES ('Running')");
  const zk = new ZKLib(host, port, timeout, inPort);

  try {
    await zk.createSocket();
    const payload = await zk.getAttendances();
    const logs = Array.isArray(payload) ? payload : payload?.data || [];
    let upserted = 0;
    for (const log of logs) {
      upserted += await upsertAttendance(mapDeviceLog(log, host));
    }
    await run(
      "UPDATE sync_runs SET status = 'Success', finished_at = CURRENT_TIMESTAMP, records_read = ?, records_upserted = ? WHERE id = ?",
      [logs.length, upserted, syncRun.id]
    );
    return { status: "Success", recordsRead: logs.length, recordsUpserted: upserted };
  } catch (error) {
    await run(
      "UPDATE sync_runs SET status = 'Failed', finished_at = CURRENT_TIMESTAMP, error_message = ? WHERE id = ?",
      [error.message, syncRun.id]
    );
    throw error;
  } finally {
    if (zk.disconnect) await zk.disconnect().catch(() => {});
  }
}

module.exports = { pullFromZktecoDevice };
