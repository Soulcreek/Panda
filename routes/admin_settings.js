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
    // ai_config laden / defaults
    await pool.query(`CREATE TABLE IF NOT EXISTS ai_config (
      id INT PRIMARY KEY,
      primary_key_choice VARCHAR(32),
      max_daily_calls INT NOT NULL DEFAULT 500,
      limits JSON NULL,
      prompts JSON NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
    const defaultPrompts = {
      seo_title_prefix:'',
      generator_default_sections:'hero,intro,posts,cta',
      enable_generator:true,
      whats_new_research:'Stelle aktuelle relevante Infos (kurz) zu Cybersecurity & Governance bereit. Antworte auf Deutsch in Stichpunkten.',
      translate:'You are a precise bilingual technical editor. Translate German blog HTML to clean English keeping simple tags.',
      media_alt_text:'Erzeuge einen prägnanten deutschen ALT-Text (max 120 Zeichen) basierend auf Dateiname oder Kontext.',
      blog_sample:'Erzeuge einen Beispiel-Blogpost (Deutsch) zum Thema Unternehmens-IT-Security. JSON: { "title_de":"...","content_de":"<p>...</p>" }',
      blog_tags:'security, governance, compliance, privacy, cloud, devsecops',
      media_categories:'Titelbild, Blog-Titelbild, Illustration, Diagramm'
    };
    let ai = {
      primary_key_choice: 'paid',
      max_daily_calls: 500,
      limits: { max_response_chars:10000, max_translate_chars:10000, max_sample_chars:8000 },
      prompts: { ...defaultPrompts }
    };
    try {
      const [rows] = await pool.query('SELECT * FROM ai_config WHERE id=1');
      if(rows.length){
        const r = rows[0];
        ai.primary_key_choice = r.primary_key_choice || ai.primary_key_choice;
        ai.max_daily_calls = r.max_daily_calls || ai.max_daily_calls;
        // JSON Felder können (je nach mysql2 / Version) schon als Objekt vorliegen
        if(r.limits){
          if(typeof r.limits === 'string'){ try { ai.limits = JSON.parse(r.limits); } catch(_){ } }
          else if(typeof r.limits === 'object') ai.limits = r.limits;
        }
        if(r.prompts){
          let loadedPrompts = {};
            if(typeof r.prompts === 'string'){ try { loadedPrompts = JSON.parse(r.prompts); } catch(_){ } }
            else if(typeof r.prompts === 'object') loadedPrompts = r.prompts;
          ai.prompts = { ...defaultPrompts, ...loadedPrompts };
        } else {
          ai.prompts = { ...defaultPrompts };
        }
        // Fallback: Fehlende Keys auffüllen
        for(const k in defaultPrompts){ if(!(k in ai.prompts)) ai.prompts[k] = defaultPrompts[k]; }
      }
    } catch(_){}
    // Settings (legacy) weiterhin lesen falls benötigt
    let settings = {};
    try { const [rows]=await pool.query('SELECT `key`,`value` FROM blog_config'); settings = rows.reduce((a,r)=>{ a[r.key]=r.value; return a; },{}); } catch(_){ }
    const saved = req.query.saved === '1';
    const csrfToken = (typeof req.csrfToken === 'function') ? req.csrfToken() : undefined;
    res.render('admin_blog_config',{ title:'Blog Konfiguration', settings, ai, saved, csrfToken });
  } catch(e){
    console.error('Blog Config Fehler', e);
    res.status(500).send('Blog Config Fehler');
  }
});

// Blog Konfiguration speichern
router.post('/blog-config', isAuth, async (req,res)=>{
  try {
    const body = req.body || {};
    const primary = ['paid','free'].includes(body.primary_key_choice) ? body.primary_key_choice : 'paid';
    let maxDaily = parseInt(body.max_daily_calls,10); if(!maxDaily || maxDaily<1) maxDaily=500; if(maxDaily>100000) maxDaily=100000;
    const limits = {
      max_response_chars: Math.min(20000, Math.max(1000, parseInt(body.max_response_chars,10)||10000)),
      max_translate_chars: Math.min(20000, Math.max(1000, parseInt(body.max_translate_chars,10)||10000)),
      max_sample_chars: Math.min(15000, Math.max(1000, parseInt(body.max_sample_chars,10)||8000))
    };
    // Vorhandene Prompts laden um nicht-gesendete Felder (z.B. künftige) zu bewahren
    let existingPrompts = {};
    try { const [r] = await pool.query('SELECT prompts FROM ai_config WHERE id=1'); if(r.length){ const raw=r[0].prompts; if(raw){ existingPrompts = typeof raw === 'string' ? JSON.parse(raw) : raw; } } } catch(_){ }
    const prompts = {
      ...existingPrompts,
      seo_title_prefix: (body.seo_title_prefix||'').slice(0,60),
      generator_default_sections: (body.generator_default_sections||'hero,intro,posts,cta').slice(0,200),
      enable_generator: !!body.enable_generator,
      whats_new_research: (body.whats_new_research||'').slice(0,4000),
      translate: (body.translate_prompt||'').slice(0,4000),
      media_alt_text: (body.media_alt_text||'').slice(0,2000),
      blog_sample: (body.blog_sample||'').slice(0,4000),
      blog_tags: (body.blog_tags||'').slice(0,1000),
      media_categories: (body.media_categories||'').slice(0,1000)
    };
    await pool.query(`INSERT INTO ai_config (id, primary_key_choice, max_daily_calls, limits, prompts)
      VALUES (1, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE primary_key_choice=VALUES(primary_key_choice), max_daily_calls=VALUES(max_daily_calls), limits=VALUES(limits), prompts=VALUES(prompts), updated_at=CURRENT_TIMESTAMP`,
      [primary, maxDaily, JSON.stringify(limits), JSON.stringify(prompts)]);
    res.redirect('/admin/blog-config?saved=1');
  } catch(e){
    console.error('Blog Config Save Fehler', e);
    res.status(500).send('Speichern fehlgeschlagen');
  }
});

// AI Usage Übersicht
router.get('/ai-usage', isAuth, async (req,res)=>{
  try {
    let totalToday = 0;
    let today = [];
    let history = [];
    let log = [];
    // Aggregationen nur versuchen wenn Tabelle existiert
    try {
      // Gesamt heute
      const [sumRows] = await pool.query('SELECT SUM(calls) s FROM ai_usage WHERE day=CURDATE()');
      totalToday = (sumRows[0] && sumRows[0].s) || 0;
    } catch(_) { /* Tabelle evtl. nicht vorhanden */ }
    try {
      // Verteilung heute pro Endpoint
      const [rows] = await pool.query('SELECT endpoint, SUM(calls) calls FROM ai_usage WHERE day=CURDATE() GROUP BY endpoint ORDER BY calls DESC');
      today = rows;
    } catch(_) {}
    try {
      // Historie letzte 14 Tage nach Tag + Endpoint
      const [rows] = await pool.query(`SELECT day, endpoint, SUM(calls) calls
        FROM ai_usage
        WHERE day BETWEEN DATE_SUB(CURDATE(), INTERVAL 14 DAY) AND CURDATE()
        GROUP BY day, endpoint
        ORDER BY day DESC, calls DESC`);
      history = rows;
    } catch(_) {}
    try {
      // Detail Log (separate Tabelle ai_usage_log falls vorhanden)
      const [rows] = await pool.query(`SELECT id, created_at, endpoint,
          LEFT(COALESCE(prompt,'') ,400) AS prompt_snippet,
          response_chars,
          error_message
        FROM ai_usage_log
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
        ORDER BY created_at DESC
        LIMIT 1000`);
      log = rows;
    } catch(_) {}
    res.render('admin_ai_usage',{ title:'AI Nutzung', totalToday, today, history, log });
  } catch(e){
    console.error('AI Usage Fehler', e);
    res.status(500).send('AI Usage Fehler');
  }
});

// Detail eines AI Log-Eintrags (JSON)
router.get('/ai-usage/log/:id', isAuth, async (req,res)=>{
  try {
    const [rows] = await pool.query('SELECT id, created_at, endpoint, prompt, response_raw, response_chars, error_message FROM ai_usage_log WHERE id=?',[req.params.id]);
    if(!rows.length) return res.status(404).json({ error:'Nicht gefunden' });
    res.json(rows[0]);
  } catch(e){
    res.status(500).json({ error:'Fehler', detail:e.message });
  }
});

// Tools (Wartung / Utilities)
router.get('/tools', isAuth, async (req,res)=>{
  try {
    let posts = [];
    try {
      const [rows] = await pool.query(`SELECT id,title,COALESCE(is_deleted,0) as is_deleted,COALESCE(is_featured,0) as is_featured,COALESCE(status='published',0) as is_visible,published_at FROM posts ORDER BY id DESC LIMIT 200`);
      posts = rows;
    } catch(_) { /* Tabelle evtl. nicht vorhanden */ }
    res.render('admin_tools',{ title:'Admin Tools', posts });
  } catch(e){
    console.error('Admin Tools Fehler', e);
    res.status(500).render('admin_tools',{ title:'Admin Tools', posts:[] });
  }
});

module.exports = router;
