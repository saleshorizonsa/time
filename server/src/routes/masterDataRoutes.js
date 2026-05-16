const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { all, get, run } = require("../db/localDb");
const { requireAuth, requireRole } = require("../middleware/auth");
const { importEmployeesCsv } = require("../services/employeeImportService");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(requireAuth);

router.get("/companies", async (req, res, next) => {
  try {
    res.json({ companies: await all("SELECT * FROM companies ORDER BY code") });
  } catch (error) {
    next(error);
  }
});

router.put("/companies/:id", requireRole("Admin"), async (req, res, next) => {
  try {
    const { code, name, isActive } = req.body;
    await run("UPDATE companies SET code = ?, name = ?, is_active = ? WHERE id = ?", [
      String(code || "").trim(),
      String(name || "").trim(),
      isActive ? 1 : 0,
      req.params.id
    ]);
    res.json(await get("SELECT * FROM companies WHERE id = ?", [req.params.id]));
  } catch (error) {
    next(error);
  }
});

router.get("/employees", async (req, res, next) => {
  try {
    const clauses = [];
    const params = [];
    if (req.query.companyId) {
      clauses.push("e.company_id = ?");
      params.push(req.query.companyId);
    }
    if (req.query.search) {
      clauses.push("(e.employee_code LIKE ? OR e.full_name LIKE ? OR e.email LIKE ?)");
      params.push(`%${req.query.search}%`, `%${req.query.search}%`, `%${req.query.search}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const employees = await all(
      `SELECT e.*, c.code AS company_code, c.name AS company_name
       FROM employees e
       JOIN companies c ON c.id = e.company_id
       ${where}
       ORDER BY c.code, e.employee_code
       LIMIT 500`,
      params
    );
    res.json({ employees });
  } catch (error) {
    next(error);
  }
});

router.post("/employees", requireRole("Admin"), async (req, res, next) => {
  try {
    const item = req.body;
    const result = await run(
      `INSERT INTO employees (company_id, employee_code, full_name, department, shift, email, phone, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.companyId,
        item.employeeCode,
        item.fullName,
        item.department || "",
        item.shift || "",
        item.email || "",
        item.phone || "",
        item.status || "Active"
      ]
    );
    res.status(201).json(await get("SELECT * FROM employees WHERE id = ?", [result.id]));
  } catch (error) {
    next(error);
  }
});

router.put("/employees/:id", requireRole("Admin"), async (req, res, next) => {
  try {
    const item = req.body;
    await run(
      `UPDATE employees SET
        company_id = ?, employee_code = ?, full_name = ?, department = ?, shift = ?,
        email = ?, phone = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        item.companyId,
        item.employeeCode,
        item.fullName,
        item.department || "",
        item.shift || "",
        item.email || "",
        item.phone || "",
        item.status || "Active",
        req.params.id
      ]
    );
    res.json(await get("SELECT * FROM employees WHERE id = ?", [req.params.id]));
  } catch (error) {
    next(error);
  }
});

router.patch("/employees/:id/mobile-access", requireRole("Admin"), async (req, res, next) => {
  try {
    const enabled = Boolean(req.body.enabled);
    const employee = await get(
      `SELECT e.*, c.code AS company_code
       FROM employees e
       JOIN companies c ON c.id = e.company_id
       WHERE e.id = ?`,
      [req.params.id]
    );
    if (!employee) return res.status(404).json({ message: "Employee not found." });

    if (!enabled) {
      await run(
        "UPDATE employees SET mobile_access_enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [employee.id]
      );
      return res.json({ enabled: false });
    }

    const username = employee.employee_code;
    const email = employee.email || `${employee.company_code}.${employee.employee_code}@mobile.local`;
    const duplicateUser = await get(
      "SELECT id FROM users WHERE (lower(username) = lower(?) OR lower(email) = lower(?)) AND (employee_id IS NULL OR employee_id != ?)",
      [username, email, employee.id]
    );
    if (duplicateUser) {
      return res.status(409).json({ message: "Login email or employee ID is already used by another user." });
    }

    let temporaryPassword = "";
    let userId = employee.user_id;
    if (userId) {
      await run("UPDATE users SET email = ?, username = ?, employee_code = ? WHERE id = ?", [
        email,
        username,
        employee.employee_code,
        userId
      ]);
    } else {
      temporaryPassword = `Emp@${crypto.randomBytes(4).toString("hex")}`;
      const hash = await bcrypt.hash(temporaryPassword, 10);
      const result = await run(
        "INSERT INTO users (email, username, employee_id, employee_code, password_hash, role) VALUES (?, ?, ?, ?, ?, 'Viewer')",
        [email, username, employee.id, employee.employee_code, hash]
      );
      userId = result.id;
    }

    await run(
      `UPDATE employees SET
        mobile_access_enabled = 1,
        user_id = ?,
        mobile_login_id = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [userId, username, employee.id]
    );

    return res.json({
      enabled: true,
      loginId: username,
      email,
      temporaryPassword: temporaryPassword || null
    });
  } catch (error) {
    next(error);
  }
});

router.post("/employees/upload", requireRole("Admin"), upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Upload file is required." });
    res.json(await importEmployeesCsv(req.file.buffer));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
