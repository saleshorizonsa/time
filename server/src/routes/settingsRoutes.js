const express = require("express");
const env = require("../config/env");
const { requireAuth, requireRole } = require("../middleware/auth");
const { getSettings, saveSettings } = require("../services/settingsService");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const saved = await getSettings();
    res.json({
      accessDbPath: saved.accessDbPath || env.access.dbPath,
      accessDriver: saved.accessDriver || env.access.driver,
      accessTable: saved.accessTable || env.access.table,
      remoteHost: saved.remoteHost || env.remoteHost,
      remoteShare: saved.remoteShare || env.remoteShare,
      syncFrequencyCron: saved.syncFrequencyCron || env.syncFrequencyCron,
      zkMode: saved.zkMode || env.zkteco.mode,
      zkDeviceHost: saved.zkDeviceHost || env.zkteco.deviceHost,
      zkDevicePort: saved.zkDevicePort || env.zkteco.devicePort,
      zkDeviceTimeoutMs: saved.zkDeviceTimeoutMs || env.zkteco.timeoutMs,
      zkDeviceInPort: saved.zkDeviceInPort || env.zkteco.inPort,
      zkAdmsServerAddress: saved.zkAdmsServerAddress || env.zkteco.admsServerAddress,
      zkAdmsServerPort: saved.zkAdmsServerPort || env.zkteco.admsServerPort,
      zkAdmsHttps: saved.zkAdmsHttps || String(env.zkteco.admsHttps),
      workplaceName: saved.workplaceName || env.workplace.name,
      workplaceLatitude: saved.workplaceLatitude || env.workplace.latitude,
      workplaceLongitude: saved.workplaceLongitude || env.workplace.longitude,
      workplaceRadiusMeters: saved.workplaceRadiusMeters || env.workplace.radiusMeters,
      accessUid: saved.accessUid || "",
      hasAccessPassword: Boolean(saved.accessDbPassword || env.access.password),
      hasAccessPwd: Boolean(saved.accessPwd || env.access.pwd),
      hasZkDevicePassword: Boolean(saved.zkDevicePassword || env.zkteco.devicePassword)
    });
  } catch (error) {
    next(error);
  }
});

router.put("/", requireRole("Admin"), async (req, res, next) => {
  try {
    const allowed = [
      "accessDbPath",
      "accessDriver",
      "accessTable",
      "remoteHost",
      "remoteShare",
      "syncFrequencyCron",
      "zkMode",
      "zkDeviceHost",
      "zkDevicePort",
      "zkDeviceTimeoutMs",
      "zkDeviceInPort",
      "zkAdmsServerAddress",
      "zkAdmsServerPort",
      "zkAdmsHttps",
      "zkDevicePassword",
      "workplaceName",
      "workplaceLatitude",
      "workplaceLongitude",
      "workplaceRadiusMeters",
      "accessUid",
      "accessDbPassword",
      "accessPwd"
    ];
    const payload = {};
    allowed.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) payload[key] = req.body[key];
    });
    res.json(await saveSettings(payload));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
