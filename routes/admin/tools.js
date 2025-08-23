const express = require('express');
const pool = require('../../db');
const { isAuth } = require('../../lib/auth');
const router = express.Router();

router.get(['/tools','/tools/raw','/tools/tables'], isAuth, async (req,res)=>{
	const mode = req.path.endsWith('/raw') ? 'raw' : (req.path.endsWith('/tables') ? 'tables' : 'structured');
	const debug = process.env.ADMIN_TOOLS_DEBUG === 'true' || true; // Force debug for now
	const errors = [];
	const note = (msg)=>{ console.log('[ADMIN_TOOLS]', msg); if(debug) errors.push(msg); };
	
	note(`Mode: ${mode}, Debug: ${debug}`);
	
	try {
		let posts = [], podcasts = [], pages = [];
		if(mode==='structured'){
			note('Executing structured queries...');
			try { const [rows] = await pool.query(`SELECT id,title,COALESCE(is_deleted,0) as is_deleted,COALESCE(is_featured,0) as is_featured,COALESCE(status='published',0) as is_visible,published_at FROM posts ORDER BY id DESC LIMIT 200`); posts = rows; note(`Posts found: ${rows.length}`); if(!rows.length) note('Keine Posts gefunden (Tabelle leer?)'); } catch(e){ note('Posts Query Fehler: '+e.message); }
			try { const [rows] = await pool.query(`SELECT id,title,published_at,seo_title,seo_description FROM podcasts ORDER BY id DESC LIMIT 100`); podcasts = rows; note(`Podcasts found: ${rows.length}`); if(!rows.length) note('Keine Podcasts gefunden'); } catch(e){ note('Podcasts Query Fehler: '+e.message); }
			try { const [rows] = await pool.query(`SELECT id,title,slug,status,updated_at,is_template FROM advanced_pages ORDER BY updated_at DESC LIMIT 150`); pages = rows; note(`Pages found: ${rows.length}`); if(!rows.length) note('Keine Advanced Pages gefunden'); } catch(e){ note('Advanced Pages Query Fehler: '+e.message); }
			return res.render('admin_tools',{ title:'Admin Tools', mode, posts, podcasts, pages, tables:[], rawData:{}, errors, debug });
		}
		if(mode==='raw'){
			note('Executing raw queries...');
			let tables=[]; let rawData={};
			try { 
				const [rows] = await pool.query(`SHOW TABLES`); 
				const key = Object.keys(rows[0]||{})[0]; 
				tables = rows.map(r=>r[key]); 
				note(`Tables found: ${tables.length} - ${tables.join(', ')}`);
				if(!tables.length) note('SHOW TABLES lieferte keine Tabellen (richtige DB ausgewählt?)'); 
			} catch(e){ note('SHOW TABLES Fehler: '+e.message); }
			for(const t of tables){
				try { 
					const [rows] = await pool.query(`SELECT * FROM \`${t}\` LIMIT 200`); 
					rawData[t]=rows; 
					note(`Table ${t}: ${rows.length} rows`);
				} catch(e){ rawData[t]=[{error:'Nicht lesbar'}]; note(`Fehler beim Lesen von ${t}: ${e.message}`); }
			}
			return res.render('admin_tools',{ title:'Admin Tools', mode, posts:[], podcasts:[], pages:[], tables, rawData, errors, debug });
		}
		if(mode==='tables'){
			note('Executing tables schema queries...');
			let tables=[]; let schemaByTable={};
			try { 
				const [rows] = await pool.query(`SHOW TABLES`); 
				const key = Object.keys(rows[0]||{})[0]; 
				tables = rows.map(r=>r[key]); 
				note(`Tables found for schema: ${tables.length}`);
				if(!tables.length) note('SHOW TABLES lieferte keine Tabellen'); 
			} catch(e){ note('SHOW TABLES Fehler: '+e.message); }
			if(tables.length){
				try { 
					const [rows] = await pool.query(`SELECT table_name,column_name,data_type,character_maximum_length,is_nullable,column_key,extra FROM information_schema.columns WHERE table_schema = DATABASE() ORDER BY table_name, ordinal_position`); 
					note(`Schema rows found: ${rows.length}`);
					rows.forEach(r=>{ (schemaByTable[r.table_name]=schemaByTable[r.table_name]||[]).push(r); }); 
				} catch(e){ note('Information_schema Query Fehler: '+e.message); }
			}
			return res.render('admin_tools_tables',{ title:'Tabellen Übersicht', mode, tables, schemaByTable, errors, debug });
		}
	} catch(e){
		console.error('Admin Tools Fehler', e);
		note('Unhandled Fehler: '+e.message);
		if(mode==='tables') return res.status(500).render('admin_tools_tables',{ title:'Tabellen Übersicht', mode:'tables', tables:[], schemaByTable:{}, errors, debug });
		res.status(500).render('admin_tools',{ title:'Admin Tools', mode, posts:[], podcasts:[], pages:[], tables:[], rawData:{}, errors, debug });
	}
});

