const express = require('express');
const router = express.Router();

// Dashboard summary (lightweight)
const pool = require('../../db');
function isEditor(req,res,next){ if(req.session && (req.session.isLoggedIn || req.session.userId || req.session.adminTokenValid)) return next(); return res.redirect('/login'); }

router.get('/', isEditor, async (req,res)=>{
  try {
    const [[postCount]] = await pool.query('SELECT COUNT(*) c FROM posts');
    const [[mediaCount]] = await pool.query('SELECT COUNT(*) c FROM media');
    const [[podCount]] = await pool.query('SELECT COUNT(*) c FROM podcasts');
    const [latest] = await pool.query('SELECT id,title,updated_at,status FROM posts ORDER BY updated_at DESC LIMIT 6');
    res.render('editors_dashboard',{ title:'Editors Dashboard', stats:{ posts:postCount.c, media:mediaCount.c, podcasts:podCount.c }, latest });
  } catch(e){ res.status(500).send('Editors Dashboard Fehler'); }
});

// Mount feature routers
router.use(require('./posts'));
router.use(require('./media'));
router.use(require('./podcasts'));
router.use(require('./advancedPages'));
router.use(require('./timeline'));
router.use(require('./ai'));

module.exports = router;
