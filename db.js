const mysql = require("mysql2/promise");
const redis = require("./cache");

// Create MySQL connection pool
const pool = mysql.createPool({
  host: "db",          // service name in docker-compose
  user: "root",
  password: "mastercom",
  database: "configbackup",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports.getDeviceDetails = async (ip) => {
  const cacheKey = `device:${ip}`;

  try {
    // 1️⃣ Check Redis cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`Cache HIT for ${ip}`);
      return JSON.parse(cached);
    }

    console.log(`Cache MISS for ${ip} — querying MySQL`);

    const [rows] = await pool.execute(
  `SELECT 
      di.deviceId AS deviceId,
      di.deviceName AS deviceName,
      di.deviceIp AS deviceIp,
      di.isBaseLineVersion AS isBaseLineSet,
      di.config_baseline AS baseLineFile,
      di.configdiff_email AS diffEmail,

      dt.devicetypename AS type,

      ds.lastSchedule AS lastSchedule,
      ds.nextSchedule AS scheduleTime,
      ds.is_enabled AS isenabled,

      df.value AS frequency,

      dl.username AS username,
      dl.password AS password,
      dl.loginport AS port,
      dl.allowed_attempt AS allowedattempt,

      dc.commandname AS commandname,
      dc.api_path AS apipath

   FROM configbackup.deviceinfo di
   JOIN configbackup.deviceschedule ds ON di.deviceId = ds.deviceId
   JOIN configbackup.devicelogin dl ON di.deviceId = dl.deviceId
   JOIN configbackup.devicefrequency df ON df.id = ds.scheduleFrequency
   JOIN configbackup.devicecommand dc ON dc.commandId = di.commandId
   JOIN configbackup.deviceType dt ON di.deviceType = dt.devicetypeid

   WHERE di.deviceIp = ?`,
  [ip]
);

const device = rows[0];

    // 3️⃣ Store in Redis with TTL (10 minutes)
    if (device) {
      await redis.set(cacheKey, JSON.stringify(device), {
        EX: 600
      });
    }

    return device;
  } catch (err) {
    console.error("DB Error:", err.message);
    return null;
  }
};
