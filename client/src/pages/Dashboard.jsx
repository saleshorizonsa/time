import { useEffect, useMemo, useState } from "react";
import { Clock3, TimerOff, UserCheck, UserX } from "lucide-react";
import StatCard from "../components/StatCard";
import SyncPanel from "../components/SyncPanel";
import { getUser } from "../lib/api";

export default function Dashboard({ helpers }) {
  const { api } = helpers;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const user = getUser();

  useEffect(() => {
    api("/api/dashboard/summary").then(setData).catch((err) => setError(err.message));
  }, []);

  const departments = useMemo(() => {
    const grouped = {};
    (data?.departments || []).forEach((row) => {
      grouped[row.department || "Unassigned"] = grouped[row.department || "Unassigned"] || {};
      grouped[row.department || "Unassigned"][row.status] = row.count;
    });
    return Object.entries(grouped);
  }, [data]);

  if (error) return <div className="rounded border border-red-200 bg-red-50 p-4 text-bad">{error}</div>;

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Present Today" value={data?.summary?.present} tone="good" icon={UserCheck} />
        <StatCard label="Late Arrivals" value={data?.summary?.late} tone="warn" icon={Clock3} />
        <StatCard label="Absences" value={data?.summary?.absent} tone="bad" icon={UserX} />
        <StatCard label="Overtime" value={data?.summary?.overtime} tone="info" icon={TimerOff} />
      </section>

      <SyncPanel api={api} isAdmin={user?.role === "Admin"} />

      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded border border-line bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Department-wise Report</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-line text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Department</th>
                  <th className="py-2 pr-4">Present</th>
                  <th className="py-2 pr-4">Late</th>
                  <th className="py-2 pr-4">Absent</th>
                  <th className="py-2 pr-4">Overtime</th>
                </tr>
              </thead>
              <tbody>
                {departments.map(([department, counts]) => (
                  <tr key={department} className="border-b border-line last:border-0">
                    <td className="py-3 pr-4 font-medium">{department}</td>
                    <td className="py-3 pr-4">{counts.Present || 0}</td>
                    <td className="py-3 pr-4">{counts.Late || 0}</td>
                    <td className="py-3 pr-4">{counts.Absent || 0}</td>
                    <td className="py-3 pr-4">{counts.Overtime || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded border border-line bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Recent Late Arrivals</h2>
          <div className="mt-4 space-y-3">
            {(data?.lateArrivals || []).map((row) => (
              <div key={row.id} className="rounded border border-line p-3">
                <p className="font-medium">{row.employee_name || row.employee_id}</p>
                <p className="text-sm text-slate-500">{row.department} · {row.attendance_date}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
