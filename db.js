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

try {
  pool = mysql.createPool(connectionConfig);

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
