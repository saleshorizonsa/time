import { useEffect, useState } from "react";
import { Check, Clock3, Plus, X } from "lucide-react";
import StatCard from "../components/StatCard";
import { getUser } from "../lib/api";

const emptyShift = {
  code: "",
  name: "",
  startTime: "08:00",
  endTime: "17:00",
  graceMinutes: 10,
  earlyOutGraceMinutes: 10,
  overtimeAfterMinutes: 30,
  isActive: true
};

export default function AttendanceManagement({ helpers }) {
  const { api } = helpers;
  const user = getUser();
  const isAdmin = user?.role === "Admin";
  const [overview, setOverview] = useState({});
  const [companies, setCompanies] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [shift, setShift] = useState(emptyShift);
  const [holiday, setHoliday] = useState({ companyId: "", holidayDate: "", name: "", type: "Public" });
  const [leave, setLeave] = useState({ employeeId: "", leaveType: "Annual", startDate: "", endDate: "", reason: "" });
  const [correction, setCorrection] = useState({ employeeId: "", attendanceDate: "", checkIn: "", checkOut: "", reason: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadAll() {
    const [overviewData, companyData, employeeData, shiftData, holidayData, leaveData, correctionData] = await Promise.all([
      api("/api/management/overview"),
      api("/api/master-data/companies"),
      api("/api/master-data/employees"),
      api("/api/management/shifts"),
      api("/api/management/holidays"),
      api("/api/management/leave-requests"),
      api("/api/management/corrections")
    ]);
    setOverview(overviewData);
    setCompanies(companyData.companies || []);
    setEmployees(employeeData.employees || []);
    setShifts(shiftData.shifts || []);
    setHolidays(holidayData.holidays || []);
    setLeaveRequests(leaveData.requests || []);
    setCorrections(correctionData.corrections || []);
    if (!leave.employeeId && employeeData.employees?.[0]) {
      setLeave((current) => ({ ...current, employeeId: String(employeeData.employees[0].id) }));
      setCorrection((current) => ({ ...current, employeeId: String(employeeData.employees[0].id) }));
    }
  }

  useEffect(() => {
    loadAll().catch((err) => setError(err.message));
  }, []);

  async function saveShift(event) {
    event.preventDefault();
    await action(async () => {
      await api(shift.id ? `/api/management/shifts/${shift.id}` : "/api/management/shifts", {
        method: shift.id ? "PUT" : "POST",
        body: shift
      });
      setShift(emptyShift);
      setMessage("Shift saved.");
    });
  }

  async function saveHoliday(event) {
    event.preventDefault();
    await action(async () => {
      await api("/api/management/holidays", { method: "POST", body: holiday });
      setHoliday({ companyId: "", holidayDate: "", name: "", type: "Public" });
      setMessage("Holiday saved.");
    });
  }

  async function submitLeave(event) {
    event.preventDefault();
    await action(async () => {
      await api("/api/management/leave-requests", { method: "POST", body: leave });
      setMessage("Leave request submitted.");
    });
  }

  async function submitCorrection(event) {
    event.preventDefault();
    await action(async () => {
      await api("/api/management/corrections", { method: "POST", body: correction });
      setMessage("Attendance correction submitted.");
    });
  }

  async function review(type, id, status) {
    await action(async () => {
      await api(`/api/management/${type}/${id}/review`, { method: "PATCH", body: { status } });
      setMessage(`${status} successfully.`);
    });
  }

  async function action(fn) {
    setMessage("");
    setError("");
    try {
      await fn();
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active Employees" value={overview.activeEmployees} icon={Clock3} />
        <StatCard label="Active Shifts" value={overview.activeShifts} tone="info" icon={Clock3} />
        <StatCard label="Pending Leaves" value={overview.pendingLeaves} tone="warn" icon={Clock3} />
        <StatCard label="Pending Corrections" value={overview.pendingCorrections} tone="bad" icon={Clock3} />
      </section>

      {message ? <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-good">{message}</p> : null}
      {error ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-bad">{error}</p> : null}

      <section className="grid gap-5 xl:grid-cols-2">
        <Panel title="Shift Management">
          <form onSubmit={saveShift} className="grid gap-3 sm:grid-cols-2">
            <Field label="Code"><input className="input" value={shift.code} onChange={(e) => setShift({ ...shift, code: e.target.value })} /></Field>
            <Field label="Name"><input className="input" value={shift.name} onChange={(e) => setShift({ ...shift, name: e.target.value })} /></Field>
            <Field label="Start"><input className="input" type="time" value={shift.startTime} onChange={(e) => setShift({ ...shift, startTime: e.target.value })} /></Field>
            <Field label="End"><input className="input" type="time" value={shift.endTime} onChange={(e) => setShift({ ...shift, endTime: e.target.value })} /></Field>
            <Field label="Late Grace"><input className="input" value={shift.graceMinutes} onChange={(e) => setShift({ ...shift, graceMinutes: e.target.value })} /></Field>
            <Field label="Overtime After"><input className="input" value={shift.overtimeAfterMinutes} onChange={(e) => setShift({ ...shift, overtimeAfterMinutes: e.target.value })} /></Field>
            {isAdmin ? <button className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white sm:col-span-2"><Plus size={16} className="mr-2 inline" />Save Shift</button> : null}
          </form>
          <List rows={shifts.map((item) => ({ id: item.id, main: `${item.code} - ${item.name}`, sub: `${item.start_time} to ${item.end_time} · Grace ${item.grace_minutes}m` }))} onEdit={(row) => {
            const item = shifts.find((entry) => entry.id === row.id);
            setShift({
              id: item.id,
              code: item.code,
              name: item.name,
              startTime: item.start_time,
              endTime: item.end_time,
              graceMinutes: item.grace_minutes,
              earlyOutGraceMinutes: item.early_out_grace_minutes,
              overtimeAfterMinutes: item.overtime_after_minutes,
              isActive: Boolean(item.is_active)
            });
          }} />
        </Panel>

        <Panel title="Holiday Calendar">
          <form onSubmit={saveHoliday} className="grid gap-3 sm:grid-cols-2">
            <Field label="Company">
              <select className="input" value={holiday.companyId} onChange={(e) => setHoliday({ ...holiday, companyId: e.target.value })}>
                <option value="">All companies</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.code}</option>)}
              </select>
            </Field>
            <Field label="Date"><input className="input" type="date" value={holiday.holidayDate} onChange={(e) => setHoliday({ ...holiday, holidayDate: e.target.value })} /></Field>
            <Field label="Name"><input className="input" value={holiday.name} onChange={(e) => setHoliday({ ...holiday, name: e.target.value })} /></Field>
            <Field label="Type"><input className="input" value={holiday.type} onChange={(e) => setHoliday({ ...holiday, type: e.target.value })} /></Field>
            {isAdmin ? <button className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white sm:col-span-2">Save Holiday</button> : null}
          </form>
          <List rows={holidays.map((item) => ({ id: item.id, main: item.name, sub: `${item.holiday_date} · ${item.company_code || "All"} · ${item.type}` }))} />
        </Panel>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Panel title="Leave Requests">
          <form onSubmit={submitLeave} className="grid gap-3 sm:grid-cols-2">
            <EmployeeSelect value={leave.employeeId} employees={employees} onChange={(value) => setLeave({ ...leave, employeeId: value })} />
            <Field label="Type"><select className="input" value={leave.leaveType} onChange={(e) => setLeave({ ...leave, leaveType: e.target.value })}><option>Annual</option><option>Sick</option><option>Unpaid</option><option>Emergency</option></select></Field>
            <Field label="Start"><input className="input" type="date" value={leave.startDate} onChange={(e) => setLeave({ ...leave, startDate: e.target.value })} /></Field>
            <Field label="End"><input className="input" type="date" value={leave.endDate} onChange={(e) => setLeave({ ...leave, endDate: e.target.value })} /></Field>
            <Field label="Reason"><input className="input" value={leave.reason} onChange={(e) => setLeave({ ...leave, reason: e.target.value })} /></Field>
            <button className="rounded border border-line px-4 py-2 text-sm font-semibold sm:col-span-2">Submit Leave</button>
          </form>
          <ReviewList rows={leaveRequests} type="leave-requests" isAdmin={isAdmin} onReview={review} />
        </Panel>

        <Panel title="Attendance Corrections">
          <form onSubmit={submitCorrection} className="grid gap-3 sm:grid-cols-2">
            <EmployeeSelect value={correction.employeeId} employees={employees} onChange={(value) => setCorrection({ ...correction, employeeId: value })} />
            <Field label="Date"><input className="input" type="date" value={correction.attendanceDate} onChange={(e) => setCorrection({ ...correction, attendanceDate: e.target.value })} /></Field>
            <Field label="Check In"><input className="input" type="datetime-local" value={correction.checkIn} onChange={(e) => setCorrection({ ...correction, checkIn: e.target.value })} /></Field>
            <Field label="Check Out"><input className="input" type="datetime-local" value={correction.checkOut} onChange={(e) => setCorrection({ ...correction, checkOut: e.target.value })} /></Field>
            <Field label="Reason"><input className="input" value={correction.reason} onChange={(e) => setCorrection({ ...correction, reason: e.target.value })} /></Field>
            <button className="rounded border border-line px-4 py-2 text-sm font-semibold sm:col-span-2">Submit Correction</button>
          </form>
          <ReviewList rows={corrections} type="corrections" isAdmin={isAdmin} onReview={review} />
        </Panel>
      </section>
    </div>
  );
}

function Panel({ title, children }) {
  return <section className="rounded border border-line bg-white p-4 shadow-sm"><h2 className="text-base font-semibold">{title}</h2><div className="mt-4 space-y-4">{children}</div></section>;
}

function Field({ label, children }) {
  return <label className="block text-sm font-medium"><span className="mb-1 block">{label}</span>{children}</label>;
}

function EmployeeSelect({ value, employees, onChange }) {
  return (
    <Field label="Employee">
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_code} - {employee.full_name}</option>)}
      </select>
    </Field>
  );
}

function List({ rows, onEdit }) {
  return (
    <div className="max-h-64 overflow-auto rounded border border-line">
      {rows.length ? rows.map((row) => (
        <div key={row.id} className="flex items-center justify-between border-b border-line p-3 last:border-0">
          <div><p className="font-medium">{row.main}</p><p className="text-sm text-slate-500">{row.sub}</p></div>
          {onEdit ? <button type="button" onClick={() => onEdit(row)} className="rounded border border-line px-3 py-1.5 text-sm font-semibold">Edit</button> : null}
        </div>
      )) : <p className="p-3 text-sm text-slate-500">No records.</p>}
    </div>
  );
}

function ReviewList({ rows, type, isAdmin, onReview }) {
  return (
    <div className="max-h-80 overflow-auto rounded border border-line">
      {rows.length ? rows.map((row) => (
        <div key={row.id} className="border-b border-line p-3 last:border-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-medium">{row.employee_code} - {row.full_name}</p>
              <p className="text-sm text-slate-500">
                {row.leave_type ? `${row.leave_type}: ${row.start_date} to ${row.end_date}` : `${row.attendance_date}: ${row.check_in || "No in"} to ${row.check_out || "No out"}`}
              </p>
              <p className="text-sm text-slate-500">{row.reason}</p>
            </div>
            <span className={`w-fit rounded px-2 py-1 text-xs font-semibold ${row.status === "Approved" ? "bg-green-50 text-good" : row.status === "Rejected" ? "bg-red-50 text-bad" : "bg-amber-50 text-warn"}`}>{row.status}</span>
          </div>
          {isAdmin && row.status === "Pending" ? (
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => onReview(type, row.id, "Approved")} className="rounded bg-good px-3 py-1.5 text-sm font-semibold text-white"><Check size={15} className="mr-1 inline" />Approve</button>
              <button type="button" onClick={() => onReview(type, row.id, "Rejected")} className="rounded border border-line px-3 py-1.5 text-sm font-semibold"><X size={15} className="mr-1 inline" />Reject</button>
            </div>
          ) : null}
        </div>
      )) : <p className="p-3 text-sm text-slate-500">No requests.</p>}
    </div>
  );
}
