const env = require("../config/env");
const { getSettings } = require("./settingsService");

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function distanceMeters(aLat, aLon, bLat, bLon) {
  const earthRadius = 6371000;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const hav =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * earthRadius * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
}

async function getWorkplaceSettings() {
  const saved = await getSettings();
  return {
    name: saved.workplaceName || env.workplace.name,
    latitude: toNumber(saved.workplaceLatitude || env.workplace.latitude),
    longitude: toNumber(saved.workplaceLongitude || env.workplace.longitude),
    radiusMeters: Number(saved.workplaceRadiusMeters || env.workplace.radiusMeters)
  };
}

async function evaluateGeofence(latitude, longitude) {
  const workplace = await getWorkplaceSettings();
  const lat = toNumber(latitude);
  const lon = toNumber(longitude);

  if (lat === null || lon === null) {
    return { accepted: false, distanceMeters: 0, reason: "Invalid mobile location.", workplace };
  }

  if (workplace.latitude === null || workplace.longitude === null) {
    return {
      accepted: false,
      distanceMeters: 0,
      reason: "Workplace location is not configured.",
      workplace
    };
  }

  const distance = distanceMeters(workplace.latitude, workplace.longitude, lat, lon);
  const accepted = distance <= workplace.radiusMeters;
  return {
    accepted,
    distanceMeters: Math.round(distance),
    reason: accepted ? "" : `Outside workplace radius by ${Math.round(distance - workplace.radiusMeters)} meters.`,
    workplace
  };
}

module.exports = { distanceMeters, evaluateGeofence, getWorkplaceSettings };
