const express = require('express');
const router = express.Router();
// Hinweis: Wir nutzen bewusst bcryptjs (reines JS) statt nativer bcrypt-Binary wegen Shared Hosting (Netcup) Kompatibilität
const bcrypt = require('bcryptjs');
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
       WHERE p.status = 'published' AND (p.published_at IS NULL OR p.published_at <= NOW()) AND p.is_deleted=0
       ORDER BY COALESCE(p.published_at, p.created_at) DESC
       LIMIT 1`
    );
    
    const featuredPost = featuredPostRows[0] || null;

    // Abfrage für die Liste der neuesten Beiträge (ohne den Hauptbeitrag)
    const [latestPostsRows] = await pool.query(
      `SELECT p.*, m.path as featured_image_path
       FROM posts p
       LEFT JOIN media m ON p.featured_image_id = m.id
       WHERE p.status = 'published' AND (p.published_at IS NULL OR p.published_at <= NOW()) AND p.is_deleted=0 AND p.id != ?
       ORDER BY COALESCE(p.published_at, p.created_at) DESC
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
       WHERE p.status = 'published' AND (p.published_at IS NULL OR p.published_at <= NOW()) AND p.is_deleted=0
       ORDER BY COALESCE(p.published_at, p.created_at) DESC`
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

// Tag Ansicht: /blog/tag/:tagName
router.get('/blog/tag/:tag', async (req, res) => {
  const tag = req.params.tag.trim();
  try {
    let sql = `SELECT p.*, m.path as featured_image_path
               FROM posts p
               LEFT JOIN media m ON p.featured_image_id = m.id
               WHERE p.status='published' AND (p.published_at IS NULL OR p.published_at <= NOW()) AND p.is_deleted=0 AND p.tags LIKE ?
               ORDER BY COALESCE(p.published_at, p.created_at) DESC`;
    let rows;
    try { [rows] = await pool.query(sql, ['%'+tag+'%']); }
    catch(e){
      if(e.code==='ER_BAD_FIELD_ERROR' && e.message.includes('p.tags')) { rows=[]; }
      else throw e;
    }
    res.render('blog_tag', { title: `Tag: ${tag}`, posts: rows, tagName: tag });
  } catch (e) {
    console.error('Fehler Tag-Ansicht:', e);
    res.status(500).send('Fehler bei Tag Filter');
  }
});

// Globale Suche (Titel, Inhalt, Tags) - GET /search?q=...
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if(!q) return res.redirect('/blog');
  const like = '%'+q+'%';
  try {
    let base = `SELECT p.*, m.path as featured_image_path
                FROM posts p
                LEFT JOIN media m ON p.featured_image_id = m.id
                WHERE p.status='published' AND (p.published_at IS NULL OR p.published_at <= NOW()) AND p.is_deleted=0`;
    let whereParts = ['(p.title LIKE ? OR p.content LIKE ?'];
    let params = [like, like];
    // optional tags
    try {
      // Test ob Feld existiert (einmaliger simpler Query)
      await pool.query('SELECT p.tags FROM posts p LIMIT 1');
      whereParts[0] += ' OR p.tags LIKE ?';
      params.push(like);
    } catch(e){ /* ignore if column missing */ }
    whereParts[0] += ')';
    const finalSql = base + ' AND ' + whereParts.join(' AND ') + ' ORDER BY COALESCE(p.published_at, p.created_at) DESC LIMIT 100';
    const [rows] = await pool.query(finalSql, params);
    res.render('blog_search_results', { title: 'Suche', posts: rows, searchTerm: q });
  } catch (e) {
    console.error('Fehler globale Suche:', e);
    res.status(500).send('Fehler bei der Suche');
  }
});

// Einzelner Blogpost als JSON für Modal (veröffentlicht)
router.get('/api/blog/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id,10);
    if(isNaN(id)) return res.status(400).json({error:'Bad id'});
  let sql = `SELECT p.id, p.title, p.content, p.title_en, p.content_en, p.created_at AS createdAt, p.tags, m.path AS featured_image_path
       FROM posts p
       LEFT JOIN media m ON p.featured_image_id = m.id
     WHERE p.id = ? AND p.status = 'published' AND (p.published_at IS NULL OR p.published_at <= NOW()) AND p.is_deleted=0
       LIMIT 1`;
    let rows;
    try { [rows] = await pool.query(sql,[id]); }
    catch(e){
      if(e.code==='ER_BAD_FIELD_ERROR' && e.message.includes("p.tags")) {
  sql = `SELECT p.id, p.title, p.content, p.title_en, p.content_en, p.created_at AS createdAt, '' AS tags, m.path AS featured_image_path FROM posts p LEFT JOIN media m ON p.featured_image_id = m.id WHERE p.id=? AND p.status='published' AND (p.published_at IS NULL OR p.published_at <= NOW()) AND p.is_deleted=0 LIMIT 1`;
        [rows] = await pool.query(sql,[id]);
      } else { throw e; }
    }
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const post = rows[0];
    // Minimal Validierung
    if(!post.content){ console.warn('Post ohne content', post.id); }
    res.json({ id: post.id, title: post.title, content: post.content || '<p>(Kein Inhalt)</p>', image_path: post.featured_image_path || null, tags: post.tags || '', createdAt: post.createdAt });
  } catch (e) {
    console.error('Blog API Fehler:', e.message);
    res.status(500).json({ error: 'Server', details: process.env.NODE_ENV==='development'? e.message: undefined });
  }
});

// Öffentliche Media-Liste (nur grundlegende Felder) – für Blog Popups wenn nötig
router.get('/api/media', async (req, res) => {
  try {
    const { type } = req.query;
    let sql = "SELECT id, name, type, path FROM media";
    const params = [];
    const where = [];
    if (type === 'image') where.push("type LIKE 'image/%'");
    if (type === 'audio') where.push("type LIKE 'audio/%'");
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY uploaded_at DESC LIMIT 200';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error:'Media Fehler'});
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

// Alternative Design Previews (statisch, keine DB notwendig)
router.get('/pandas-way-alt1', (req, res) => {
  res.render('pandas_way_alt1', { title: "Panda's Way – ALT 1" });
});

router.get('/pandas-way-alt2', (req, res) => {
  res.render('pandas_way_alt2', { title: "Panda's Way – ALT 2" });
});

router.get('/pandas-way-alt3', (req, res) => {
  res.render('pandas_way_alt3', { title: "Panda's Way – ALT 3" });
});

router.get('/pandas-way-alt4', (req, res) => {
  res.render('pandas_way_alt4', { title: "Panda's Way – ALT 4" });
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

// --- AUTH ROUTES ---
router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/admin');
  res.render('login', { title: 'Login', error: null });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    if (!rows.length) return res.status(401).render('login', { title: 'Login', error: 'Ungültige Zugangsdaten' });
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).render('login', { title: 'Login', error: 'Ungültige Zugangsdaten' });
    req.session.userId = user.id;
    req.session.isLoggedIn = true;
    res.redirect('/admin');
  } catch (err) {
    console.error('Login Fehler:', err);
    res.status(500).render('login', { title: 'Login', error: 'Interner Fehler' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/')); 
});

router.get('/register', (req, res) => {
  res.render('register', { title: 'Registrieren', error: null });
});

router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).render('register', { title: 'Registrieren', error: 'Alle Felder erforderlich' });
  try {
    const hash = await bcrypt.hash(password, 12);
    await pool.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash]);
    res.redirect('/login');
  } catch (err) {
    console.error('Register Fehler:', err);
    const msg = err.code === 'ER_DUP_ENTRY' ? 'Benutzername bereits vergeben' : 'Interner Fehler';
    res.status(500).render('register', { title: 'Registrieren', error: msg });
  }
});


module.exports = router;
