const express = require("express");
const { all } = require("../db/localDb");
const { requireAuth } = require("../middleware/auth");
const { buildExcel, buildPdf } = require("../services/reportService");
const { attendanceWhere } = require("../utils/queryBuilder");

const router = express.Router();
router.use(requireAuth);

router.get("/export", async (req, res, next) => {
  try {
    const { where, params } = attendanceWhere(req.query);
    const records = await all(
      `SELECT * FROM attendance_records ${where} ORDER BY attendance_date DESC, employee_name`,
      params
    );
    const format = String(req.query.format || "excel").toLowerCase();
    if (format === "pdf") {
      const pdf = await buildPdf(records);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=attendance-report.pdf");
      return res.send(pdf);
    }

    const excel = await buildExcel(records);
    res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=attendance-report.xls");
    return res.send(excel);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
