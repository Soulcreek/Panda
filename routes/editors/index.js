const express = require('express');
const router = express.Router();

// Dashboard summary (lightweight)
const pool = require('../../db');
function isEditor(req,res,next){ if(req.session && (req.session.isLoggedIn || req.session.userId || req.session.adminTokenValid)) return next(); return res.redirect('/login'); }

router.get('/', isEditor, async (req,res)=>{
  try {
    const siteKey = req.siteKey || 'default';

    // Helper tries site_key aware count, falls back if column missing
    async function safeCount(table){
      try { const [[r]] = await pool.query(`SELECT COUNT(*) c FROM ${table} WHERE site_key=?`,[siteKey]); return r.c; }
      catch(e){
        if(e.code === 'ER_BAD_FIELD_ERROR'){
          // Try to add site_key column dynamically for known tables
          if(['posts','media','podcasts'].includes(table)){
            try { await pool.query(`ALTER TABLE ${table} ADD COLUMN site_key VARCHAR(64) NOT NULL DEFAULT "default", ADD INDEX idx_${table}_site (site_key)`); }
            catch(_){ /* ignore */ }
            try { const [[r2]] = await pool.query(`SELECT COUNT(*) c FROM ${table} WHERE site_key=?`,[siteKey]); return r2.c; } catch(e2){ /* still missing; fallback */ }
          }
          // Final fallback: global count
          const [[r3]] = await pool.query(`SELECT COUNT(*) c FROM ${table}`); return r3.c;
        }
        throw e;
      }
    }

    async function safeLatestPosts(){
      try { const [rows] = await pool.query('SELECT id,title,updated_at,status FROM posts WHERE site_key=? ORDER BY updated_at DESC LIMIT 6',[siteKey]); return rows; }
      catch(e){
        if(e.code === 'ER_BAD_FIELD_ERROR'){
          // Attempt ALTER then retry
            try { await pool.query('ALTER TABLE posts ADD COLUMN site_key VARCHAR(64) NOT NULL DEFAULT "default", ADD INDEX idx_posts_site (site_key)'); }
            catch(_){ }
            try { const [rows2] = await pool.query('SELECT id,title,updated_at,status FROM posts WHERE site_key=? ORDER BY updated_at DESC LIMIT 6',[siteKey]); return rows2; } catch(_){ }
          // Fallback global
          const [rows3] = await pool.query('SELECT id,title,updated_at,status FROM posts ORDER BY updated_at DESC LIMIT 6'); return rows3;
        }
        throw e;
      }
    }

    const [postsC, mediaC, podC, latest] = await Promise.all([
      safeCount('posts'),
      safeCount('media'),
      safeCount('podcasts'),
      safeLatestPosts()
    ]);

    // AI usage (ai_usage may not yet have site_key column) -> fallback global
    let aiUsage = { used:0, limit:500, percent:0 };
    try {
      try {
        const [r] = await pool.query('SELECT SUM(calls) s FROM ai_usage WHERE site_key=? AND day BETWEEN (CURDATE() - INTERVAL 2 DAY) AND CURDATE()',[siteKey]);
        aiUsage.used = (r[0].s)||0;
      } catch(e){
        if(e.code === 'ER_BAD_FIELD_ERROR'){
          const [r2] = await pool.query('SELECT SUM(calls) s FROM ai_usage WHERE day BETWEEN (CURDATE() - INTERVAL 2 DAY) AND CURDATE()');
          aiUsage.used = (r2[0].s)||0;
        } else throw e;
      }
      const [cfg] = await pool.query('SELECT max_daily_calls FROM ai_config WHERE id=1');
      if(cfg.length) aiUsage.limit = cfg[0].max_daily_calls || aiUsage.limit;
    } catch(_){ }
    aiUsage.percent = aiUsage.limit ? Math.round((aiUsage.used/(aiUsage.limit*3))*100) : 0;

    res.render('editors_dashboard',{
      title:'Editors Dashboard',
      stats:{ posts:postsC, media:mediaC, podcasts:podC },
      latest,
      aiUsage
    });
  } catch(e){
    console.warn('[EDITORS DASHBOARD] Fehler', e.code, e.message);
    res.status(500).send('Editors Dashboard Fehler');
  }
});

// Mount feature routers
router.use(require('./posts'));
router.use(require('./media'));
router.use(require('./podcasts'));
router.use(require('./advancedPages'));
router.use(require('./timeline'));
router.use(require('./ai'));

module.exports = router;
