const express = require('express');
const router = express.Router();
const pool = require('../db'); // Unser zentraler MySQL-Connection-Pool

// Middleware, um den aktuellen Pfad für die Navigation verfügbar zu machen
router.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

/*
 * Route für die Startseite
 * GET /
 * Ruft die neuesten Blog-Beiträge ab und zeigt sie an.
 */
router.get('/', async (req, res) => {
  try {
    // Abfrage für den Hauptbeitrag (der neueste veröffentlichte Beitrag)
    const [featuredPostRows] = await pool.query(
      `SELECT p.*, m.path as featured_image_path
       FROM posts p
       LEFT JOIN media m ON p.featured_image_id = m.id
       WHERE p.status = 'published'
       ORDER BY p.created_at DESC
       LIMIT 1`
    );
    
    const featuredPost = featuredPostRows[0] || null;

    // Abfrage für die Liste der neuesten Beiträge (ohne den Hauptbeitrag)
    const [latestPostsRows] = await pool.query(
      `SELECT p.*, m.path as featured_image_path
       FROM posts p
       LEFT JOIN media m ON p.featured_image_id = m.id
       WHERE p.status = 'published' AND p.id != ?
       ORDER BY p.created_at DESC
       LIMIT 4`,
      [featuredPost ? featuredPost.id : 0]
    );

    // Rendere die index.ejs-Vorlage und übergib die abgerufenen Daten
    res.render('index', {
      title: 'Startseite',
      featuredPost: featuredPost,
      latestPosts: latestPostsRows
    });

  } catch (err) {
    console.error("Fehler beim Laden der Startseite:", err);
    // Sende den Fehler auch an den Browser, da Logs nicht sichtbar sind
    res.status(500).json({ 
        message: "Ein interner Fehler ist aufgetreten.",
        error: err.message,
        stack: err.stack
    });
  }
});

/*
 * Route für die Blog-Übersichtsseite
 * GET /blog
 */
router.get('/blog', async (req, res) => {
  try {
    // Hole alle veröffentlichten Beiträge, sortiert nach dem neuesten Datum
    const [posts] = await pool.query(
      `SELECT p.*, m.path as featured_image_path
       FROM posts p
       LEFT JOIN media m ON p.featured_image_id = m.id
       WHERE p.status = 'published'
       ORDER BY p.created_at DESC`
    );
    res.render('blog', {
      title: 'Blog',
      posts: posts
    });
  } catch (err) {
    console.error("Fehler beim Laden der Blog-Seite:", err);
    res.status(500).send("Ein interner Fehler ist aufgetreten.");
  }
});

/*
 * Route für die Podcast-Seite
 * GET /podcasts
 */
router.get('/podcasts', async (req, res) => {
  try {
    // Hole alle Podcasts, sortiert nach dem neuesten Datum
    const [podcasts] = await pool.query(
      `SELECT id, title, description, audio_url, published_at FROM podcasts ORDER BY published_at DESC`
    );
    res.render('podcasts', {
      title: 'Podcasts',
      podcasts: podcasts
    });
  } catch (err) {
    console.error("Fehler beim Laden der Podcast-Seite:", err);
    res.status(500).send("Ein interner Fehler ist aufgetreten.");
  }
});

// Einzelne Podcast Episode (SEO-freundlich via ID, später slug-spalte möglich)
router.get('/podcasts/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT id, title, description, audio_url, published_at FROM podcasts WHERE id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).render('partials/error_404', { title: 'Episode nicht gefunden' });
    res.render('podcast_detail', { title: rows[0].title, episode: rows[0] });
  } catch (err) {
    console.error('Fehler beim Laden der Episode:', err);
    res.status(500).render('partials/error_500', { title: 'Fehler', error: err });
  }
});

// RSS Feed (Podcast)
router.get('/podcast.rss', async (req, res) => {
  try {
    const [episodes] = await pool.query(`SELECT id, title, description, audio_url, published_at FROM podcasts ORDER BY published_at DESC LIMIT 50`);
    const siteUrl = process.env.SITE_URL || 'https://example.com';
    const rssItems = episodes.map(ep => `\n<item>\n<title><![CDATA[${ep.title}]]></title>\n<link>${siteUrl}/podcasts/${ep.id}</link>\n<guid>${siteUrl}/podcasts/${ep.id}</guid>\n<pubDate>${new Date(ep.published_at).toUTCString()}</pubDate>\n<description><![CDATA[${ep.description || ''}]]></description>\n<enclosure url="${siteUrl}${ep.audio_url}" type="audio/mpeg"/>\n</item>`).join('\n');
    const rss = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n<channel>\n<title>Purview Panda Podcast</title>\n<link>${siteUrl}/podcasts</link>\n<description>Podcast zu Datensicherheit & Microsoft Purview</description>\n<language>de-de</language>${rssItems}\n</channel>\n</rss>`;
    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(rss);
  } catch (err) {
    console.error('Fehler beim Generieren des RSS Feeds:', err);
    res.status(500).send('RSS Feed Fehler');
  }
});

/*
 * Route für die "Panda's Way"-Seite
 * GET /pandas-way
 */
router.get('/pandas-way', async (req, res) => {
  try {
    // Hole alle Inhalts-Level, sortiert nach der Anzeigereihenfolge
    const [levels] = await pool.query(
      `SELECT * FROM pandas_way_levels ORDER BY display_order ASC`
    );
    res.render('pandas_way', {
      title: 'Panda\'s Way',
      levels: levels
    });
  } catch (err) {
    console.error("Fehler beim Laden der Panda's Way Seite:", err);
    res.status(500).send("Ein interner Fehler ist aufgetreten.");
  }
});


// --- Statische Seiten ohne Datenbank-Logik ---

router.get('/purview', (req, res) => {
  res.render('purview', { title: 'Microsoft Purview' });
});

router.get('/autor', (req, res) => {
  res.render('autor', { title: 'Über den Autor' });
});

router.get('/impressum', (req, res) => {
  res.render('impressum', { title: 'Impressum' });
});

module.exports = router;
