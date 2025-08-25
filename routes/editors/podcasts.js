const express = require('express');
const router = express.Router();
const { pool, isEditor } = require('./_shared');
const { baseSlug } = require('../../lib/slug');

router.get('/podcasts', isEditor, async (req, res) => {
  try {
    try {
      await pool.query(
        'ALTER TABLE podcasts ADD COLUMN site_key VARCHAR(64) NOT NULL DEFAULT "default", ADD INDEX idx_podcasts_site (site_key)'
      );
    } catch (_) {}
    const [pods] = await pool.query(
      'SELECT * FROM podcasts WHERE site_key=? ORDER BY published_at DESC',
      [req.siteKey]
    );
    res.render('editors_podcasts', { title: 'Podcasts', podcasts: pods });
  } catch (e) {
    res.render('editors_podcasts', { title: 'Podcasts', podcasts: [] });
  }
});
router.get('/podcasts/new', isEditor, async (req, res) => {
  res.render('editors_edit_podcast', { title: 'Neuer Podcast', podcast: null });
});
router.post('/podcasts/new', isEditor, async (req, res) => {
  const {
    title,
    description,
    audio_url,
    tags,
    seo_title,
    seo_description,
    meta_keywords,
    published_at,
    slug,
  } = req.body;
  try {
    let s = baseSlug(slug || title || 'episode');
    // Ensure composite unique index (site_key, slug)
    try {
      await pool.query(
        'ALTER TABLE podcasts ADD UNIQUE INDEX uq_podcasts_site_slug (site_key, slug)'
      );
    } catch (_) {}
    // Loop uniqueness per site
    let i = 2;
    while (true) {
      const [rows] = await pool.query(
        'SELECT id FROM podcasts WHERE slug=? AND site_key=? LIMIT 1',
        [s, req.siteKey]
      );
      if (!rows.length) break;
      s = baseSlug(slug || title || 'episode') + '-' + i++;
    }
    await pool.query(
      'INSERT INTO podcasts (title, slug, description, audio_url, tags, seo_title, seo_description, meta_keywords, published_at, site_key) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [
        title,
        s,
        description,
        audio_url,
        tags,
        seo_title,
        seo_description,
        meta_keywords,
        published_at || new Date(),
        req.siteKey,
      ]
    );
    res.redirect('/editors/podcasts');
  } catch (e) {
    res.status(500).send('Podcast Create Fehler');
  }
});
router.get('/podcasts/edit/:id', isEditor, async (req, res) => {
  try {
    const [[podcast]] = await pool.query('SELECT * FROM podcasts WHERE id=? AND site_key=?', [
      req.params.id,
      req.siteKey,
    ]);
    if (!podcast) return res.status(404).send('Nicht gefunden');
    res.render('editors_edit_podcast', { title: 'Podcast bearbeiten', podcast });
  } catch (e) {
    res.status(500).send('Podcast Lade Fehler');
  }
});
router.post('/podcasts/edit/:id', isEditor, async (req, res) => {
  const {
    title,
    description,
    audio_url,
    tags,
    seo_title,
    seo_description,
    meta_keywords,
    published_at,
    slug,
  } = req.body;
  try {
    let s = baseSlug(slug || title || 'episode');
    try {
      await pool.query(
        'ALTER TABLE podcasts ADD UNIQUE INDEX uq_podcasts_site_slug (site_key, slug)'
      );
    } catch (_) {}
    const [exists] = await pool.query(
      'SELECT id FROM podcasts WHERE slug=? AND id<>? AND site_key=? LIMIT 1',
      [s, req.params.id, req.siteKey]
    );
    if (exists.length) {
      s = s + '-' + req.params.id;
    }
    await pool.query(
      'UPDATE podcasts SET title=?, slug=?, description=?, audio_url=?, tags=?, seo_title=?, seo_description=?, meta_keywords=?, published_at=? WHERE id=? AND site_key=?',
      [
        title,
        s,
        description,
        audio_url,
        tags,
        seo_title,
        seo_description,
        meta_keywords,
        published_at || new Date(),
        req.params.id,
        req.siteKey,
      ]
    );
    res.redirect('/editors/podcasts');
  } catch (e) {
    res.status(500).send('Podcast Update Fehler');
  }
});

module.exports = router;
