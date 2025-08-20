const express = require('express');
const router = express.Router();
// Hinweis: Wir nutzen bewusst bcryptjs (reines JS) statt nativer bcrypt-Binary wegen Shared Hosting (Netcup) Kompatibilität
const bcrypt = require('bcryptjs');
const pool = require('../db'); // Unser zentraler MySQL-Connection-Pool
// Helper zum Generieren von Cache Headers (Basis für statische Inhalte / Feeds)
function setShortCache(res){ res.set('Cache-Control','public, max-age=300, stale-while-revalidate=600'); }
function setFeedCache(res){ res.set('Cache-Control','public, max-age=900, stale-while-revalidate=1800'); }

// --- User Preferences (Theme, Panda's Way Progress) ---
async function ensureUserPreferencesTable(){
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INT PRIMARY KEY,
      theme VARCHAR(16) NOT NULL DEFAULT 'system',
      pandas_way_level INT NOT NULL DEFAULT 1,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_user_prefs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  } catch(e){ console.error('Prefs Table Fehler:', e.message); }
}
async function getUserPreferences(userId){
  if(!userId) return null;
  try { await ensureUserPreferencesTable(); const [rows] = await pool.query('SELECT * FROM user_preferences WHERE user_id=?',[userId]); return rows[0]||null; }
  catch(e){ return null; }
}
async function saveUserPreferences(userId, { theme, pandas_way_level }){
  if(!userId) return;
  await ensureUserPreferencesTable();
  const t = (theme||'system').toLowerCase();
  const allowed = new Set(['light','dark','system']);
  const finalTheme = allowed.has(t)? t : 'system';
  let lvl = parseInt(pandas_way_level,10); if(!lvl || lvl<1 || lvl>10) lvl = 1; // 1..10 plausible cap
  await pool.query(`INSERT INTO user_preferences (user_id, theme, pandas_way_level) VALUES (?,?,?)
    ON DUPLICATE KEY UPDATE theme=VALUES(theme), pandas_way_level=VALUES(pandas_way_level), updated_at=CURRENT_TIMESTAMP`, [userId, finalTheme, lvl]);
  return { theme: finalTheme, pandas_way_level: lvl };
}

// --- Account Hilfsfunktionen ---
function requireLogin(req, res, next){ if(req.session.userId) return next(); return res.redirect('/login'); }
async function ensureUserSoftDeleteColumns(){
  try { await pool.query('ALTER TABLE users ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0'); } catch(_) {}
}

// Account Seite
router.get('/account', requireLogin, async (req, res)=>{
  try {
    await ensureUserSoftDeleteColumns();
    const [rows] = await pool.query('SELECT id, username, is_deleted, created_at, updated_at FROM users WHERE id=?',[req.session.userId]);
    const user = rows[0] || null;
    const prefs = await getUserPreferences(req.session.userId);
    res.render('account', { title:'Account', user, prefs });
  } catch(e){ console.error('Account Load Fehler', e); res.status(500).send('Fehler Account'); }
});

// Export personenbezogener Daten (einfach JSON)
router.get('/account/export', requireLogin, async (req, res)=>{
  try {
    await ensureUserSoftDeleteColumns();
    const [users] = await pool.query('SELECT id, username, is_deleted, created_at, updated_at FROM users WHERE id=?',[req.session.userId]);
    const prefs = await getUserPreferences(req.session.userId);
    const exportObj = { user: users[0]||null, preferences: prefs||null, ai_calls: 'Aggregierte AI Logs sind anonymisiert / nicht usergebunden' };
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="account-export-'+req.session.userId+'.json"');
    res.send(JSON.stringify(exportObj, null, 2));
  } catch(e){ console.error('Export Fehler', e); res.status(500).send('Export Fehler'); }
});

