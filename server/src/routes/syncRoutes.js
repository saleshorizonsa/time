const express = require("express");
const multer = require("multer");
const { requireAuth, requireRole } = require("../middleware/auth");
const { getSyncStatus, pullAttendanceData, upsertBySourceId, calculateShiftMetrics, batchUpsertMdbRows } = require("../services/syncService");
const { all } = require("../db/localDb");
const { computeShiftMetrics, getTimeOfDayMinutes } = require("../utils/shiftCalc");
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

/**
 * Step 3 — import: streams NDJSON progress lines while processing.
 * Each line: { phase, done, total, upserted, skipped }
 * Final line adds: status:"done"
 *
 * Optimisations vs row-by-row:
 *  - Shifts pre-loaded once into memory (no DB hit per row)
 *  - batchUpsertMdbRows does 3 queries per 500-row batch (not 2 per row)
 */
router.post("/access-upload-import", requireRole("Admin"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded." });
  const { tableName } = req.body;
  if (!tableName) return res.status(400).json({ message: "tableName is required." });

  let mapping = {};
  try { mapping = JSON.parse(req.body.mapping || "{}"); } catch { /* ignore */ }

  // Stream NDJSON so the client sees live progress
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");

  const send = (obj) => { try { res.write(JSON.stringify(obj) + "\n"); } catch { /* client disconnected */ } };

  try {
    const rawRows = readMdbTable(req.file.buffer, tableName, mapping);
    const total   = rawRows.length;

    // Pre-load all shifts once — eliminates one DB query per row
    const shiftRows = await all("SELECT * FROM shifts WHERE is_active = 1");
    const shiftMap  = new Map();
    for (const s of shiftRows) {
      shiftMap.set(String(s.code).toLowerCase(), s);
      shiftMap.set(String(s.name).toLowerCase(), s);
    }

    const BATCH   = 500;
    let upserted  = 0;
    let skipped   = 0;

    const toIso = (v) => {
      if (!v) return null;
      const d = v instanceof Date ? v : new Date(v);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    };

    for (let i = 0; i < rawRows.length; i += BATCH) {
      const batch = rawRows.slice(i, i + BATCH);

      const prepared = batch.map((row) => {
        const empId = String(row.employeeId ?? "").trim();
        if (!empId) { skipped++; return null; }

        const checkIn  = toIso(row.checkIn);
        const checkOut = toIso(row.checkOut);
        if (!checkIn && !checkOut) { skipped++; return null; }

        const date = (checkIn || checkOut).slice(0, 10);
        const shiftKey = String(row.shift || "").trim().toLowerCase();
        const shift = shiftMap.get(shiftKey);

        let lateMinutes = 0, earlyOutMinutes = 0, overtimeMinutes = 0, calcStatus = "Present";
        if (shift && checkIn) {
          const m = computeShiftMetrics(shift, getTimeOfDayMinutes(checkIn), checkOut ? getTimeOfDayMinutes(checkOut) : null);
          lateMinutes = m.lateMinutes; earlyOutMinutes = m.earlyOutMinutes;
          overtimeMinutes = m.overtimeMinutes; calcStatus = m.status;
        }

        return {
          sourceId:        `mdb-${empId}-${date}`,
          employeeId:      empId,
          employeeName:    String(row.employeeName ?? ""),
          department:      String(row.department   ?? ""),
          shift:           String(row.shift         ?? ""),
          checkIn, checkOut,
          status:          row.status || calcStatus || "Present",
          lateMinutes,
          earlyOutMinutes,
          overtimeMinutes: Number(row.overtimeMinutes) || overtimeMinutes
        };
      }).filter(Boolean);

      if (prepared.length) {
        await batchUpsertMdbRows(prepared);
        upserted += prepared.length;
      }

      const done = Math.min(i + BATCH, total);
      send({ phase: "processing", done, total, upserted, skipped });
    }

    send({ phase: "done", done: total, total, upserted, skipped, status: "done" });
    res.end();
  } catch (error) {
    send({ error: error.message });
    res.end();
  }
});

module.exports = router;
