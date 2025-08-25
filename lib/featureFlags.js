// Lightweight feature flags (per site / global) with in-memory cache.
// Table schema (auto-created): feature_flags
// Columns: id, site_key, flag_key, enabled TINYINT, variant VARCHAR(64) NULL, description, updated_at, created_at
// Unique: (site_key, flag_key)

const pool = require('../db');

let ensured = false;
async function ensureTable() {
  if (ensured) return;
  ensured = true;
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS feature_flags (
      id INT AUTO_INCREMENT PRIMARY KEY,
      site_key VARCHAR(64) NOT NULL DEFAULT 'default',
      flag_key VARCHAR(100) NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 0,
      variant VARCHAR(64) NULL,
      description VARCHAR(255) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_flag_site (site_key, flag_key),
      KEY idx_flag_site_enabled (site_key, enabled)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
    try {
      await pool.query(
        'ALTER TABLE feature_flags ADD COLUMN site_key VARCHAR(64) NOT NULL DEFAULT "default"'
      );
    } catch (_) {}
    try {
      await pool.query(
        'ALTER TABLE feature_flags ADD UNIQUE KEY uq_flag_site (site_key, flag_key)'
      );
    } catch (_) {}
  } catch (e) {
    console.warn('[featureFlags] ensure table failed', e.message);
  }
}

// Cache structure: { site_key: { flag_key: { enabled, variant, updated_at } } }
const cache = new Map();
let lastPurge = Date.now();
const MAX_AGE_MS = 60_000; // 1 minute TTL

async function loadSite(siteKey) {
  await ensureTable();
  try {
    const [rows] = await pool.query(
      'SELECT flag_key, enabled, COALESCE(variant, "") variant, UNIX_TIMESTAMP(updated_at) u FROM feature_flags WHERE site_key=?',
      [siteKey]
    );
    const m = new Map();
    for (const r of rows) {
      m.set(r.flag_key, { enabled: !!r.enabled, variant: r.variant || null, updated_at: r.u });
    }
    cache.set(siteKey, { map: m, ts: Date.now() });
    return m;
  } catch (e) {
    return new Map();
  }
}

async function getFlag(siteKey, key) {
  const now = Date.now();
  if (now - lastPurge > 5 * MAX_AGE_MS) {
    // periodic purge
    for (const [k, v] of cache.entries()) if (now - v.ts > MAX_AGE_MS) cache.delete(k);
    lastPurge = now;
  }
  let entry = cache.get(siteKey);
  if (!entry || now - entry.ts > MAX_AGE_MS) {
    await loadSite(siteKey);
    entry = cache.get(siteKey);
  }
  const map = entry ? entry.map : new Map();
  return map.get(key) || { enabled: false, variant: null };
}

async function isEnabled(siteKey, key) {
  const f = await getFlag(siteKey, key);
  return !!f.enabled;
}
async function getVariant(siteKey, key) {
  const f = await getFlag(siteKey, key);
  return f.variant;
}

async function upsertFlag(siteKey, flagKey, enabled, variant, description) {
  await ensureTable();
  try {
    await pool.query(
      'INSERT INTO feature_flags (site_key, flag_key, enabled, variant, description) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled), variant=VALUES(variant), description=VALUES(description)',
      [siteKey, flagKey, enabled ? 1 : 0, variant || null, description || null]
    );
    // Audit log (lightweight; create table if missing)
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS feature_flag_audit (
        id INT AUTO_INCREMENT PRIMARY KEY,
        site_key VARCHAR(64) NOT NULL,
        flag_key VARCHAR(100) NOT NULL,
        action VARCHAR(16) NOT NULL,
        enabled TINYINT(1) NOT NULL,
        variant VARCHAR(64) NULL,
        description VARCHAR(255) NULL,
        user_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ff_audit_site_flag (site_key, flag_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
      await pool.query(
        'INSERT INTO feature_flag_audit (site_key, flag_key, action, enabled, variant, description, user_id) VALUES (?,?,?,?,?,?,?)',
        [siteKey, flagKey, 'upsert', enabled ? 1 : 0, variant || null, description || null, null]
      );
    } catch (_) {}
    // invalidate site cache
    cache.delete(siteKey);
    return true;
  } catch (e) {
    console.warn('[featureFlags] upsert fail', e.message);
    return false;
  }
}

async function listFlags(siteKey) {
  await ensureTable();
  try {
    const [rows] = await pool.query(
      'SELECT id, flag_key, enabled, variant, description, updated_at FROM feature_flags WHERE site_key=? ORDER BY flag_key ASC',
      [siteKey]
    );
    return rows;
  } catch (e) {
    return [];
  }
}

async function deleteFlag(siteKey, flagKey) {
  await ensureTable();
  try {
    await pool.query('DELETE FROM feature_flags WHERE site_key=? AND flag_key=?', [
      siteKey,
      flagKey,
    ]);
    cache.delete(siteKey);
    return true;
  } catch (e) {
    return false;
  }
}

async function recentAudit(siteKey, limit = 50) {
  try {
    const [rows] = await pool.query(
      'SELECT id, flag_key, action, enabled, variant, description, created_at FROM feature_flag_audit WHERE site_key=? ORDER BY id DESC LIMIT ' +
        Math.min(limit, 200),
      [siteKey]
    );
    return rows;
  } catch (e) {
    return [];
  }
}

function buildHydrator() {
  return async function featureFlagHydrator(req, res, next) {
    try {
      const site = req.siteKey || 'default';
      const list = await listFlags(site);
      const map = {};
      for (const f of list) map[f.flag_key] = !!f.enabled;
      res.locals.flags = map; // boolean map for quick conditionals
      res.locals.flagsList = list; // full objects if template wants variants
    } catch (_) {}
    next();
  };
}

module.exports = {
  ensureTable,
  isEnabled,
  getVariant,
  getFlag,
  upsertFlag,
  listFlags,
  deleteFlag,
  recentAudit,
  buildHydrator,
};