// Quick DEBUG endpoint to see what's wrong
router.get('/tools/debug-json', isAuth, async (req,res)=>{
	const errors = [];
	const note = (msg) => { console.log('[DEBUG_JSON]', msg); errors.push(msg); };
	
	try {
		note('Testing basic DB connection...');
		await pool.query('SELECT 1');
		note('✅ DB connection OK');
		
		note('Testing posts query...');
		const [posts] = await pool.query(`SELECT id,title,COALESCE(is_deleted,0) as is_deleted,COALESCE(is_featured,0) as is_featured,COALESCE(status='published',0) as is_visible,published_at FROM posts ORDER BY id DESC LIMIT 5`);
		note(`✅ Posts query OK: ${posts.length} rows`);
		
		note('Testing podcasts query...');
		const [podcasts] = await pool.query(`SELECT id,title,published_at FROM podcasts ORDER BY id DESC LIMIT 5`);
		note(`✅ Podcasts query OK: ${podcasts.length} rows`);
		
		return res.json({ 
			success: true, 
			timestamp: new Date().toISOString(), 
			posts_count: posts.length, 
			podcasts_count: podcasts.length,
			sample_post: posts[0] || null,
			errors 
		});
	} catch(e) {
		note(`❌ ERROR: ${e.message}`);
		return res.json({ success: false, error: e.message, errors });
	}
});

