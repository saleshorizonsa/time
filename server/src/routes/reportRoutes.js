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
      `SELECT * FROM attendance_records ${where} ORDER BY attendance_date ASC, employee_name ASC`,
      params
    );

    const dateTag =
      req.query.startDate && req.query.endDate
        ? `${req.query.startDate}_to_${req.query.endDate}`
        : new Date().toISOString().slice(0, 10);

    const meta = {
      dateRange: req.query.startDate
        ? `${req.query.startDate} to ${req.query.endDate || "present"}`
        : "All dates",
      generatedAt: new Date().toLocaleString(),
      department: req.query.department || "",
      employee: req.query.employee || ""
    };

    const format = String(req.query.format || "excel").toLowerCase();

    if (format === "pdf") {
      const pdf = await buildPdf(records, meta);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="attendance-${dateTag}.pdf"`);
      return res.send(pdf);
    }

    const excel = await buildExcel(records, meta);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="attendance-${dateTag}.xlsx"`);
    return res.send(excel);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
