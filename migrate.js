const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Alle Datenbankverbindungen, die für Migrationen relevant sein könnten
const dbConnections = {
    'posts.db': new sqlite3.Database('./posts.db'),
    'media.db': new sqlite3.Database('./media.db'),
    'podcasts.db': new sqlite3.Database('./podcasts.db'),
    'site_content.db': new sqlite3.Database('./site_content.db')
};

// Die site_content.db wird verwendet, um den Überblick über alle Migrationen zu behalten.
const logDb = dbConnections['site_content.db'];
const migrationsDir = path.join(__dirname, 'migrations');

// 1. Sicherstellen, dass die 'migrations'-Tabelle existiert.
logDb.serialize(() => {
    logDb.run(`CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        run_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error("Konnte die 'migrations'-Tabelle nicht erstellen.", err);
            return closeAllConnections();
        }
        runMigrations();
    });
});

function runMigrations() {
    // 2. Alle bereits durchgeführten Migrationen aus der DB holen.
    logDb.all("SELECT name FROM migrations", (err, ranMigrations) => {
        if (err) {
            console.error("Konnte bereits durchgeführte Migrationen nicht abrufen.", err);
            return closeAllConnections();
        }
        const ranMigrationNames = ranMigrations.map(m => m.name);
        console.log('Bereits ausgeführte Migrationen:', ranMigrationNames.join(', ') || 'Keine');

        // 3. Alle verfügbaren Migrations-Dateien aus dem Ordner lesen.
        fs.readdir(migrationsDir, (err, files) => {
            if (err) {
                console.error("Migrations-Verzeichnis konnte nicht gelesen werden.", err);
                return closeAllConnections();
            }

            const pendingMigrations = files
                .filter(file => file.endsWith('.sql'))
                .filter(file => !ranMigrationNames.includes(file))
                .sort();

            if (pendingMigrations.length === 0) {
                console.log("Datenbank ist bereits auf dem neuesten Stand.");
                return closeAllConnections();
            }

            console.log('Ausstehende Migrationen:', pendingMigrations.join(', '));

            // 4. Jede ausstehende Migration nacheinander ausführen (sequentiell).
            const executeSequentially = async () => {
                for (const file of pendingMigrations) {
                    try {
                        await executeMigration(file);
                    } catch (error) {
                        console.error(`Migration ${file} ist fehlgeschlagen. Breche ab.`, error);
                        return closeAllConnections(); // Bei einem Fehler stoppen
                    }
                }
                console.log("Alle ausstehenden Migrationen erfolgreich abgeschlossen.");
                closeAllConnections();
            };

            executeSequentially();
        });
    });
}

function executeMigration(file) {
    return new Promise((resolve, reject) => {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');

        // Ziel-Datenbank aus dem SQL-Kommentar auslesen
        const dbNameMatch = sql.match(/-- DBNAME:\s*(\S+\.db)/);
        if (!dbNameMatch) {
            return reject(new Error(`Kein '-- DBNAME: ...' Kommentar in ${file} gefunden.`));
        }
        const dbName = dbNameMatch[1];
        const targetDb = dbConnections[dbName];
        if (!targetDb) {
            return reject(new Error(`Unbekannte Datenbank '${dbName}' in ${file}.`));
        }

        console.log(`Führe Migration aus: ${file} auf ${dbName}...`);

        targetDb.exec(sql, (err) => {
            if (err) {
                return reject(err);
            }

            // 5. Erfolgreiche Migration in der logDb vermerken.
            logDb.run("INSERT INTO migrations (name) VALUES (?)", [file], (err) => {
                if (err) {
                    return reject(err);
                }
                console.log(`Migration ${file} erfolgreich ausgeführt und vermerkt.`);
                resolve();
            });
        });
    });
}

function closeAllConnections() {
    console.log("Schließe alle Datenbankverbindungen.");
    for (const key in dbConnections) {
        dbConnections[key].close();
    }
}