// Konto löschen (Soft Delete + Anonymisierung)
router.post('/account/delete', requireLogin, async (req, res)=>{
  try {
    await ensureUserSoftDeleteColumns();
    const uid = req.session.userId;
    // User anonymisieren: username ersetzen, Passwort entwerten
    const anonUser = 'deleted_user_'+uid;
    await pool.query('UPDATE users SET username=?, password=REPEAT("x",60), is_deleted=1 WHERE id=?',[anonUser, uid]);
    // Präferenzen löschen
    try { await pool.query('DELETE FROM user_preferences WHERE user_id=?',[uid]); } catch(_) {}
    // Optional: Posts behalten, aber Kennzeichnung falls gewünscht (hier ausgelassen um minimalinvasiv zu bleiben)
    // Session zerstören
    req.session.destroy(()=>{});
    if(req.accepts('json')) return res.json({ ok:true, deleted:true });
    res.redirect('/');
  } catch(e){ console.error('Delete Fehler', e); res.status(500).send('Löschung fehlgeschlagen'); }
});

// Middleware, um den aktuellen Pfad für die Navigation verfügbar zu machen
router.use(async (req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.isLoggedIn = !!req.session.userId;
  if(req.session.userId){
    try { res.locals.userPrefs = await getUserPreferences(req.session.userId); }
    catch(e){ /* ignore */ }
  }
  next();
});

// API: Speichere Benutzer-Präferenzen (Theme / Panda Level)
router.post('/api/user/preferences', async (req, res) => {
  if(!req.session.userId) return res.status(401).json({ error:'Nicht eingeloggt' });
  try {
    const { theme, pandas_way_level } = req.body || {};
    const saved = await saveUserPreferences(req.session.userId, { theme, pandas_way_level });
    res.json({ ok:true, preferences: saved });
  } catch(e){
    console.error('Prefs Save Fehler:', e);
    res.status(500).json({ error:'Speichern fehlgeschlagen' });
  }
});

/*
 * Route für die Startseite
 * GET /
 * Ruft die neuesten Blog-Beiträge ab und zeigt sie an.
 */
