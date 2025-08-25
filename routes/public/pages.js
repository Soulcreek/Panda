const express = require('express');
const pool = require('../../db');
const router = express.Router();

// Public advanced page by slug
router.get('/pages/:slug', async (req, res) => {
  const slug = req.params.slug;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM advanced_pages WHERE slug=? AND is_template=0 AND status="published" LIMIT 1',
      [slug]
    );
    if (!rows.length)
      return res.status(404).render('partials/error_404', { title: 'Seite nicht gefunden' });
    const page = rows[0];
    const currentUrl =
      (process.env.SITE_URL || req.protocol + '://' + req.get('host')).replace(/\/$/, '') +
      req.originalUrl;
    const fallbackDesc = (page.rendered_html || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);
    const seo = {
      title: page.seo_title || page.title,
      description: page.seo_description || fallbackDesc,
      keywords: page.meta_keywords || '',
      image: page.meta_image || '',
      url: currentUrl,
      type: 'website',
    };
    res.render('advanced_page_public', { title: page.title, page, currentUrl, seo });
  } catch (e) {
    console.error('Public adv page Fehler', e);
    res.status(500).render('partials/error_500', { title: 'Fehler', error: e });
  }
});

module.exports = router;
