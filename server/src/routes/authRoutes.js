const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const express = require("express");
const env = require("../config/env");
const { get, run } = require("../db/localDb");
const { requireAuth, requireRole } = require("../middleware/auth");
const { ensureAppUserFromSupabase, signInWithSupabase } = require("../services/supabaseAuthService");

const router = express.Router();

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const login = String(email || "").trim();
    const user = await get("SELECT * FROM users WHERE lower(email) = lower(?) OR lower(username) = lower(?)", [
      login,
      login
    ]);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: "Invalid login or password." });
    }

    if (user.employee_id) {
      const employee = await get("SELECT mobile_access_enabled, status FROM employees WHERE id = ?", [user.employee_id]);
      if (!employee?.mobile_access_enabled || employee.status !== "Active") {
        return res.status(403).json({ message: "Mobile access is not enabled for this employee." });
      }
    }

    const payload = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      employeeId: user.employee_id,
      employeeCode: user.employee_code
    };
    const token = jwt.sign(payload, env.jwtSecret, { expiresIn: "12h" });
    return res.json({ token, user: payload });
  } catch (error) {
    return next(error);
  }
});

router.post("/supabase-login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const session = await signInWithSupabase(String(email || "").trim(), password);
    const appUser = await ensureAppUserFromSupabase(session.user);
    const payload = {
      id: appUser.id,
      email: appUser.email,
      username: appUser.username,
      role: appUser.role,
      employeeId: appUser.employee_id,
      employeeCode: appUser.employee_code
    };
    const token = jwt.sign(payload, env.jwtSecret, { expiresIn: "12h" });
    return res.json({ token, user: payload, supabaseAccessToken: session.access_token });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));

router.post("/users", requireAuth, requireRole("Admin"), async (req, res, next) => {
  try {
    const { email, password, role } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const result = await run("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)", [
      email,
      hash,
      role === "Admin" ? "Admin" : "Viewer"
    ]);
    res.status(201).json({ id: result.id, email, role });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
