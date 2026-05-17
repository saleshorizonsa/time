import { useEffect, useRef, useState } from "react";
import { getToken } from "../lib/api";

const API_BASE = import.meta.env.VITE_API_BASE || "";

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

function today() { return new Date().toISOString().slice(0, 10); }
function isoMonthsAgo(n) { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10); }
function isoYearStart() { const d = new Date(); d.setMonth(0, 1); return d.toISOString().slice(0, 10); }

const PULL_PRESETS = [
  { key: "1m",  label: "Last month",   from: () => isoMonthsAgo(1) },
  { key: "3m",  label: "Last 3 months",from: () => isoMonthsAgo(3) },
  { key: "6m",  label: "Last 6 months",from: () => isoMonthsAgo(6) },
  { key: "ytd", label: "This year",    from: () => isoYearStart()  },
  { key: "custom", label: "Custom",    from: null                   },
];

export default function AdminSettings({ helpers }) {
  const { api } = helpers;
  const [settings, setSettings] = useState({});
  const [busy, setBusy]         = useState("");
  const [message, setMessage]   = useState("");
  const [error, setError]       = useState("");
  const [errorCode, setErrorCode] = useState("");

  // Access mode: "upload" (.mdb file) | "csv" (CSV file) | "odbc" (server path)
  const [accessMode, setAccessMode] = useState("upload");

  // CSV-mode state
  const [csvFile, setCsvFile]           = useState(null);
  const [csvSchema, setCsvSchema]       = useState(null);   // { columns, suggestedMapping, totalRows, preview }
  const [csvMapping, setCsvMapping]     = useState({});
  const [csvGroupByDay, setCsvGroupByDay] = useState(false);
  const [csvResult, setCsvResult]       = useState(null);
  const [csvProgress, setCsvProgress]   = useState(null);
  const csvXhrRef = useRef(null);

  // Upload-mode state
  const [uploadFile, setUploadFile]       = useState(null);
  const [uploadSchema, setUploadSchema]   = useState([]);
  const [uploadTable, setUploadTable]     = useState("");
  const [uploadMapping, setUploadMapping] = useState({});
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploadResult, setUploadResult]   = useState(null);
  const [importProgress, setImportProgress] = useState(null); // { phase, uploadPct, done, total }
  const xhrRef = useRef(null);

  // ODBC-mode state
  const [odbcSchema, setOdbcSchema]           = useState([]);
  const [odbcPreview, setOdbcPreview]         = useState(null);
  const [detectedSources, setDetectedSources] = useState(null); // { dsns, drivers }

  // Pull date range
  const [pullPreset, setPullPreset] = useState("3m");
  const [pullFrom, setPullFrom]     = useState(() => isoMonthsAgo(3));
  const [pullTo, setPullTo]         = useState(() => today());

  useEffect(() => {
    api("/api/settings").then(setSettings).catch((err) => setError(err.message));
  }, []);

  function update(key, value) { setSettings((s) => ({ ...s, [key]: value })); }
  function notify(msg, isError = false, code = "") {
    setMessage(isError ? "" : msg);
    setError(isError ? msg : "");
    setErrorCode(isError ? code : "");
  }

  // ── Save settings ────────────────────────────────────────────────────────
  async function save(e) {
    e.preventDefault();
    setBusy("save"); notify("");
    try {
      setSettings(await api("/api/settings", { method: "PUT", body: settings }));
      notify("Settings saved.");
    } catch (err) { notify(err.message, true, err.code); }
    finally { setBusy(""); }
  }

  // ── Upload mode ──────────────────────────────────────────────────────────

  async function handleUploadDiscover() {
    if (!uploadFile) return;
    setBusy("udiscover"); notify("");
    setUploadSchema([]); setUploadTable(""); setUploadMapping({}); setUploadPreview(null); setUploadResult(null);
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      const result = await api("/api/sync/access-upload-discover", { method: "POST", body: form });
      const tables = result.tables || [];
      setUploadSchema(tables);
      notify(`Connected — found ${tables.length} table${tables.length !== 1 ? "s" : ""}.`);
      if (tables.length === 1) applyUploadTable(tables[0]);
    } catch (err) { notify(err.message, true, err.code); }
    finally { setBusy(""); }
  }

  function applyUploadTable(tableObj) {
    setUploadTable(tableObj.name);
    // Build mapping: { employeeId: "ActualColName", ... }
    const m = {};
    for (const [field] of MAPPING_KEYS) {
      m[field] = tableObj.suggestedMapping?.[field] || "";
    }
    setUploadMapping(m);
    setUploadPreview(null);
    setUploadResult(null);
  }

  function handleUploadTableChange(name) {
    const tableObj = uploadSchema.find((t) => t.name === name);
    if (tableObj) applyUploadTable(tableObj);
    else setUploadTable(name);
  }

  async function handleUploadPreview() {
    if (!uploadFile || !uploadTable) return;
    setBusy("upreview"); notify("");
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("tableName", uploadTable);
      setUploadPreview(await api("/api/sync/access-upload-preview", { method: "POST", body: form }));
    } catch (err) { notify(err.message, true, err.code); }
    finally { setBusy(""); }
  }

  function handleUploadImport() {
    if (!uploadFile || !uploadTable) return;
    setBusy("uimport"); notify(""); setUploadResult(null); setImportProgress(null);

    const form = new FormData();
    form.append("file", uploadFile);
    form.append("tableName", uploadTable);
    form.append("mapping", JSON.stringify(uploadMapping));

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", `${API_BASE}/api/sync/access-upload-import`);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    // Phase 1 — upload progress
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setImportProgress({ phase: "upload", uploadPct: Math.round((e.loaded / e.total) * 100) });
      }
    };

    // Phase 2 — streaming processing progress (NDJSON lines)
    let lastIdx = 0;
    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 3 && xhr.responseText) {
        const newText = xhr.responseText.slice(lastIdx);
        lastIdx = xhr.responseText.length;
        for (const line of newText.split("\n").filter(Boolean)) {
          try {
            const p = JSON.parse(line);
            if (p.error) { notify(p.error, true); return; }
            setImportProgress((prev) => ({ ...(prev || {}), ...p }));
            if (p.status === "done") {
              setUploadResult(p);
              notify(`Import done — ${p.upserted} records synced from ${p.total} rows${p.skipped ? `, ${p.skipped} skipped` : ""}.`);
            }
          } catch { /* partial line */ }
        }
      }
      if (xhr.readyState === 4) {
        if (xhr.status !== 200 && !uploadResult) notify(`Import failed (${xhr.status})`, true);
        setBusy("");
      }
    };

    xhr.send(form);
  }

  function cancelImport() {
    xhrRef.current?.abort();
    setBusy(""); setImportProgress(null);
    notify("Import cancelled.");
  }

  // ── CSV mode ─────────────────────────────────────────────────────────────

  async function handleCsvDiscover() {
    if (!csvFile) return;
    setBusy("cdiscover"); notify("");
    setCsvSchema(null); setCsvMapping({}); setCsvResult(null); setCsvProgress(null);
    try {
      const form = new FormData();
      form.append("file", csvFile);
      const result = await api("/api/sync/csv-upload-discover", { method: "POST", body: form });
      setCsvSchema(result);
      setCsvMapping(result.suggestedMapping || {});
      notify(`Detected ${result.columns.length} columns, ${result.totalRows.toLocaleString()} rows.`);
    } catch (err) { notify(err.message, true, err.code); }
    finally { setBusy(""); }
  }

  function handleCsvImport() {
    if (!csvFile || !csvSchema) return;
    setBusy("cimport"); notify(""); setCsvResult(null); setCsvProgress(null);

    const form = new FormData();
    form.append("file", csvFile);
    form.append("mapping", JSON.stringify(csvMapping));
    form.append("groupByDay", String(csvGroupByDay));

    const xhr = new XMLHttpRequest();
    csvXhrRef.current = xhr;
    xhr.open("POST", `${API_BASE}/api/sync/csv-upload-import`);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setCsvProgress({ phase: "upload", uploadPct: Math.round((e.loaded / e.total) * 100) });
    };

    let lastIdx = 0;
    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 3 && xhr.responseText) {
        const newText = xhr.responseText.slice(lastIdx);
        lastIdx = xhr.responseText.length;
        for (const line of newText.split("\n").filter(Boolean)) {
          try {
            const p = JSON.parse(line);
            if (p.error) { notify(p.error, true); return; }
            setCsvProgress((prev) => ({ ...(prev || {}), ...p }));
            if (p.status === "done") {
              setCsvResult(p);
              notify(`Import done — ${p.upserted} records synced from ${p.total} rows${p.skipped ? `, ${p.skipped} skipped` : ""}.`);
            }
          } catch { /* partial line */ }
        }
      }
      if (xhr.readyState === 4) { setBusy(""); }
    };
    xhr.send(form);
  }

  function cancelCsvImport() {
    csvXhrRef.current?.abort();
    setBusy(""); setCsvProgress(null);
    notify("Import cancelled.");
  }

  async function handleSaveUploadMapping() {
    if (!uploadTable) return;
    setBusy("usave"); notify("");
    try {
      const payload = {
        accessTable:                 uploadTable,
        accessEmployeeIdColumn:      uploadMapping.employeeId      || "",
        accessEmployeeNameColumn:    uploadMapping.employeeName    || "",
        accessDepartmentColumn:      uploadMapping.department      || "",
        accessShiftColumn:           uploadMapping.shift           || "",
        accessCheckInColumn:         uploadMapping.checkIn         || "",
        accessCheckOutColumn:        uploadMapping.checkOut        || "",
        accessStatusColumn:          uploadMapping.status          || "",
        accessOvertimeMinutesColumn: uploadMapping.overtimeMinutes || "",
      };
      setSettings(await api("/api/settings", { method: "PUT", body: payload }));
      notify("Mapping saved.");
    } catch (err) { notify(err.message, true, err.code); }
    finally { setBusy(""); }
  }

  const uploadColumns = uploadSchema.find((t) => t.name === uploadTable)?.columns || [];

  // ── ODBC mode ────────────────────────────────────────────────────────────

  async function handleDetectSources() {
    setBusy("odetect"); notify("");
    try {
      const result = await api("/api/settings/access/odbc-sources");
      setDetectedSources(result);
      if (result.drivers.length && !settings.accessDriver) {
        update("accessDriver", result.drivers[0]);
      }
      const dsnLabel = `${result.dsns.length} DSN${result.dsns.length !== 1 ? "s" : ""}`;
      const drvLabel = `${result.drivers.length} driver${result.drivers.length !== 1 ? "s" : ""}`;
      notify(`Detected: ${dsnLabel}, ${drvLabel}.`);
    } catch (err) { notify(err.message, true, err.code); }
    finally { setBusy(""); }
  }

  function applyDsn(dsn) {
    update("accessDsn", dsn.name);
    if (detectedSources?.drivers?.length) update("accessDriver", detectedSources.drivers[0]);
    setOdbcSchema([]); setOdbcPreview(null);
  }

  function clearDsn() {
    update("accessDsn", "");
    setOdbcSchema([]); setOdbcPreview(null);
  }

  function applyPullPreset(key) {
    setPullPreset(key);
    const preset = PULL_PRESETS.find((p) => p.key === key);
    if (preset?.from) { setPullFrom(preset.from()); setPullTo(today()); }
  }

  async function handleOdbcConnect() {
    setOdbcPreview(null); setBusy("oconnect"); notify("");
    try {
      const result = await api("/api/settings/access/discover", {
        method: "POST",
        body: {
          accessDsn: settings.accessDsn, accessDbPath: settings.accessDbPath,
          accessDriver: settings.accessDriver, accessDbPassword: settings.accessDbPassword,
          accessUid: settings.accessUid, accessPwd: settings.accessPwd
        }
      });
      const tables = result.tables || [];
      setOdbcSchema(tables);
      if (result.isZktecoSchema) {
        update("accessZktecoMode", "true");
        update("accessTable", "CHECKINOUT");
        notify("ZKTeco att2000 schema detected — CHECKINOUT + USERINFO + DEPARTMENTS will be joined automatically.");
      } else {
        update("accessZktecoMode", "");
        if (tables.length === 1 && !settings.accessTable) applyOdbcTable(tables[0]);
        notify(`Connected — found ${tables.length} table${tables.length !== 1 ? "s" : ""}.`);
      }
    } catch (err) { notify(err.message, true, err.code); }
    finally { setBusy(""); }
  }

  function applyOdbcTable(tableObj) {
    const updates = { accessTable: tableObj.name };
    for (const [field, settingKey] of MAPPING_KEYS) {
      const s = tableObj.suggestedMapping?.[field];
      if (s) updates[settingKey] = s;
    }
    setSettings((prev) => ({ ...prev, ...updates }));
    setOdbcPreview(null);
  }

  async function handleOdbcPreview() {
    setBusy("opreview"); notify("");
    try {
      const result = await api("/api/settings/access/preview", {
        method: "POST",
        body: { accessDsn: settings.accessDsn, accessDbPath: settings.accessDbPath,
                accessDriver: settings.accessDriver, accessTable: settings.accessTable,
                accessDbPassword: settings.accessDbPassword, accessUid: settings.accessUid,
                accessPwd: settings.accessPwd }
      });
      setOdbcPreview(result);
    } catch (err) { notify(err.message, true, err.code); }
    finally { setBusy(""); }
  }

  async function handleSaveOdbcSettings() {
    setBusy("osave"); notify("");
    try {
      setSettings(await api("/api/settings", { method: "PUT", body: settings }));
      notify("Settings saved.");
    } catch (err) { notify(err.message, true, err.code); }
    finally { setBusy(""); }
  }

  async function handleOdbcPull() {
    setBusy("opull"); notify("");
    try {
      await api("/api/settings", { method: "PUT", body: settings });
      const result = await api("/api/sync/pull-now", { method: "POST", body: { dateFrom: pullFrom, dateTo: pullTo } });
      notify(`Pull complete — ${result.recordsUpserted ?? 0} records synced (${pullFrom} → ${pullTo}).`);
    } catch (err) { notify(err.message, true, err.code); }
    finally { setBusy(""); }
  }

  const odbcSelectedTable = odbcSchema.find((t) => t.name === settings.accessTable);
  const odbcColumns = odbcSelectedTable?.columns || [];

  return (
    <form onSubmit={save} className="space-y-5">

      {/* ── Microsoft Access Source ──────────────────────────────────────── */}
      <section className="rounded border border-line bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Microsoft Access Source</h2>

        {/* Mode toggle */}
        <div className="mt-3 flex overflow-hidden rounded border border-line w-fit text-sm font-medium">
          <ModeBtn active={accessMode === "upload"} onClick={() => setAccessMode("upload")}>
            Upload MDB <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700 font-semibold">Any PC</span>
          </ModeBtn>
          <ModeBtn active={accessMode === "csv"} onClick={() => setAccessMode("csv")}>
            Import CSV <span className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 font-semibold">Smallest file</span>
          </ModeBtn>
          <ModeBtn active={accessMode === "odbc"} onClick={() => setAccessMode("odbc")}>
            Server ODBC <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 font-semibold">Driver required</span>
          </ModeBtn>
        </div>

        {/* ── Upload mode ── */}
        {accessMode === "upload" && (
          <div className="mt-5 space-y-5">
            <p className="text-xs text-slate-500">
              Browse the <strong>.mdb / .accdb</strong> file from <em>any PC on the network</em> — no ODBC driver needed.
              The file is sent to the server and read directly.
            </p>

            {/* Step 1 */}
            <Step n={1} label="Pick the Access database file">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  accept=".mdb,.accdb"
                  className="block rounded border border-line p-2 text-sm"
                  onChange={(e) => {
                    setUploadFile(e.target.files?.[0] || null);
                    setUploadSchema([]); setUploadTable(""); setUploadMapping({});
                    setUploadPreview(null); setUploadResult(null);
                  }}
                />
                <button
                  type="button"
                  onClick={handleUploadDiscover}
                  disabled={!uploadFile || busy === "udiscover"}
                  className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy === "udiscover" ? "Reading…" : uploadSchema.length ? "Re-read" : "Read Tables"}
                </button>
              </div>
            </Step>

            {/* Step 2 */}
            <div className={uploadSchema.length === 0 ? "opacity-30 pointer-events-none" : ""}>
              <Step n={2} label={`Select table & verify column mapping ${uploadSchema.length ? `(${uploadSchema.length} tables found)` : ""}`}>
                <Field label="Table">
                  <select className="input" value={uploadTable} onChange={(e) => handleUploadTableChange(e.target.value)}>
                    <option value="">Select table…</option>
                    {uploadSchema.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </select>
                </Field>

                {uploadTable && (
                  <div className="mt-3">
                    <p className="mb-2 text-xs text-slate-500">Columns auto-matched — adjust any that are wrong.</p>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {MAPPING_KEYS.map(([field, , label]) => (
                        <Field key={field} label={FIELD_LABELS[`access${field.charAt(0).toUpperCase() + field.slice(1)}Column`] || field}>
                          {uploadColumns.length ? (
                            <select
                              className="input"
                              value={uploadMapping[field] || ""}
                              onChange={(e) => setUploadMapping((m) => ({ ...m, [field]: e.target.value }))}
                            >
                              <option value="">Not mapped</option>
                              {uploadColumns.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          ) : (
                            <input
                              className="input"
                              value={uploadMapping[field] || ""}
                              onChange={(e) => setUploadMapping((m) => ({ ...m, [field]: e.target.value }))}
                            />
                          )}
                        </Field>
                      ))}
                    </div>
                  </div>
                )}
              </Step>
            </div>

            {/* Step 3 */}
            <div className={!uploadTable ? "opacity-30 pointer-events-none" : ""}>
              <Step n={3} label="Preview &amp; import">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={handleUploadPreview} disabled={!uploadTable || busy === "upreview" || busy === "uimport"} className="rounded border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50">
                    {busy === "upreview" ? "Loading…" : "Preview 10 Rows"}
                  </button>
                  <button type="button" onClick={handleSaveUploadMapping} disabled={!uploadTable || busy === "usave" || busy === "uimport"} className="rounded border border-brand px-4 py-2 text-sm font-semibold text-brand disabled:opacity-50">
                    {busy === "usave" ? "Saving…" : "Save Mapping"}
                  </button>
                  {busy === "uimport" ? (
                    <button type="button" onClick={cancelImport} className="rounded border border-red-300 bg-red-50 px-5 py-2 text-sm font-semibold text-bad">
                      Cancel
                    </button>
                  ) : (
                    <button type="button" onClick={handleUploadImport} disabled={!uploadTable} className="rounded bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                      Import Now
                    </button>
                  )}
                </div>

                {/* Live progress */}
                {importProgress && !uploadResult && (
                  <div className="mt-4 space-y-2">
                    {importProgress.phase === "upload" ? (
                      <ProgressBar
                        label={`Uploading file… ${importProgress.uploadPct ?? 0}%`}
                        value={importProgress.uploadPct ?? 0}
                        color="bg-blue-500"
                      />
                    ) : (
                      <ProgressBar
                        label={`Processing ${(importProgress.done ?? 0).toLocaleString()} / ${(importProgress.total ?? 0).toLocaleString()} rows — ${importProgress.upserted ?? 0} synced`}
                        value={importProgress.total ? Math.round(((importProgress.done ?? 0) / importProgress.total) * 100) : 0}
                        color="bg-brand"
                      />
                    )}
                  </div>
                )}

                {uploadResult && (
                  <div className="mt-3 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                    <strong>Import complete</strong> — {(uploadResult.upserted ?? 0).toLocaleString()} records synced from {(uploadResult.total ?? 0).toLocaleString()} rows
                    {uploadResult.skipped > 0 && `, ${uploadResult.skipped} skipped (no Employee ID)`}.
                  </div>
                )}

                {uploadPreview && <PreviewTable data={uploadPreview} />}
              </Step>
            </div>
          </div>
        )}

        {/* ── CSV mode ── */}
        {accessMode === "csv" && (
          <div className="mt-5 space-y-5">
            <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              Export a table or query from MS Access as <strong>.csv</strong> (File → Export → Text File).
              CSV files are tiny compared to .mdb files and work on any server including Vercel.
            </div>

            {/* Step 1 */}
            <Step n={1} label="Pick the CSV file">
              <div className="flex flex-wrap items-center gap-2">
                <input type="file" accept=".csv" className="block rounded border border-line p-2 text-sm"
                  onChange={(e) => {
                    setCsvFile(e.target.files?.[0] || null);
                    setCsvSchema(null); setCsvMapping({}); setCsvResult(null);
                  }} />
                <button type="button" onClick={handleCsvDiscover} disabled={!csvFile || busy === "cdiscover"}
                  className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {busy === "cdiscover" ? "Reading…" : csvSchema ? "Re-read" : "Read Columns"}
                </button>
              </div>
            </Step>

            {/* Step 2 */}
            <div className={!csvSchema ? "opacity-30 pointer-events-none" : ""}>
              <Step n={2} label={`Map columns${csvSchema ? ` (${csvSchema.totalRows.toLocaleString()} rows)` : ""}`}>

                {/* ZKTeco punch format toggle */}
                <label className="mb-3 flex items-center gap-2 text-sm cursor-pointer w-fit">
                  <input type="checkbox" checked={csvGroupByDay} onChange={(e) => setCsvGroupByDay(e.target.checked)} className="h-4 w-4" />
                  <span className="font-semibold">ZKTeco punch format</span>
                  <span className="text-xs text-slate-500">— one row per swipe; groups by employee + date (min=In, max=Out)</span>
                </label>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {MAPPING_KEYS.map(([field, , ]) => {
                    const label = FIELD_LABELS[`access${field.charAt(0).toUpperCase() + field.slice(1)}Column`] || field;
                    const hint = csvGroupByDay && field === "checkIn" ? "CHECKTIME column" : label;
                    return (
                      <Field key={field} label={hint}>
                        <select className="input" value={csvMapping[field] || ""}
                          onChange={(e) => setCsvMapping((m) => ({ ...m, [field]: e.target.value }))}>
                          <option value="">Not mapped</option>
                          {(csvSchema?.columns || []).map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </Field>
                    );
                  })}
                </div>

                {csvSchema?.preview && <PreviewTable data={csvSchema.preview} />}
              </Step>
            </div>

            {/* Step 3 */}
            <div className={!csvSchema ? "opacity-30 pointer-events-none" : ""}>
              <Step n={3} label="Import">
                <div className="flex flex-wrap gap-2">
                  {busy === "cimport" ? (
                    <button type="button" onClick={cancelCsvImport} className="rounded border border-red-300 bg-red-50 px-5 py-2 text-sm font-semibold text-bad">Cancel</button>
                  ) : (
                    <button type="button" onClick={handleCsvImport} disabled={!csvSchema}
                      className="rounded bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                      Import Now
                    </button>
                  )}
                </div>

                {csvProgress && !csvResult && (
                  <div className="mt-4 space-y-2">
                    {csvProgress.phase === "upload" ? (
                      <ProgressBar label={`Uploading… ${csvProgress.uploadPct ?? 0}%`} value={csvProgress.uploadPct ?? 0} color="bg-blue-500" />
                    ) : (
                      <ProgressBar
                        label={`Processing ${(csvProgress.done ?? 0).toLocaleString()} / ${(csvProgress.total ?? 0).toLocaleString()} rows — ${csvProgress.upserted ?? 0} synced`}
                        value={csvProgress.total ? Math.round(((csvProgress.done ?? 0) / csvProgress.total) * 100) : 0}
                        color="bg-brand" />
                    )}
                  </div>
                )}
                {csvResult && (
                  <div className="mt-3 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                    <strong>Import complete</strong> — {(csvResult.upserted ?? 0).toLocaleString()} records synced
                    from {(csvResult.total ?? 0).toLocaleString()} rows
                    {csvResult.skipped > 0 && `, ${csvResult.skipped} skipped`}.
                  </div>
                )}
              </Step>
            </div>
          </div>
        )}

        {/* ── ODBC mode ── */}
        {accessMode === "odbc" && (
          <div className="mt-5 space-y-5">
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Requires the <strong>Microsoft Access ODBC driver</strong> installed on the machine running this server.
              If you're getting "ODBC unavailable", switch to <strong>Upload File</strong> mode instead.
            </div>
            {errorCode === "ODBC_UNAVAILABLE" && (
              <div className="rounded border border-red-200 bg-red-50 p-3 text-sm">
                <p className="font-semibold text-bad mb-1">ODBC not available on this server</p>
                <p className="text-slate-700 text-xs mb-2">
                  The server is running on Linux or does not have the Microsoft Access ODBC driver installed.
                  Server ODBC mode only works on a <strong>local Windows machine</strong> with the Access driver.
                </p>
                <button type="button" onClick={() => { setAccessMode("upload"); setError(""); setErrorCode(""); }}
                  className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white">
                  Switch to Upload File mode
                </button>
              </div>
            )}

            {/* Step 1 */}
            <Step n={1} label="Database connection">

              {/* Detect button */}
              <div className="mb-4">
                <button type="button" onClick={handleDetectSources} disabled={busy === "odetect"} className="rounded border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:border-brand hover:text-brand transition-colors">
                  {busy === "odetect" ? "Detecting…" : "Detect Available ODBC Connections"}
                </button>
              </div>

              {/* Detected sources panel */}
              {detectedSources && (
                <div className="mb-4 rounded border border-line bg-slate-50 p-3 space-y-2">
                  {detectedSources.drivers.length > 0 ? (
                    <p className="text-xs font-semibold text-green-700">✓ Access driver installed: {detectedSources.drivers[0]}</p>
                  ) : (
                    <p className="text-xs text-amber-700 font-semibold">⚠ No Access ODBC driver found in registry</p>
                  )}
                  {detectedSources.dsns.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold text-slate-600 mb-1.5">Pre-configured DSNs — click to select:</p>
                      <div className="flex flex-wrap gap-2">
                        {detectedSources.dsns.map((dsn) => (
                          <button key={dsn.name} type="button" onClick={() => applyDsn(dsn)}
                            className={`rounded border px-3 py-1.5 text-xs font-semibold transition-colors ${settings.accessDsn === dsn.name ? "border-brand bg-brand text-white" : "border-line bg-white hover:border-brand hover:text-brand"}`}>
                            {dsn.name}
                            {dsn.description && <span className="ml-1.5 font-normal opacity-70">{dsn.description}</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">No pre-configured Access DSNs found — enter the database path below.</p>
                  )}
                </div>
              )}

              {/* DSN indicator OR path/driver fields */}
              {settings.accessDsn ? (
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <span className="rounded border border-brand bg-brand/5 px-3 py-1.5 text-sm font-semibold text-brand">DSN: {settings.accessDsn}</span>
                  <button type="button" onClick={clearDsn} className="text-xs text-slate-500 underline hover:text-bad">Clear — use path instead</button>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 mb-3">
                  <Field label="Database path (.accdb / .mdb)">
                    <input className="input" value={settings.accessDbPath || ""} onChange={(e) => { update("accessDbPath", e.target.value); setOdbcSchema([]); setOdbcPreview(null); }} placeholder="\\192.168.1.10\Share\att2000.mdb" />
                  </Field>
                  <Field label="ODBC driver">
                    <input className="input" value={settings.accessDriver || ""} onChange={(e) => update("accessDriver", e.target.value)} />
                  </Field>
                </div>
              )}

              {/* Auth (shown in both modes) */}
              <div className="grid gap-3 md:grid-cols-2 mb-3">
                <Field label="Database user (optional)">
                  <input className="input" value={settings.accessUid || ""} onChange={(e) => update("accessUid", e.target.value)} />
                </Field>
                <Field label="File password (optional)">
                  <input className="input" type="password" value={settings.accessDbPassword || ""} onChange={(e) => update("accessDbPassword", e.target.value)} placeholder={settings.hasAccessPassword ? "Saved" : ""} />
                </Field>
              </div>

              <button type="button" onClick={handleOdbcConnect} disabled={(!settings.accessDbPath && !settings.accessDsn) || busy === "oconnect"} className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {busy === "oconnect" ? "Connecting…" : odbcSchema.length ? "Re-connect" : "Connect & Discover Tables"}
              </button>
            </Step>

            {/* Step 2 */}
            <div className={odbcSchema.length === 0 ? "opacity-30 pointer-events-none" : ""}>
              <Step n={2} label={`Table & column mapping ${odbcSchema.length ? `(${odbcSchema.length} tables)` : ""}`}>

                {settings.accessZktecoMode === "true" ? (
                  /* ── ZKTeco auto-mode ── */
                  <div className="rounded border border-green-200 bg-green-50 p-4 space-y-3">
                    <p className="text-sm font-semibold text-green-800">ZKTeco att2000.mdb detected — mapping applied automatically</p>
                    <div className="grid gap-2 text-xs text-green-900 md:grid-cols-2">
                      {[
                        ["Employee ID",   "USERINFO.Badgenumber"],
                        ["Employee Name", "USERINFO.Name"],
                        ["Department",    "DEPARTMENTS.DEPTNAME"],
                        ["Check In",      "Min(CHECKINOUT.CHECKTIME) per day"],
                        ["Check Out",     "Max(CHECKINOUT.CHECKTIME) per day"],
                        ["Join key",      "CHECKINOUT.USERID = USERINFO.Badgenumber"],
                      ].map(([label, val]) => (
                        <div key={label} className="flex gap-2">
                          <span className="w-28 shrink-0 font-semibold">{label}</span>
                          <span className="font-mono">{val}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-green-700">
                      Each employee's punches are grouped by day — first swipe = Check In, last swipe = Check Out.
                      Single-swipe days record Check In only.
                    </p>
                    <button type="button" onClick={() => { update("accessZktecoMode", ""); update("accessTable", ""); }}
                      className="text-xs text-slate-500 underline hover:text-bad">
                      Switch to manual column mapping instead
                    </button>
                  </div>
                ) : (
                  /* ── Manual mapping ── */
                  <>
                    <Field label="Table">
                      <select className="input" value={settings.accessTable || ""} onChange={(e) => { const t = odbcSchema.find((x) => x.name === e.target.value); if (t) applyOdbcTable(t); else update("accessTable", e.target.value); }}>
                        <option value="">Select table…</option>
                        {odbcSchema.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                        {!odbcSchema.length && settings.accessTable && <option value={settings.accessTable}>{settings.accessTable}</option>}
                      </select>
                    </Field>
                    {settings.accessTable && (
                      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {MAPPING_KEYS.map(([, settingKey]) => (
                          <Field key={settingKey} label={FIELD_LABELS[settingKey]}>
                            {odbcColumns.length ? (
                              <select className="input" value={settings[settingKey] || ""} onChange={(e) => update(settingKey, e.target.value)}>
                                <option value="">Not mapped</option>
                                {odbcColumns.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            ) : (
                              <input className="input" value={settings[settingKey] || ""} onChange={(e) => update(settingKey, e.target.value)} />
                            )}
                          </Field>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </Step>
            </div>

            {/* Step 3 */}
            <div className={!settings.accessTable && settings.accessZktecoMode !== "true" ? "opacity-30 pointer-events-none" : ""}>
              <Step n={3} label="Date range &amp; pull">

                {/* Preset buttons */}
                <div className="mb-3">
                  <p className="mb-1.5 text-xs font-semibold text-slate-600">Date range to pull</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PULL_PRESETS.map((p) => (
                      <button key={p.key} type="button" onClick={() => applyPullPreset(p.key)}
                        className={`rounded border px-3 py-1 text-xs font-semibold transition-colors ${pullPreset === p.key ? "border-brand bg-brand text-white" : "border-line bg-white hover:border-brand hover:text-brand"}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date inputs — always visible so user can fine-tune even on presets */}
                <div className="mb-4 flex flex-wrap items-end gap-3">
                  <Field label="From">
                    <input type="date" className="input" value={pullFrom} onChange={(e) => { setPullFrom(e.target.value); setPullPreset("custom"); }} />
                  </Field>
                  <Field label="To">
                    <input type="date" className="input" value={pullTo} onChange={(e) => { setPullTo(e.target.value); setPullPreset("custom"); }} />
                  </Field>
                  <p className="pb-1 text-xs text-slate-500 self-end">
                    Records where Check-In ≥ <strong>{pullFrom}</strong> and &lt; <strong>{pullTo ? new Date(new Date(pullTo).setDate(new Date(pullTo).getDate() + 1)).toISOString().slice(0, 10) : "—"}</strong>
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={handleOdbcPreview} disabled={!settings.accessTable || busy === "opreview"} className="rounded border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50">
                    {busy === "opreview" ? "Loading…" : "Preview 10 Rows"}
                  </button>
                  <button type="button" onClick={handleSaveOdbcSettings} disabled={!settings.accessTable || busy === "osave" || busy === "opull"} className="rounded border border-brand px-4 py-2 text-sm font-semibold text-brand disabled:opacity-50">
                    {busy === "osave" ? "Saving…" : "Save Settings"}
                  </button>
                  <button type="button" onClick={handleOdbcPull} disabled={(!settings.accessTable && settings.accessZktecoMode !== "true") || !pullFrom || busy === "opull" || busy === "osave"} className="rounded bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {busy === "opull" ? "Pulling…" : "Pull Now"}
                  </button>
                </div>
                {odbcPreview && <PreviewTable data={odbcPreview} />}
              </Step>
            </div>
          </div>
        )}
      </section>

      {/* ── Remote sync schedule ─────────────────────────────────────────── */}
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

      {/* ── ZKTeco ──────────────────────────────────────────────────────────── */}
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

      {/* ── Mobile punch geofence ─────────────────────────────────────────── */}
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

// ── Small shared components ───────────────────────────────────────────────────

function ModeBtn({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm transition-colors ${active ? "bg-brand text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
    >
      {children}
    </button>
  );
}

function Step({ n, label, children }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{n}</span>
        <span className="text-sm font-semibold" dangerouslySetInnerHTML={{ __html: label }} />
      </div>
      <div className="pl-8">{children}</div>
    </div>
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

function ProgressBar({ label, value, color = "bg-brand" }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span className="font-semibold">{value}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

function PreviewTable({ data }) {
  if (!data) return null;
  return (
    <div className="mt-4 overflow-x-auto rounded border border-line">
      <table className="w-full text-xs">
        <thead className="bg-slate-50">
          <tr>
            {data.columns.map((c) => <th key={c} className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-1.5 text-slate-700 whitespace-nowrap">
                  {cell == null ? <span className="text-slate-300">—</span> : cell}
                </td>
              ))}
            </tr>
          ))}
          {data.rows.length === 0 && (
            <tr><td colSpan={data.columns.length} className="px-3 py-3 text-center text-slate-400">No rows</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
