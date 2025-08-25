// Multi-tenant helper utilities (foundational / partial implementation)
const inspectedTables = new Map();
async function ensureSiteKeyColumn(pool, table) {
  if (inspectedTables.has(table) && inspectedTables.get(table).hasSiteKey) return true;
  try {
    const [rows] = await pool.query(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name=?',
      [table]
    );
    const cols = new Set(rows.map((r) => r.COLUMN_NAME || r.column_name));
    let hasSiteKey = cols.has('site_key');
    if (!hasSiteKey) {
      try {
        await pool.query(
          `ALTER TABLE \`${table}\` ADD COLUMN site_key VARCHAR(64) NOT NULL DEFAULT 'default', ADD INDEX idx_${table}_site (site_key)`
        );
        hasSiteKey = true;
      } catch (_) {}
    }
    inspectedTables.set(table, { hasSiteKey, lastChecked: new Date() });
    return hasSiteKey;
  } catch (e) {
    return false;
  }
}
function resolveSiteKey(req) {
  const hdr = (req.get('X-Site-Key') || '').trim();
  if (hdr) return sanitize(hdr);
  if (req.query && req.query.site) return sanitize(req.query.site);
  const host = (req.hostname || '').toLowerCase();
  const parts = host.split('.');
  if (parts.length > 2) {
    const sub = parts[0];
    if (sub && sub !== 'www') return sanitize(sub);
  }
  return 'default';
}
function sanitize(k) {
  return (
    (k || '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 64) || 'default'
  );
}
async function ensureMultiTenant(pool) {
  const tables = [
    'posts',
    'media',
    'podcasts',
    'advanced_pages',
    'advanced_page_generation_logs',
    'ai_usage',
    'ai_usage_log',
    'media_categories',
    'timeline_entries',
    'timeline_levels',
  ];
  await Promise.all(tables.map((t) => ensureSiteKeyColumn(pool, t)));
}
module.exports = { resolveSiteKey, ensureMultiTenant };