router.get('/tools/diag', isAuth, async (req,res)=>{
	const debug = process.env.ADMIN_TOOLS_DEBUG === 'true' || true;
	console.log('[ADMIN_DIAG] Starting diagnostic...');
	
	const diag = {
		timestamp: new Date().toISOString(),
		debug: debug,
		database: {
			connected: false,
			tables: [],
			sample_queries: {}
		},
		media: {
			uploads_dir_exists: false,
			placeholders_exist: false,
			sample_files: []
		},
		environment: {
			db_name: process.env.DB_NAME,
			db_host: process.env.DB_HOST,
			node_env: process.env.NODE_ENV
		}
	};

	// Database diagnostics
	try {
		console.log('[ADMIN_DIAG] Testing database connection...');
		await pool.query('SELECT 1');
		diag.database.connected = true;
		
		// Get tables
		const [tables] = await pool.query('SHOW TABLES');
		const key = Object.keys(tables[0] || {})[0];
		diag.database.tables = tables.map(r => r[key]);
		console.log('[ADMIN_DIAG] Found tables:', diag.database.tables.length);
		
		// Test key tables
		if (diag.database.tables.includes('posts')) {
			const [posts] = await pool.query('SELECT COUNT(*) as count FROM posts');
			diag.database.sample_queries.posts_count = posts[0].count;
		}
		if (diag.database.tables.includes('media')) {
			const [media] = await pool.query('SELECT COUNT(*) as count FROM media');
			diag.database.sample_queries.media_count = media[0].count;
		}
		if (diag.database.tables.includes('podcasts')) {
			const [podcasts] = await pool.query('SELECT COUNT(*) as count FROM podcasts');
			diag.database.sample_queries.podcasts_count = podcasts[0].count;
		}
	} catch (e) {
		console.error('[ADMIN_DIAG] Database error:', e);
		diag.database.error = e.message;
	}

	// Media diagnostics
	try {
		const fs = require('fs');
		const path = require('path');
		
		const uploadsDir = path.join(__dirname, '../../httpdocs/uploads');
		const placeholdersDir = path.join(__dirname, '../../httpdocs/uploads/placeholders');
		
		diag.media.uploads_dir_exists = fs.existsSync(uploadsDir);
		diag.media.placeholders_exist = fs.existsSync(placeholdersDir);
		
		console.log('[ADMIN_DIAG] Uploads dir exists:', diag.media.uploads_dir_exists);
		console.log('[ADMIN_DIAG] Placeholders exist:', diag.media.placeholders_exist);
		
		if (diag.media.uploads_dir_exists) {
			const files = fs.readdirSync(uploadsDir);
			diag.media.sample_files = files.slice(0, 10); // First 10 files
		}
	} catch (e) {
		console.error('[ADMIN_DIAG] Media diagnostics error:', e);
		diag.media.error = e.message;
	}

	console.log('[ADMIN_DIAG] Diagnostic complete');
	res.json(diag);
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

// Diagnostic endpoint: authenticated helper to verify DB user and selected database.
// Returns JSON with CURRENT_USER() and DATABASE() to assist in triage when raw/tables views show no data.
router.get('/tools/diag', isAuth, async (req,res)=>{
	const debug = process.env.ADMIN_TOOLS_DEBUG === 'true';
	try {
		const [rows] = await pool.query('SELECT CURRENT_USER() AS current_user, DATABASE() AS database_name');
		const info = rows && rows[0] ? rows[0] : {};
		const out = { current_user: info.current_user || null, database_name: info.database_name || null, env_DB_NAME: process.env.DB_NAME || null, debug };

		// Try to run SHOW TABLES to detect permission issues or wrong DB selection
		try {
			const [tablesRows] = await pool.query('SHOW TABLES');
			if(Array.isArray(tablesRows) && tablesRows.length){
				const key = Object.keys(tablesRows[0])[0];
				out.tables_sample = tablesRows.slice(0,20).map(r=>r[key]);
				out.tables_count = tablesRows.length;
			} else {
				out.tables_sample = [];
				out.tables_count = 0;
			}
		} catch(e){
			out.show_tables_error = e.message;
		}

		// Check whether querying information_schema is allowed (helps identify metadata privilege issues)
		try {
			const [cntRows] = await pool.query("SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE()");
			out.info_schema_count = (cntRows && cntRows[0] && cntRows[0].c != null) ? cntRows[0].c : null;
		} catch(e){
			out.info_schema_error = e.message;
		}

		return res.json(out);
	} catch(e){
		console.error('Admin Tools Diag Error', e);
		return res.status(500).json({ error: e.message, env_DB_NAME: process.env.DB_NAME || null, debug });
	}
});

// Simple filename-based alt-text fallback endpoint (used by client when uploading new files)
router.post('/generate-alt-text', isAuth, async (req,res)=>{
	try {
		const filename = (req.body && req.body.filename) ? String(req.body.filename) : '';
		if(!filename) return res.status(400).json({ error:'Filename required' });
		// Heuristic: use filename without extension and replace separators with spaces
		const base = filename.replace(/[-_]/g,' ').replace(/\.[a-zA-Z0-9]+$/,'').trim();
		const alt = 'Bild: ' + (base.substring(0,120) || 'Unbenannt');
		const description = 'Automatisch erstellte Beschreibung für ' + (base.substring(0,200) || 'die Datei');
		return res.json({ alt, description, success:true });
	} catch(e){
		console.error('Generate alt-text fallback error', e);
		return res.status(500).json({ error:'internal' });
	}
});

// List uploads directory contents (authenticated). Useful to verify files exist and permissions.
router.get('/tools/uploads', isAuth, async (req,res)=>{
	const fs = require('fs').promises;
	const path = require('path');
	const uploadDir = path.join(__dirname,'..','..','httpdocs','uploads');
	try {
		const names = await fs.readdir(uploadDir);
		const list = [];
		for(const n of names.slice(0,500)){
			try {
				const st = await fs.stat(path.join(uploadDir,n));
				list.push({ name: n, size: st.size, mtime: st.mtime, isFile: st.isFile() });
			} catch(e){ list.push({ name: n, error: e.message }); }
		}
		return res.json({ count: names.length, sample: list });
	} catch(e){
		console.error('Uploads diag error', e);
		return res.status(500).json({ error: e.message });
	}
});

module.exports = router;
