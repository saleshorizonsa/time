import { useEffect, useState } from "react";

const emptyFilters = {
  startDate: "",
  endDate: "",
  employee: "",
  department: "",
  shift: "",
  status: ""
};

export default function Reports({ helpers }) {
  const { api, buildQuery } = helpers;
  const [filters, setFilters] = useState(emptyFilters);
  const [filterOptions, setFilterOptions] = useState({ employees: [], departments: [], shifts: [], statuses: [] });
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  async function loadRecords(nextFilters = filters) {
    setError("");
    try {
      const query = buildQuery({ ...nextFilters, limit: 500 });
      const payload = await api(`/api/attendance?${query}`);
      setRecords(payload.records);
      setTotal(payload.total);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    api("/api/attendance/filters").then(setFilterOptions).catch(() => {});
    loadRecords();
  }, []);

  function update(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function exportFile(format) {
    const query = buildQuery({ ...filters, format });
    const blob = await api(`/api/reports/export?${query}`);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = format === "pdf" ? "attendance-report.pdf" : "attendance-report.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <section className="rounded border border-line bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Field label="Start Date">
            <input type="date" value={filters.startDate} onChange={(e) => update("startDate", e.target.value)} className="input" />
          </Field>
          <Field label="End Date">
            <input type="date" value={filters.endDate} onChange={(e) => update("endDate", e.target.value)} className="input" />
          </Field>
          <Field label="Employee">
            <input value={filters.employee} onChange={(e) => update("employee", e.target.value)} className="input" placeholder="ID or name" />
          </Field>
          <Field label="Department">
            <select value={filters.department} onChange={(e) => update("department", e.target.value)} className="input">
              <option value="">All</option>
              {filterOptions.departments.map((row) => <option key={row.department}>{row.department}</option>)}
            </select>
          </Field>
          <Field label="Shift">
            <select value={filters.shift} onChange={(e) => update("shift", e.target.value)} className="input">
              <option value="">All</option>
              {filterOptions.shifts.map((row) => <option key={row.shift}>{row.shift}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={filters.status} onChange={(e) => update("status", e.target.value)} className="input">
              <option value="">All</option>
              {filterOptions.statuses.map((status) => <option key={status}>{status}</option>)}
            </select>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => loadRecords()} className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white">Apply Filters</button>
          <button onClick={() => { setFilters(emptyFilters); loadRecords(emptyFilters); }} className="rounded border border-line px-4 py-2 text-sm font-semibold">Reset</button>
          <button onClick={() => exportFile("excel")} className="rounded border border-line px-4 py-2 text-sm font-semibold">Excel</button>
          <button onClick={() => exportFile("pdf")} className="rounded border border-line px-4 py-2 text-sm font-semibold">PDF</button>
        </div>
      </section>

      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-bad">{error}</div> : null}

      <section className="rounded border border-line bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="font-semibold">Employee Attendance Report</h2>
          <p className="text-sm text-slate-500">{total} records</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="border-b border-line bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Shift</th>
                <th className="px-4 py-3">Check In</th>
                <th className="px-4 py-3">Check Out</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">OT Min</th>
              </tr>
            </thead>
            <tbody>
              {records.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">{row.attendance_date}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{row.employee_name || row.employee_id}</p>
                    <p className="text-xs text-slate-500">{row.employee_id}</p>
                  </td>
                  <td className="px-4 py-3">{row.department}</td>
                  <td className="px-4 py-3">{row.shift}</td>
                  <td className="px-4 py-3">{row.check_in}</td>
                  <td className="px-4 py-3">{row.check_out}</td>
                  <td className="px-4 py-3"><Status value={row.status} /></td>
                  <td className="px-4 py-3">{row.overtime_minutes}</td>
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

function Status({ value }) {
  const tone = value === "Absent" ? "bg-red-50 text-bad" : value === "Late" ? "bg-amber-50 text-warn" : "bg-green-50 text-good";
  return <span className={`rounded px-2 py-1 text-xs font-semibold ${tone}`}>{value}</span>;
}
