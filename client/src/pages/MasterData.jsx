import { useEffect, useState } from "react";
import { Upload, Save, Search } from "lucide-react";

const emptyEmployee = {
  companyId: "",
  employeeCode: "",
  fullName: "",
  department: "",
  shift: "",
  email: "",
  phone: "",
  status: "Active"
};

export default function MasterData({ helpers }) {
  const { api } = helpers;
  const [companies, setCompanies] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [search, setSearch] = useState("");
  const [employee, setEmployee] = useState(emptyEmployee);
  const [newCompany, setNewCompany] = useState({ code: "", name: "" });
  const [editingCompany, setEditingCompany] = useState(null);
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [accessResult, setAccessResult] = useState(null);

  async function loadCompanies() {
    const data = await api("/api/master-data/companies");
    setCompanies(data.companies || []);
    if (!companyId && data.companies?.[0]) {
      setCompanyId(String(data.companies[0].id));
      setEmployee((current) => ({ ...current, companyId: String(data.companies[0].id) }));
    }
  }

  async function loadEmployees(nextCompanyId = companyId, nextSearch = search) {
    const params = new URLSearchParams();
    if (nextCompanyId) params.set("companyId", nextCompanyId);
    if (nextSearch) params.set("search", nextSearch);
    const data = await api(`/api/master-data/employees?${params.toString()}`);
    setEmployees(data.employees || []);
  }

  useEffect(() => {
    loadCompanies().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    loadEmployees().catch(() => {});
  }, [companyId]);

  function updateEmployee(key, value) {
    setEmployee((current) => ({ ...current, [key]: value }));
  }

  async function saveEmployee(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      await api(employee.id ? `/api/master-data/employees/${employee.id}` : "/api/master-data/employees", {
        method: employee.id ? "PUT" : "POST",
        body: employee
      });
      setEmployee({ ...emptyEmployee, companyId });
      setMessage("Employee saved.");
      await loadEmployees();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveCompany(company) {
    setMessage("");
    setError("");
    try {
      await api(`/api/master-data/companies/${company.id}`, {
        method: "PUT",
        body: { code: company.code, name: company.name, isActive: Boolean(company.is_active) }
      });
      setEditingCompany(null);
      setMessage("Company saved.");
      await loadCompanies();
    } catch (err) {
      setError(err.message);
    }
  }

  async function createCompany(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      await api("/api/master-data/companies", { method: "POST", body: newCompany });
      setNewCompany({ code: "", name: "" });
      setMessage("Company created.");
      await loadCompanies();
    } catch (err) {
      setError(err.message);
    }
  }

  async function uploadEmployees(event) {
    event.preventDefault();
    if (!file) return;
    setMessage("");
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api("/api/master-data/employees/upload", { method: "POST", body: form });
      setMessage(`Imported ${result.imported}; skipped ${result.skipped}. ${result.errors?.[0] || ""}`);
      await loadEmployees();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleMobileAccess(row, enabled) {
    setMessage("");
    setError("");
    setAccessResult(null);
    try {
      const result = await api(`/api/master-data/employees/${row.id}/mobile-access`, {
        method: "PATCH",
        body: { enabled }
      });
      if (result.enabled) {
        setAccessResult(result);
        setMessage(`Mobile access enabled for ${row.full_name}. Login with Employee ID ${result.loginId}${result.temporaryPassword ? " and the temporary password shown below." : "."}`);
      } else {
        setMessage(`Mobile access disabled for ${row.full_name}.`);
      }
      await loadEmployees();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded border border-line bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Companies</h2>
            <p className="text-sm text-slate-500">Create up to four real company profiles.</p>
          </div>
        </div>
        {companies.length < 4 ? (
          <form onSubmit={createCompany} className="mt-4 grid gap-3 md:grid-cols-[160px_1fr_auto]">
            <input className="input" value={newCompany.code} onChange={(e) => setNewCompany({ ...newCompany, code: e.target.value })} placeholder="Code" />
            <input className="input" value={newCompany.name} onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })} placeholder="Company name" />
            <button className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white">Add Company</button>
          </form>
        ) : null}
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {companies.map((company) => {
            const editing = editingCompany?.id === company.id;
            const draft = editing ? editingCompany : company;
            return (
              <div key={company.id} className="rounded border border-line p-3">
                <input
                  className="input"
                  value={draft.code}
                  disabled={!editing}
                  onChange={(e) => setEditingCompany({ ...draft, code: e.target.value })}
                />
                <input
                  className="input mt-2"
                  value={draft.name}
                  disabled={!editing}
                  onChange={(e) => setEditingCompany({ ...draft, name: e.target.value })}
                />
                <div className="mt-3 flex gap-2">
                  {editing ? (
                    <button type="button" onClick={() => saveCompany(draft)} className="rounded bg-brand px-3 py-2 text-sm font-semibold text-white">Save</button>
                  ) : (
                    <button type="button" onClick={() => setEditingCompany(company)} className="rounded border border-line px-3 py-2 text-sm font-semibold">Edit</button>
                  )}
                  <button type="button" onClick={() => { setCompanyId(String(company.id)); updateEmployee("companyId", String(company.id)); }} className="rounded border border-line px-3 py-2 text-sm font-semibold">View</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={saveEmployee} className="rounded border border-line bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Employee Master</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Company">
              <select className="input" value={employee.companyId || companyId} onChange={(e) => updateEmployee("companyId", e.target.value)}>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.code} - {company.name}</option>)}
              </select>
            </Field>
            <Field label="Employee Code">
              <input className="input" value={employee.employeeCode} onChange={(e) => updateEmployee("employeeCode", e.target.value)} />
            </Field>
            <Field label="Full Name">
              <input className="input" value={employee.fullName} onChange={(e) => updateEmployee("fullName", e.target.value)} />
            </Field>
            <Field label="Department">
              <input className="input" value={employee.department} onChange={(e) => updateEmployee("department", e.target.value)} />
            </Field>
            <Field label="Shift">
              <input className="input" value={employee.shift} onChange={(e) => updateEmployee("shift", e.target.value)} />
            </Field>
            <Field label="Email">
              <input className="input" value={employee.email} onChange={(e) => updateEmployee("email", e.target.value)} placeholder="Personal email" />
            </Field>
            <Field label="Phone">
              <input className="input" value={employee.phone} onChange={(e) => updateEmployee("phone", e.target.value)} />
            </Field>
            <Field label="Status">
              <select className="input" value={employee.status} onChange={(e) => updateEmployee("status", e.target.value)}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </Field>
          </div>
          <button className="mt-4 rounded bg-brand px-4 py-2 text-sm font-semibold text-white">
            <span className="inline-flex items-center gap-2"><Save size={16} /> Save Employee</span>
          </button>
        </form>

        <form onSubmit={uploadEmployees} className="rounded border border-line bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Data Upload</h2>
          <p className="mt-1 text-sm text-slate-500">Upload CSV with companyCode, employeeCode, fullName, department, shift, email, phone, status.</p>
          <input className="mt-4 block w-full rounded border border-line p-2 text-sm" type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button className="mt-4 rounded border border-line px-4 py-2 text-sm font-semibold">
            <span className="inline-flex items-center gap-2"><Upload size={16} /> Upload Employees</span>
          </button>
        </form>
      </section>

      {message ? <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-good">{message}</p> : null}
      {accessResult?.temporaryPassword ? (
        <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-brand">
          <p className="font-semibold">One-time login details</p>
          <p>Employee ID: {accessResult.loginId}</p>
          <p>Email: {accessResult.email}</p>
          <p>Temporary Password: {accessResult.temporaryPassword}</p>
        </div>
      ) : null}
      {error ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-bad">{error}</p> : null}

      <section className="rounded border border-line bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="font-semibold">Employees</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select className="input sm:w-56" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">All companies</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.code} - {company.name}</option>)}
            </select>
            <div className="flex gap-2">
              <input className="input sm:w-64" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee" />
              <button type="button" onClick={() => loadEmployees(companyId, search)} className="rounded border border-line px-3 py-2">
                <Search size={18} />
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1080px] w-full text-left text-sm">
            <thead className="border-b border-line bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Shift</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Mobile Punch</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">{row.company_code}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{row.full_name}</p>
                    <p className="text-xs text-slate-500">{row.employee_code}</p>
                  </td>
                  <td className="px-4 py-3">{row.department}</td>
                  <td className="px-4 py-3">{row.shift}</td>
                  <td className="px-4 py-3">{row.email}</td>
                  <td className="px-4 py-3">{row.status}</td>
                  <td className="px-4 py-3">
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={Boolean(row.mobile_access_enabled)}
                        onChange={(e) => toggleMobileAccess(row, e.target.checked)}
                      />
                      <span className="text-sm">{row.mobile_access_enabled ? "Enabled" : "Disabled"}</span>
                    </label>
                    {row.mobile_login_id ? <p className="mt-1 text-xs text-slate-500">ID: {row.mobile_login_id}</p> : null}
                  </td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => setEmployee({
                      id: row.id,
                      companyId: String(row.company_id),
                      employeeCode: row.employee_code,
                      fullName: row.full_name,
                      department: row.department || "",
                      shift: row.shift || "",
                      email: row.email || "",
                      phone: row.phone || "",
                      status: row.status || "Active"
                    })} className="rounded border border-line px-3 py-1.5 text-sm font-semibold">Edit</button>
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
