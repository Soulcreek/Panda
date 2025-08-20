const express = require('express');
const router = express.Router();
const { pool, isEditor } = require('./_shared');
const { generateWhatsNew, generateSampleArticle, translateDeToEn, generatePodcastMetadata } = require('../../lib/aiHelpers');

async function logUsage(pool, endpoint, prompt, raw, error){
	try {
		await pool.query(`CREATE TABLE IF NOT EXISTS ai_usage (
			id INT AUTO_INCREMENT PRIMARY KEY,
			day DATE NOT NULL,
			endpoint VARCHAR(64) NOT NULL,
			calls INT NOT NULL DEFAULT 0,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			UNIQUE KEY uniq_day_ep (day, endpoint)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
		await pool.query(`CREATE TABLE IF NOT EXISTS ai_usage_log (
			id INT AUTO_INCREMENT PRIMARY KEY,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			endpoint VARCHAR(64) NOT NULL,
			prompt MEDIUMTEXT NULL,
			response_raw MEDIUMTEXT NULL,
			response_chars INT NULL,
			error_message VARCHAR(255) NULL
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
		await pool.query('INSERT INTO ai_usage (day, endpoint, calls) VALUES (CURDATE(), ?, 1) ON DUPLICATE KEY UPDATE calls=calls+1',[endpoint]);
		await pool.query('ALTER TABLE ai_usage_log ADD COLUMN response_raw MEDIUMTEXT NULL',[]).catch(()=>{});
		let responseChars = null;
		let responseRaw = null;
		if(typeof raw === 'string'){ responseRaw = raw.slice(0,64000); responseChars = raw.length; }
		else if(typeof raw === 'number'){ responseChars = raw; }
		await pool.query('INSERT INTO ai_usage_log (endpoint, prompt, response_raw, response_chars, error_message) VALUES (?,?,?,?,?)',[endpoint, prompt ? prompt.slice(0,64000) : null, responseRaw, responseChars, error? (''+error).slice(0,255): null]);
	} catch(e){
		console.warn('[AI][UsageLog] Fehler beim Loggen', endpoint, e.message);
	}
}

function errorPayload(e){ return { error:'AI Fehler', detail:e.message, code:e.code||undefined }; }
router.post('/generate-whats-new', isEditor, async (req,res)=>{ try { const data = await generateWhatsNew(); res.json(data); await logUsage(pool,'generate-whats-new','(internal two-stage whats-new)', data.raw||'', data.parse_error); } catch(e){ console.warn('[AI][generate-whats-new] Fehler', e); await logUsage(pool,'generate-whats-new','(internal two-stage whats-new)','',e.message); if(e.message==='NO_API_KEY') return res.status(503).json({ error:'AI Service nicht konfiguriert' }); res.status(500).json(errorPayload(e)); } });
// Support both legacy nested path and new flat path for sample generation
router.post(['/posts/generate-sample','/generate-sample'], isEditor, async (req,res)=>{ try { const data=await generateSampleArticle(); res.json(data); await logUsage(pool,'generate-sample','(sample article)', data.raw||'', data.parse_error); } catch(e){ console.warn('[AI][generate-sample] Fehler', e); await logUsage(pool,'generate-sample','(sample article)','',e.message); if(e.message==='NO_API_KEY') return res.status(503).json({ error:'AI Service nicht konfiguriert' }); res.status(500).json(errorPayload(e)); } });
router.post('/api/translate', isEditor, async (req,res)=>{ try { const { text }=req.body||{}; if(!text) return res.status(400).json({ error:'text fehlt' }); const matchTitle=text.match(/German Title:\s*(.*)\n/); const title=matchTitle?matchTitle[1].trim():''; const body=text.split(/German HTML Content:/)[1]||''; const data=await translateDeToEn(title, body); const payload={ translation: JSON.stringify({ title: data.title || data.title_en || data.title_de || '', content: data.content || data.content_en || '' }), raw:data.raw, parse_error:data.parse_error }; res.json(payload); await logUsage(pool,'translate',text,data.raw||'', data.parse_error); } catch(e){ console.warn('[AI][translate] Fehler', e); await logUsage(pool,'translate', (req.body && req.body.text)||'','',e.message); if(e.message==='NO_API_KEY') return res.status(503).json({ error:'AI Service nicht konfiguriert' }); res.status(500).json(errorPayload(e)); } });
router.post('/podcasts/:id/ai-metadata', isEditor, async (req,res)=>{ try { const [[pod]] = await pool.query('SELECT * FROM podcasts WHERE id=?',[req.params.id]); if(!pod) return res.status(404).json({ error:'Podcast nicht gefunden' }); const md = await generatePodcastMetadata(pod.title, pod.description||''); if(md.seo_title || md.seo_description){ await pool.query('UPDATE podcasts SET seo_title=COALESCE(?,seo_title), seo_description=COALESCE(?,seo_description), meta_keywords=COALESCE(?,meta_keywords) WHERE id=?',[md.seo_title, md.seo_description, md.meta_keywords, pod.id]); } res.json(md); await logUsage(pool,'podcast-metadata', pod.title, md.raw||'', md.parse_error); } catch(e){ console.warn('[AI][podcast-metadata] Fehler', e); await logUsage(pool,'podcast-metadata', 'id='+req.params.id,'', e.message); if(e.message==='NO_API_KEY') return res.status(503).json({ error:'AI Service nicht konfiguriert' }); res.status(500).json(errorPayload(e)); } });

module.exports = router;
