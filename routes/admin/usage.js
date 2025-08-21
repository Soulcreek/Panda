const express = require('express');
const pool = require('../../db');
const { isAuth } = require('../../lib/auth');
const router = express.Router();

// AI Usage Übersicht
router.get('/ai-usage', isAuth, async (req,res)=>{
	try {
		let totalToday = 0, today = [], history = [], log = [];
		try { const [sumRows] = await pool.query('SELECT SUM(calls) s FROM ai_usage WHERE day=CURDATE()'); totalToday = (sumRows[0] && sumRows[0].s) || 0; } catch(_){ }
		try { const [rows] = await pool.query('SELECT endpoint, SUM(calls) calls FROM ai_usage WHERE day=CURDATE() GROUP BY endpoint ORDER BY calls DESC'); today = rows; } catch(_){ }
		try { const [rows] = await pool.query(`SELECT day, endpoint, SUM(calls) calls FROM ai_usage WHERE day BETWEEN DATE_SUB(CURDATE(), INTERVAL 14 DAY) AND CURDATE() GROUP BY day, endpoint ORDER BY day DESC, calls DESC`); history = rows; } catch(_){ }
		try { const [rows] = await pool.query(`SELECT id, created_at, endpoint, LEFT(COALESCE(prompt,'') ,400) AS prompt_snippet, response_chars, error_message FROM ai_usage_log WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) ORDER BY created_at DESC LIMIT 1000`); log = rows; } catch(_){ }
		res.render('admin_ai_usage',{ title:'AI Nutzung', totalToday, today, history, log });
	} catch(e){ console.error('AI Usage Fehler', e); res.status(500).send('AI Usage Fehler'); }
});

router.get('/ai-usage/log/:id', isAuth, async (req,res)=>{
	try { const [rows] = await pool.query('SELECT id, created_at, endpoint, prompt, response_raw, response_chars, error_message FROM ai_usage_log WHERE id=?',[req.params.id]); if(!rows.length) return res.status(404).json({ error:'Nicht gefunden' }); res.json(rows[0]); }
	catch(e){ res.status(500).json({ error:'Fehler', detail:e.message }); }
});

module.exports = router;
