#!/usr/bin/env node
// scripts/check_db_privs.js
// Run non-destructive checks against a MySQL database to validate app user privileges.
// Usage: node scripts/check_db_privs.js --host=... --user=... --password=... --database=...

const mysql = require('mysql2/promise');
try {
  require('dotenv').config();
} catch (_) {}
const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  args.forEach((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  });
  // fallback to env
  out.host = out.host || process.env.DB_HOST || 'localhost';
  out.port = out.port || process.env.DB_PORT || 3306;
  out.user = out.user || process.env.DB_USER;
  out.password = out.password || process.env.DB_PASSWORD;
  out.database = out.database || process.env.DB_NAME;
  return out;
}

(async function () {
  const cfg = parseArgs();
  if (!cfg.user || !cfg.password || !cfg.database) {
    console.error(
      'Missing required parameters. Provide --user, --password, --database or set DB_USER/DB_PASSWORD/DB_NAME env vars.'
    );
    process.exit(2);
  }

  const out = {
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    database: cfg.database,
    timestamp: new Date().toISOString(),
    results: {},
  };
  let conn;
  try {
    conn = await mysql.createConnection({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      connectTimeout: 10000,
    });
    // basic identity
    try {
      const [rows] = await conn.query(
        'SELECT CURRENT_USER() AS current_user, DATABASE() AS database_name'
      );
      out.results.identity = rows && rows[0] ? rows[0] : null;
    } catch (e) {
      out.results.identity_error = e.message;
    }

    // show tables (limit)
    try {
      const [rows] = await conn.query('SHOW TABLES');
      const key = rows[0] ? Object.keys(rows[0])[0] : null;
      out.results.show_tables = {
        count: Array.isArray(rows) ? rows.length : 0,
        sample: key ? rows.slice(0, 20).map((r) => r[key]) : [],
      };
    } catch (e) {
      out.results.show_tables_error = e.message;
    }

    // information_schema count
    try {
      const [rows] = await conn.query(
        'SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE()'
      );
      out.results.info_schema_count = rows && rows[0] ? rows[0].c : null;
    } catch (e) {
      out.results.info_schema_error = e.message;
    }

    // try reading a small row from posts (if exists)
    try {
      const [rows] = await conn.query('SELECT COUNT(*) AS c FROM posts LIMIT 1');
      out.results.posts_count = rows && rows[0] ? rows[0].c : 0;
    } catch (e) {
      out.results.posts_count_error = e.message;
    }
  } catch (err) {
    out.connect_error = err.message;
  } finally {
    try {
      if (conn) await conn.end();
    } catch (_) {}
  }

  const outPath = path.join(process.cwd(), 'tmp', 'check_db_privs_' + Date.now() + '.json');
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
    console.log('Wrote:', outPath);
  } catch (e) {
    console.error('Could not write output file:', e.message);
  }
  console.log(JSON.stringify(out, null, 2));
})();
