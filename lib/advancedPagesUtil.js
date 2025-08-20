// Shared utilities for Advanced Pages (layout rendering, slug handling, table ensure)
const pool = require('../db');

async function ensureAdvancedPagesTables(){
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS advanced_pages (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255) NOT NULL, slug VARCHAR(255) NOT NULL UNIQUE, layout_json MEDIUMTEXT, rendered_html MEDIUMTEXT, is_template TINYINT(1) NOT NULL DEFAULT 0, status VARCHAR(32) NOT NULL DEFAULT 'draft', seo_title VARCHAR(255), seo_description VARCHAR(255), meta_keywords VARCHAR(255), meta_image VARCHAR(255), updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
    try { await pool.query('ALTER TABLE advanced_pages ADD COLUMN seo_title VARCHAR(255)'); } catch(_){ }
    try { await pool.query('ALTER TABLE advanced_pages ADD COLUMN seo_description VARCHAR(255)'); } catch(_){ }
    try { await pool.query('ALTER TABLE advanced_pages ADD COLUMN meta_keywords VARCHAR(255)'); } catch(_){ }
    try { await pool.query('ALTER TABLE advanced_pages ADD COLUMN meta_image VARCHAR(255)'); } catch(_){ }
    await pool.query(`CREATE TABLE IF NOT EXISTS advanced_page_generation_logs (id INT AUTO_INCREMENT PRIMARY KEY, topic VARCHAR(255), intent VARCHAR(64), sections VARCHAR(255), style_profile VARCHAR(64), diagnostics JSON NULL, layout_json MEDIUMTEXT, research_json MEDIUMTEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  } catch(e){ console.warn('[advancedPagesUtil] ensure tables failed', e.message); }
}

// NOTE: Keep original regex behavior (even though /^-|-$|/ has an empty alternative). Future improvement could tighten to /^-+|-+$/g.
function safeSlug(base){
  let s=(base||'').toLowerCase().trim().replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,'').replace(/--+/g,'-').replace(/^-|-$|/g,'');
  if(!s) s='page-'+Date.now();
  return s.slice(0,180);
}
async function ensureUniqueSlug(slug,id){
  let final=slug; let i=2;
  while(true){
    const [rows]=await pool.query('SELECT id FROM advanced_pages WHERE slug=? AND id<>?',[final,id||0]);
    if(!rows.length) return final;
    final=slug+'-'+i++;
  }
}
function escapeHtml(str){ return (str||'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function renderAdvancedLayout(layout,helpers){
  let html='';
  if(!layout||!Array.isArray(layout.rows)) return '';
  for(const row of layout.rows){
    html+='<section class="ap-row">';
    if(!Array.isArray(row.columns)) continue;
    html+='<div class="row g-4">';
    for(const col of row.columns){
      html+='<div class="col-md-'+(col.width||12)+'">';
      if(Array.isArray(col.blocks)){
        for(const b of col.blocks){
          if(b.type==='image'){
            html+='<figure class="ap-block-image"><img src="'+escapeHtml(b.src||'')+'" alt="'+escapeHtml(b.alt||'')+'" class="img-fluid"/>'+(b.caption?'<figcaption class="small text-muted">'+escapeHtml(b.caption)+'</figcaption>':'')+'</figure>';
          } else if(b.type==='background'){
            html+='<div class="ap-block-bg" style="background:'+(b.bgColor||'#f5f5f5')+';padding:'+(b.padding||'20px')+';">'+(b.html||'')+'</div>';
          } else if(b.type==='text'||b.type==='html'){
            html+='<div class="ap-block-text">'+(b.html||'')+'</div>';
          } else if(b.type==='hero'){
            html+='<div class="ap-hero" style="position:relative;min-height:'+(b.height||'50vh')+';display:flex;align-items:center;justify-content:'+(b.align||'center')+';background:#222;color:#fff;">'+(b.image?'<img src="'+escapeHtml(b.image)+'" alt="" style="object-fit:cover;position:absolute;top:0;left:0;width:100%;height:100%;opacity:'+(b.overlayOpacity?Math.max(0,Math.min(1,b.overlayOpacity)):0.4)+';filter:brightness(0.6);"/>':'')+'<div class="container position-relative"><h1 class="display-5">'+escapeHtml(b.title||'')+'</h1><p class="lead">'+escapeHtml(b.subtitle||'')+'</p>'+(b.ctaText?'<a class="btn btn-primary" href="'+escapeHtml(b.ctaUrl||'#')+'">'+escapeHtml(b.ctaText)+'</a>':'')+'</div></div>';
          } else if(b.type==='post-link' && b.postId && helpers && helpers.posts){
            const p=helpers.posts[b.postId];
            if(p){ html+='<div class="ap-post-link card h-100"><div class="card-body"><h3 class="h5">'+escapeHtml(p.title)+'</h3><p class="small text-muted">'+escapeHtml((p.whatsnew||'').slice(0,140))+'</p><a href="/blog/'+escapeHtml(p.slug||'')+'" class="stretched-link">Mehr</a></div></div>'; }
          } else if(b.type==='podcast-link' && b.podcastId && helpers && helpers.podcasts){
            const pod=helpers.podcasts[b.podcastId];
            if(pod){ html+='<div class="ap-podcast-link card h-100"><div class="card-body"><h3 class="h6">'+escapeHtml(pod.title)+'</h3><p class="small text-muted">'+escapeHtml((pod.description||'').slice(0,140))+'</p><a href="/podcasts/'+pod.id+'" class="stretched-link">Anhören</a></div></div>'; }
          }
        }
      }
      html+='</div>';
    }
    html+='</div></section>';
  }
  return html.replace(/<script[\s\S]*?<\/script>/gi,'');
}

module.exports = { ensureAdvancedPagesTables, safeSlug, ensureUniqueSlug, escapeHtml, renderAdvancedLayout };
