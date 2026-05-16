import { useEffect, useState } from "react";

export default function AdminSettings({ helpers }) {
  const { api } = helpers;
  const [settings, setSettings] = useState({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/settings").then(setSettings).catch((err) => setError(err.message));
  }, []);

  function update(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function save(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      setSettings(await api("/api/settings", { method: "PUT", body: settings }));
      setMessage("Settings saved.");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <section className="rounded border border-line bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">Microsoft Access Source</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Access DB Path">
            <input className="input" value={settings.accessDbPath || ""} onChange={(e) => update("accessDbPath", e.target.value)} placeholder="\\\\REMOTE-PC\\SharedFolder\\attendance.accdb" />
          </Field>
          <Field label="ODBC Driver">
            <input className="input" value={settings.accessDriver || ""} onChange={(e) => update("accessDriver", e.target.value)} />
          </Field>
          <Field label="Access Table">
            <input className="input" value={settings.accessTable || ""} onChange={(e) => update("accessTable", e.target.value)} />
          </Field>
          <Field label="Database User">
            <input className="input" value={settings.accessUid || ""} onChange={(e) => update("accessUid", e.target.value)} />
          </Field>
          <Field label="Database Password">
            <input className="input" type="password" value={settings.accessPwd || ""} onChange={(e) => update("accessPwd", e.target.value)} placeholder={settings.hasAccessPwd ? "Saved" : ""} />
          </Field>
          <Field label="Access File Password">
            <input className="input" type="password" value={settings.accessDbPassword || ""} onChange={(e) => update("accessDbPassword", e.target.value)} placeholder={settings.hasAccessPassword ? "Saved" : ""} />
          </Field>
        </div>
      </section>

      <section className="rounded border border-line bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">Remote Sync</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Remote Machine IP / Hostname">
            <input className="input" value={settings.remoteHost || ""} onChange={(e) => update("remoteHost", e.target.value)} placeholder="REMOTE-PC or 192.168.1.10" />
          </Field>
          <Field label="Shared Folder Path">
            <input className="input" value={settings.remoteShare || ""} onChange={(e) => update("remoteShare", e.target.value)} placeholder="\\\\REMOTE-PC\\SharedFolder" />
          </Field>
          <Field label="Sync Frequency Cron">
            <input className="input" value={settings.syncFrequencyCron || ""} onChange={(e) => update("syncFrequencyCron", e.target.value)} placeholder="*/15 * * * *" />
          </Field>
        </div>
      </section>

      <section className="rounded border border-line bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">ZKTeco MB20</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Mode">
            <select className="input" value={settings.zkMode || "adms"} onChange={(e) => update("zkMode", e.target.value)}>
              <option value="adms">ADMS Push</option>
              <option value="pull">Direct Pull</option>
              <option value="hybrid">ADMS + Pull Backup</option>
            </select>
          </Field>
          <Field label="ADMS Server Address">
            <input className="input" value={settings.zkAdmsServerAddress || ""} onChange={(e) => update("zkAdmsServerAddress", e.target.value)} placeholder="attendance.yourdomain.com" />
          </Field>
          <Field label="ADMS Server Port">
            <input className="input" value={settings.zkAdmsServerPort || ""} onChange={(e) => update("zkAdmsServerPort", e.target.value)} placeholder="443" />
          </Field>
          <Field label="ADMS HTTPS">
            <select className="input" value={String(settings.zkAdmsHttps || "false")} onChange={(e) => update("zkAdmsHttps", e.target.value)}>
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </Field>
          <Field label="Device Host / Public IP">
            <input className="input" value={settings.zkDeviceHost || ""} onChange={(e) => update("zkDeviceHost", e.target.value)} placeholder="203.0.113.20 or branch-ddns.example.com" />
          </Field>
          <Field label="Device Port">
            <input className="input" value={settings.zkDevicePort || ""} onChange={(e) => update("zkDevicePort", e.target.value)} placeholder="4370" />
          </Field>
          <Field label="Device Timeout Ms">
            <input className="input" value={settings.zkDeviceTimeoutMs || ""} onChange={(e) => update("zkDeviceTimeoutMs", e.target.value)} placeholder="10000" />
          </Field>
          <Field label="Device Password">
            <input className="input" type="password" value={settings.zkDevicePassword || ""} onChange={(e) => update("zkDevicePassword", e.target.value)} placeholder={settings.hasZkDevicePassword ? "Saved" : "0"} />
          </Field>
        </div>
      </section>

      <section className="rounded border border-line bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">Mobile Punch Geofence</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Workplace Name">
            <input className="input" value={settings.workplaceName || ""} onChange={(e) => update("workplaceName", e.target.value)} placeholder="Main Workplace" />
          </Field>
          <Field label="Allowed Radius Meters">
            <input className="input" value={settings.workplaceRadiusMeters || ""} onChange={(e) => update("workplaceRadiusMeters", e.target.value)} placeholder="500" />
          </Field>
          <Field label="Workplace Latitude">
            <input className="input" value={settings.workplaceLatitude || ""} onChange={(e) => update("workplaceLatitude", e.target.value)} placeholder="24.713552" />
          </Field>
          <Field label="Workplace Longitude">
            <input className="input" value={settings.workplaceLongitude || ""} onChange={(e) => update("workplaceLongitude", e.target.value)} placeholder="46.675296" />
          </Field>
        </div>
      </section>

      {message ? <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-good">{message}</p> : null}
      {error ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-bad">{error}</p> : null}
      <button className="rounded bg-brand px-5 py-2.5 text-sm font-semibold text-white">Save Settings</button>
    </form>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-sm font-medium">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}
