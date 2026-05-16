const express = require("express");
const { all, get } = require("../db/localDb");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/summary", async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const summary = await get(
      `SELECT
        SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) AS present,
        SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) AS late,
        SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) AS absent,
        SUM(CASE WHEN status = 'Overtime' THEN 1 ELSE 0 END) AS overtime,
        COUNT(*) AS total
      FROM attendance_records
      WHERE attendance_date = ?`,
      [req.query.date || today]
    );
    const departments = await all(
      `SELECT department, status, COUNT(*) AS count
       FROM attendance_records
       WHERE attendance_date >= (CURRENT_DATE - INTERVAL '30 days')::text
       GROUP BY department, status
       ORDER BY department`
    );
    const lateArrivals = await all(
      "SELECT * FROM attendance_records WHERE status = 'Late' ORDER BY attendance_date DESC LIMIT 10"
    );
    res.json({ summary, departments, lateArrivals });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
