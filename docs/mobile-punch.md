# Mobile Punch Geofence

The mobile punch feature lets employees punch in and out from a phone only when they are inside the configured workplace radius.

## Admin Settings

Set these values in the Admin Settings page:

```text
Workplace Name
Workplace Latitude
Workplace Longitude
Allowed Radius Meters
```

For your requirement, use:

```text
Allowed Radius Meters: 500
```

## How Employees Punch

1. Employee logs in from mobile.
2. Opens **Punch**.
3. Taps **Locate Me**.
4. Taps **Punch In** or **Punch Out**.
5. Backend checks distance from workplace coordinates.

Accepted punches are saved to:

```text
mobile_punches
attendance_records
```

Rejected punches are still stored in `mobile_punches` with the rejection reason.

## Browser Requirements

Mobile browser location usually requires HTTPS in production. For local testing, `localhost` works, but phone access should use HTTPS:

```text
https://attendance.yourdomain.com
```

## API

```text
GET  /api/mobile-punch/workplace
POST /api/mobile-punch
GET  /api/mobile-punch/history
```

POST body:

```json
{
  "punchType": "IN",
  "latitude": 24.713552,
  "longitude": 46.675296,
  "accuracyMeters": 12
}
```