router.get('/', async (req, res) => {
  try {
    // 1) Versuche explizit gesetzten Featured-Post zu holen
    let [featuredPostRows] = await pool.query(
      `SELECT p.*, m.path as featured_image_path
       FROM posts p
       LEFT JOIN media m ON p.featured_image_id = m.id
       WHERE p.status = 'published' AND (p.published_at IS NULL OR p.published_at <= NOW()) AND p.is_deleted=0 AND p.is_featured=1
       ORDER BY COALESCE(p.published_at, p.created_at) DESC
       LIMIT 1`
    );
    let featuredPost = featuredPostRows[0] || null;
    // 2) Fallback: falls keiner als featured markiert -> neuester Beitrag
    if(!featuredPost){
      [featuredPostRows] = await pool.query(
        `SELECT p.*, m.path as featured_image_path
         FROM posts p
         LEFT JOIN media m ON p.featured_image_id = m.id
         WHERE p.status = 'published' AND (p.published_at IS NULL OR p.published_at <= NOW()) AND p.is_deleted=0
         ORDER BY COALESCE(p.published_at, p.created_at) DESC
         LIMIT 1`
      );
      featuredPost = featuredPostRows[0] || null;
    }

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
    const pageSize = 10;
    const page = Math.max(1, parseInt(req.query.page||'1',10));
    const offset = (page-1)*pageSize;
    const [countRows] = await pool.query(`SELECT COUNT(*) as c FROM posts p WHERE p.status='published' AND (p.published_at IS NULL OR p.published_at<=NOW()) AND p.is_deleted=0`);
    const total = countRows[0].c || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const [posts] = await pool.query(
      `SELECT p.*, m.path as featured_image_path, COALESCE(p.published_at, p.created_at) AS createdAt
       FROM posts p
       LEFT JOIN media m ON p.featured_image_id = m.id
       WHERE p.status = 'published' AND (p.published_at IS NULL OR p.published_at <= NOW()) AND p.is_deleted=0
       ORDER BY COALESCE(p.published_at, p.created_at) DESC
       LIMIT ? OFFSET ?`, [pageSize, offset]
    );
    res.render('blog', { title: 'Blog', posts, page, totalPages, total });
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

// Podcast RSS Feed (verbessert, iTunes Felder, einfacher Memory Cache)
let podcastRssCache = { xml: null, generatedAt: 0 };
router.get('/podcast.rss', async (req, res) => {
  try {
    const now = Date.now();
    if(podcastRssCache.xml && (now - podcastRssCache.generatedAt) < 5*60*1000){
      res.set('Content-Type','application/rss+xml; charset=utf-8');
      return res.send(podcastRssCache.xml);
    }
    const [episodes] = await pool.query(`SELECT id, title, description, audio_url, published_at FROM podcasts ORDER BY published_at DESC LIMIT 100`);
    const siteUrl = (process.env.SITE_URL || (req.protocol + '://' + req.get('host'))).replace(/\/$/,'');
    const imageUrl = siteUrl + '/img/logo.png';
    const esc = s=> (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
    const buildItem = ep => {
      const link = `${siteUrl}/podcasts/${ep.id}`;
      const pub = ep.published_at ? new Date(ep.published_at).toUTCString() : new Date().toUTCString();
      return `<item>
  <title><![CDATA[${ep.title}]]></title>
  <link>${link}</link>
  <guid isPermaLink="false">podcast-${ep.id}</guid>
  <pubDate>${pub}</pubDate>
  <description><![CDATA[${ep.description || ''}]]></description>
  <enclosure url="${siteUrl}${ep.audio_url}" type="audio/mpeg" />
  <itunes:author>Purview Panda</itunes:author>
  <itunes:explicit>false</itunes:explicit>
  <itunes:episodeType>full</itunes:episodeType>
</item>`; };
    const itemsXml = episodes.map(buildItem).join('\n');
    const lastBuild = episodes.length ? new Date(episodes[0].published_at).toUTCString() : new Date().toUTCString();
    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Purview Panda Podcast</title>
    <link>${siteUrl}/podcasts</link>
    <atom:link href="${siteUrl}/podcast.rss" rel="self" type="application/rss+xml" />
    <language>de-de</language>
    <description>Podcast zu Datensicherheit &amp; Microsoft Purview</description>
    <itunes:summary>Datensicherheit, Governance, Purview Einblicke.</itunes:summary>
    <itunes:author>Purview Panda</itunes:author>
    <itunes:explicit>false</itunes:explicit>
    <itunes:image href="${imageUrl}" />
    <lastBuildDate>${lastBuild}</lastBuildDate>
    ${itemsXml}
  </channel>
</rss>`;
    podcastRssCache = { xml: rss, generatedAt: now };
  setFeedCache(res); res.set('Content-Type','application/rss+xml; charset=utf-8');
    res.send(rss);
  } catch (err) {
// Blog RSS Feed (14) – einfacher Feed für Artikel
let blogRssCache = { xml:null, ts:0 };
router.get('/blog.rss', async (req, res)=>{
  try {
    const now=Date.now(); if(blogRssCache.xml && (now-blogRssCache.ts)<5*60*1000){ setFeedCache(res); res.set('Content-Type','application/rss+xml; charset=utf-8'); return res.send(blogRssCache.xml); }
    const [posts] = await pool.query(`SELECT p.id, p.title, p.content, p.created_at, p.published_at, p.slug FROM posts p WHERE p.status='published' AND (p.published_at IS NULL OR p.published_at<=NOW()) AND p.is_deleted=0 ORDER BY COALESCE(p.published_at, p.created_at) DESC LIMIT 50`);
    const siteUrl = (process.env.SITE_URL || (req.protocol+'://'+req.get('host'))).replace(/\/$/,'');
    const items = posts.map(r=>{ const body=(r.content||'').replace(/<script[\s\S]*?<\/script>/gi,''); return `<item><title><![CDATA[${r.title}]]></title><link>${siteUrl}/blog#post-${r.id}</link><guid isPermaLink="false">post-${r.id}</guid><pubDate>${new Date(r.published_at||r.created_at).toUTCString()}</pubDate><description><![CDATA[${body.slice(0,1200)}]]></description></item>`; }).join('\n');
    const rss=`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Purview Panda Blog</title><link>${siteUrl}/blog</link><description>Aktuelle Beiträge</description>${items}</channel></rss>`;
    blogRssCache={xml:rss, ts:now}; setFeedCache(res); res.set('Content-Type','application/rss+xml; charset=utf-8'); res.send(rss);
  } catch(e){ console.error('Blog RSS Fehler', e); res.status(500).send('Blog RSS Fehler'); }
});

// Individual blog post by slug with SEO meta
router.get('/blog/:slug', async (req,res)=>{
  try {
    const slug = req.params.slug; if(!slug) return res.redirect('/blog');
    const [rows] = await pool.query(`SELECT p.*, m.path AS featured_image_path FROM posts p LEFT JOIN media m ON p.featured_image_id=m.id WHERE p.slug=? AND p.status='published' AND COALESCE(p.is_deleted,0)=0 LIMIT 1`, [slug]);
    if(!rows.length) return res.status(404).render('partials/error_404',{ title:'Nicht gefunden' });
    const post = rows[0];
    // Basic related posts (same tags)
    let related=[];
    if(post.tags){
      const firstTag = post.tags.split(',')[0];
      if(firstTag){
        const [rel] = await pool.query(`SELECT id,title,slug,whatsnew,published_at FROM posts WHERE id<>? AND tags LIKE ? AND status='published' AND COALESCE(is_deleted,0)=0 ORDER BY published_at DESC LIMIT 5`, [post.id, '%'+firstTag.trim()+'%']);
        related = rel;
      }
    }
    // Expose SEO fields
  const currentUrl = (process.env.SITE_URL || (req.protocol + '://' + req.get('host'))).replace(/\/$/,'') + req.originalUrl;
  res.render('blog_detail',{ title: post.seo_title || post.title, post, related, currentUrl, seo:{ title: post.seo_title||post.title, description: post.seo_description||post.whatsnew||'', keywords: post.meta_keywords||'', image: post.featured_image_path||'', url: currentUrl, type: 'article' } });
  } catch(e){ console.error('Slug route Fehler', e); res.status(500).render('partials/error_500',{ title:'Fehler', error:e }); }
});

// Public Advanced Page by slug
router.get('/pages/:slug', async (req,res)=>{
  const slug = req.params.slug;
  try {
    const [rows] = await pool.query('SELECT * FROM advanced_pages WHERE slug=? AND is_template=0 AND status="published" LIMIT 1',[slug]);
    if(!rows.length) return res.status(404).render('partials/error_404',{ title:'Seite nicht gefunden' });
    const page = rows[0];
  const currentUrl = (process.env.SITE_URL || (req.protocol + '://' + req.get('host'))).replace(/\/$/,'') + req.originalUrl;
  const fallbackDesc = (page.rendered_html||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,180);
  const seo = { title: page.seo_title||page.title, description: page.seo_description||fallbackDesc, keywords: page.meta_keywords||'', image: page.meta_image||'', url: currentUrl, type:'website' };
    res.render('advanced_page_public', { title: page.title, page, currentUrl, seo });
  } catch(e){ console.error('Public adv page Fehler', e); res.status(500).render('partials/error_500',{ title:'Fehler', error:e }); }
});

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

// Timeline + Glass Hybrid (ALT 5) – dynamische Einträge aus MySQL
router.get('/pandas-way-alt5', async (req, res) => {
  try {
    // Tabelle (falls noch nicht) erstellen
    await pool.query(`CREATE TABLE IF NOT EXISTS timeline_entries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      site_key VARCHAR(64) NOT NULL,
      position INT NOT NULL DEFAULT 0,
      title VARCHAR(255) NOT NULL,
      phase VARCHAR(100) NULL,
      content_html MEDIUMTEXT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX (site_key), INDEX(position)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
    await pool.query(`CREATE TABLE IF NOT EXISTS timeline_site_config (
      site_key VARCHAR(64) PRIMARY KEY,
      level_count INT NOT NULL DEFAULT 3,
      design_theme VARCHAR(32) NOT NULL DEFAULT 'glass',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
    await pool.query(`CREATE TABLE IF NOT EXISTS timeline_levels (
      id INT AUTO_INCREMENT PRIMARY KEY,
      site_key VARCHAR(64) NOT NULL,
      level_index INT NOT NULL,
      title VARCHAR(255) NOT NULL DEFAULT '',
      content_html MEDIUMTEXT NULL,
      image_path VARCHAR(255) NULL,
      UNIQUE KEY uniq_level (site_key, level_index),
      INDEX(site_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  // level-Spalte sicherstellen (für öffentliches Filtern)
  try { await pool.query('ALTER TABLE timeline_entries ADD COLUMN level INT NOT NULL DEFAULT 1 AFTER site_key'); } catch(_) {}
  let [rows] = await pool.query('SELECT id, position, title, phase, content_html, level FROM timeline_entries WHERE site_key=? AND is_active=1 ORDER BY position ASC, id ASC', ['pandas_way_5']);
    if(!rows.length){
      // Beispiel-Einträge initial erstellen (verteilt auf 3 Level zur Demonstration)
      const seed = [
        {position:0,level:1,title:'Bewusstsein',phase:'Initiate',html:'<p>Warum Schutz? Stories & Risiken sichtbar machen.</p>'},
        {position:1,level:1,title:'Inventar',phase:'Foundation',html:'<p>Systeme & Datenquellen katalogisieren.</p>'},
        {position:2,level:2,title:'Kontrollen',phase:'Foundation',html:'<p>Passwörter, MFA, Verschlüsselung etablieren.</p>'},
        {position:3,level:2,title:'Klassifizierung',phase:'Evolve',html:'<p>Labels & Schutzprofile definieren.</p>'},
        {position:4,level:3,title:'Detektion',phase:'Evolve',html:'<p>Logging + Baselines für Anomalien.</p>'}
      ];
      for(const s of seed){
        await pool.query('INSERT INTO timeline_entries (site_key, position, level, title, phase, content_html) VALUES (?,?,?,?,?,?)',[ 'pandas_way_5', s.position, s.level, s.title, s.phase, s.html]);
      }
      ;[rows] = await pool.query('SELECT id, position, title, phase, content_html, level FROM timeline_entries WHERE site_key=? AND is_active=1 ORDER BY position ASC, id ASC', ['pandas_way_5']);
    }
    // Site Config + Level Metadaten laden
    let [cfgRows] = await pool.query('SELECT * FROM timeline_site_config WHERE site_key=?',['pandas_way_5']);
    if(!cfgRows.length){
      await pool.query('INSERT INTO timeline_site_config (site_key, level_count, design_theme) VALUES (?,?,?)',[ 'pandas_way_5', 3, 'glass']);
      ;[cfgRows] = await pool.query('SELECT * FROM timeline_site_config WHERE site_key=?',['pandas_way_5']);
    }
    const siteCfg = cfgRows[0];
    // Sicherstellen Level Records existieren
    for(let i=1;i<=siteCfg.level_count;i++){
      const [exists] = await pool.query('SELECT id FROM timeline_levels WHERE site_key=? AND level_index=?',[ 'pandas_way_5', i]);
      if(!exists.length){ await pool.query('INSERT INTO timeline_levels (site_key, level_index, title) VALUES (?,?,?)',[ 'pandas_way_5', i, 'Level '+i]); }
    }
  const [levelRows] = await pool.query('SELECT level_index, title, image_path, icon FROM timeline_levels WHERE site_key=? ORDER BY level_index ASC',[ 'pandas_way_5' ]);
  // Render nun mit allen benötigten Variablen (statt nachträglichem res.locals Setzen)
  res.render('pandas_way_alt5', { title: "Panda's Way – ALT 5", entries: rows, timelineSiteConfig: siteCfg, timelineLevels: levelRows });
  } catch (e) {
    console.error('Fehler ALT5:', e);
    res.status(500).render('partials/error_500', { title:'Fehler', error:e });
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
