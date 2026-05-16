import { useEffect, useState } from "react";
import { CheckCircle2, LocateFixed, LogIn, LogOut, MapPin, XCircle } from "lucide-react";

export default function MobilePunch({ helpers }) {
  const { api } = helpers;
  const [workplace, setWorkplace] = useState(null);
  const [history, setHistory] = useState([]);
  const [location, setLocation] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api("/api/mobile-punch/workplace").then(setWorkplace).catch((err) => setError(err.message));
    api("/api/mobile-punch/history").then((data) => setHistory(data.punches || [])).catch(() => {});
  }, []);

  function getLocation() {
    setError("");
    setMessage("");
    if (!navigator.geolocation) {
      setError("Location is not supported on this device.");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy
        });
        setLoading(false);
      },
      (err) => {
        setError(err.message || "Unable to read mobile location.");
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }

  async function punch(punchType) {
    if (!location) {
      getLocation();
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await api("/api/mobile-punch", {
        method: "POST",
        body: { punchType, ...location }
      });
      setMessage(`${punchType === "IN" ? "Punch in" : "Punch out"} accepted. Distance: ${response.punch.distanceMeters} m.`);
      const historyResponse = await api("/api/mobile-punch/history");
      setHistory(historyResponse.punches || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const configured = workplace?.latitude !== null && workplace?.longitude !== null && workplace?.latitude !== "";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="rounded border border-line bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded bg-blue-50 text-brand">
            <MapPin />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Mobile Punch</h2>
            <p className="text-sm text-slate-500">
              {workplace?.name || "Workplace"} · accepted within {workplace?.radiusMeters || 500} meters
            </p>
          </div>
        </div>

        <div className="mt-5 rounded border border-line bg-slate-50 p-4">
          <p className="text-sm font-medium">Current location</p>
          {location ? (
            <div className="mt-2 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
              <span>Lat: {location.latitude.toFixed(6)}</span>
              <span>Lng: {location.longitude.toFixed(6)}</span>
              <span>Accuracy: {Math.round(location.accuracyMeters)} m</span>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Location not captured yet.</p>
          )}
        </div>

        {!configured ? (
          <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-warn">
            Workplace latitude and longitude are not configured by the Admin.
          </div>
        ) : null}

        {message ? (
          <div className="mt-4 flex items-center gap-2 rounded border border-green-200 bg-green-50 p-3 text-sm text-good">
            <CheckCircle2 size={18} /> {message}
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 flex items-center gap-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-bad">
            <XCircle size={18} /> {error}
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <button onClick={getLocation} disabled={loading} className="rounded border border-line px-4 py-3 text-sm font-semibold">
            <span className="inline-flex items-center gap-2"><LocateFixed size={18} /> Locate Me</span>
          </button>
          <button onClick={() => punch("IN")} disabled={loading} className="rounded bg-good px-4 py-3 text-sm font-semibold text-white">
            <span className="inline-flex items-center gap-2"><LogIn size={18} /> Punch In</span>
          </button>
          <button onClick={() => punch("OUT")} disabled={loading} className="rounded bg-ink px-4 py-3 text-sm font-semibold text-white">
            <span className="inline-flex items-center gap-2"><LogOut size={18} /> Punch Out</span>
          </button>
        </div>
      </section>

      <section className="rounded border border-line bg-white shadow-sm">
        <div className="border-b border-line p-4">
          <h2 className="font-semibold">Recent Mobile Punches</h2>
        </div>
        <div className="divide-y divide-line">
          {history.length ? history.map((row) => (
            <div key={row.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{row.punch_type === "IN" ? "Punch In" : "Punch Out"}</p>
                <p className="text-sm text-slate-500">{row.punch_time}</p>
              </div>
              <span className={`w-fit rounded px-2 py-1 text-xs font-semibold ${row.accepted ? "bg-green-50 text-good" : "bg-red-50 text-bad"}`}>
                {row.accepted ? "Accepted" : "Rejected"} · {Math.round(row.distance_meters)} m
              </span>
            </div>
          )) : <p className="p-4 text-sm text-slate-500">No mobile punches yet.</p>}
        </div>
      </section>
    </div>
  );
}
