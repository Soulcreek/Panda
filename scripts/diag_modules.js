// Simple runtime diagnostics to run on the server (via Plesk Node.js console)
// Prints CWD, existence of key files, and resolves of core modules
const fs = require('fs');
const path = require('path');

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function safeResolve(name) {
  try {
    const p = require.resolve(name);
    return { ok: true, path: p };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

(async () => {
  console.log('[diag] cwd=', process.cwd());
  const root = process.cwd();
  const files = ['package.json', 'package-lock.json', '.env', 'server.js', 'config/env.js'];
  for (const f of files) {
    console.log(`[diag] exists ${f}:`, exists(path.join(root, f)) ? 'YES' : 'NO');
  }

  const targets = [
    'express',
    'ejs',
    'envalid',
    'dotenv',
    'express-session',
    'express-mysql-session',
    'mysql2',
  ];
  for (const t of targets) {
    const res = safeResolve(t);
    console.log(`[diag] resolve ${t}:`, res.ok ? res.path : `MISSING (${res.error})`);
  }
})();
