const bcrypt = require("bcryptjs");
const env = require("../config/env");
const { get, run } = require("../db/localDb");

async function signInWithSupabase(email, password) {
  if (!env.supabaseAnonKey) {
    const error = new Error("Supabase Auth is not configured. Set SUPABASE_ANON_KEY.");
    error.code = "SUPABASE_AUTH_NOT_CONFIGURED";
    throw error;
  }

  const response = await fetch(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${env.supabaseAnonKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error_description || payload.msg || payload.error || "Supabase login failed.");
    error.code = "SUPABASE_AUTH_FAILED";
    throw error;
  }

  return payload;
}

async function ensureAppUserFromSupabase(supabaseUser) {
  const email = String(supabaseUser.email || "").trim().toLowerCase();
  if (!email) throw new Error("Supabase user email is missing.");

  let user = await get("SELECT * FROM users WHERE supabase_user_id = ?", [supabaseUser.id]);
  if (!user) {
    user = await get("SELECT * FROM users WHERE lower(email) = lower(?)", [email]);
  }

  if (user) {
    await run(
      "UPDATE users SET email = ?, username = ?, auth_provider = 'supabase', supabase_user_id = ? WHERE id = ?",
      [email, user.username || email, supabaseUser.id, user.id]
    );
    return get("SELECT * FROM users WHERE id = ?", [user.id]);
  }

  const hash = await bcrypt.hash(`supabase:${supabaseUser.id}:${Date.now()}`, 10);
  const role = email === "itsupport@aljazera.com" ? "Admin" : "Viewer";
  const result = await run(
    "INSERT INTO users (email, username, password_hash, role, auth_provider, supabase_user_id) VALUES (?, ?, ?, ?, 'supabase', ?)",
    [email, email, hash, role, supabaseUser.id]
  );
  return get("SELECT * FROM users WHERE id = ?", [result.id]);
}

module.exports = { ensureAppUserFromSupabase, signInWithSupabase };
