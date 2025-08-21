// soulcreek/panda/Panda-master/db.js

const mysql = require('mysql2/promise');
require('dotenv').config();

console.log('[DB] Initialisiere Datenbank-Pool...');

// Baut das Konfigurationsobjekt für die Verbindung zusammen
const connectionConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000 // 10 Sekunden Timeout
};

// Bevorzugt den Socket-Pfad, wenn er in der .env-Datei vorhanden ist.
// Das ist auf Webhostern oft stabiler.
if (process.env.DB_SOCKET_PATH) {
  console.log(`[DB] Benutze Socket-Pfad: ${process.env.DB_SOCKET_PATH}`);
  connectionConfig.socketPath = process.env.DB_SOCKET_PATH;
} else {
  console.log(`[DB] Benutze Host: ${process.env.DB_HOST}, Port: ${process.env.DB_PORT}`);
  connectionConfig.host = process.env.DB_HOST;
  connectionConfig.port = process.env.DB_PORT || 3306;
}

let pool;
// Lightweight health metrics
const dbHealth = {
  lastPingMs: null,
  degraded: false,
  lastError: null,
  lastCheckedAt: null,
  slowThresholdMs: parseInt(process.env.DB_SLOW_THRESHOLD_MS||'250',10), // default 250ms
  rollingAvgMs: null,
  totalQueries: 0,
  slowQueries: 0,
  window: [] // recent durations (max 50)
};

try {
  pool = mysql.createPool(connectionConfig);

  // Wrap original query for latency tracking (non-invasive)
  const origQuery = pool.query.bind(pool);
  pool.query = async function wrappedQuery(sql, params){
    const start = Date.now();
    try {
      const res = await origQuery(sql, params);
      const dur = Date.now() - start;
  if(sql === 'SELECT 1' || /SELECT 1/.test(sql)){ dbHealth.lastPingMs = dur; }
  dbHealth.totalQueries++;
  dbHealth.window.push(dur); if(dbHealth.window.length>50) dbHealth.window.shift();
  const sum = dbHealth.window.reduce((a,b)=>a+b,0);
  dbHealth.rollingAvgMs = Math.round(sum / dbHealth.window.length);
  if(dur > dbHealth.slowThresholdMs){ dbHealth.slowQueries++; }
  // degraded if current or rolling average exceeds threshold OR last error existed
  dbHealth.degraded = !!dbHealth.lastError || dur > dbHealth.slowThresholdMs || (dbHealth.rollingAvgMs && dbHealth.rollingAvgMs > dbHealth.slowThresholdMs);
      dbHealth.lastError = null;
      dbHealth.lastCheckedAt = new Date();
      return res;
    } catch(e){
      dbHealth.lastError = e.message;
      dbHealth.degraded = true;
      dbHealth.lastCheckedAt = new Date();
      throw e;
    }
  };

  // Testet die Verbindung sofort beim Start
  pool.getConnection()
    .then(connection => {
      console.log('[DB] ERFOLG: Datenbank-Pool erstellt und Verbindungstest erfolgreich!');
      connection.release();
    })
    .catch(err => {
      console.error('[DB] FATAL: Konnte nach dem Erstellen des Pools keine Verbindung zur Datenbank herstellen.');
      console.error('[DB] Bitte prüfe deine .env Konfiguration (Host, User, Passwort, Socket-Pfad).');
      console.error(err);
      process.exit(1); // Beendet den Prozess bei einem Fehler, um klare Logs zu erzeugen
    });

} catch (err) {
  console.error('[DB] FATAL: Der Datenbank-Pool konnte nicht erstellt werden. Prüfe deine .env Konfiguration.');
  console.error(err);
  process.exit(1);
}

module.exports = pool;
module.exports.dbHealth = dbHealth;
