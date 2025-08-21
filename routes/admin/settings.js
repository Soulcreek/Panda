const express = require('express');
const pool = require('../../db');
const { isAuth } = require('../../lib/auth');
const router = express.Router();

// Dashboard (settings / usage focus only)
router.get('/', isAuth, async (req,res)=>{
	try {
		let aiCallsToday = 0; let aiLimit = 500;
		try { const [r]=await pool.query('SELECT SUM(calls) s FROM ai_usage WHERE day=CURDATE()'); aiCallsToday = (r[0].s)||0; } catch(_){ }
		try { const [r2]=await pool.query('SELECT max_daily_calls FROM ai_config WHERE id=1'); if(r2.length){ aiLimit = r2[0].max_daily_calls || aiLimit; } } catch(_){ }
		const usagePercent = aiLimit? Math.round((aiCallsToday/aiLimit)*100) : 0;
		let genLogCount = 0; 
		try { const [[r3]] = await pool.query('SELECT COUNT(*) c FROM advanced_page_generation_logs WHERE created_at >= (NOW() - INTERVAL 3 DAY)'); genLogCount = r3.c; } catch(_){ }
		let parseErrorCount = 0;
		try { const [[e1]] = await pool.query('SELECT COUNT(*) c FROM ai_usage_log WHERE parse_error_flag=1 AND created_at >= (NOW() - INTERVAL 3 DAY)'); parseErrorCount = e1.c; } catch(_){ }
		let mediaUploads3d = 0;
		try { const [[m1]] = await pool.query('SELECT COUNT(*) c FROM media WHERE uploaded_at >= (NOW() - INTERVAL 3 DAY)'); mediaUploads3d = m1.c; } catch(_){ }
		let postsPublishedToday = 0; let draftsCount = 0;
		try { const [[pToday]] = await pool.query("SELECT COUNT(*) c FROM posts WHERE status='published' AND DATE(updated_at)=CURDATE()"); postsPublishedToday = pToday.c; } catch(_){ }
		try { const [[pDrafts]] = await pool.query("SELECT COUNT(*) c FROM posts WHERE status!='published'"); draftsCount = pDrafts.c; } catch(_){ }
		const { dbHealth } = require('../../db');
		const aiUsageInfo = { used: aiCallsToday, limit: aiLimit, percent: usagePercent };
		res.render('admin_dashboard', { title:'Admin Dashboard', aiCallsToday, aiLimit, usagePercent, genLogCount, postsPublishedToday, draftsCount, dbHealth, aiUsageInfo, parseErrorCount, mediaUploads3d });
	} catch(e){ res.status(500).send('Dashboard Fehler'); }
});

router.get('/link-editors', isAuth, (req,res)=> res.redirect('/editors'));

// Blog Konfiguration
router.get('/blog-config', isAuth, async (req,res)=>{
	try {
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
		let ai = { primary_key_choice: 'paid', max_daily_calls: 500, limits: { max_response_chars:10000, max_translate_chars:10000, max_sample_chars:8000 }, prompts: { ...defaultPrompts } };
		let needPersist = false;
		try {
			const [rows] = await pool.query('SELECT * FROM ai_config WHERE id=1');
			if(!rows.length){
				// Direkt seeden
				await pool.query('INSERT INTO ai_config (id, primary_key_choice, max_daily_calls, limits, prompts) VALUES (1,?,?,?,?)', [ai.primary_key_choice, ai.max_daily_calls, JSON.stringify(ai.limits), JSON.stringify(ai.prompts)]);
			} else {
				const r = rows[0];
				ai.primary_key_choice = r.primary_key_choice || ai.primary_key_choice;
				ai.max_daily_calls = r.max_daily_calls || ai.max_daily_calls;
				if(r.limits){ if(typeof r.limits === 'string'){ try { ai.limits = JSON.parse(r.limits); } catch(_){ needPersist = true; } } else if(typeof r.limits === 'object') ai.limits = r.limits; }
				let loadedPrompts = {};
				if(r.prompts){
					if(typeof r.prompts === 'string'){ try { loadedPrompts = JSON.parse(r.prompts); } catch(_){ needPersist = true; } }
					else if(typeof r.prompts === 'object') loadedPrompts = r.prompts;
				}
				ai.prompts = { ...defaultPrompts, ...loadedPrompts };
				for(const k in defaultPrompts){ if(!(k in loadedPrompts)){ needPersist = true; } }
			}
		} catch(e){ console.warn('Blog Config load warn', e.message); }
		if(needPersist){
			try { await pool.query('UPDATE ai_config SET prompts=?, limits=?, updated_at=CURRENT_TIMESTAMP WHERE id=1', [JSON.stringify(ai.prompts), JSON.stringify(ai.limits)]); } catch(e){ console.warn('Blog Config persist defaults warn', e.message); }
		}
		let settings = {};
		try { const [rows]=await pool.query('SELECT `key`,`value` FROM blog_config'); settings = rows.reduce((a,r)=>{ a[r.key]=r.value; return a; },{}); } catch(_){ }
		const saved = req.query.saved === '1';
		const csrfToken = (typeof req.csrfToken === 'function') ? req.csrfToken() : undefined;
		res.render('admin_blog_config',{ title:'Blog Konfiguration', settings, ai, saved, csrfToken });
	} catch(e){ console.error('Blog Config Fehler', e); res.status(500).send('Blog Config Fehler'); }
});

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
	} catch(e){ console.error('Blog Config Save Fehler', e); res.status(500).send('Speichern fehlgeschlagen'); }
});

// Export AI usage view endpoints moved to usage module; keep minimal link or fallback if needed here.

module.exports = router;
