import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  Clock3,
  Database,
  Download,
  FileSpreadsheet,
  Filter,
  MapPin,
  LogOut,
  RefreshCw,
  Settings,
  ShieldCheck,
  Building2,
  ClipboardList,
  Users
} from "lucide-react";
import "./styles.css";
import { api, buildQuery, clearSession, getUser, setSession } from "./lib/api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import MobilePunch from "./pages/MobilePunch";
import Reports from "./pages/Reports";
import AdminSettings from "./pages/AdminSettings";
import MasterData from "./pages/MasterData";
import AttendanceManagement from "./pages/AttendanceManagement";

const nav = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "punch", label: "Punch", icon: MapPin },
  { id: "reports", label: "Reports", icon: FileSpreadsheet },
  { id: "manage", label: "Management", icon: ClipboardList },
  { id: "master", label: "Master Data", icon: Building2, adminOnly: true },
  { id: "settings", label: "Settings", icon: Settings, adminOnly: true }
];

function AppShell() {
  const [user, setUser] = useState(getUser());
  const [active, setActive] = useState("dashboard");

  if (!user) {
    return <Login onLogin={(session) => { setSession(session); setUser(session.user); }} />;
  }

  const visibleNav = nav.filter((item) => !item.adminOnly || user.role === "Admin");
  const ActivePage =
    active === "reports"
      ? Reports
      : active === "settings"
        ? AdminSettings
        : active === "punch"
          ? MobilePunch
          : active === "master"
            ? MasterData
            : active === "manage"
              ? AttendanceManagement
              : Dashboard;

  return (
    <div className="min-h-screen bg-surface">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-white px-4 py-5 lg:block">
        <div className="flex items-center gap-3 px-2">
          <div className="grid h-10 w-10 place-items-center rounded bg-brand text-white">
            <Clock3 size={22} />
          </div>
          <div>
            <p className="text-sm font-semibold">Time Attendance</p>
            <p className="text-xs text-slate-500">Reporting Console</p>
          </div>
        </div>
        <nav className="mt-8 space-y-1">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const selected = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActive(item.id)}
                className={`flex w-full items-center gap-3 rounded px-3 py-2.5 text-sm font-medium ${
                  selected ? "bg-blue-50 text-brand" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6">
            <div>
              <h1 className="text-lg font-semibold sm:text-xl">Attendance Reporting</h1>
              <p className="hidden text-sm text-slate-500 sm:block">Access database sync and employee attendance reports</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded border border-line px-3 py-2 text-sm md:flex">
                <ShieldCheck size={16} className="text-good" />
                <span>{user.email}</span>
                <span className="text-slate-400">/</span>
                <span>{user.role}</span>
              </div>
              <button
                className="grid h-10 w-10 place-items-center rounded border border-line bg-white hover:bg-slate-50"
                onClick={() => { clearSession(); setUser(null); }}
                title="Sign out"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
          <nav className="flex overflow-x-auto border-t border-line px-4 lg:hidden">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActive(item.id)}
                  className={`flex min-w-fit items-center gap-2 px-4 py-3 text-sm font-medium ${
                    active === item.id ? "border-b-2 border-brand text-brand" : "text-slate-600"
                  }`}
                >
                  <Icon size={17} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </header>
        <main className="px-4 py-5 sm:px-6">
          <ActivePage helpers={{ api, buildQuery }} icons={{ AlertCircle, CalendarDays, Database, Download, Filter, RefreshCw, Users }} />
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<AppShell />);
