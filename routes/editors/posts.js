const express = require('express');
const router = express.Router();
const { pool, isEditor, sanitizeWhatsNew } = require('./_shared');

router.get('/posts', isEditor, async (req,res)=>{
  try { const [posts] = await pool.query('SELECT * FROM posts WHERE COALESCE(is_deleted,0)=0 ORDER BY updated_at DESC'); res.render('editors_posts',{ title:'Beiträge', posts, archived:false }); }
  catch(e){ res.status(500).send('Posts Fehler'); }
});
router.get('/posts/new', isEditor, async (req,res)=>{
  try { const [media] = await pool.query('SELECT * FROM media ORDER BY uploaded_at DESC'); res.render('editors_edit_post',{ title:'Neuer Beitrag', post:null, media, tagsList:[], mediaCats:[] }); }
  catch(e){ res.status(500).send('Editor Fehler'); }
});
router.post('/posts/new', isEditor, async (req,res)=>{
  const { title, content, status, title_en, content_en, whatsnew, featured_image_id, published_at, tags, seo_title, seo_description, meta_keywords }=req.body;
  const slug = title.toLowerCase().replace(/\s+/g,'-').replace(/[^\w-]+/g,'');
  const wn = sanitizeWhatsNew(whatsnew);
  try { await pool.query('INSERT INTO posts (title,slug,content,author_id,status,title_en,content_en,whatsnew,featured_image_id,published_at,tags,seo_title,seo_description,meta_keywords) VALUES (?,?,?,?, ?,?,?, ?,?,?, ?,?,?,?)',[title, slug, content||'', req.session.userId, status, title_en, content_en, wn, featured_image_id||null, published_at||null, tags||null, seo_title||null, seo_description||null, meta_keywords||null]); res.redirect('/editors/posts'); }
  catch(e){ res.status(500).send('Speichern fehlgeschlagen'); }
});
router.get('/posts/edit/:id', isEditor, async (req,res)=>{
  try { const [rows]=await pool.query('SELECT p.*, m.path featured_image_path FROM posts p LEFT JOIN media m ON p.featured_image_id=m.id WHERE p.id=?',[req.params.id]); if(!rows.length) return res.status(404).send('Nicht gefunden'); const [media]=await pool.query('SELECT * FROM media ORDER BY uploaded_at DESC'); res.render('editors_edit_post',{ title:'Beitrag bearbeiten', post:rows[0], media, tagsList:[], mediaCats:[] }); }
  catch(e){ res.status(500).send('Editor Fehler'); }
});
router.post('/posts/edit/:id', isEditor, async (req,res)=>{
  const { title, content, status, title_en, content_en, whatsnew, featured_image_id, published_at, tags, seo_title, seo_description, meta_keywords }=req.body;
  const slug = title.toLowerCase().replace(/\s+/g,'-').replace(/[^\w-]+/g,'');
  const wn = sanitizeWhatsNew(whatsnew);
  try { await pool.query('UPDATE posts SET title=?,slug=?,content=?,status=?,title_en=?,content_en=?,whatsnew=?,featured_image_id=?,published_at=?,tags=?,seo_title=?,seo_description=?,meta_keywords=? WHERE id=?',[title, slug, content||'', status, title_en, content_en, wn, featured_image_id||null, published_at||null, tags||null, seo_title||null, seo_description||null, meta_keywords||null, req.params.id]); res.redirect('/editors/posts'); }
  catch(e){ res.status(500).send('Update fehlgeschlagen'); }
});

module.exports = router;
