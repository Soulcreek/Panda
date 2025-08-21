const express = require('express');
const pool = require('../../db');
const router = express.Router();

let podcastRssCache = { xml: null, generatedAt: 0 };
function setFeedCache(res){ res.set('Cache-Control','public, max-age=900, stale-while-revalidate=1800'); }

// Podcasts list
router.get('/podcasts', async (req, res) => {
  try {
  const [podcasts] = await pool.query(`SELECT id, slug, title, description, audio_url, published_at, seo_title, seo_description FROM podcasts ORDER BY published_at DESC`);
    res.render('podcasts', { title: 'Podcasts', podcasts });
  } catch (err) {
    console.error('Fehler beim Laden der Podcast-Seite:', err);
    res.status(500).send('Ein interner Fehler ist aufgetreten.');
  }
});

// Podcast detail
// Podcast detail by id or slug
router.get('/podcasts/:slugOrId', async (req, res) => {
  try {
    const key = req.params.slugOrId;
    const isId = /^\d+$/.test(key);
    const [rows] = isId ? await pool.query('SELECT id, slug, title, description, audio_url, published_at, seo_title, seo_description, meta_keywords FROM podcasts WHERE id=? LIMIT 1',[key])
                       : await pool.query('SELECT id, slug, title, description, audio_url, published_at, seo_title, seo_description, meta_keywords FROM podcasts WHERE slug=? LIMIT 1',[key]);
    if (!rows.length) return res.status(404).render('partials/error_404', { title: 'Episode nicht gefunden' });
    const ep = rows[0];
    // Canonical redirect if accessed by id but slug exists
    if(isId && ep.slug){ return res.redirect(301, '/podcasts/'+ep.slug); }
    const meta = { title: ep.seo_title || ep.title, description: ep.seo_description || (ep.description||'').slice(0,160), keywords: ep.meta_keywords||'' };
    res.render('podcast_detail', { title: meta.title, episode: ep, meta });
  } catch (err) {
    console.error('Fehler beim Laden der Episode:', err);
    res.status(500).render('partials/error_500', { title: 'Fehler', error: err });
  }
});

// Podcast RSS
router.get('/podcast.rss', async (req, res) => {
  try {
    const now = Date.now();
    if(podcastRssCache.xml && (now - podcastRssCache.generatedAt) < 5*60*1000){
      res.set('Content-Type','application/rss+xml; charset=utf-8');
      return res.send(podcastRssCache.xml);
    }
  const [episodes] = await pool.query(`SELECT id, slug, title, description, audio_url, published_at FROM podcasts ORDER BY published_at DESC LIMIT 100`);
    const siteUrl = (process.env.SITE_URL || (req.protocol + '://' + req.get('host'))).replace(/\/$/,'');
    const imageUrl = siteUrl + '/img/logo.png';
    const buildItem = ep => {
  const link = `${siteUrl}/podcasts/${ep.slug || ep.id}`;
      const pub = ep.published_at ? new Date(ep.published_at).toUTCString() : new Date().toUTCString();
      return `<item>\n  <title><![CDATA[${ep.title}]]></title>\n  <link>${link}</link>\n  <guid isPermaLink="false">podcast-${ep.id}</guid>\n  <pubDate>${pub}</pubDate>\n  <description><![CDATA[${ep.description || ''}]]></description>\n  <enclosure url="${siteUrl}${ep.audio_url}" type="audio/mpeg" />\n  <itunes:author>Purview Panda</itunes:author>\n  <itunes:explicit>false</itunes:explicit>\n  <itunes:episodeType>full</itunes:episodeType>\n</item>`; };
    const itemsXml = episodes.map(buildItem).join('\n');
    const lastBuild = episodes.length ? new Date(episodes[0].published_at).toUTCString() : new Date().toUTCString();
    const rss = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>Purview Panda Podcast</title>\n    <link>${siteUrl}/podcasts</link>\n    <atom:link href="${siteUrl}/podcast.rss" rel="self" type="application/rss+xml" />\n    <language>de-de</language>\n    <description>Podcast zu Datensicherheit &amp; Microsoft Purview</description>\n    <itunes:summary>Datensicherheit, Governance, Purview Einblicke.</itunes:summary>\n    <itunes:author>Purview Panda</itunes:author>\n    <itunes:explicit>false</itunes:explicit>\n    <itunes:image href="${imageUrl}" />\n    <lastBuildDate>${lastBuild}</lastBuildDate>\n    ${itemsXml}\n  </channel>\n</rss>`;
    podcastRssCache = { xml: rss, generatedAt: now };
    setFeedCache(res); res.set('Content-Type','application/rss+xml; charset=utf-8');
    res.send(rss);
  } catch (err) {
    console.error('Fehler beim Generieren des Podcast RSS:', err);
    res.status(500).send('RSS Feed Fehler');
  }
});

module.exports = router;
