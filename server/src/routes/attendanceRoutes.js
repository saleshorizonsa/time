const express = require("express");
const { all, get } = require("../db/localDb");
const { requireAuth } = require("../middleware/auth");
const { attendanceWhere } = require("../utils/queryBuilder");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const { where, params } = attendanceWhere(req.query);
    const limit = Math.min(Number(req.query.limit || 100), 1000);
    const offset = Number(req.query.offset || 0);
    const records = await all(
      `SELECT * FROM attendance_records ${where} ORDER BY attendance_date DESC, employee_name LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const total = await get(`SELECT COUNT(*) AS count FROM attendance_records ${where}`, params);
    res.json({ records, total: total.count });
  } catch (error) {
    next(error);
  }
});

router.get("/filters", async (req, res, next) => {
  try {
    const [employees, departments, shifts] = await Promise.all([
      all("SELECT DISTINCT employee_id, employee_name FROM attendance_records ORDER BY employee_name"),
      all("SELECT DISTINCT department FROM attendance_records WHERE department != '' ORDER BY department"),
      all("SELECT DISTINCT shift FROM attendance_records WHERE shift != '' ORDER BY shift")
    ]);
    res.json({ employees, departments, shifts, statuses: ["Present", "Absent", "Late", "Early Out", "Overtime"] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
