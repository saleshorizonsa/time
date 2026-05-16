const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  databaseUrl: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/time_attendance",
  databaseSsl: process.env.DATABASE_SSL === "true",
  databasePoolMax: Number(process.env.DATABASE_POOL_MAX || 10),
  adminEmail: process.env.ADMIN_EMAIL || "admin@example.com",
  adminPassword: process.env.ADMIN_PASSWORD || "ChangeMe123!",
  access: {
    dbPath: process.env.ACCESS_DB_PATH || "",
    driver: process.env.ACCESS_DRIVER || "{Microsoft Access Driver (*.mdb, *.accdb)}",
    password: process.env.ACCESS_DB_PASSWORD || "",
    uid: process.env.ACCESS_UID || "",
    pwd: process.env.ACCESS_PWD || "",
    table: process.env.ACCESS_TABLE || "AttendanceLog",
    columns: {
      employeeId: process.env.ACCESS_EMPLOYEE_ID_COLUMN || "EmployeeID",
      employeeName: process.env.ACCESS_EMPLOYEE_NAME_COLUMN || "EmployeeName",
      department: process.env.ACCESS_DEPARTMENT_COLUMN || "Department",
      shift: process.env.ACCESS_SHIFT_COLUMN || "ShiftName",
      checkIn: process.env.ACCESS_CHECK_IN_COLUMN || "CheckInTime",
      checkOut: process.env.ACCESS_CHECK_OUT_COLUMN || "CheckOutTime",
      status: process.env.ACCESS_STATUS_COLUMN || "Status",
      overtimeMinutes: process.env.ACCESS_OVERTIME_MINUTES_COLUMN || "OvertimeMinutes"
    }
  },
  remoteHost: process.env.REMOTE_HOST || "",
  remoteShare: process.env.REMOTE_SHARE || "",
  syncFrequencyCron: process.env.SYNC_FREQUENCY_CRON || "*/15 * * * *",
  syncLookbackDays: Number(process.env.SYNC_LOOKBACK_DAYS || 30),
  zkteco: {
    mode: process.env.ZK_MODE || "adms",
    deviceHost: process.env.ZK_DEVICE_HOST || "",
    devicePort: Number(process.env.ZK_DEVICE_PORT || 4370),
    devicePassword: process.env.ZK_DEVICE_PASSWORD || "0",
    timeoutMs: Number(process.env.ZK_DEVICE_TIMEOUT_MS || 10000),
    inPort: Number(process.env.ZK_DEVICE_INPORT || 5200),
    admsServerAddress: process.env.ZK_ADMS_SERVER_ADDRESS || "",
    admsServerPort: Number(process.env.ZK_ADMS_SERVER_PORT || process.env.PORT || 5000),
    admsHttps: process.env.ZK_ADMS_HTTPS === "true",
    timezone: process.env.ZK_TIMEZONE || "Asia/Riyadh"
  },
  workplace: {
    name: process.env.WORKPLACE_NAME || "Main Workplace",
    latitude: process.env.WORKPLACE_LATITUDE || "",
    longitude: process.env.WORKPLACE_LONGITUDE || "",
    radiusMeters: Number(process.env.WORKPLACE_RADIUS_METERS || 500)
  }
};

module.exports = env;
