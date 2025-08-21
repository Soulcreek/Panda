const express = require('express');
const pool = require('../../db');
const { isAuth } = require('../../lib/auth');
const router = express.Router();

router.get(['/tools','/tools/raw','/tools/tables'], isAuth, async (req,res)=>{
	const mode = req.path.endsWith('/raw') ? 'raw' : (req.path.endsWith('/tables') ? 'tables' : 'structured');
	try {
		let posts = [], podcasts = [], pages = [];
		if(mode==='structured'){
			try { const [rows] = await pool.query(`SELECT id,title,COALESCE(is_deleted,0) as is_deleted,COALESCE(is_featured,0) as is_featured,COALESCE(status='published',0) as is_visible,published_at FROM posts ORDER BY id DESC LIMIT 200`); posts = rows; } catch(_){ }
			try { const [rows] = await pool.query(`SELECT id,title,published_at,seo_title,seo_description FROM podcasts ORDER BY id DESC LIMIT 100`); podcasts = rows; } catch(_){ }
			try { const [rows] = await pool.query(`SELECT id,title,slug,status,updated_at,is_template FROM advanced_pages ORDER BY updated_at DESC LIMIT 150`); pages = rows; } catch(_){ }
			return res.render('admin_tools',{ title:'Admin Tools', mode, posts, podcasts, pages, tables:[], rawData:{} });
		}
		if(mode==='raw'){
			let tables=[]; let rawData={};
			try { const [rows] = await pool.query(`SHOW TABLES`); const key = Object.keys(rows[0]||{})[0]; tables = rows.map(r=>r[key]); } catch(_){ }
			for(const t of tables){ try { const [rows] = await pool.query(`SELECT * FROM \`${t}\` LIMIT 200`); rawData[t]=rows; } catch(_){ rawData[t]=[{error:'Nicht lesbar'}]; } }
			return res.render('admin_tools',{ title:'Admin Tools', mode, posts:[], podcasts:[], pages:[], tables, rawData });
		}
		if(mode==='tables'){
			let tables=[]; let schemaByTable={};
			try { const [rows] = await pool.query(`SHOW TABLES`); const key = Object.keys(rows[0]||{})[0]; tables = rows.map(r=>r[key]); } catch(_){ }
			if(tables.length){
				try { const [rows] = await pool.query(`SELECT table_name,column_name,data_type,character_maximum_length,is_nullable,column_key,extra FROM information_schema.columns WHERE table_schema = DATABASE() ORDER BY table_name, ordinal_position`); rows.forEach(r=>{ (schemaByTable[r.table_name]=schemaByTable[r.table_name]||[]).push(r); }); } catch(_){ }
			}
			return res.render('admin_tools_tables',{ title:'Tabellen Übersicht', mode, tables, schemaByTable });
		}
	} catch(e){
		console.error('Admin Tools Fehler', e);
		if(mode==='tables') return res.status(500).render('admin_tools_tables',{ title:'Tabellen Übersicht', mode:'tables', tables:[], schemaByTable:{} });
		res.status(500).render('admin_tools',{ title:'Admin Tools', mode, posts:[], podcasts:[], pages:[], tables:[], rawData:{} });
	}
});

router.get('/tools/prompt-tester', isAuth, (req,res)=>{ res.render('admin_tool_prompt_tester',{ title:'AI Prompt Tester', result:null, error:null }); });
router.post('/tools/prompt-tester', isAuth, async (req,res)=>{
	const { prompt='', model='fast', temperature='0.7' } = req.body||{};
	const t = prompt.trim();
	if(!t) return res.render('admin_tool_prompt_tester',{ title:'AI Prompt Tester', result:null, error:'Prompt fehlt' });
	const { modelFast, modelHeavy } = require('../../lib/aiConfig');
	const useModel = (model==='heavy')? modelHeavy : modelFast;
	let rawResp='', parse_error=null;
	try { const { callGeminiRaw } = require('../../lib/aiHelpers'); const r = await callGeminiRaw({ model:useModel, system:'You are a helpful assistant.', user:t, json:false, temperature: parseFloat(temperature)||0.7 }); rawResp = r.text; }
	catch(e){ parse_error=e.message; }
	res.render('admin_tool_prompt_tester',{ title:'AI Prompt Tester', result: rawResp, error: parse_error });
});

module.exports = router;
