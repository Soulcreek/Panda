// Multi-tenant isolation tests focusing on slug uniqueness per site.
const pool = require('../db');

describe('Multi-tenant slug isolation', () => {
  const table = 'advanced_pages';
  const siteA = 'isotest_a';
  const siteB = 'isotest_b';
  beforeAll(async () => {
    const { ensureAdvancedPagesTables } = require('../lib/advancedPagesUtil');
    await ensureAdvancedPagesTables();
  });
  test('same slug allowed on different sites', async () => {
    const slug = 'duplicate-slug';
    await pool.query('DELETE FROM ' + table + ' WHERE site_key IN (?,?)', [siteA, siteB]);
    await pool.query('INSERT INTO ' + table + ' (title, slug, site_key) VALUES (?,?,?)', [
      slug,
      slug,
      siteA,
    ]);
    await pool.query('INSERT INTO ' + table + ' (title, slug, site_key) VALUES (?,?,?)', [
      slug,
      slug,
      siteB,
    ]);
    const [rows] = await pool.query(
      'SELECT site_key, slug FROM ' + table + ' WHERE slug=? AND site_key IN (?,?)',
      [slug, siteA, siteB]
    );
    expect(rows.length).toBe(2);
  });
});
