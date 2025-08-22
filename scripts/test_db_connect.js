// Quick DB connectivity test using current .env
const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const cfg = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectTimeout: 8000,
    ssl: undefined,
  };
  const label = `[DB TEST] host=${cfg.host} db=${cfg.database}`;
  try {
    const conn = await mysql.createConnection(cfg);
    const t0 = Date.now();
    const [rows] = await conn.query('SELECT CURRENT_USER() AS user, DATABASE() AS db, 1 AS ok');
    const ms = Date.now() - t0;
    await conn.end();
    const info = rows && rows[0] ? rows[0] : {};
    console.log(`${label} -> OK in ${ms}ms; user=${info.user}; database=${info.db}`);
    process.exit(0);
  } catch (e) {
    // Print concise error without secrets
    console.error(`${label} -> FAILED: ${e && e.message ? e.message : e}`);
    process.exit(2);
  }
})();
