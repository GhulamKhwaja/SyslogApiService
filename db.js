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

    // 2️⃣ Query MySQL if not cached
    const [rows] = await pool.execute(
      "SELECT * FROM deviceinfo WHERE deviceIp = ? LIMIT 1",
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
