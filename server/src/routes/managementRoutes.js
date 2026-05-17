const express = require("express");
const { all, get, run } = require("../db/localDb");
const { requireAuth, requireRole } = require("../middleware/auth");
const { upsertBySourceId, calculateShiftMetrics } = require("../services/syncService");

const router = express.Router();
router.use(requireAuth);

/** Returns all dates (YYYY-MM-DD) in [startDate, endDate] inclusive. */
function getDatesInRange(startDate, endDate) {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return dates;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

router.get("/overview", async (req, res, next) => {
  try {
    const [pendingLeaves, pendingCorrections, activeEmployees, activeShifts] = await Promise.all([
      get("SELECT COUNT(*) AS count FROM leave_requests WHERE status = 'Pending'"),
      get("SELECT COUNT(*) AS count FROM attendance_corrections WHERE status = 'Pending'"),
      get("SELECT COUNT(*) AS count FROM employees WHERE status = 'Active'"),
      get("SELECT COUNT(*) AS count FROM shifts WHERE is_active = 1")
    ]);
    res.json({
      pendingLeaves: pendingLeaves.count,
      pendingCorrections: pendingCorrections.count,
      activeEmployees: activeEmployees.count,
      activeShifts: activeShifts.count
    });
  } catch (error) {
    next(error);
  }
});

router.get("/shifts", async (req, res, next) => {
  try {
    res.json({ shifts: await all("SELECT * FROM shifts ORDER BY code") });
  } catch (error) {
    next(error);
  }
});

router.post("/shifts", requireRole("Admin"), async (req, res, next) => {
  try {
    const item = req.body;
    if (!item.code || !item.name || !item.startTime || !item.endTime) {
      return res.status(400).json({ message: "code, name, startTime, and endTime are required." });
    }
    const result = await run(
      `INSERT INTO shifts (code, name, start_time, end_time, grace_minutes, early_out_grace_minutes, overtime_after_minutes, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.code,
        item.name,
        item.startTime,
        item.endTime,
        Number(item.graceMinutes || 0),
        Number(item.earlyOutGraceMinutes || 0),
        Number(item.overtimeAfterMinutes || 0),
        item.isActive === false ? 0 : 1
      ]
    );
    res.status(201).json(await get("SELECT * FROM shifts WHERE id = ?", [result.id]));
  } catch (error) {
    next(error);
  }
});

router.put("/shifts/:id", requireRole("Admin"), async (req, res, next) => {
  try {
    const item = req.body;
    await run(
      `UPDATE shifts SET code = ?, name = ?, start_time = ?, end_time = ?, grace_minutes = ?,
       early_out_grace_minutes = ?, overtime_after_minutes = ?, is_active = ? WHERE id = ?`,
      [
        item.code,
        item.name,
        item.startTime,
        item.endTime,
        Number(item.graceMinutes || 0),
        Number(item.earlyOutGraceMinutes || 0),
        Number(item.overtimeAfterMinutes || 0),
        item.isActive === false ? 0 : 1,
        req.params.id
      ]
    );
    res.json(await get("SELECT * FROM shifts WHERE id = ?", [req.params.id]));
  } catch (error) {
    next(error);
  }
});

router.get("/holidays", async (req, res, next) => {
  try {
    res.json({
      holidays: await all(
        `SELECT h.*, c.code AS company_code
         FROM holidays h
         LEFT JOIN companies c ON c.id = h.company_id
         ORDER BY h.holiday_date DESC`
      )
    });
  } catch (error) {
    next(error);
  }
});

router.post("/holidays", requireRole("Admin"), async (req, res, next) => {
  try {
    const item = req.body;
    if (!item.holidayDate || !item.name) {
      return res.status(400).json({ message: "holidayDate and name are required." });
    }
    const result = await run(
      "INSERT INTO holidays (company_id, holiday_date, name, type) VALUES (?, ?, ?, ?)",
      [item.companyId || null, item.holidayDate, item.name, item.type || "Public"]
    );
    res.status(201).json(await get("SELECT * FROM holidays WHERE id = ?", [result.id]));
  } catch (error) {
    next(error);
  }
});

router.get("/leave-requests", async (req, res, next) => {
  try {
    res.json({
      requests: await all(
        `SELECT lr.*, e.employee_code, e.full_name, c.code AS company_code
         FROM leave_requests lr
         JOIN employees e ON e.id = lr.employee_id
         JOIN companies c ON c.id = e.company_id
         ORDER BY lr.created_at DESC
         LIMIT 300`
      )
    });
  } catch (error) {
    next(error);
  }
});

router.post("/leave-requests", async (req, res, next) => {
  try {
    const item = req.body;
    const employeeId = item.employeeId || req.user.employeeId;
    if (!employeeId) return res.status(400).json({ message: "Employee is required." });
    if (!item.leaveType || !item.startDate || !item.endDate) {
      return res.status(400).json({ message: "leaveType, startDate, and endDate are required." });
    }
    if (item.startDate > item.endDate) {
      return res.status(400).json({ message: "startDate must be on or before endDate." });
    }

    // Check for overlapping approved/pending leave for this employee
    const overlap = await get(
      `SELECT id FROM leave_requests
       WHERE employee_id = ? AND status IN ('Pending', 'Approved')
         AND start_date <= ? AND end_date >= ?`,
      [employeeId, item.endDate, item.startDate]
    );
    if (overlap) {
      return res.status(409).json({ message: "An overlapping leave request already exists for this period." });
    }

    const result = await run(
      "INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, reason, requested_by) VALUES (?, ?, ?, ?, ?, ?)",
      [employeeId, item.leaveType, item.startDate, item.endDate, item.reason || "", req.user.id]
    );
    res.status(201).json(await get("SELECT * FROM leave_requests WHERE id = ?", [result.id]));
  } catch (error) {
    next(error);
  }
});

router.patch("/leave-requests/:id/review", requireRole("Admin"), async (req, res, next) => {
  try {
    const status = req.body.status === "Rejected" ? "Rejected" : "Approved";

    // Get full leave + employee before updating
    const leave = await get(
      `SELECT lr.*, e.employee_code, e.full_name, e.department, e.shift
       FROM leave_requests lr
       JOIN employees e ON e.id = lr.employee_id
       WHERE lr.id = ?`,
      [req.params.id]
    );
    if (!leave) return res.status(404).json({ message: "Leave request not found." });

    await run(
      "UPDATE leave_requests SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ? WHERE id = ?",
      [status, req.user.id, req.body.reviewNote || "", req.params.id]
    );

    if (status === "Approved") {
      // Create one attendance record per leave day
      const dates = getDatesInRange(leave.start_date, leave.end_date);
      for (const date of dates) {
        await upsertBySourceId({
          sourceId: `leave-${leave.id}-${date}`,
          employeeId: leave.employee_code,
          employeeName: leave.full_name,
          department: leave.department || "",
          shift: leave.shift || "",
          checkIn: `${date}T00:00:00.000Z`,
          checkOut: `${date}T23:59:59.000Z`,
          status: "Leave",
          overtimeMinutes: 0,
          lateMinutes: 0,
          earlyOutMinutes: 0
        });
      }
    }

    res.json(await get("SELECT * FROM leave_requests WHERE id = ?", [req.params.id]));
  } catch (error) {
    next(error);
  }
});

router.get("/corrections", async (req, res, next) => {
  try {
    res.json({
      corrections: await all(
        `SELECT ac.*, e.employee_code, e.full_name, c.code AS company_code
         FROM attendance_corrections ac
         JOIN employees e ON e.id = ac.employee_id
         JOIN companies c ON c.id = e.company_id
         ORDER BY ac.created_at DESC
         LIMIT 300`
      )
    });
  } catch (error) {
    next(error);
  }
});

router.post("/corrections", async (req, res, next) => {
  try {
    const item = req.body;
    const employeeId = item.employeeId || req.user.employeeId;
    if (!employeeId) return res.status(400).json({ message: "Employee is required." });
    if (!item.attendanceDate) return res.status(400).json({ message: "attendanceDate is required." });

    // Basic time sanity check
    if (item.checkIn && item.checkOut && item.checkIn >= item.checkOut) {
      return res.status(400).json({ message: "checkOut must be after checkIn." });
    }

    const result = await run(
      `INSERT INTO attendance_corrections (employee_id, attendance_date, check_in, check_out, reason, requested_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [employeeId, item.attendanceDate, item.checkIn || "", item.checkOut || "", item.reason || "", req.user.id]
    );
    res.status(201).json(await get("SELECT * FROM attendance_corrections WHERE id = ?", [result.id]));
  } catch (error) {
    next(error);
  }
});

router.patch("/corrections/:id/review", requireRole("Admin"), async (req, res, next) => {
  try {
    const status = req.body.status === "Rejected" ? "Rejected" : "Approved";
    const correction = await get(
      `SELECT ac.*, e.employee_code, e.full_name, e.department, e.shift
       FROM attendance_corrections ac
       JOIN employees e ON e.id = ac.employee_id
       WHERE ac.id = ?`,
      [req.params.id]
    );
    if (!correction) return res.status(404).json({ message: "Correction not found." });

    await run(
      "UPDATE attendance_corrections SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ? WHERE id = ?",
      [status, req.user.id, req.body.reviewNote || "", req.params.id]
    );

    if (status === "Approved") {
      // Calculate shift metrics from the corrected times
      const metrics = await calculateShiftMetrics(
        correction.shift,
        correction.check_in || `${correction.attendance_date}T00:00:00`,
        correction.check_out || null
      );
      await upsertBySourceId({
        sourceId: `correction-${correction.id}`,
        employeeId: correction.employee_code,
        employeeName: correction.full_name,
        department: correction.department || "",
        shift: correction.shift || "",
        checkIn: correction.check_in || `${correction.attendance_date}T00:00:00`,
        checkOut: correction.check_out || null,
        status: metrics.status,
        overtimeMinutes: metrics.overtimeMinutes,
        lateMinutes: metrics.lateMinutes,
        earlyOutMinutes: metrics.earlyOutMinutes
      });
    }

    res.json(await get("SELECT * FROM attendance_corrections WHERE id = ?", [req.params.id]));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
