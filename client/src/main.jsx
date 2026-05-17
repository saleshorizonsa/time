import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
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

const ROUTES = [
  { path: "/dashboard", label: "Dashboard",   icon: BarChart3,     component: Dashboard },
  { path: "/punch",     label: "Punch",        icon: MapPin,         component: MobilePunch },
  { path: "/reports",   label: "Reports",      icon: FileSpreadsheet, component: Reports },
  { path: "/manage",    label: "Management",   icon: ClipboardList,  component: AttendanceManagement },
  { path: "/master",    label: "Master Data",  icon: Building2,      component: MasterData, adminOnly: true },
  { path: "/settings",  label: "Settings",     icon: Settings,       component: AdminSettings, adminOnly: true }
];

const helpers = { api, buildQuery };
const icons = { AlertCircle, CalendarDays, Database, Download, Filter, RefreshCw, Users };

/** Renders sidebar + header + nested routes. Must be inside a Router context. */
function AppShellLayout({ user, onLogout }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const visibleRoutes = ROUTES.filter((r) => !r.adminOnly || user.role === "Admin");

  return (
    <div className="min-h-screen bg-surface">
      {/* Sidebar */}
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
          {visibleRoutes.map((route) => {
            const Icon = route.icon;
            const selected = pathname.startsWith(route.path);
            return (
              <button
                key={route.path}
                onClick={() => navigate(route.path)}
                className={`flex w-full items-center gap-3 rounded px-3 py-2.5 text-sm font-medium ${
                  selected ? "bg-blue-50 text-brand" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon size={18} />
                {route.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6">
            <div>
              <h1 className="text-lg font-semibold sm:text-xl">Attendance Reporting</h1>
              <p className="hidden text-sm text-slate-500 sm:block">
                Access database sync and employee attendance reports
              </p>
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
                onClick={onLogout}
                title="Sign out"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
          {/* Mobile tab nav */}
          <nav className="flex overflow-x-auto border-t border-line px-4 lg:hidden">
            {visibleRoutes.map((route) => {
              const Icon = route.icon;
              return (
                <button
                  key={route.path}
                  onClick={() => navigate(route.path)}
                  className={`flex min-w-fit items-center gap-2 px-4 py-3 text-sm font-medium ${
                    pathname.startsWith(route.path) ? "border-b-2 border-brand text-brand" : "text-slate-600"
                  }`}
                >
                  <Icon size={17} />
                  {route.label}
                </button>
              );
            })}
          </nav>
        </header>

        <main className="px-4 py-5 sm:px-6">
          <Routes>
            {/* Default redirect */}
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {ROUTES.map((route) => {
              const Page = route.component;
              const element =
                route.adminOnly && user.role !== "Admin" ? (
                  <Navigate to="/dashboard" replace />
                ) : (
                  <Page helpers={helpers} icons={icons} />
                );
              return <Route key={route.path} path={route.path} element={element} />;
            })}

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function AppRoutes({ user, setUser }) {
  const handleLogin = (session) => {
    setSession(session);
    setUser(session.user);
  };
  const handleLogout = () => {
    clearSession();
    setUser(null);
  };

  if (!user) return <Login onLogin={handleLogin} />;
  return <AppShellLayout user={user} onLogout={handleLogout} />;
}

function AppShell() {
  const [user, setUser] = useState(getUser());

  return (
    <HashRouter>
      <AppRoutes user={user} setUser={setUser} />
    </HashRouter>
  );
}

createRoot(document.getElementById("root")).render(<AppShell />);
