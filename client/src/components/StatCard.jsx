export default function StatCard({ label, value, tone = "default", icon: Icon }) {
  const tones = {
    default: "border-slate-200 bg-white",
    good: "border-green-200 bg-green-50",
    warn: "border-amber-200 bg-amber-50",
    bad: "border-red-200 bg-red-50",
    info: "border-blue-200 bg-blue-50"
  };

  return (
    <div className={`rounded border p-4 shadow-sm ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        {Icon ? <Icon size={18} className="text-slate-500" /> : null}
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-normal">{value ?? 0}</p>
    </div>
  );
}
