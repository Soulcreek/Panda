const express = require('express');
const router = express.Router();
const { pool, isEditor } = require('./_shared');

router.get('/podcasts', isEditor, async (req,res)=>{ try { const [pods]=await pool.query('SELECT * FROM podcasts ORDER BY published_at DESC'); res.render('editors_podcasts',{ title:'Podcasts', podcasts:pods }); } catch(e){ res.render('editors_podcasts',{ title:'Podcasts', podcasts:[] }); } });
router.get('/podcasts/new', isEditor, async (req,res)=>{ res.render('editors_edit_podcast',{ title:'Neuer Podcast', podcast:null }); });
router.post('/podcasts/new', isEditor, async (req,res)=>{ const { title, description, audio_url, tags, seo_title, seo_description, meta_keywords, published_at }=req.body; try { await pool.query('INSERT INTO podcasts (title, description, audio_url, tags, seo_title, seo_description, meta_keywords, published_at) VALUES (?,?,?,?,?,?,?,?)',[title, description, audio_url, tags, seo_title, seo_description, meta_keywords, published_at||new Date()]); res.redirect('/editors/podcasts'); } catch(e){ res.status(500).send('Podcast Create Fehler'); } });
router.get('/podcasts/edit/:id', isEditor, async (req,res)=>{ try { const [[podcast]] = await pool.query('SELECT * FROM podcasts WHERE id=?',[req.params.id]); if(!podcast) return res.status(404).send('Nicht gefunden'); res.render('editors_edit_podcast',{ title:'Podcast bearbeiten', podcast }); } catch(e){ res.status(500).send('Podcast Lade Fehler'); } });
router.post('/podcasts/edit/:id', isEditor, async (req,res)=>{ const { title, description, audio_url, tags, seo_title, seo_description, meta_keywords, published_at }=req.body; try { await pool.query('UPDATE podcasts SET title=?, description=?, audio_url=?, tags=?, seo_title=?, seo_description=?, meta_keywords=?, published_at=? WHERE id=?',[title, description, audio_url, tags, seo_title, seo_description, meta_keywords, published_at||new Date(), req.params.id]); res.redirect('/editors/podcasts'); } catch(e){ res.status(500).send('Podcast Update Fehler'); } });

module.exports = router;
