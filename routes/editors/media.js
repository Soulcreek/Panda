const express = require('express');
const router = express.Router();
const { pool, isEditor } = require('./_shared');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { validateUploadedFile } = require('../../lib/uploadValidation');

// Helper: fetch categories
async function fetchCategories(){
	try { const [cats] = await pool.query('SELECT slug,label FROM media_categories ORDER BY label ASC'); return cats; } catch(e){ return []; }
}

// Medienbibliothek
router.get('/media', isEditor, async (req,res)=>{ try {
	const [rows]=await pool.query('SELECT m.*, mc.label AS category_label FROM media m LEFT JOIN media_categories mc ON m.category_id=mc.id ORDER BY m.uploaded_at DESC');
	const cats = await fetchCategories();
	res.render('editors_media_library',{ title:'Medien', files:rows, mediaCategories:cats });
} catch(e){ res.status(500).send('Medien Fehler'); } });
router.get('/media/edit/:id', isEditor, async (req,res)=>{ try { const [[file]] = await pool.query('SELECT m.*, mc.label AS category_label FROM media m LEFT JOIN media_categories mc ON m.category_id=mc.id WHERE m.id=?',[req.params.id]); res.render('editors_edit_media',{ title:'Medien bearbeiten', file }); } catch(e){ res.status(500).send('Medien Edit Fehler'); } });
router.post('/media/edit/:id', isEditor, async (req,res)=>{ const { name, alt_text, description, seo_alt, seo_description, meta_keywords, category }=req.body; try {
	let catSlug = category||null; let catId = null;
	if(catSlug){
		try { const [c] = await pool.query('SELECT id FROM media_categories WHERE slug=? OR label=? LIMIT 1',[catSlug,catSlug]); if(c.length){ catId=c[0].id; catSlug = c[0].slug || catSlug; } else { return res.status(400).send('Ungültige Kategorie'); } } catch(_){ }
	}
	await pool.query('UPDATE media SET name=?, alt_text=?, description=?, seo_alt=?, seo_description=?, meta_keywords=?, category=?, category_id=? WHERE id=?',[name, alt_text, description, seo_alt, seo_description, meta_keywords, catSlug, catId, req.params.id]); res.redirect('/editors/media'); } catch(e){ res.status(500).send('Medien Update Fehler'); } });

// Media API
router.get('/api/media', isEditor, async (req,res)=>{ try { const { category, type } = req.query; let sql='SELECT m.id,m.name,m.path,m.type,m.alt_text,m.description,m.category,m.category_id,m.uploaded_at, mc.label AS category_label FROM media m LEFT JOIN media_categories mc ON m.category_id=mc.id'; const cond=[]; const vals=[]; if(category){ cond.push('(m.category=? OR mc.slug=?)'); vals.push(category,category); } if(type){cond.push('m.type LIKE ?');vals.push(type+'%');} if(cond.length) sql+=' WHERE '+cond.join(' AND '); sql+=' ORDER BY m.uploaded_at DESC LIMIT 500'; const [rows]=await pool.query(sql,vals); res.json(rows); } catch(e){ res.apiError(500,{ error:'Media Liste Fehler', code:'MEDIA_LIST', detail:e.message }); } });

// Uploads
const uploadDir = path.join(__dirname,'..','..','httpdocs','uploads'); try { fs.mkdirSync(uploadDir,{recursive:true}); } catch(_){ }
const storage = multer.diskStorage({ destination:(req,file,cb)=>cb(null,uploadDir), filename:(req,file,cb)=>{ const ext=path.extname(file.originalname).toLowerCase(); cb(null, Date.now()+'-'+Math.round(Math.random()*1e6)+ext);} });
// Increase limit to align with validation config (8MB) but still protect server
const upload = multer({ storage, limits:{ fileSize:8*1024*1024 } });

