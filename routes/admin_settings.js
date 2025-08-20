const express = require('express');
const router = express.Router();
const pool = require('../db');

function isAuth(req,res,next){ if(req.session && (req.session.isLoggedIn || req.session.userId || req.session.adminTokenValid)) return next(); return res.redirect('/login'); }

// Dashboard (reduced)
router.get('/', isAuth, async (req,res)=>{
  try {
    const [[posts]] = await pool.query('SELECT COUNT(*) c FROM posts');
    const [[media]] = await pool.query('SELECT COUNT(*) c FROM media');
    const [[pods]] = await pool.query('SELECT COUNT(*) c FROM podcasts');
    let aiCalls=0; try { const [r]=await pool.query('SELECT SUM(calls) s FROM ai_usage WHERE day=CURDATE()'); aiCalls = r[0].s || 0; } catch(_){ }
    res.render('admin_dashboard', { title:'Settings Dashboard', postCount:posts.c, mediaCount:media.c, podcastCount:pods.c, aiCallsToday:aiCalls, latestPosts:[], advPageCount:0, templateCount:0, genLogCount:0 });
  } catch(e){ res.status(500).send('Dashboard Fehler'); }
});

// Blog Config & AI Usage delegated earlier to existing views (mounted under /admin via this router)
// Re-expose blog-config and ai-usage if not in separate modules (fallback)
router.get('/link-editors', isAuth, (req,res)=> res.redirect('/editors'));

// Blog Konfiguration
router.get('/blog-config', isAuth, async (req,res)=>{
  try {
    // Sammle ggf. Settings aus einer Tabelle blog_config (fallback leer)
    let settings = {};
    try { const [rows]=await pool.query('SELECT `key`,`value` FROM blog_config'); settings = rows.reduce((a,r)=>{ a[r.key]=r.value; return a; },{}); } catch(_){ /* Tabelle evtl. nicht vorhanden */ }
    res.render('admin_blog_config',{ title:'Blog Konfiguration', settings });
  } catch(e){ res.status(500).send('Blog Config Fehler'); }
});

// AI Usage Übersicht
router.get('/ai-usage', isAuth, async (req,res)=>{
  try {
    let usage=[]; try { const [rows]=await pool.query('SELECT endpoint, SUM(calls) total FROM ai_usage WHERE day BETWEEN DATE_SUB(CURDATE(), INTERVAL 14 DAY) AND CURDATE() GROUP BY endpoint ORDER BY total DESC'); usage=rows; } catch(_){ }
    res.render('admin_ai_usage',{ title:'AI Nutzung', usage });
  } catch(e){ res.status(500).send('AI Usage Fehler'); }
});

// Tools (Wartung / Utilities)
router.get('/tools', isAuth, (req,res)=>{ res.render('admin_tools',{ title:'Admin Tools' }); });

module.exports = router;
