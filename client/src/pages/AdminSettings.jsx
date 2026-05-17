import { useEffect, useState } from "react";

const FIELD_LABELS = {
  accessEmployeeIdColumn:      "Employee ID",
  accessEmployeeNameColumn:    "Employee Name",
  accessDepartmentColumn:      "Department",
  accessShiftColumn:           "Shift",
  accessCheckInColumn:         "Check In",
  accessCheckOutColumn:        "Check Out",
  accessStatusColumn:          "Status",
  accessOvertimeMinutesColumn: "Overtime Minutes"
};

const MAPPING_KEYS = [
  ["employeeId",      "accessEmployeeIdColumn"],
  ["employeeName",    "accessEmployeeNameColumn"],
  ["department",      "accessDepartmentColumn"],
  ["shift",           "accessShiftColumn"],
  ["checkIn",         "accessCheckInColumn"],
  ["checkOut",        "accessCheckOutColumn"],
  ["status",          "accessStatusColumn"],
  ["overtimeMinutes", "accessOvertimeMinutesColumn"]
];

export default function AdminSettings({ helpers }) {
  const { api } = helpers;
  const [settings, setSettings]       = useState({});
  const [accessSchema, setAccessSchema] = useState([]);
  const [preview, setPreview]         = useState(null);
  const [busy, setBusy]               = useState("");
  const [message, setMessage]         = useState("");
  const [error, setError]             = useState("");

  useEffect(() => {
    api("/api/settings").then(setSettings).catch((err) => setError(err.message));
  }, []);

  function update(key, value) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  function notify(msg, isError = false) {
    setMessage(isError ? "" : msg);
    setError(isError ? msg : "");
  }

  /* ── Step 1: Connect & discover tables ─────────────────────────── */
  async function handleConnect() {
    setPreview(null);
    setBusy("connect");
    notify("");
    try {
      const result = await api("/api/settings/access/discover", {
        method: "POST",
        body: {
          accessDbPath:     settings.accessDbPath,
          accessDriver:     settings.accessDriver,
          accessDbPassword: settings.accessDbPassword,
          accessUid:        settings.accessUid,
          accessPwd:        settings.accessPwd
        }
      });
      const tables = result.tables || [];
      setAccessSchema(tables);
      notify(`Connected — found ${tables.length} table${tables.length !== 1 ? "s" : ""}.`);

      // Auto-select the only table if there's exactly one
      if (tables.length === 1 && !settings.accessTable) {
        applyTableSelection(tables[0]);
      }
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy("");
    }
  }

  /* ── Step 2: Table selected → auto-map columns ──────────────────── */
  function applyTableSelection(tableObj) {
    const updates = { accessTable: tableObj.name };
    if (tableObj.suggestedMapping) {
      for (const [field, settingKey] of MAPPING_KEYS) {
        const suggested = tableObj.suggestedMapping[field];
        if (suggested) updates[settingKey] = suggested;
      }
    }
    setSettings((s) => ({ ...s, ...updates }));
    setPreview(null);
  }

  function handleTableChange(tableName) {
    const tableObj = accessSchema.find((t) => t.name === tableName);
    if (tableObj) applyTableSelection(tableObj);
    else update("accessTable", tableName);
  }

  const selectedTableObj = accessSchema.find((t) => t.name === settings.accessTable);
  const availableColumns = selectedTableObj?.columns || [];

  /* ── Step 3: Preview rows ───────────────────────────────────────── */
  async function handlePreview() {
    setBusy("preview");
    notify("");
    try {
      const result = await api("/api/settings/access/preview", {
        method: "POST",
        body: {
          accessDbPath:                settings.accessDbPath,
          accessDriver:                settings.accessDriver,
          accessTable:                 settings.accessTable,
          accessDbPassword:            settings.accessDbPassword,
          accessUid:                   settings.accessUid,
          accessPwd:                   settings.accessPwd
        }
      });
      setPreview(result);
      notify(`Preview: ${result.rows.length} row${result.rows.length !== 1 ? "s" : ""} returned.`);
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy("");
    }
  }

  /* ── Pull now ───────────────────────────────────────────────────── */
  async function handlePullNow() {
    setBusy("pull");
    notify("");
    try {
      await api("/api/settings", { method: "PUT", body: settings });
      const result = await api("/api/sync/pull-now", { method: "POST" });
      notify(`Pull complete — ${result.recordsUpserted ?? result.records ?? 0} records synced.`);
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy("");
    }
  }

  /* ── Save all settings ──────────────────────────────────────────── */
  async function save(event) {
    event.preventDefault();
    setBusy("save");
    notify("");
    try {
      setSettings(await api("/api/settings", { method: "PUT", body: settings }));
      notify("Settings saved.");
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy("");
    }
  }

  const isConnected = accessSchema.length > 0;
  const hasTable    = Boolean(settings.accessTable);

  return (
    <form onSubmit={save} className="space-y-5">

      {/* ── Access Source ─────────────────────────────────────────── */}
      <section className="rounded border border-line bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Microsoft Access Source</h2>
        <p className="mt-1 text-xs text-slate-500">Enter the database path, connect to discover tables, then pull.</p>

        {/* Step 1 */}
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">1</span>
            <span className="text-sm font-semibold">Database connection</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Database path (.accdb / .mdb)">
              <input
                className="input"
                value={settings.accessDbPath || ""}
                onChange={(e) => { update("accessDbPath", e.target.value); setAccessSchema([]); setPreview(null); }}
                placeholder="\\REMOTE-PC\SharedFolder\attendance.accdb"
              />
            </Field>
            <Field label="ODBC driver">
              <input className="input" value={settings.accessDriver || ""} onChange={(e) => update("accessDriver", e.target.value)} />
            </Field>
            <Field label="Database user (optional)">
              <input className="input" value={settings.accessUid || ""} onChange={(e) => update("accessUid", e.target.value)} />
            </Field>
            <Field label="Access file password (optional)">
              <input className="input" type="password" value={settings.accessDbPassword || ""} onChange={(e) => update("accessDbPassword", e.target.value)} placeholder={settings.hasAccessPassword ? "Saved" : ""} />
            </Field>
          </div>
          <button
            type="button"
            onClick={handleConnect}
            disabled={!settings.accessDbPath || busy === "connect"}
            className="mt-3 rounded bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === "connect" ? "Connecting…" : isConnected ? "Re-connect" : "Connect & Discover Tables"}
          </button>
        </div>

        {/* Step 2 */}
        <div className={`mt-6 transition-opacity ${isConnected ? "opacity-100" : "pointer-events-none opacity-30"}`}>
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">2</span>
            <span className="text-sm font-semibold">Select table &amp; map columns</span>
            {isConnected && <span className="ml-1 rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">{accessSchema.length} tables found</span>}
          </div>

          <Field label="Table">
            <select
              className="input"
              value={settings.accessTable || ""}
              onChange={(e) => handleTableChange(e.target.value)}
            >
              <option value="">Select table…</option>
              {accessSchema.map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
              {!isConnected && settings.accessTable && (
                <option value={settings.accessTable}>{settings.accessTable}</option>
              )}
            </select>
          </Field>

          {hasTable && (
            <div className="mt-3">
              <p className="mb-2 text-xs text-slate-500">
                Columns are auto-mapped from the table. Adjust any that are wrong.
              </p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {MAPPING_KEYS.map(([, settingKey]) => (
                  <ColumnField
                    key={settingKey}
                    label={FIELD_LABELS[settingKey]}
                    value={settings[settingKey]}
                    options={availableColumns}
                    onChange={(v) => update(settingKey, v)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Step 3 */}
        <div className={`mt-6 transition-opacity ${hasTable ? "opacity-100" : "pointer-events-none opacity-30"}`}>
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">3</span>
            <span className="text-sm font-semibold">Preview &amp; pull</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePreview}
              disabled={!hasTable || busy === "preview"}
              className="rounded border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {busy === "preview" ? "Loading…" : "Preview 10 Rows"}
            </button>
            <button
              type="button"
              onClick={handlePullNow}
              disabled={!hasTable || busy === "pull"}
              className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy === "pull" ? "Pulling…" : "Pull Now"}
            </button>
          </div>

          {/* Preview table */}
          {preview && (
            <div className="mt-4 overflow-x-auto rounded border border-line">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    {preview.columns.map((c) => (
                      <th key={c} className="px-3 py-2 text-left font-semibold text-slate-600">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      {row.map((cell, j) => (
                        <td key={j} className="px-3 py-1.5 text-slate-700">
                          {cell === null || cell === undefined ? <span className="text-slate-400">—</span> : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {preview.rows.length === 0 && (
                    <tr><td colSpan={preview.columns.length} className="px-3 py-3 text-center text-slate-400">No rows returned</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── Remote sync schedule ────────────────────────────────────── */}
      <section className="rounded border border-line bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">Remote Sync Schedule</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Remote machine IP / hostname">
            <input className="input" value={settings.remoteHost || ""} onChange={(e) => update("remoteHost", e.target.value)} placeholder="REMOTE-PC or 192.168.1.10" />
          </Field>
          <Field label="Shared folder path">
            <input className="input" value={settings.remoteShare || ""} onChange={(e) => update("remoteShare", e.target.value)} placeholder="\\REMOTE-PC\SharedFolder" />
          </Field>
          <Field label="Sync frequency (cron)">
            <input className="input" value={settings.syncFrequencyCron || ""} onChange={(e) => update("syncFrequencyCron", e.target.value)} placeholder="*/15 * * * *" />
          </Field>
        </div>
      </section>

      {/* ── ZKTeco ──────────────────────────────────────────────────── */}
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
          <Field label="ADMS server address">
            <input className="input" value={settings.zkAdmsServerAddress || ""} onChange={(e) => update("zkAdmsServerAddress", e.target.value)} placeholder="attendance.yourdomain.com" />
          </Field>
          <Field label="ADMS server port">
            <input className="input" value={settings.zkAdmsServerPort || ""} onChange={(e) => update("zkAdmsServerPort", e.target.value)} placeholder="443" />
          </Field>
          <Field label="ADMS HTTPS">
            <select className="input" value={String(settings.zkAdmsHttps || "false")} onChange={(e) => update("zkAdmsHttps", e.target.value)}>
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </Field>
          <Field label="Device host / public IP">
            <input className="input" value={settings.zkDeviceHost || ""} onChange={(e) => update("zkDeviceHost", e.target.value)} placeholder="203.0.113.20" />
          </Field>
          <Field label="Device port">
            <input className="input" value={settings.zkDevicePort || ""} onChange={(e) => update("zkDevicePort", e.target.value)} placeholder="4370" />
          </Field>
          <Field label="Device timeout (ms)">
            <input className="input" value={settings.zkDeviceTimeoutMs || ""} onChange={(e) => update("zkDeviceTimeoutMs", e.target.value)} placeholder="10000" />
          </Field>
          <Field label="Device password">
            <input className="input" type="password" value={settings.zkDevicePassword || ""} onChange={(e) => update("zkDevicePassword", e.target.value)} placeholder={settings.hasZkDevicePassword ? "Saved" : "0"} />
          </Field>
        </div>
      </section>

      {/* ── Mobile punch geofence ────────────────────────────────────── */}
      <section className="rounded border border-line bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">Mobile Punch Geofence</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Workplace name">
            <input className="input" value={settings.workplaceName || ""} onChange={(e) => update("workplaceName", e.target.value)} placeholder="Main Workplace" />
          </Field>
          <Field label="Allowed radius (meters)">
            <input className="input" value={settings.workplaceRadiusMeters || ""} onChange={(e) => update("workplaceRadiusMeters", e.target.value)} placeholder="500" />
          </Field>
          <Field label="Workplace latitude">
            <input className="input" value={settings.workplaceLatitude || ""} onChange={(e) => update("workplaceLatitude", e.target.value)} placeholder="24.713552" />
          </Field>
          <Field label="Workplace longitude">
            <input className="input" value={settings.workplaceLongitude || ""} onChange={(e) => update("workplaceLongitude", e.target.value)} placeholder="46.675296" />
          </Field>
        </div>
      </section>

      {message && <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-good">{message}</p>}
      {error   && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-bad">{error}</p>}

      <button type="submit" disabled={busy === "save"} className="rounded bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {busy === "save" ? "Saving…" : "Save Settings"}
      </button>
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

function ColumnField({ label, value, options, onChange }) {
  return (
    <Field label={label}>
      {options.length ? (
        <select className="input" value={value || ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">Not mapped</option>
          {options.map((col) => <option key={col} value={col}>{col}</option>)}
        </select>
      ) : (
        <input className="input" value={value || ""} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}
