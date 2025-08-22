const express = require('express');
const pool = require('../../db');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Public media list (basic) for pickers / blog modal
router.get('/api/media', async (req, res) => {
  try {
    const { type } = req.query;
    let sql = 'SELECT id, name, type, path FROM media';
    const where = [];
    if (type === 'image') where.push("type LIKE 'image/%'");
    if (type === 'audio') where.push("type LIKE 'audio/%'");
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY uploaded_at DESC LIMIT 200';
    const [rows] = await pool.query(sql);
    res.json(rows);
  } catch (e) {
    res.apiError(500,{ error:'Media Fehler', code:'MEDIA_FETCH', detail:e.message });
  }
});

// Fallback simple media page (no-auth) to reduce "Medien Fehler" UX. Tries DB first, if fails shows a helpful message.
router.get('/media', async (req,res)=>{
  // helper: enumerate files in httpdocs/uploads as a filesystem fallback
  function listUploadFiles(){
    try {
      const uploadsDir = path.join(__dirname, '..', '..', 'httpdocs', 'uploads');
      const extsImage = new Set(['.jpg','.jpeg','.png','.gif','.webp','.svg']);
      const extsAudio = new Set(['.mp3','.ogg','.wav','.m4a']);
      const entries = [];
      function walk(dir){
        const list = fs.readdirSync(dir, { withFileTypes: true });
        for(const d of list){
          const full = path.join(dir, d.name);
          if(d.isDirectory()){
            // skip thumbnails and placeholders folders to avoid clutter
            if(d.name === 'thumbnails' || d.name === 'placeholders') continue;
            walk(full);
          } else {
            const ext = path.extname(d.name).toLowerCase();
            if(extsImage.has(ext) || extsAudio.has(ext)){
              const stat = fs.statSync(full);
              // public href from httpdocs
              const publicPath = '/uploads/' + path.relative(uploadsDir, full).replace(/\\/g,'/');
              const type = extsImage.has(ext) ? 'image/*' : 'audio/*';
              entries.push({ name: d.name, path: publicPath, type, mtimeMs: stat.mtimeMs });
            }
          }
        }
      }
      if(fs.existsSync(uploadsDir)) walk(uploadsDir);
      entries.sort((a,b)=> b.mtimeMs - a.mtimeMs);
      return entries.slice(0,200);
    } catch(_){ return []; }
  }

  try {
    const [rows] = await pool.query("SELECT id, name, type, path FROM media ORDER BY uploaded_at DESC LIMIT 200");
    let itemsHtml;
    if(rows && rows.length){
      itemsHtml = rows.map(r=>`<li><a href="${r.path}" target="_blank" rel="noopener">${r.name}</a> <small>(${r.type||''})</small></li>`).join('');
    } else {
      const fsItems = listUploadFiles();
      itemsHtml = fsItems.length ? fsItems.map(r=>`<li><a href="${r.path}" target="_blank" rel="noopener">${r.name}</a> <small>(${r.type||''})</small></li>`).join('') : '';
    }
    const hasAny = !!itemsHtml;
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Medien</title><link rel="stylesheet" href="/css/bootstrap.min.css"></head><body><div class="container my-4"><h1>Medien</h1>${hasAny? `<ul>${itemsHtml}</ul>` : '<p class="text-muted">Keine Medien gefunden.</p>'}<p class="mt-3"><a class="btn btn-sm btn-outline-secondary" href="/">Zur Startseite</a></p></div></body></html>`;
    res.set('Content-Type','text/html; charset=utf-8');
    return res.send(html);
  } catch(e){
    // Try filesystem fallback if DB fails
    const fsItems = listUploadFiles();
    const itemsHtml = fsItems.length ? fsItems.map(r=>`<li><a href="${r.path}" target="_blank" rel="noopener">${r.name}</a> <small>(${r.type||''})</small></li>`).join('') : '';
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Medien</title><link rel="stylesheet" href="/css/bootstrap.min.css"></head><body><div class="container my-4"><h1>Medien</h1>${itemsHtml? `<div class="alert alert-info">Datenbank nicht erreichbar – zeige Dateiliste als Fallback.</div><ul>${itemsHtml}</ul>` : `<div class=\"alert alert-warning\">Medien konnten nicht geladen werden.</div><p class=\"small text-muted\">${(e && e.message)||'Unbekannter Fehler'}</p>`}<p><a class="btn btn-sm btn-outline-secondary" href="/">Zur Startseite</a></p></div></body></html>`;
    res.set('Content-Type','text/html; charset=utf-8');
    return res.status(200).send(html);
  }
});

module.exports = router;
