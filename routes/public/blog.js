const express = require('express');
const pool = require('../../db');
const router = express.Router();

function setFeedCache(res){ res.set('Cache-Control','public, max-age=900, stale-while-revalidate=1800'); }

// Home / index (featured + latest)
router.get('/', async (req, res) => {
  try {
    let [featuredPostRows] = await pool.query(
      `SELECT p.*, m.path as featured_image_path
       FROM posts p
       LEFT JOIN media m ON p.featured_image_id = m.id
       WHERE p.status = 'published' AND (p.published_at IS NULL OR p.published_at <= NOW()) AND p.is_deleted=0 AND p.is_featured=1
       ORDER BY COALESCE(p.published_at, p.created_at) DESC
       LIMIT 1`);
    let featuredPost = featuredPostRows[0] || null;
    if(!featuredPost){
      [featuredPostRows] = await pool.query(
        `SELECT p.*, m.path as featured_image_path
         FROM posts p
         LEFT JOIN media m ON p.featured_image_id = m.id
         WHERE p.status = 'published' AND (p.published_at IS NULL OR p.published_at <= NOW()) AND p.is_deleted=0
         ORDER BY COALESCE(p.published_at, p.created_at) DESC
         LIMIT 1`);
      featuredPost = featuredPostRows[0] || null;
    }
    const [latestPostsRows] = await pool.query(
      `SELECT p.*, m.path as featured_image_path
       FROM posts p
       LEFT JOIN media m ON p.featured_image_id = m.id
       WHERE p.status = 'published' AND (p.published_at IS NULL OR p.published_at <= NOW()) AND p.is_deleted=0 AND p.id != ?
       ORDER BY COALESCE(p.published_at, p.created_at) DESC
       LIMIT 4`, [featuredPost ? featuredPost.id : 0]);
    res.render('index', { title: 'Startseite', featuredPost, latestPosts: latestPostsRows });
  } catch (err) {
    console.error('Fehler Startseite:', err);
    res.status(500).json({ message:'Interner Fehler', error: err.message });
  }
});

// Blog overview
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
       LIMIT ? OFFSET ?`, [pageSize, offset]);
    res.render('blog', { title: 'Blog', posts, page, totalPages, total });
  } catch (err) {
    console.error('Fehler Blog Übersicht:', err);
    res.status(500).send('Interner Fehler');
  }
});

// Tag view
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
    catch(e){ if(e.code==='ER_BAD_FIELD_ERROR' && e.message.includes('p.tags')) { rows=[]; } else throw e; }
    res.render('blog_tag', { title: `Tag: ${tag}`, posts: rows, tagName: tag });
  } catch (e) {
    console.error('Fehler Tag Ansicht:', e);
    res.status(500).send('Fehler bei Tag Filter');
  }
});

// Global search
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if(!q) return res.redirect('/blog');
  const like = '%'+q+'%';
  try {
    let base = `SELECT p.*, m.path as featured_image_path FROM posts p LEFT JOIN media m ON p.featured_image_id = m.id WHERE p.status='published' AND (p.published_at IS NULL OR p.published_at <= NOW()) AND p.is_deleted=0`;
    let whereParts = ['(p.title LIKE ? OR p.content LIKE ?'];
    let params = [like, like];
    try { await pool.query('SELECT p.tags FROM posts p LIMIT 1'); whereParts[0] += ' OR p.tags LIKE ?'; params.push(like); } catch(_){}
    whereParts[0] += ')';
    const finalSql = base + ' AND ' + whereParts.join(' AND ') + ' ORDER BY COALESCE(p.published_at, p.created_at) DESC LIMIT 100';
    const [rows] = await pool.query(finalSql, params);
    res.render('blog_search_results', { title: 'Suche', posts: rows, searchTerm: q });
  } catch (e) {
    console.error('Fehler globale Suche:', e);
    res.status(500).send('Fehler bei der Suche');
  }
});

// Blog post JSON (modal)
router.get('/api/blog/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id,10);
    if(isNaN(id)) return res.apiError(400,{ error:'Ungültige ID', code:'BLOG_BAD_ID' });
    let sql = `SELECT p.id, p.title, p.content, p.title_en, p.content_en, p.created_at AS createdAt, p.tags, m.path AS featured_image_path FROM posts p LEFT JOIN media m ON p.featured_image_id = m.id WHERE p.id = ? AND p.status = 'published' AND (p.published_at IS NULL OR p.published_at <= NOW()) AND p.is_deleted=0 LIMIT 1`;
    let rows; try { [rows] = await pool.query(sql,[id]); }
    catch(e){ if(e.code==='ER_BAD_FIELD_ERROR' && e.message.includes('p.tags')) { sql = `SELECT p.id, p.title, p.content, p.title_en, p.content_en, p.created_at AS createdAt, '' AS tags, m.path AS featured_image_path FROM posts p LEFT JOIN media m ON p.featured_image_id = m.id WHERE p.id=? AND p.status='published' AND (p.published_at IS NULL OR p.published_at <= NOW()) AND p.is_deleted=0 LIMIT 1`; [rows] = await pool.query(sql,[id]); } else { throw e; } }
    if (!rows.length) return res.apiError(404,{ error: 'Nicht gefunden', code:'BLOG_NOT_FOUND' });
    const post = rows[0];
    res.json({ id: post.id, title: post.title, content: post.content || '<p>(Kein Inhalt)</p>', image_path: post.featured_image_path || null, tags: post.tags || '', createdAt: post.createdAt });
  } catch (e) {
    console.error('Blog API Fehler:', e.message);
    res.apiError(500,{ error: 'Server Fehler', code:'BLOG_FETCH', detail:e.message });
  }
});

// Blog RSS
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

// Individual post by slug
router.get('/blog/:slug', async (req,res)=>{
  try {
    const slug = req.params.slug; if(!slug) return res.redirect('/blog');
    const [rows] = await pool.query(`SELECT p.*, m.path AS featured_image_path FROM posts p LEFT JOIN media m ON p.featured_image_id=m.id WHERE p.slug=? AND p.status='published' AND COALESCE(p.is_deleted,0)=0 LIMIT 1`, [slug]);
    if(!rows.length) return res.status(404).render('partials/error_404',{ title:'Nicht gefunden' });
    const post = rows[0];
    let related=[]; if(post.tags){ const firstTag = post.tags.split(',')[0]; if(firstTag){ const [rel] = await pool.query(`SELECT id,title,slug,whatsnew,published_at FROM posts WHERE id<>? AND tags LIKE ? AND status='published' AND COALESCE(is_deleted,0)=0 ORDER BY published_at DESC LIMIT 5`, [post.id, '%'+firstTag.trim()+'%']); related = rel; } }
    const currentUrl = (process.env.SITE_URL || (req.protocol + '://' + req.get('host'))).replace(/\/$/,'') + req.originalUrl;
    res.render('blog_detail',{ title: post.seo_title || post.title, post, related, currentUrl, seo:{ title: post.seo_title||post.title, description: post.seo_description||post.whatsnew||'', keywords: post.meta_keywords||'', image: post.featured_image_path||'', url: currentUrl, type: 'article' } });
  } catch(e){ console.error('Slug route Fehler', e); res.status(500).render('partials/error_500',{ title:'Fehler', error:e }); }
});

module.exports = router;
