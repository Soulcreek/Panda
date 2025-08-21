const express = require('express');
const router = express.Router();
const { pool, isEditor } = require('./_shared');

async function ensureTimelineTables(){
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS timeline_entries (id INT AUTO_INCREMENT PRIMARY KEY, site_key VARCHAR(64) NOT NULL, position INT NOT NULL DEFAULT 0, level INT NOT NULL DEFAULT 1, title VARCHAR(255) NOT NULL, phase VARCHAR(120), content_html MEDIUMTEXT, is_active TINYINT NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS timeline_site_config (id INT AUTO_INCREMENT PRIMARY KEY, site_key VARCHAR(64) UNIQUE, level_count INT NOT NULL DEFAULT 3, design_theme VARCHAR(32) DEFAULT 'glass')`);
    await pool.query(`CREATE TABLE IF NOT EXISTS timeline_levels (id INT AUTO_INCREMENT PRIMARY KEY, site_key VARCHAR(64) NOT NULL, level_index INT NOT NULL, title VARCHAR(255), image_path VARCHAR(255), icon VARCHAR(120), content_html MEDIUMTEXT, UNIQUE KEY uniq_level (site_key, level_index))`);
    try { await pool.query('ALTER TABLE timeline_entries ADD COLUMN level INT NOT NULL DEFAULT 1'); } catch(_){ }
    try { await pool.query('ALTER TABLE timeline_levels ADD COLUMN icon VARCHAR(120)'); } catch(_){ }
    try { await pool.query('ALTER TABLE timeline_levels ADD COLUMN content_html MEDIUMTEXT'); } catch(_){ }
  } catch(e){ console.warn('ensureTimelineTables failed', e.message); }
}

// Timeline Editor (multi-tenant aware). Non-admin users forced to their req.siteKey.
router.get('/timeline-editor', isEditor, async (req,res)=>{ 
  let site = (req.query.site||'').toString().trim();
  const isAdmin = !!(req.session && (req.session.role==='admin' || req.session.adminTokenValid));
  if(!site) site = req.siteKey; // default to current tenant
  if(!isAdmin && site !== req.siteKey) site = req.siteKey; // prevent cross-tenant access
  // basic sanitization
  site = site.toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,64) || 'default';
  const level=parseInt(req.query.level||'0',10)||1; 
  await ensureTimelineTables(); 
  try { 
    const [[cfg]] = await pool.query('SELECT * FROM timeline_site_config WHERE site_key=?',[site]); 
    if(!cfg){ await pool.query('INSERT INTO timeline_site_config (site_key, level_count, design_theme) VALUES (?,?,?)',[site,3,'glass']); }
    const [[cfg2]] = await pool.query('SELECT * FROM timeline_site_config WHERE site_key=?',[site]); 
    if(req.query.level){ 
      const [[lvlMeta]] = await pool.query('SELECT * FROM timeline_levels WHERE site_key=? AND level_index=?',[site,level]); 
      const levelMeta=lvlMeta||null; 
      const [entries]=await pool.query('SELECT * FROM timeline_entries WHERE site_key=? AND level=? ORDER BY position ASC, id ASC',[site,level]); 
      return res.render('editors_timeline_editor',{ title:'Timeline Editor', site, level, siteConfig:cfg2, entries, levelMeta }); 
    } 
    const [levelsRaw]=await pool.query('SELECT level_index, COALESCE(title, CONCAT("Level ",level_index)) title, image_path, icon, (SELECT COUNT(*) FROM timeline_entries te WHERE te.site_key=tl.site_key AND te.level=tl.level_index AND te.is_active=1) entry_count FROM timeline_levels tl WHERE site_key=? ORDER BY level_index ASC',[site]); 
    if(!levelsRaw.length){ for(let i=1;i<=cfg2.level_count;i++){ try { await pool.query('INSERT IGNORE INTO timeline_levels (site_key, level_index, title) VALUES (?,?,?)',[site,i,'Level '+i]); } catch(_){} } } 
    const [levelsFinal]=await pool.query('SELECT level_index, COALESCE(title, CONCAT("Level ",level_index)) title, image_path, icon, (SELECT COUNT(*) FROM timeline_entries te WHERE te.site_key=tl.site_key AND te.level=tl.level_index AND te.is_active=1) entry_count FROM timeline_levels tl WHERE site_key=? ORDER BY level_index ASC',[site]); 
    res.render('editors_timeline_levels',{ title:'Timeline Levels', site, config:cfg2, levels:levelsFinal }); 
  } catch(e){ res.status(500).send('Timeline Fehler'); } 
});

router.post('/timeline-editor/site-config', isEditor, async (req,res)=>{ const { site_key, level_count, design_theme }=req.body; let site= (site_key||'').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,64); if(!site) return res.status(400).send('site_key fehlt'); const isAdmin= !!(req.session && (req.session.role==='admin' || req.session.adminTokenValid)); if(!isAdmin && site!==req.siteKey) site = req.siteKey; await ensureTimelineTables(); try { await pool.query('INSERT INTO timeline_site_config (site_key, level_count, design_theme) VALUES (?,?,?) ON DUPLICATE KEY UPDATE level_count=VALUES(level_count), design_theme=VALUES(design_theme)',[site, parseInt(level_count||'3',10), design_theme||'glass']); for(let i=1;i<=parseInt(level_count||'3',10);i++){ try { await pool.query('INSERT IGNORE INTO timeline_levels (site_key, level_index, title) VALUES (?,?,?)',[site,i,'Level '+i]); } catch(_){} } res.redirect('/editors/timeline-editor?site='+encodeURIComponent(site)); } catch(e){ res.status(500).send('Config Fehler'); } });
router.post('/timeline-editor/level-meta/:site/:level', isEditor, async (req,res)=>{ let { site, level }=req.params; const { title, image_path, icon, content_html }=req.body; site = site.toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,64); const isAdmin= !!(req.session && (req.session.role==='admin' || req.session.adminTokenValid)); if(!isAdmin && site!==req.siteKey) site = req.siteKey; await ensureTimelineTables(); try { await pool.query('INSERT INTO timeline_levels (site_key, level_index, title, image_path, icon, content_html) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE title=VALUES(title), image_path=VALUES(image_path), icon=VALUES(icon), content_html=VALUES(content_html)',[site, parseInt(level,10), title||null, image_path||null, icon||null, content_html||null]); res.redirect('/editors/timeline-editor?site='+encodeURIComponent(site)+'&level='+level); } catch(e){ res.status(500).send('Level Meta Fehler'); } });
router.post('/timeline-editor/add', isEditor, async (req,res)=>{ let { site_key, title, phase, content_html, position, level }=req.body; if(!site_key) site_key=req.siteKey; site_key = site_key.toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,64); const isAdmin = !!(req.session && (req.session.role==='admin' || req.session.adminTokenValid)); if(!isAdmin && site_key!==req.siteKey) site_key = req.siteKey; await ensureTimelineTables(); try { await pool.query('INSERT INTO timeline_entries (site_key, position, level, title, phase, content_html) VALUES (?,?,?,?,?,?)',[site_key, parseInt(position||'0',10), parseInt(level||'1',10), title, phase||null, content_html||'']); res.redirect('/editors/timeline-editor?site='+encodeURIComponent(site_key)+'&level='+(level||1)); } catch(e){ res.status(500).send('Add Fehler'); } });
router.post('/timeline-editor/update/:id', isEditor, async (req,res)=>{ const { id }=req.params; const { title, phase, content_html, is_active }=req.body; try { await pool.query('UPDATE timeline_entries SET title=?, phase=?, content_html=?, is_active=? WHERE id=?',[title, phase||null, content_html||'', is_active?1:0, id]); res.redirect('back'); } catch(e){ res.status(500).send('Update Fehler'); } });
router.post('/timeline-editor/toggle/:id', isEditor, async (req,res)=>{ const { id }=req.params; try { await pool.query('UPDATE timeline_entries SET is_active=1-is_active WHERE id=?',[id]); res.redirect('back'); } catch(e){ res.status(500).send('Toggle Fehler'); } });
router.post('/timeline-editor/delete/:id', isEditor, async (req,res)=>{ const { id }=req.params; try { await pool.query('UPDATE timeline_entries SET is_active=0 WHERE id=?',[id]); res.redirect('back'); } catch(e){ res.status(500).send('Delete Fehler'); } });
router.post('/timeline-editor/reorder', isEditor, async (req,res)=>{ try { const orders=JSON.parse(req.body.orders||'[]'); for(const o of orders){ await pool.query('UPDATE timeline_entries SET position=? WHERE id=?',[o.position, o.id]); } res.json({ ok:true }); } catch(e){ res.apiError(500,{ error:'Reorder Fehler', code:'TIMELINE_REORDER', detail:e.message }); } });
router.get('/api/timeline-entry/:id', isEditor, async (req,res)=>{ try { const [[row]] = await pool.query('SELECT id,title,phase,content_html,is_active FROM timeline_entries WHERE id=?',[req.params.id]); if(!row) return res.apiError(404,{ error:'Nicht gefunden', code:'TIMELINE_ENTRY_NOT_FOUND' }); res.json(row); } catch(e){ res.apiError(500,{ error:'Timeline Fetch Fehler', code:'TIMELINE_FETCH', detail:e.message }); } });

module.exports = router;
