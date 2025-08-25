const express = require('express');
const pool = require('../../db');
const router = express.Router();

// Simple in-memory rate limiter (IP based) – lightweight (reset every minute)
const rateState = {};
const LIMIT = parseInt(process.env.PUBLIC_API_RPM || '120', 10); // requests per minute per IP
setInterval(() => {
  for (const k of Object.keys(rateState)) {
    if (Date.now() - rateState[k].ts > 60 * 1000) delete rateState[k];
  }
}, 30 * 1000);
function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'anon';
  let entry = rateState[ip];
  if (!entry || Date.now() - entry.ts > 60 * 1000) {
    entry = { ts: Date.now(), c: 0 };
    rateState[ip] = entry;
  }
  entry.c++;
  if (entry.c > LIMIT) {
    return res.status(429).json({
      error: 'Rate Limit',
      code: 'RATE_LIMIT',
      detail: 'Zu viele Anfragen, warte eine Minute.',
    });
  }
  next();
}

router.use('/api/v1', rateLimit);

// GET /api/v1/posts?limit=20&offset=0
router.get('/api/v1/posts', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset = Math.max(0, parseInt(req.query.offset || '0', 10));
    const [rows] = await pool.query(
      `SELECT p.id, p.slug, p.title, p.seo_title, p.whatsnew, p.published_at, p.created_at, p.meta_keywords, m.path AS featured_image_path
      FROM posts p
      LEFT JOIN media m ON p.featured_image_id = m.id
      WHERE p.status='published' AND (p.published_at IS NULL OR p.published_at<=NOW()) AND p.is_deleted=0
      ORDER BY COALESCE(p.published_at, p.created_at) DESC
      LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    res.json({ items: rows, limit, offset, count: rows.length });
  } catch (e) {
    res.status(500).json({ error: 'Posts Fetch Fehler', code: 'POSTS_FETCH', detail: e.message });
  }
});

// GET /api/v1/posts/:id (numeric) or slug
router.get('/api/v1/posts/:idOrSlug', async (req, res) => {
  try {
    const idOrSlug = req.params.idOrSlug;
    const isId = /^\d+$/.test(idOrSlug);
    const where = isId ? 'p.id=?' : 'p.slug=?';
    const [rows] = await pool.query(
      `SELECT p.id, p.slug, p.title, p.content, p.seo_title, p.seo_description, p.whatsnew, p.published_at, p.created_at, p.meta_keywords, m.path AS featured_image_path
      FROM posts p
      LEFT JOIN media m ON p.featured_image_id=m.id
      WHERE ${where} AND p.status='published' AND (p.published_at IS NULL OR p.published_at<=NOW()) AND p.is_deleted=0 LIMIT 1`,
      [idOrSlug]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found', code: 'POST_NOT_FOUND' });
    const post = rows[0];
    // Basic sanitization: Remove script tags from content
    post.content = (post.content || '').replace(/<script[\s\S]*?<\/script>/gi, '');
    res.json(post);
  } catch (e) {
    res.status(500).json({ error: 'Post Fetch Fehler', code: 'POST_FETCH', detail: e.message });
  }
});

// GET /api/v1/media?type=image|audio&limit=50
router.get('/api/v1/media', async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const type = req.query.type;
    let sql = 'SELECT id, name, type, path, uploaded_at FROM media';
    const cond = [];
    if (type === 'image') cond.push("type LIKE 'image/%'");
    if (type === 'audio') cond.push("type LIKE 'audio/%'");
    if (cond.length) sql += ' WHERE ' + cond.join(' AND ');
    sql += ' ORDER BY uploaded_at DESC LIMIT ?';
    const [rows] = await pool.query(sql, [limit]);
    res.json({ items: rows, limit, count: rows.length });
  } catch (e) {
    res.status(500).json({ error: 'Media Fetch Fehler', code: 'MEDIA_FETCH', detail: e.message });
  }
});

module.exports = router;
