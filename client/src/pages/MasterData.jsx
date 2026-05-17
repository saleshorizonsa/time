import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Layers, MapPin, Plus, Save, Search, Upload } from "lucide-react";

const emptyEmployee = {
  companyId: "", locationId: "", employeeCode: "", fullName: "",
  department: "", shift: "", email: "", phone: "", status: "Active"
};

export default function MasterData({ helpers }) {
  const { api } = helpers;

  // Core lists
  const [companies, setCompanies]   = useState([]);
  const [employees, setEmployees]   = useState([]);

  // Company create/edit
  const [newCompany, setNewCompany]       = useState({ code: "", name: "" });
  const [editingCompany, setEditingCompany] = useState(null);

  // Selected company for location/dept management
  const [managedId, setManagedId] = useState(null);
  const [locations, setLocations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [newLocation, setNewLocation] = useState({ code: "", name: "", address: "" });
  const [newDept, setNewDept]         = useState({ name: "", locationId: "" });
  const [editingLoc, setEditingLoc]   = useState(null);
  const [editingDept, setEditingDept] = useState(null);

  // Employee form
  const [employee, setEmployee]     = useState(emptyEmployee);
  const [empLocations, setEmpLocations] = useState([]);
  const [empDepts, setEmpDepts]         = useState([]);

  // Employees list filters
  const [filterCompanyId, setFilterCompanyId] = useState("");
  const [search, setSearch]                   = useState("");

  // Misc
  const [file, setFile]               = useState(null);
  const [message, setMessage]         = useState("");
  const [error, setError]             = useState("");
  const [accessResult, setAccessResult] = useState(null);

  function notify(msg, isError = false) {
    setMessage(isError ? "" : msg);
    setError(isError ? msg : "");
  }

  // ── loaders ──────────────────────────────────────────────────────────────

  async function loadCompanies() {
    const data = await api("/api/master-data/companies");
    setCompanies(data.companies || []);
  }

  async function loadEmployees(cId = filterCompanyId, s = search) {
    const p = new URLSearchParams();
    if (cId) p.set("companyId", cId);
    if (s)   p.set("search", s);
    const data = await api(`/api/master-data/employees?${p.toString()}`);
    setEmployees(data.employees || []);
  }

  async function loadLocations(companyId) {
    const data = await api(`/api/master-data/companies/${companyId}/locations`);
    setLocations(data.locations || []);
    return data.locations || [];
  }

  async function loadDepts(companyId) {
    const data = await api(`/api/master-data/companies/${companyId}/departments`);
    setDepartments(data.departments || []);
    return data.departments || [];
  }

  async function loadEmpCompanyData(companyId) {
    if (!companyId) { setEmpLocations([]); setEmpDepts([]); return; }
    const [ld, dd] = await Promise.all([
      api(`/api/master-data/companies/${companyId}/locations`),
      api(`/api/master-data/companies/${companyId}/departments`)
    ]);
    setEmpLocations(ld.locations || []);
    setEmpDepts(dd.departments || []);
  }

  useEffect(() => {
    loadCompanies().catch(err => setError(err.message));
    loadEmployees().catch(() => {});
  }, []);

  useEffect(() => {
    if (managedId) {
      loadLocations(managedId).catch(() => {});
      loadDepts(managedId).catch(() => {});
    } else {
      setLocations([]);
      setDepartments([]);
    }
  }, [managedId]);

  useEffect(() => {
    loadEmpCompanyData(employee.companyId).catch(() => {});
  }, [employee.companyId]);

  // ── company handlers ──────────────────────────────────────────────────────

  async function createCompany(e) {
    e.preventDefault();
    notify("");
    try {
      await api("/api/master-data/companies", { method: "POST", body: newCompany });
      setNewCompany({ code: "", name: "" });
      notify("Company created.");
      await loadCompanies();
    } catch (err) { notify(err.message, true); }
  }

  async function saveCompany(c) {
    notify("");
    try {
      await api(`/api/master-data/companies/${c.id}`, {
        method: "PUT",
        body: { code: c.code, name: c.name, isActive: Boolean(c.is_active) }
      });
      setEditingCompany(null);
      notify("Company saved.");
      await loadCompanies();
    } catch (err) { notify(err.message, true); }
  }

  function toggleManage(id) {
    setManagedId(prev => (prev === id ? null : id));
    setNewLocation({ code: "", name: "", address: "" });
    setNewDept({ name: "", locationId: "" });
    setEditingLoc(null);
    setEditingDept(null);
  }

  // ── location handlers ─────────────────────────────────────────────────────

  async function createLocation(e) {
    e.preventDefault();
    notify("");
    try {
      await api(`/api/master-data/companies/${managedId}/locations`, { method: "POST", body: newLocation });
      setNewLocation({ code: "", name: "", address: "" });
      await Promise.all([loadLocations(managedId), loadCompanies()]);
    } catch (err) { notify(err.message, true); }
  }

  async function saveLocation(loc) {
    notify("");
    try {
      await api(`/api/master-data/locations/${loc.id}`, {
        method: "PUT",
        body: { code: loc.code, name: loc.name, address: loc.address, isActive: Boolean(loc.is_active) }
      });
      setEditingLoc(null);
      await Promise.all([loadLocations(managedId), loadCompanies()]);
    } catch (err) { notify(err.message, true); }
  }

  async function deleteLocation(id) {
    if (!window.confirm("Delete this location? Departments and employees linked to it will be unlinked.")) return;
    notify("");
    try {
      await api(`/api/master-data/locations/${id}`, { method: "DELETE" });
      await Promise.all([loadLocations(managedId), loadDepts(managedId), loadCompanies()]);
    } catch (err) { notify(err.message, true); }
  }

  // ── department handlers ───────────────────────────────────────────────────

  async function createDept(e) {
    e.preventDefault();
    notify("");
    try {
      await api(`/api/master-data/companies/${managedId}/departments`, { method: "POST", body: newDept });
      setNewDept({ name: "", locationId: "" });
      await Promise.all([loadDepts(managedId), loadCompanies()]);
    } catch (err) { notify(err.message, true); }
  }

  async function saveDept(dept) {
    notify("");
    try {
      await api(`/api/master-data/departments/${dept.id}`, {
        method: "PUT",
        body: { name: dept.name, locationId: dept.location_id, isActive: Boolean(dept.is_active) }
      });
      setEditingDept(null);
      await Promise.all([loadDepts(managedId), loadCompanies()]);
    } catch (err) { notify(err.message, true); }
  }

  async function deleteDept(id) {
    if (!window.confirm("Delete this department?")) return;
    notify("");
    try {
      await api(`/api/master-data/departments/${id}`, { method: "DELETE" });
      await Promise.all([loadDepts(managedId), loadCompanies()]);
    } catch (err) { notify(err.message, true); }
  }

  // ── employee handlers ─────────────────────────────────────────────────────

  function updateEmp(key, value) {
    setEmployee(prev => ({ ...prev, [key]: value }));
  }

  async function saveEmployee(e) {
    e.preventDefault();
    notify("");
    try {
      const url  = employee.id ? `/api/master-data/employees/${employee.id}` : "/api/master-data/employees";
      const method = employee.id ? "PUT" : "POST";
      await api(url, { method, body: employee });
      setEmployee({ ...emptyEmployee, companyId: employee.companyId });
      notify("Employee saved.");
      await loadEmployees();
    } catch (err) { notify(err.message, true); }
  }

  async function uploadEmployees(e) {
    e.preventDefault();
    if (!file) return;
    notify("");
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api("/api/master-data/employees/upload", { method: "POST", body: form });
      notify(`Imported ${result.imported}; skipped ${result.skipped}. ${result.errors?.[0] || ""}`);
      await loadEmployees();
    } catch (err) { notify(err.message, true); }
  }

  async function toggleMobileAccess(row, enabled) {
    notify("");
    setAccessResult(null);
    try {
      const result = await api(`/api/master-data/employees/${row.id}/mobile-access`, {
        method: "PATCH", body: { enabled }
      });
      if (result.enabled) {
        setAccessResult(result);
        notify(`Mobile access enabled for ${row.full_name}. Login ID: ${result.loginId}.`);
      } else {
        notify(`Mobile access disabled for ${row.full_name}.`);
      }
      await loadEmployees();
    } catch (err) { notify(err.message, true); }
  }

  const managedCompany = companies.find(c => c.id === managedId);

  return (
    <div className="space-y-5">

      {/* ── Companies ──────────────────────────────────────────────────────── */}
      <section className="rounded border border-line bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Companies</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {companies.length} compan{companies.length !== 1 ? "ies" : "y"} — click <strong>Manage</strong> to add locations &amp; departments
            </p>
          </div>
        </div>

        {/* Add-company form (always visible, unlimited) */}
        <form onSubmit={createCompany} className="flex flex-wrap gap-2">
          <input
            className="input w-28"
            value={newCompany.code}
            onChange={e => setNewCompany({ ...newCompany, code: e.target.value })}
            placeholder="Code"
            required
          />
          <input
            className="input flex-1 min-w-48"
            value={newCompany.name}
            onChange={e => setNewCompany({ ...newCompany, name: e.target.value })}
            placeholder="Company name"
            required
          />
          <button className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white inline-flex items-center gap-1.5">
            <Plus size={15} /> Add Company
          </button>
        </form>

        {/* Company grid */}
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {companies.map(company => {
            const editing   = editingCompany?.id === company.id;
            const draft     = editing ? editingCompany : company;
            const isManaged = managedId === company.id;
            return (
              <div
                key={company.id}
                className={`rounded border p-3 transition-colors ${isManaged ? "border-brand/50 bg-blue-50/60" : "border-line"}`}
              >
                <div className="flex gap-1.5">
                  <input
                    className="input w-24 text-sm"
                    value={draft.code}
                    disabled={!editing}
                    onChange={e => setEditingCompany({ ...draft, code: e.target.value })}
                  />
                  <input
                    className="input flex-1 text-sm"
                    value={draft.name}
                    disabled={!editing}
                    onChange={e => setEditingCompany({ ...draft, name: e.target.value })}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex gap-1.5">
                    <Chip><MapPin size={10} className="inline" /> {company.location_count ?? 0} loc</Chip>
                    <Chip><Layers size={10} className="inline" /> {company.department_count ?? 0} dept</Chip>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {editing ? (
                      <>
                        <Btn sm onClick={() => saveCompany(draft)} primary>Save</Btn>
                        <Btn sm onClick={() => setEditingCompany(null)}>Cancel</Btn>
                      </>
                    ) : (
                      <Btn sm onClick={() => setEditingCompany(company)}>Edit</Btn>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleManage(company.id)}
                      className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold ${
                        isManaged ? "bg-brand text-white" : "border border-line text-slate-700"
                      }`}
                    >
                      {isManaged ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      Manage
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Locations & Departments panel */}
        {managedId && managedCompany && (
          <div className="mt-4 rounded border border-brand/25 bg-slate-50 p-4">
            <h3 className="mb-4 text-sm font-semibold text-brand">
              {managedCompany.name} — Locations &amp; Departments
            </h3>
            <div className="grid gap-6 md:grid-cols-2">

              {/* ── Locations ── */}
              <div>
                <SectionLabel icon={<MapPin size={12} />}>Locations</SectionLabel>
                <form onSubmit={createLocation} className="mb-3 space-y-1.5">
                  <div className="grid grid-cols-[84px_1fr_36px] gap-1.5">
                    <input className="input text-sm" value={newLocation.code} onChange={e => setNewLocation({ ...newLocation, code: e.target.value })} placeholder="Code" required />
                    <input className="input text-sm" value={newLocation.name} onChange={e => setNewLocation({ ...newLocation, name: e.target.value })} placeholder="Location name" required />
                    <button className="rounded bg-brand text-white flex items-center justify-center"><Plus size={16} /></button>
                  </div>
                  <input className="input text-sm w-full" value={newLocation.address} onChange={e => setNewLocation({ ...newLocation, address: e.target.value })} placeholder="Address (optional)" />
                </form>

                <div className="space-y-1.5">
                  {locations.length === 0 && <p className="text-xs text-slate-400 italic">No locations yet</p>}
                  {locations.map(loc => {
                    const isEdit = editingLoc?.id === loc.id;
                    const draft  = isEdit ? editingLoc : loc;
                    return (
                      <div key={loc.id} className="rounded border border-line bg-white p-2.5">
                        {isEdit ? (
                          <div className="space-y-1.5">
                            <div className="flex gap-1.5">
                              <input className="input text-xs w-20" value={draft.code} onChange={e => setEditingLoc({ ...draft, code: e.target.value })} />
                              <input className="input text-xs flex-1" value={draft.name} onChange={e => setEditingLoc({ ...draft, name: e.target.value })} />
                            </div>
                            <input className="input text-xs w-full" value={draft.address || ""} onChange={e => setEditingLoc({ ...draft, address: e.target.value })} placeholder="Address" />
                            <div className="flex gap-1.5">
                              <Btn sm primary onClick={() => saveLocation(draft)}>Save</Btn>
                              <Btn sm onClick={() => setEditingLoc(null)}>Cancel</Btn>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate">{loc.code} — {loc.name}</p>
                              {loc.address && <p className="text-xs text-slate-500 truncate">{loc.address}</p>}
                            </div>
                            <div className="flex gap-2 shrink-0 text-xs">
                              <button type="button" onClick={() => setEditingLoc(loc)} className="text-brand hover:underline">Edit</button>
                              <button type="button" onClick={() => deleteLocation(loc.id)} className="text-bad hover:underline">Del</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Departments ── */}
              <div>
                <SectionLabel icon={<Layers size={12} />}>Departments</SectionLabel>
                <form onSubmit={createDept} className="mb-3 space-y-1.5">
                  <div className="flex gap-1.5">
                    <input className="input text-sm flex-1" value={newDept.name} onChange={e => setNewDept({ ...newDept, name: e.target.value })} placeholder="Department name" required />
                    <button className="rounded bg-brand px-2 text-white flex items-center"><Plus size={16} /></button>
                  </div>
                  <select className="input text-sm w-full" value={newDept.locationId} onChange={e => setNewDept({ ...newDept, locationId: e.target.value })}>
                    <option value="">No location link</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </form>

                <div className="space-y-1.5">
                  {departments.length === 0 && <p className="text-xs text-slate-400 italic">No departments yet</p>}
                  {departments.map(dept => {
                    const isEdit = editingDept?.id === dept.id;
                    const draft  = isEdit ? editingDept : dept;
                    return (
                      <div key={dept.id} className="rounded border border-line bg-white p-2.5">
                        {isEdit ? (
                          <div className="space-y-1.5">
                            <input className="input text-xs w-full" value={draft.name} onChange={e => setEditingDept({ ...draft, name: e.target.value })} />
                            <select className="input text-xs w-full" value={draft.location_id || ""} onChange={e => setEditingDept({ ...draft, location_id: e.target.value || null })}>
                              <option value="">No location link</option>
                              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                            <div className="flex gap-1.5">
                              <Btn sm primary onClick={() => saveDept(draft)}>Save</Btn>
                              <Btn sm onClick={() => setEditingDept(null)}>Cancel</Btn>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate">{dept.name}</p>
                              {dept.location_name && <p className="text-xs text-slate-500">{dept.location_name}</p>}
                            </div>
                            <div className="flex gap-2 shrink-0 text-xs">
                              <button type="button" onClick={() => setEditingDept(dept)} className="text-brand hover:underline">Edit</button>
                              <button type="button" onClick={() => deleteDept(dept.id)} className="text-bad hover:underline">Del</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        )}
      </section>

      {/* ── Employee Master ─────────────────────────────────────────────────── */}
      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={saveEmployee} className="rounded border border-line bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">
            {employee.id ? "Edit Employee" : "New Employee"}
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Company">
              <select className="input" value={employee.companyId} onChange={e => updateEmp("companyId", e.target.value)}>
                <option value="">Select company…</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
              </select>
            </Field>
            <Field label="Location">
              <select className="input" value={employee.locationId} onChange={e => updateEmp("locationId", e.target.value)}>
                <option value="">No location</option>
                {empLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            <Field label="Employee Code">
              <input className="input" value={employee.employeeCode} onChange={e => updateEmp("employeeCode", e.target.value)} required />
            </Field>
            <Field label="Full Name">
              <input className="input" value={employee.fullName} onChange={e => updateEmp("fullName", e.target.value)} required />
            </Field>
            <Field label="Department">
              <input className="input" list="dept-suggestions" value={employee.department} onChange={e => updateEmp("department", e.target.value)} placeholder="Type or select…" />
              <datalist id="dept-suggestions">
                {empDepts.map(d => <option key={d.id} value={d.name} />)}
              </datalist>
            </Field>
            <Field label="Shift">
              <input className="input" value={employee.shift} onChange={e => updateEmp("shift", e.target.value)} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={employee.email} onChange={e => updateEmp("email", e.target.value)} />
            </Field>
            <Field label="Phone">
              <input className="input" value={employee.phone} onChange={e => updateEmp("phone", e.target.value)} />
            </Field>
            <Field label="Status">
              <select className="input" value={employee.status} onChange={e => updateEmp("status", e.target.value)}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </Field>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white inline-flex items-center gap-2">
              <Save size={15} /> Save Employee
            </button>
            {employee.id && (
              <button type="button" onClick={() => setEmployee({ ...emptyEmployee, companyId: employee.companyId })} className="rounded border border-line px-4 py-2 text-sm font-semibold">
                Clear
              </button>
            )}
          </div>
        </form>

        <form onSubmit={uploadEmployees} className="rounded border border-line bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Bulk Upload</h2>
          <p className="mt-1 text-sm text-slate-500">
            CSV columns: companyCode, employeeCode, fullName, department, shift, email, phone, status
          </p>
          <input
            className="mt-4 block w-full rounded border border-line p-2 text-sm"
            type="file"
            accept=".csv,text/csv"
            onChange={e => setFile(e.target.files?.[0] || null)}
          />
          <button className="mt-4 rounded border border-line px-4 py-2 text-sm font-semibold inline-flex items-center gap-2">
            <Upload size={15} /> Upload Employees
          </button>
        </form>
      </section>

      {/* Feedback */}
      {message && <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-good">{message}</p>}
      {accessResult?.temporaryPassword && (
        <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-brand">
          <p className="font-semibold">One-time login details</p>
          <p>Employee ID: {accessResult.loginId}</p>
          <p>Email: {accessResult.email}</p>
          <p>Temporary Password: {accessResult.temporaryPassword}</p>
        </div>
      )}
      {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-bad">{error}</p>}

      {/* ── Employees Table ─────────────────────────────────────────────────── */}
      <section className="rounded border border-line bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="font-semibold">Employees ({employees.length})</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              className="input sm:w-56"
              value={filterCompanyId}
              onChange={e => { setFilterCompanyId(e.target.value); loadEmployees(e.target.value, search); }}
            >
              <option value="">All companies</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
            </select>
            <div className="flex gap-2">
              <input className="input sm:w-56" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee" onKeyDown={e => e.key === "Enter" && loadEmployees(filterCompanyId, search)} />
              <button type="button" onClick={() => loadEmployees(filterCompanyId, search)} className="rounded border border-line px-3 py-2">
                <Search size={17} />
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full text-left text-sm">
            <thead className="border-b border-line bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Shift</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Mobile Punch</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">No employees found</td></tr>
              )}
              {employees.map(row => (
                <tr key={row.id} className="border-b border-line last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-3">{row.company_code}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{row.full_name}</p>
                    <p className="text-xs text-slate-500">{row.employee_code}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.location_name || <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3 text-slate-600">{row.department || <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3 text-slate-600">{row.shift || <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${row.status === "Active" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={Boolean(row.mobile_access_enabled)}
                        onChange={e => toggleMobileAccess(row, e.target.checked)}
                      />
                      <span>{row.mobile_access_enabled ? "Enabled" : "Disabled"}</span>
                    </label>
                    {row.mobile_login_id && <p className="mt-0.5 text-xs text-slate-500">ID: {row.mobile_login_id}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setEmployee({
                        id: row.id,
                        companyId:    String(row.company_id),
                        locationId:   row.location_id ? String(row.location_id) : "",
                        employeeCode: row.employee_code,
                        fullName:     row.full_name,
                        department:   row.department || "",
                        shift:        row.shift || "",
                        email:        row.email || "",
                        phone:        row.phone || "",
                        status:       row.status || "Active"
                      })}
                      className="rounded border border-line px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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

function Chip({ children }) {
  return <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{children}</span>;
}

function SectionLabel({ icon, children }) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {icon} {children}
    </p>
  );
}

function Btn({ children, onClick, sm, primary }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded font-semibold ${sm ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-sm"} ${
        primary ? "bg-brand text-white" : "border border-line text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
