const express = require('express');
const router = express.Router();
const { pool, isEditor } = require('./_shared');
const { baseSlug } = require('../../lib/slug');

router.get('/podcasts', isEditor, async (req,res)=>{ try { const [pods]=await pool.query('SELECT * FROM podcasts ORDER BY published_at DESC'); res.render('editors_podcasts',{ title:'Podcasts', podcasts:pods }); } catch(e){ res.render('editors_podcasts',{ title:'Podcasts', podcasts:[] }); } });
router.get('/podcasts/new', isEditor, async (req,res)=>{ res.render('editors_edit_podcast',{ title:'Neuer Podcast', podcast:null }); });
router.post('/podcasts/new', isEditor, async (req,res)=>{ const { title, description, audio_url, tags, seo_title, seo_description, meta_keywords, published_at, slug }=req.body; try {
	let s = baseSlug(slug || title || 'episode');
	// ensure uniqueness (retry with -id after insert if needed)
	await pool.query('INSERT INTO podcasts (title, slug, description, audio_url, tags, seo_title, seo_description, meta_keywords, published_at) VALUES (?,?,?,?,?,?,?,?,?)',[title, s, description, audio_url, tags, seo_title, seo_description, meta_keywords, published_at||new Date()]);
	// post-insert collision resolution
	const [[row]] = await pool.query('SELECT id FROM podcasts WHERE slug=?',[s]);
	const [[dupCount]] = await pool.query('SELECT COUNT(*) c FROM podcasts WHERE slug=?',[s]);
	if(dupCount.c > 1 && row){ const newSlug = s+'-'+row.id; await pool.query('UPDATE podcasts SET slug=? WHERE id=?',[newSlug,row.id]); }
	res.redirect('/editors/podcasts'); } catch(e){ res.status(500).send('Podcast Create Fehler'); } });
router.get('/podcasts/edit/:id', isEditor, async (req,res)=>{ try { const [[podcast]] = await pool.query('SELECT * FROM podcasts WHERE id=?',[req.params.id]); if(!podcast) return res.status(404).send('Nicht gefunden'); res.render('editors_edit_podcast',{ title:'Podcast bearbeiten', podcast }); } catch(e){ res.status(500).send('Podcast Lade Fehler'); } });
router.post('/podcasts/edit/:id', isEditor, async (req,res)=>{ const { title, description, audio_url, tags, seo_title, seo_description, meta_keywords, published_at, slug }=req.body; try {
	let s = baseSlug(slug || title || 'episode');
	// Check if slug in use by another
	const [exists] = await pool.query('SELECT id FROM podcasts WHERE slug=? AND id<>? LIMIT 1',[s, req.params.id]);
	if(exists.length){ s = s+'-'+req.params.id; }
	await pool.query('UPDATE podcasts SET title=?, slug=?, description=?, audio_url=?, tags=?, seo_title=?, seo_description=?, meta_keywords=?, published_at=? WHERE id=?',[title, s, description, audio_url, tags, seo_title, seo_description, meta_keywords, published_at||new Date(), req.params.id]); res.redirect('/editors/podcasts'); } catch(e){ res.status(500).send('Podcast Update Fehler'); } });

module.exports = router;
