import { useEffect, useState } from "react";

export default function SyncPanel({ api, isAdmin }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadStatus() {
    const data = await api("/api/sync/status");
    setStatus(data);
  }

  useEffect(() => {
    loadStatus().catch((err) => setError(err.message));
  }, []);

  async function pullNow() {
    setLoading(true);
    setError("");
    try {
      await api("/api/sync/pull-now", { method: "POST" });
      await loadStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function pullZktecoNow() {
    setLoading(true);
    setError("");
    try {
      await api("/api/sync/pull-zkteco-now", { method: "POST" });
      await loadStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const latest = status?.latest;

  return (
    <section className="rounded border border-line bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Synchronization</h2>
          <p className="text-sm text-slate-500">
            Last sync: {latest?.finished_at || latest?.started_at || "No sync runs yet"}
          </p>
        </div>
        {isAdmin ? (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={pullNow}
              disabled={loading || status?.isSyncing}
              className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loading || status?.isSyncing ? "Pulling..." : "Pull Access DB"}
            </button>
            <button
              onClick={pullZktecoNow}
              disabled={loading || status?.isSyncing}
              className="rounded border border-line px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              Pull MB20
            </button>
          </div>
        ) : null}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded border border-line p-3">
          <p className="text-xs uppercase text-slate-500">Status</p>
          <p className="mt-1 font-semibold">{status?.isSyncing ? "Running" : latest?.status || "Idle"}</p>
        </div>
        <div className="rounded border border-line p-3">
          <p className="text-xs uppercase text-slate-500">Records Read</p>
          <p className="mt-1 font-semibold">{latest?.records_read || 0}</p>
        </div>
        <div className="rounded border border-line p-3">
          <p className="text-xs uppercase text-slate-500">Upserted</p>
          <p className="mt-1 font-semibold">{latest?.records_upserted || 0}</p>
        </div>
      </div>
      {(error || latest?.error_message) && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-bad">
          {error || latest.error_message}
        </div>
      )}
      {status?.errors?.length ? (
        <div className="mt-4 max-h-40 overflow-auto rounded border border-line">
          {status.errors.map((log) => (
            <div key={log.id} className="border-b border-line px-3 py-2 text-xs last:border-0">
              <span className="font-semibold">{log.created_at}</span> {log.message}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
