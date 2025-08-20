const express = require('express');
const router = express.Router();
const { pool, isEditor } = require('./_shared');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Medienbibliothek
router.get('/media', isEditor, async (req,res)=>{ try { const [rows]=await pool.query('SELECT * FROM media ORDER BY uploaded_at DESC'); res.render('editors_media_library',{ title:'Medien', files:rows }); } catch(e){ res.status(500).send('Medien Fehler'); } });
router.get('/media/edit/:id', isEditor, async (req,res)=>{ try { const [[file]] = await pool.query('SELECT * FROM media WHERE id=?',[req.params.id]); res.render('editors_edit_media',{ title:'Medien bearbeiten', file }); } catch(e){ res.status(500).send('Medien Edit Fehler'); } });
router.post('/media/edit/:id', isEditor, async (req,res)=>{ const { name, alt_text, description, seo_alt, seo_description, meta_keywords, category }=req.body; try { await pool.query('UPDATE media SET name=?, alt_text=?, description=?, seo_alt=?, seo_description=?, meta_keywords=?, category=? WHERE id=?',[name, alt_text, description, seo_alt, seo_description, meta_keywords, category, req.params.id]); res.redirect('/editors/media'); } catch(e){ res.status(500).send('Medien Update Fehler'); } });

// Media API
router.get('/api/media', isEditor, async (req,res)=>{ try { const { category, type } = req.query; let sql='SELECT id,name,path,type,alt_text,description,category,uploaded_at FROM media'; const cond=[]; const vals=[]; if(category){cond.push('category=?');vals.push(category);} if(type){cond.push('type LIKE ?');vals.push(type+'%');} if(cond.length) sql+=' WHERE '+cond.join(' AND '); sql+=' ORDER BY uploaded_at DESC LIMIT 500'; const [rows]=await pool.query(sql,vals); res.json(rows); } catch(e){ res.status(500).json({ error:'media list error' }); } });

// Uploads
const uploadDir = path.join(__dirname,'..','..','httpdocs','uploads'); try { fs.mkdirSync(uploadDir,{recursive:true}); } catch(_){ }
const storage = multer.diskStorage({ destination:(req,file,cb)=>cb(null,uploadDir), filename:(req,file,cb)=>{ const ext=path.extname(file.originalname).toLowerCase(); cb(null, Date.now()+'-'+Math.round(Math.random()*1e6)+ext);} });
const upload = multer({ storage, limits:{ fileSize:5*1024*1024 } });

router.post('/api/upload-inline-image', isEditor, upload.single('file'), async (req,res)=>{ try { if(!req.file) return res.status(400).json({error:'no file'}); const filename=req.file.filename; const relPath='/uploads/'+filename; try{ await pool.query('INSERT INTO media (name,path,type,alt_text,description,category) VALUES (?,?,?,?,?,?)',[filename,relPath,req.file.mimetype,'','',null]); } catch(_){} res.json({ path:relPath, name:filename }); } catch(e){ res.status(500).json({ error:'upload failed' }); } });
router.post('/upload', isEditor, upload.array('mediaFiles',25), async (req,res)=>{ try { if(!req.files||!req.files.length) return res.redirect('/editors/media'); const { base_name, alt_text, description, category }=req.body; for(const f of req.files){ let storedName=f.filename; if(base_name){ const ext=path.extname(f.originalname).toLowerCase(); const baseSafe=base_name.replace(/[^a-zA-Z0-9_-]+/g,'-'); const seq=(req.files.length>1)?('-'+(req.files.indexOf(f)+1)) : ''; const newName=Date.now()+'-'+baseSafe+seq+ext; try{ fs.renameSync(path.join(uploadDir,storedName), path.join(uploadDir,newName)); storedName=newName; } catch(_){ } } const relPath='/uploads/'+storedName; try{ await pool.query('INSERT INTO media (name,path,type,alt_text,description,category) VALUES (?,?,?,?,?,?)',[storedName,relPath,f.mimetype,alt_text||'',description||'',category||null]); } catch(_){} } res.redirect('/editors/media'); } catch(e){ res.status(500).send('Upload Fehler'); } });

module.exports = router;
