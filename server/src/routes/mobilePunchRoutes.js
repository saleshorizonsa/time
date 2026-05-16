const express = require("express");
const { all, run } = require("../db/localDb");
const { requireAuth } = require("../middleware/auth");
const { evaluateGeofence, getWorkplaceSettings } = require("../services/geofenceService");
const { upsertAttendance } = require("../services/syncService");

const router = express.Router();
router.use(requireAuth);

router.get("/workplace", async (req, res, next) => {
  try {
    res.json(await getWorkplaceSettings());
  } catch (error) {
    next(error);
  }
});

router.get("/history", async (req, res, next) => {
  try {
    const rows = await all(
      "SELECT * FROM mobile_punches WHERE user_id = ? ORDER BY punch_time DESC LIMIT 20",
      [req.user.id]
    );
    res.json({ punches: rows });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { punchType, latitude, longitude, accuracyMeters } = req.body;
    const normalizedType = String(punchType || "").toUpperCase() === "OUT" ? "OUT" : "IN";
    if (req.user.employeeId) {
      const employee = await all("SELECT mobile_access_enabled, status FROM employees WHERE id = ?", [req.user.employeeId]);
      if (!employee[0]?.mobile_access_enabled || employee[0].status !== "Active") {
        return res.status(403).json({ message: "Mobile punch access is disabled for this employee." });
      }
    }
    const employeeId = String(req.body.employeeId || req.user.employeeCode || req.user.email);
    const evaluation = await evaluateGeofence(latitude, longitude);

    const result = await run(
      `INSERT INTO mobile_punches (
        user_id, employee_id, punch_type, latitude, longitude, accuracy_meters,
        distance_meters, accepted, rejection_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        employeeId,
        normalizedType,
        Number(latitude),
        Number(longitude),
        accuracyMeters ? Number(accuracyMeters) : null,
        evaluation.distanceMeters,
        evaluation.accepted ? 1 : 0,
        evaluation.reason
      ]
    );

    if (!evaluation.accepted) {
      return res.status(400).json({
        message: evaluation.reason,
        punch: { id: result.id, accepted: false, distanceMeters: evaluation.distanceMeters },
        workplace: evaluation.workplace
      });
    }

    const now = new Date().toISOString();
    await upsertAttendance({
      sourceId: `mobile-${req.user.id}-${normalizedType}-${now}`,
      employeeId,
      employeeName: req.user.email,
      department: "Mobile",
      shift: "Mobile",
      checkIn: now,
      checkOut: normalizedType === "OUT" ? now : "",
      status: "Present",
      overtimeMinutes: 0
    });

    return res.status(201).json({
      punch: { id: result.id, accepted: true, distanceMeters: evaluation.distanceMeters, punchType: normalizedType },
      workplace: evaluation.workplace
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
