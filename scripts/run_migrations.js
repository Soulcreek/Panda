#!/usr/bin/env node
// scripts/run_migrations.js
// Simple, safe MySQL migration runner.
// - Looks for .sql files in the migrations directory (default: ./migrations)
// - Keeps a `schema_migrations` table with filename + checksum + applied_at
// - Runs each not-yet-applied file in a transaction (requires MySQL engine that supports transactional DDL or accepts it)
// - Usage examples:
//   node scripts/run_migrations.js --dir=migrations --host=127.0.0.1 --user=root --password=secret --database=mydb
//   node scripts/run_migrations.js --dry-run
// Notes:
// - This runner uses a dedicated mysql2 connection with multipleStatements enabled.
// - It will stop on the first failing migration and rollback the transaction.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  args.forEach((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
    if (a === '--dry-run') out['dry-run'] = 'true';
    if (a === '--help') out['help'] = 'true';
  });
  out.dir = out.dir || process.env.MIGRATIONS_DIR || path.join(process.cwd(), 'migrations');
  out.host = out.host || process.env.DB_HOST || '127.0.0.1';
  out.port = parseInt(out.port || process.env.DB_PORT || '3306', 10);
  out.user = out.user || process.env.DB_USER || 'root';
  out.password = out.password || process.env.DB_PASSWORD || '';
  out.database = out.database || process.env.DB_NAME || null;
  out.dryRun = !!out['dry-run'];
  out.help = !!out['help'];
  return out;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

async function ensureMigrationsTable(conn) {
  const sql = `CREATE TABLE IF NOT EXISTS schema_migrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    checksum VARCHAR(128) NOT NULL,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY (filename)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
  await conn.query(sql);
}

async function getAppliedMigrations(conn) {
  const [rows] = await conn.query(
    'SELECT filename,checksum,applied_at FROM schema_migrations ORDER BY id ASC'
  );
  const map = new Map();
  for (const r of rows) map.set(r.filename, r);
  return map;
}

async function run() {
  const cfg = parseArgs();
  if (cfg.help || !cfg.database) {
    console.log(
      'Usage: node scripts/run_migrations.js --database=DB_NAME [--host=] [--user=] [--password=] [--dir=./migrations] [--dry-run]'
    );
    console.log(
      'Environment variables used if not specified: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, MIGRATIONS_DIR'
    );
    process.exit(cfg.help ? 0 : 2);
  }

  if (!fs.existsSync(cfg.dir)) {
    console.error('Migrations directory not found:', cfg.dir);
    process.exit(1);
  }
  const files = fs
    .readdirSync(cfg.dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (!files.length) {
    console.log('No .sql files in', cfg.dir);
    process.exit(0);
  }

  let conn;
  try {
    conn = await mysql.createConnection({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      multipleStatements: true,
      connectTimeout: 10000,
    });
    console.log('[migrate] Connected to', cfg.host + ':' + cfg.port, 'DB=', cfg.database);

    await ensureMigrationsTable(conn);
    const applied = await getAppliedMigrations(conn);

    for (const file of files) {
      const full = path.join(cfg.dir, file);
      const sql = fs.readFileSync(full, 'utf8').trim();
      if (!sql) {
        console.log('[skip] empty file', file);
        continue;
      }
      const checksum = sha256(sql);
      const already = applied.get(file);
      if (already) {
        if (already.checksum !== checksum) {
          console.error(
            '[error] checksum mismatch for',
            file,
            '\n - applied checksum:',
            already.checksum,
            '\n - current checksum:',
            checksum,
            '\n -> Manual intervention required (rename file or adjust).'
          );
          process.exit(1);
        }
        console.log('[skip] already applied', file);
        continue;
      }

      console.log(cfg.dryRun ? '[dry-run] would apply' : '[apply] applying', file);
      if (cfg.dryRun) continue;

      try {
        await conn.beginTransaction();
        // execute the full SQL file; assumes statements are legal when run together
        await conn.query(sql);
        // record migration
        await conn.query('INSERT INTO schema_migrations (filename,checksum) VALUES (?,?)', [
          file,
          checksum,
        ]);
        await conn.commit();
        console.log('[ok] applied', file);
      } catch (e) {
        try {
          await conn.rollback();
        } catch (_) {}
        console.error('[FAIL] applying', file, e.message);
        process.exit(1);
      }
    }

    console.log('[migrate] done.');
    await conn.end();
  } catch (e) {
    console.error('[migrate] fatal:', e.message);
    if (conn)
      try {
        await conn.end();
      } catch (_) {}
    process.exit(1);
  }
}

run();
