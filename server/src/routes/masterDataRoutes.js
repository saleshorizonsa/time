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

// ── Companies ────────────────────────────────────────────────────────────────

router.get("/companies", async (req, res, next) => {
  try {
    const companies = await all(`
      SELECT c.*,
        COUNT(DISTINCT l.id)::int AS location_count,
        COUNT(DISTINCT d.id)::int AS department_count
      FROM companies c
      LEFT JOIN locations l ON l.company_id = c.id AND l.is_active = 1
      LEFT JOIN departments d ON d.company_id = c.id AND d.is_active = 1
      GROUP BY c.id
      ORDER BY c.code
    `);
    res.json({ companies });
  } catch (error) {
    next(error);
  }
});

router.post("/companies", requireRole("Admin"), async (req, res, next) => {
  try {
    const { code, name } = req.body;
    if (!code || !name) return res.status(400).json({ message: "Code and name are required." });
    const result = await run(
      "INSERT INTO companies (code, name, is_active) VALUES (?, ?, 1)",
      [String(code).trim(), String(name).trim()]
    );
    return res.status(201).json(await get("SELECT * FROM companies WHERE id = ?", [result.id]));
  } catch (error) {
    return next(error);
  }
});

router.put("/companies/:id", requireRole("Admin"), async (req, res, next) => {
  try {
    const { code, name, isActive } = req.body;
    await run(
      "UPDATE companies SET code = ?, name = ?, is_active = ? WHERE id = ?",
      [String(code || "").trim(), String(name || "").trim(), isActive ? 1 : 0, req.params.id]
    );
    res.json(await get("SELECT * FROM companies WHERE id = ?", [req.params.id]));
  } catch (error) {
    next(error);
  }
});

// ── Locations ────────────────────────────────────────────────────────────────

router.get("/companies/:id/locations", async (req, res, next) => {
  try {
    const rows = await all(
      "SELECT * FROM locations WHERE company_id = ? ORDER BY code",
      [req.params.id]
    );
    res.json({ locations: rows });
  } catch (error) {
    next(error);
  }
});

router.post("/companies/:id/locations", requireRole("Admin"), async (req, res, next) => {
  try {
    const { code, name, address } = req.body;
    if (!code || !name) return res.status(400).json({ message: "Code and name are required." });
    const result = await run(
      "INSERT INTO locations (company_id, code, name, address) VALUES (?, ?, ?, ?)",
      [req.params.id, String(code).trim(), String(name).trim(), String(address || "").trim()]
    );
    res.status(201).json(await get("SELECT * FROM locations WHERE id = ?", [result.id]));
  } catch (error) {
    next(error);
  }
});

router.put("/locations/:id", requireRole("Admin"), async (req, res, next) => {
  try {
    const { code, name, address, isActive } = req.body;
    await run(
      "UPDATE locations SET code = ?, name = ?, address = ?, is_active = ? WHERE id = ?",
      [String(code).trim(), String(name).trim(), String(address || "").trim(), isActive !== false ? 1 : 0, req.params.id]
    );
    res.json(await get("SELECT * FROM locations WHERE id = ?", [req.params.id]));
  } catch (error) {
    next(error);
  }
});

router.delete("/locations/:id", requireRole("Admin"), async (req, res, next) => {
  try {
    await run("UPDATE departments SET location_id = NULL WHERE location_id = ?", [req.params.id]);
    await run("UPDATE employees SET location_id = NULL WHERE location_id = ?", [req.params.id]);
    await run("DELETE FROM locations WHERE id = ?", [req.params.id]);
    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

// ── Departments ──────────────────────────────────────────────────────────────

router.get("/companies/:id/departments", async (req, res, next) => {
  try {
    const rows = await all(
      `SELECT d.*, l.name AS location_name
       FROM departments d
       LEFT JOIN locations l ON l.id = d.location_id
       WHERE d.company_id = ?
       ORDER BY d.name`,
      [req.params.id]
    );
    res.json({ departments: rows });
  } catch (error) {
    next(error);
  }
});

router.post("/companies/:id/departments", requireRole("Admin"), async (req, res, next) => {
  try {
    const { name, locationId } = req.body;
    if (!name) return res.status(400).json({ message: "Department name is required." });
    const result = await run(
      "INSERT INTO departments (company_id, location_id, name) VALUES (?, ?, ?)",
      [req.params.id, locationId || null, String(name).trim()]
    );
    res.status(201).json(await get("SELECT * FROM departments WHERE id = ?", [result.id]));
  } catch (error) {
    next(error);
  }
});

router.put("/departments/:id", requireRole("Admin"), async (req, res, next) => {
  try {
    const { name, locationId, isActive } = req.body;
    await run(
      "UPDATE departments SET name = ?, location_id = ?, is_active = ? WHERE id = ?",
      [String(name).trim(), locationId || null, isActive !== false ? 1 : 0, req.params.id]
    );
    res.json(await get("SELECT * FROM departments WHERE id = ?", [req.params.id]));
  } catch (error) {
    next(error);
  }
});

router.delete("/departments/:id", requireRole("Admin"), async (req, res, next) => {
  try {
    await run("DELETE FROM departments WHERE id = ?", [req.params.id]);
    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

// ── Employees ────────────────────────────────────────────────────────────────

router.get("/employees", async (req, res, next) => {
  try {
    const clauses = [];
    const params = [];
    if (req.query.companyId) {
      clauses.push("e.company_id = ?");
      params.push(req.query.companyId);
    }
    if (req.query.search) {
      clauses.push("(e.employee_code ILIKE ? OR e.full_name ILIKE ? OR e.email ILIKE ?)");
      params.push(`%${req.query.search}%`, `%${req.query.search}%`, `%${req.query.search}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const employees = await all(
      `SELECT e.*, c.code AS company_code, c.name AS company_name, l.name AS location_name
       FROM employees e
       JOIN companies c ON c.id = e.company_id
       LEFT JOIN locations l ON l.id = e.location_id
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
      `INSERT INTO employees (company_id, location_id, employee_code, full_name, department, shift, email, phone, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.companyId,
        item.locationId || null,
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
        company_id = ?, location_id = ?, employee_code = ?, full_name = ?, department = ?,
        shift = ?, email = ?, phone = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        item.companyId,
        item.locationId || null,
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
        email, username, employee.employee_code, userId
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
        mobile_access_enabled = 1, user_id = ?, mobile_login_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [userId, username, employee.id]
    );

    return res.json({ enabled: true, loginId: username, email, temporaryPassword: temporaryPassword || null });
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
