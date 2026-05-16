import { useState } from "react";
import { Clock3 } from "lucide-react";
import { api } from "../lib/api";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("ChangeMe123!");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      try {
        onLogin(await api("/api/auth/supabase-login", { method: "POST", body: { email, password } }));
      } catch {
        onLogin(await api("/api/auth/login", { method: "POST", body: { email, password } }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-surface px-4">
      <form onSubmit={submit} className="w-full max-w-md rounded border border-line bg-white p-6 shadow-panel">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded bg-brand text-white">
            <Clock3 />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Time Attendance</h1>
            <p className="text-sm text-slate-500">Sign in to continue</p>
          </div>
        </div>
        <label className="block text-sm font-medium">Email or Employee ID</label>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 w-full rounded border border-line px-3 py-2 outline-none focus:border-brand"
          type="text"
        />
        <label className="mt-4 block text-sm font-medium">Password</label>
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 w-full rounded border border-line px-3 py-2 outline-none focus:border-brand"
          type="password"
        />
        {error ? <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-bad">{error}</p> : null}
        <button className="mt-5 w-full rounded bg-brand px-4 py-2.5 font-semibold text-white" disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </main>
  );
}