router.post('/api/upload-inline-image', isEditor, upload.single('file'), async (req,res)=>{ try {
	if(!req.file) return res.apiError(400,{error:'Datei fehlt', code:'NO_FILE'});
	const problems = await validateUploadedFile(req.file);
	if(problems.length){
		try { fs.unlinkSync(req.file.path); } catch(_){ }
		return res.apiError(400,{ error:'Upload Validierung fehlgeschlagen', code:'UPLOAD_INVALID', detail:problems.join('; ') });
	}
	const filename=req.file.filename; const relPath='/uploads/'+filename;
	try{ await pool.query('INSERT INTO media (name,path,type,alt_text,description,category,category_id) VALUES (?,?,?,?,?,?,?)',[filename,relPath,req.file.mimetype,'','',null,null]); } catch(_){ }
	res.json({ path:relPath, name:filename });
} catch(e){ res.apiError(500,{ error:'Upload fehlgeschlagen', code:'UPLOAD_FAIL', detail:e.message }); } });
router.post('/upload', isEditor, upload.array('mediaFiles',25), async (req,res)=>{ try {
	if(!req.files||!req.files.length) return res.redirect('/editors/media');
	const { base_name, alt_text, description, category }=req.body;
	for(const f of req.files){
		const problems = await validateUploadedFile(f);
		if(problems.length){
			try { fs.unlinkSync(f.path); } catch(_){ }
			// Store a minimal rejected log entry? (optional)
			continue; // Skip invalid file silently for bulk upload; could flash message later
		}
		let storedName=f.filename;
		if(base_name){
			const ext=path.extname(f.originalname).toLowerCase();
			const baseSafe=base_name.replace(/[^a-zA-Z0-9_-]+/g,'-');
			const seq=(req.files.length>1)?('-'+(req.files.indexOf(f)+1)) : '';
			const newName=Date.now()+'-'+baseSafe+seq+ext;
			try{ fs.renameSync(path.join(uploadDir,storedName), path.join(uploadDir,newName)); storedName=newName; } catch(_){ }
		}
			const relPath='/uploads/'+storedName;
			// Validate category existence (best-effort)
			let catVal = category||null;
			if(catVal){ try { const [c] = await pool.query('SELECT 1 FROM media_categories WHERE slug=? OR label=? LIMIT 1',[catVal,catVal]); if(!c.length) catVal=null; } catch(_){ catVal=null; } }
			// Resolve category_id
			let catId=null; if(catVal){ try { const [c] = await pool.query('SELECT id,slug FROM media_categories WHERE slug=? OR label=? LIMIT 1',[catVal,catVal]); if(c.length){ catId=c[0].id; catVal=c[0].slug; } } catch(_){ catId=null; }}
			try{ await pool.query('INSERT INTO media (name,path,type,alt_text,description,category,category_id) VALUES (?,?,?,?,?,?,?)',[storedName,relPath,f.mimetype,alt_text||'',description||'',catVal,catId]); } catch(_){}
	}
	res.redirect('/editors/media');
} catch(e){ res.status(500).send('Upload Fehler'); } });

	// API: list categories
	router.get('/api/media-categories', isEditor, async (req,res)=>{
		try { const cats = await fetchCategories(); res.json(cats); } catch(e){ res.apiError(500,{error:'Kategorie Liste Fehler', code:'MEDIA_CAT_LIST', detail:e.message}); }
	});

	// API: create category
	router.post('/api/media-categories', isEditor, async (req,res)=>{
		try { const { label } = req.body; if(!label||!label.trim()) return res.apiError(400,{error:'Label fehlt', code:'CAT_LABEL_MISSING'});
			const slug = label.trim().toLowerCase().replace(/[^a-z0-9_-\s]/g,'').replace(/\s+/g,'-').slice(0,100);
			if(!slug) return res.apiError(400,{error:'Slug leer', code:'CAT_SLUG_EMPTY'});
			await pool.query('INSERT IGNORE INTO media_categories (slug,label) VALUES (?,?)',[slug,label.trim()]);
			const cats = await fetchCategories();
			res.apiOk({ created:slug, categories:cats });
		} catch(e){ res.apiError(500,{error:'Kategorie Erstellung Fehler', code:'MEDIA_CAT_CREATE', detail:e.message}); }
	});

module.exports = router;
