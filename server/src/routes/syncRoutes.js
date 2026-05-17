const express = require("express");
const multer = require("multer");
const { requireAuth, requireRole } = require("../middleware/auth");
const { getSyncStatus, pullAttendanceData, upsertBySourceId, calculateShiftMetrics } = require("../services/syncService");
const { pullFromZktecoDevice } = require("../services/zktecoPullService");
const { discoverMdbSchema, previewMdbTable, readMdbTable } = require("../services/mdbFileService");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

router.use(requireAuth);

// ── Standard ODBC-based sync ──────────────────────────────────────────────────

router.get("/status", async (req, res, next) => {
  try {
    res.json(await getSyncStatus());
  } catch (error) {
    next(error);
  }
});

router.post("/pull-now", requireRole("Admin"), async (req, res, next) => {
  try {
    res.json(await pullAttendanceData());
  } catch (error) {
    next(error);
  }
});

router.post("/pull-zkteco-now", requireRole("Admin"), async (req, res, next) => {
  try {
    res.json(await pullFromZktecoDevice());
  } catch (error) {
    next(error);
  }
});

// ── File-upload Access import (no ODBC required) ──────────────────────────────

/** Step 1 — upload .mdb / .accdb, get tables + columns + suggested mapping */
router.post("/access-upload-discover", requireRole("Admin"), upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded." });
    if (!/\.(mdb|accdb)$/i.test(req.file.originalname)) {
      return res.status(400).json({ message: "File must be an .mdb or .accdb Access database." });
    }
    res.json(discoverMdbSchema(req.file.buffer));
  } catch (error) {
    next(error);
  }
});

/** Step 2 (optional) — preview first 10 rows of a selected table */
router.post("/access-upload-preview", requireRole("Admin"), upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded." });
    const { tableName } = req.body;
    if (!tableName) return res.status(400).json({ message: "tableName is required." });
    res.json(previewMdbTable(req.file.buffer, tableName));
  } catch (error) {
    next(error);
  }
});

/** Step 3 — import: upload file + tableName + column mapping, upsert attendance records */
router.post("/access-upload-import", requireRole("Admin"), upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded." });
    const { tableName } = req.body;
    if (!tableName) return res.status(400).json({ message: "tableName is required." });

    let mapping = {};
    try { mapping = JSON.parse(req.body.mapping || "{}"); } catch { /* leave empty */ }

    const rows = readMdbTable(req.file.buffer, tableName, mapping);
    let recordsUpserted = 0;
    let skipped = 0;

    for (const row of rows) {
      const empId = String(row.employeeId ?? "").trim();
      if (!empId) { skipped++; continue; }

      const toIso = (v) => {
        if (!v) return null;
        const d = v instanceof Date ? v : new Date(v);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
      };

      const checkIn  = toIso(row.checkIn);
      const checkOut = toIso(row.checkOut);
      const date = (checkIn || checkOut || new Date().toISOString()).slice(0, 10);
      const metrics  = await calculateShiftMetrics(row.shift, checkIn, checkOut);

      await upsertBySourceId({
        sourceId:        `mdb-${empId}-${date}`,
        employeeId:      empId,
        employeeName:    String(row.employeeName ?? ""),
        department:      String(row.department   ?? ""),
        shift:           String(row.shift         ?? ""),
        checkIn,
        checkOut,
        status:          row.status || metrics.status || "Present",
        lateMinutes:     metrics.lateMinutes    ?? 0,
        earlyOutMinutes: metrics.earlyOutMinutes ?? 0,
        overtimeMinutes: Number(row.overtimeMinutes) || metrics.overtimeMinutes || 0
      });

      recordsUpserted++;
    }

    res.json({ recordsRead: rows.length, recordsUpserted, skipped, status: "done" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
