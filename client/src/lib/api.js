const API_BASE = import.meta.env.VITE_API_BASE || "";

export function getToken() {
  return localStorage.getItem("attendance_token");
}

export function setSession(session) {
  localStorage.setItem("attendance_token", session.token);
  localStorage.setItem("attendance_user", JSON.stringify(session.user));
}

export function getUser() {
  const raw = localStorage.getItem("attendance_user");
  return raw ? JSON.parse(raw) : null;
}

export function clearSession() {
  localStorage.removeItem("attendance_token");
  localStorage.removeItem("attendance_user");
}

export async function api(path, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body
  });

  if (!response.ok) {
    // Expired / invalid token — clear session so the login screen shows
    if (response.status === 401) {
      clearSession();
      window.location.reload();
      return;
    }
    let message = "Request failed.";
    let code = "";
    try {
      const payload = await response.json();
      message = payload.message || message;
      code = payload.code || "";
    } catch {
      message = response.statusText || message;
    }
    const error = new Error(message);
    error.status = response.status;
    error.code = code;
    throw error;
  }

  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) return response.json();
  return response.blob();
}

export function buildQuery(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}
