// soulcreek/panda/Panda-master/routes/admin.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const pool = require('../db');
// Utility: ensure generator related tables & seed profiles/meta
async function ensureGeneratorTables(){
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS advanced_page_template_meta (
            id INT AUTO_INCREMENT PRIMARY KEY,
            template_id INT NOT NULL,
            category VARCHAR(64) NULL,
            tags VARCHAR(255) NULL,
            section_signature VARCHAR(255) NULL,
            recommended_intents VARCHAR(255) NULL,
            default_style_profile VARCHAR(32) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX(template_id),
            FOREIGN KEY (template_id) REFERENCES advanced_pages(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
        await pool.query(`CREATE TABLE IF NOT EXISTS generator_profiles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            description VARCHAR(255) NULL,
            default_sections VARCHAR(255) NULL,
            allowed_sections VARCHAR(255) NULL,
            heuristics JSON NULL,
            ai_prompt_template MEDIUMTEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
        const [gp] = await pool.query('SELECT COUNT(*) as c FROM generator_profiles');
        if(gp[0].c===0){
            await pool.query('INSERT INTO generator_profiles (name, description, default_sections, allowed_sections, heuristics, ai_prompt_template) VALUES (?,?,?,?,?,?)',[
                'Default Landing','Basis-Profil für Landing Pages','hero,intro,posts,cta','hero,intro,highlights,posts,podcasts,faq,cta','{"weights":{"structure":0.4,"intent":0.3,"style":0.1,"popularity":0.1,"freshness":0.1}}',
                'Erzeuge Sektion {{section}} für Thema "{{topic}}" mit Intent {{intent}} in deutscher Sprache. Kurze prägnante Sätze, sachlich.'
            ]);
        }
        // Generation Log Table
        await pool.query(`CREATE TABLE IF NOT EXISTS advanced_page_generations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            page_id INT NULL,
            topic VARCHAR(255) NOT NULL,
            intent VARCHAR(32) NOT NULL,
            sections VARCHAR(255) NOT NULL,
            score DECIMAL(5,2) NULL,
            diagnostics JSON NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX(topic), INDEX(intent)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
    } catch(e){ console.error('Generator Tables Fehler:', e.message); }
}
// Advanced Pages helper table ensure
async function ensureAdvancedPagesTable(){
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS advanced_pages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            slug VARCHAR(255) NOT NULL UNIQUE,
            layout_json MEDIUMTEXT NULL,
            rendered_html MEDIUMTEXT NULL,
            status ENUM('draft','published') NOT NULL DEFAULT 'draft',
            is_template TINYINT(1) NOT NULL DEFAULT 0,
            author_id INT NULL,
            published_at DATETIME NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX(status), INDEX(author_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
        try { await pool.query('ALTER TABLE advanced_pages ADD COLUMN is_template TINYINT(1) NOT NULL DEFAULT 0 AFTER status'); } catch(_) {}
    } catch(e){ console.error('Advanced Pages Table Fehler:', e.message); }
}
// Extend content schemas with SEO / tagging columns (idempotent)
async function ensureExtendedContentMetadata(){
    try { await pool.query("ALTER TABLE posts ADD COLUMN seo_title VARCHAR(255) NULL"); } catch(_) {}
    try { await pool.query("ALTER TABLE posts ADD COLUMN seo_description VARCHAR(255) NULL"); } catch(_) {}
    try { await pool.query("ALTER TABLE posts ADD COLUMN meta_keywords VARCHAR(255) NULL"); } catch(_) {}
    try { await pool.query("ALTER TABLE posts ADD COLUMN research_summary MEDIUMTEXT NULL"); } catch(_) {}
    try { await pool.query("ALTER TABLE podcasts ADD COLUMN tags VARCHAR(255) NULL"); } catch(_) {}
    try { await pool.query("ALTER TABLE podcasts ADD COLUMN seo_title VARCHAR(255) NULL"); } catch(_) {}
    try { await pool.query("ALTER TABLE podcasts ADD COLUMN seo_description VARCHAR(255) NULL"); } catch(_) {}
    try { await pool.query("ALTER TABLE podcasts ADD COLUMN meta_keywords VARCHAR(255) NULL"); } catch(_) {}
    try { await pool.query("ALTER TABLE podcasts ADD COLUMN research_summary MEDIUMTEXT NULL"); } catch(_) {}
    try { await pool.query("ALTER TABLE media_files ADD COLUMN seo_alt VARCHAR(255) NULL"); } catch(_) {}
    try { await pool.query("ALTER TABLE media_files ADD COLUMN seo_description VARCHAR(255) NULL"); } catch(_) {}
    try { await pool.query("ALTER TABLE media_files ADD COLUMN meta_keywords VARCHAR(255) NULL"); } catch(_) {}
    // swallow errors quietly; individual adds are idempotent
}

// --- Generator Helpers ---
function tokenize(str){ return (str||'').toLowerCase().replace(/[^a-z0-9äöüß\s]/g,' ').split(/\s+/).filter(Boolean); }
function overlapScore(aTokens,bTokens){ if(!aTokens.length||!bTokens.length) return 0; const setB=new Set(bTokens); let hit=0; aTokens.forEach(t=>{ if(setB.has(t)) hit++; }); return hit/Math.max(aTokens.length,1); }
async function buildContentIndex(){
    const [posts] = await pool.query("SELECT id, title, slug, tags, status, is_deleted, published_at FROM posts WHERE (is_deleted=0 OR is_deleted IS NULL) AND (status='published' OR status='draft') ORDER BY published_at DESC LIMIT 100");
    let podcasts=[]; try { [podcasts] = await pool.query("SELECT id, title, published_at, tags FROM podcasts ORDER BY published_at DESC LIMIT 100"); } catch(_) {}
    return { posts, podcasts };
}
async function researchTopic(topic, lang){
    // Simple in-memory cache (per topic+lang for 10 min)
    if(!global.__GEN_RESEARCH_CACHE) global.__GEN_RESEARCH_CACHE={};
    const key = (topic+'|'+lang).toLowerCase();
    const cached = global.__GEN_RESEARCH_CACHE[key];
    const now = Date.now();
    if(cached && (now - cached.ts) < 10*60*1000){ return cached.data; }
    const sources = [
        'https://www.bsi.bund.de/SiteGlobals/Functions/RSSFeed/DE/RSSNewsfeed/RSSNewsfeed.xml',
        'https://azure.microsoft.com/en-us/updates/feed/',
        'https://feeds.feedburner.com/TheHackersNews'
    ];
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), 8000);
    const topicTokens = tokenize(topic).filter(t=>t.length>2);
    let articles = [];
    try {
        await Promise.all(sources.map(async url => {
            try {
                const res = await fetch(url, { signal: controller.signal });
                if(!res.ok) return; const xml = await res.text();
                // Very lightweight RSS parsing (no external deps)
                const itemRegex = /<item[\s\S]*?<\/item>/gi; let m;
                while((m = itemRegex.exec(xml))){
                    const item = m[0];
                    const title = (item.match(/<title>([\s\S]*?)<\/title>/i)||['',''])[1].replace(/<!\[CDATA\[|\]\]>/g,'').trim();
                    const desc = (item.match(/<description>([\s\S]*?)<\/description>/i)||['',''])[1].replace(/<!\[CDATA\[|\]\]>/g,'').trim();
                    const link = (item.match(/<link>([\s\S]*?)<\/link>/i)||['',''])[1].trim();
                    if(!title) continue;
                    const lower = (title + ' ' + desc).toLowerCase();
                    const relevance = topicTokens.reduce((acc,t)=> acc + (lower.includes(t)?1:0),0);
                    if(relevance>0){
                        articles.push({ title, desc, link, relevance });
                    }
                }
            } catch(e){ /* ignore per source */ }
        }));
    } catch(e){ /* global fetch abort or other */ }
    clearTimeout(timeout);
    // Sort & trim
    articles.sort((a,b)=> b.relevance - a.relevance);
    articles = articles.slice(0,6);
    // Build key points (simple heuristic: first sentence of desc or title)
    const key_points = articles.map(a=>{
        const base = a.desc || a.title;
        const sent = base.split(/(?<=[.!?])\s+/)[0].slice(0,160);
        return (a.title.length>90? a.title.slice(0,87)+'…' : a.title)+': '+sent;
    });
    // Summarization: concatenate top titles and run frequency filter
    const allText = articles.map(a=>a.title+' '+a.desc).join(' ');
    const freq = {}; tokenize(allText).forEach(t=>{ if(t.length>3){ freq[t]=(freq[t]||0)+1; }});
    const topWords = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,8).map(e=>e[0]);
    const summary = articles.length
        ? `Fokus: ${topic}. Relevante Schlagworte: ${topWords.join(', ')}. Enthaltene Quellen: ${articles.map(a=>a.title).slice(0,3).join(' | ')}.`
        : `Keine passenden externen Artikel zu ${topic} gefunden (Basis-Sources).`;
    const data = { summary, key_points, faq: null, articles, lang };
    global.__GEN_RESEARCH_CACHE[key] = { ts: now, data };
    return data;
}
function chooseTemplate(templates, desiredSections, intent, style){
    if(!templates.length) return null;
    // naive scoring based on section_signature overlap
    let best=null, bestScore=-1;
    templates.forEach(t=>{
        const sig=(t.section_signature||'').split('|').filter(Boolean);
        const overlap = sig.length? desiredSections.filter(s=>sig.includes(s)).length / sig.length : 0;
        const score = overlap; // extend later with intent/style
        if(score>bestScore){ bestScore=score; best=t; }
    });
    return best;
}
function buildLayoutFromSections(sections, topic, contentIndex, options){
    const layout = { version:2, rows:[] };
    function addRow(preset,widths){ return { preset, columns: widths.map(w=>({ width:w, blocks:[] })) }; }
    if(sections.includes('hero')){
        layout.rows.push(addRow('full',[12]));
        const heroBlock={ id:'hero1', type:'hero', image:'', title: topic, subtitle: '', ctaText:'Mehr erfahren', ctaUrl:'#', overlayOpacity:0.5, height:'50vh', align:'center' };
        layout.rows[layout.rows.length-1].columns[0].blocks.push(heroBlock);
    }
    if(sections.includes('intro')){
        layout.rows.push(addRow('full',[12]));
        layout.rows[layout.rows.length-1].columns[0].blocks.push({ id:'intro1', type:'text', html:`<p>Einführung zu <strong>${topic}</strong>.</p>`, textColor:'', bgColor:'', classes:'lead', spacing:'pad-m' });
    }
    if(sections.includes('posts')){
        const posts = contentIndex.posts.slice(0, options.maxPosts||3);
        if(posts.length){
            layout.rows.push(addRow('three',[4,4,4]));
            posts.forEach((p,i)=>{
                const col = layout.rows[layout.rows.length-1].columns[i];
                col.blocks.push({ id:'post'+p.id, type:'post-link', postId:p.id, title:p.title, slug:p.slug });
            });
        }
    }
    if(sections.includes('podcasts')){
        const pods = contentIndex.podcasts.slice(0, Math.min(3, (options.maxPodcasts||3)));
        if(pods.length){
            layout.rows.push(addRow('three',[4,4,4]));
            pods.forEach((p,i)=>{ const col=layout.rows[layout.rows.length-1].columns[i]; col.blocks.push({ id:'pod'+p.id, type:'podcast-link', podcastId:p.id, title:p.title, description:'' }); });
        }
    }
    if(sections.includes('highlights')){
        const points = (options.research && options.research.key_points) ? options.research.key_points.slice(0,3) : ['Highlight 1','Highlight 2','Highlight 3'];
        layout.rows.push(addRow('three',[4,4,4]));
        points.forEach((pt,i)=>{ layout.rows[layout.rows.length-1].columns[i].blocks.push({ id:'hl'+i, type:'text', html:`<h4>${pt.split(':')[0]}</h4><p>${pt}</p>`, classes:'ap-highlight text-center', spacing:'pad-m' }); });
    }
    if(sections.includes('faq')){
        const faqs = (options.research && options.research.faq) ? options.research.faq : [
            {q:`Was ist ${topic}?`, a:`Kurze erklärende Antwort zu ${topic} in einfachen Worten.`},
            {q:`Warum ist ${topic} wichtig?`, a:`Bedeutung & Nutzen kurz umrissen.`},
            {q:`Wie starte ich mit ${topic}?`, a:`Ein erster Schritt / Quickstart Hinweis.`}
        ];
        layout.rows.push(addRow('full',[12]));
        const htmlFaq = faqs.map(f=>`<h4>${f.q}</h4><p>${f.a}</p>`).join('');
        layout.rows[layout.rows.length-1].columns[0].blocks.push({ id:'faq1', type:'text', html: htmlFaq, classes:'ap-faq', spacing:'pad-l' });
    }
    if(sections.includes('cta')){
        layout.rows.push(addRow('full',[12]));
        layout.rows[layout.rows.length-1].columns[0].blocks.push({ id:'cta1', type:'text', html:`<h3>Jetzt mehr zu ${topic} entdecken</h3><p>Kontakt aufnehmen oder Ressourcen ansehen.</p>`, classes:'text-center fw-bold', spacing:'pad-l' });
    }
    return layout;
}
// Reuse rendering logic from save route (light wrapper)
function renderAdvancedPageHTML(layout){
    try {
        const layoutObj = typeof layout==='string'? JSON.parse(layout): layout;
        let htmlParts=['<div class="ap-page">'];
        (layoutObj.rows||[]).forEach((row,rowIndex)=>{
            const preset=row.preset||'custom';
            htmlParts.push(`<section class="ap-row ap-preset-${preset}" data-row="${rowIndex}"><div class="container-fluid"><div class="row g-4">`);
            (row.columns||[]).forEach((col,colIndex)=>{
                const width = parseInt(col.width,10)||12;
                htmlParts.push(`<div class="col-md-${Math.min(Math.max(width,1),12)} ap-col" data-col="${colIndex}">`);
                (col.blocks||[]).forEach(block=>{ if(!block||typeof block!=='object') return; const bType=block.type||'text';
                    if(bType==='text'||bType==='html'){ const classes=['ap-block',`ap-block-${bType}`]; if(block.classes) classes.push(block.classes); if(block.spacing) classes.push(block.spacing); htmlParts.push(`<div class="${classes.join(' ')}">${block.html||''}</div>`); }
                    else if(bType==='post-link'){ if(block.postId&&block.title){ htmlParts.push(`<div class="ap-block ap-block-post-link"><a href="/blog/${block.slug||''}">${block.title}</a></div>`); } }
                    else if(bType==='podcast-link'){ if(block.podcastId&&block.title){ htmlParts.push(`<div class="ap-block ap-block-podcast-link"><a href="/podcasts#ep-${block.podcastId}">${block.title}</a></div>`); } }
                    else if(bType==='hero'){ htmlParts.push(`<div class="ap-block ap-block-hero"><div class="ap-hero" style="position:relative;background:${block.image?`url('${block.image}') center/cover no-repeat`:'#222'};height:${block.height||'50vh'}"><div class="ap-hero-overlay" style="position:absolute;inset:0;background:#000;opacity:${block.overlayOpacity||0.5}"></div><div class="ap-hero-inner container h-100 d-flex flex-column justify-content-center text-${block.align||'center'}" style="position:relative;z-index:2;"><div class="ap-hero-title display-6 fw-bold text-white">${block.title||''}</div>${block.subtitle?`<p class='ap-hero-sub lead text-white-50'>${block.subtitle}</p>`:''}${(block.ctaText&&block.ctaUrl)?`<p><a href='${block.ctaUrl}' class='btn btn-primary btn-lg'>${block.ctaText}</a></p>`:''}</div></div></div>`); }
                });
                htmlParts.push('</div>');
            });
            htmlParts.push('</div></div></section>');
        });
        htmlParts.push('</div>');
        return htmlParts.join('');
    } catch(e){ return ''; }
}

// --- Generator Endpoints ---
router.get('/advanced-pages/generator', isAuthenticated, async (req,res)=>{
    await ensureAdvancedPagesTable(); await ensureGeneratorTables(); await ensureExtendedContentMetadata();
    const [templates] = await pool.query('SELECT ap.id, ap.title, ap.slug, m.section_signature FROM advanced_pages ap LEFT JOIN advanced_page_template_meta m ON m.template_id=ap.id WHERE ap.is_template=1 ORDER BY ap.updated_at DESC LIMIT 50');
    // recent generation logs (latest 20)
    let genLogs=[]; try { const [g] = await pool.query('SELECT id, topic, intent, sections, created_at FROM advanced_page_generations ORDER BY id DESC LIMIT 20'); genLogs=g; } catch(_) {}
    res.render('admin_advanced_pages_generator', { title:'Page Generator', templates, genLogs });
});
router.post('/advanced-pages/generate', isAuthenticated, async (req,res)=>{
    await ensureAdvancedPagesTable(); await ensureGeneratorTables(); await ensureExtendedContentMetadata();
    try {
        const { topic, intent='inform', styleProfile='light', sections='', maxPosts=3, maxPodcasts=3, templateId, dryRun } = req.body;
        if(!topic || topic.length<3) return res.status(400).send('Topic zu kurz');
        // Simple in-memory rate limit per user
        const uid = req.session.userId || 'anon';
        if(!global.__GEN_LIMIT) global.__GEN_LIMIT={};
        const bucket = global.__GEN_LIMIT[uid] || { count:0, reset: Date.now()+3600000 };
        if(Date.now()>bucket.reset){ bucket.count=0; bucket.reset=Date.now()+3600000; }
        if(bucket.count>=20) return res.status(429).send('Limit erreicht (20/h)');
    const desiredSections = (sections?sections.split(','):['hero','intro','posts','cta']).map(s=>s.trim()).filter(Boolean);
    // AI usage tracking (counts every generator invocation)
    try { await incrementAIUsage('generator'); } catch(_){}
        const [templates] = await pool.query('SELECT ap.id, ap.title, ap.slug, m.section_signature FROM advanced_pages ap LEFT JOIN advanced_page_template_meta m ON m.template_id=ap.id WHERE ap.is_template=1');
        const templateMeta = chooseTemplate(templates, desiredSections, intent, styleProfile);
        const index = await buildContentIndex();
        const research = await researchTopic(topic,'de');
        const layout = buildLayoutFromSections(desiredSections, topic, index, { maxPosts: parseInt(maxPosts,10)||3, maxPodcasts: parseInt(maxPodcasts,10)||3, intent, styleProfile, research });
        const layout_json = JSON.stringify(layout);
        const rendered_html = renderAdvancedPageHTML(layout);
        const diagnostics = { template_used: templateMeta?templateMeta.id:null, sections_requested: desiredSections, posts_used: layout.rows.flatMap(r=>r.columns.flatMap(c=>c.blocks)).filter(b=>b.type==='post-link').length, podcasts_used: layout.rows.flatMap(r=>r.columns.flatMap(c=>c.blocks)).filter(b=>b.type==='podcast-link').length, research_summary: research.summary };
        if(dryRun==='1'){
            // Log dry-run details (no page insert)
            try { await ensureAIUsageTable(); await pool.query('INSERT INTO ai_call_log (endpoint, prompt_text, response_chars) VALUES (?,?,?)',[ 'generator-dry', JSON.stringify({ topic, intent, sections:desiredSections, templateChosen: templateMeta?templateMeta.id:null, diagnostics }), rendered_html.length ]); } catch(_){}
            return res.json({ layout: JSON.parse(layout_json), used_template: templateMeta, research, rendered_preview: rendered_html, diagnostics });
        }
        const slugBase = topic.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
        const slug = slugBase+'-'+Date.now();
        const [ins] = await pool.query('INSERT INTO advanced_pages (title, slug, layout_json, rendered_html, status, is_template, author_id) VALUES (?,?,?,?,?,0,?)',[ topic, slug, layout_json, rendered_html, 'draft', req.session.userId||null ]);
        const pageId = ins.insertId;
    await pool.query('INSERT INTO advanced_page_generations (page_id, topic, intent, sections, score, diagnostics) VALUES (?,?,?,?,?,?)',[ pageId, topic, intent, desiredSections.join(','), null, JSON.stringify(diagnostics) ]);
    try { await ensureAIUsageTable(); await pool.query('INSERT INTO ai_call_log (endpoint, prompt_text, response_chars) VALUES (?,?,?)',[ 'generator', JSON.stringify({ topic, intent, sections:desiredSections, templateChosen: templateMeta?templateMeta.id:null, diagnostics }), rendered_html.length ]); } catch(_){}
        bucket.count++; global.__GEN_LIMIT[uid]=bucket;
        res.redirect('/admin/advanced-pages');
    } catch(e){ console.error('Generate Fehler', e); res.status(500).send('Generator Fehler'); }
});
// Generator diagnostics detail JSON
router.get('/advanced-pages/generation/:id', isAuthenticated, async (req,res)=>{
    try { const [rows] = await pool.query('SELECT id, page_id, topic, intent, sections, score, diagnostics, created_at FROM advanced_page_generations WHERE id=?',[req.params.id]); if(!rows.length) return res.status(404).json({error:'Not found'}); const row=rows[0]; let diag={}; try{ diag=JSON.parse(row.diagnostics||'{}'); }catch(_){} res.json({ id:row.id, topic:row.topic, intent:row.intent, sections:row.sections, score:row.score, diagnostics:diag, page_id:row.page_id, created_at:row.created_at }); } catch(e){ res.status(500).json({error:'Fetch error'}); }
});
router.get('/advanced-pages/generation', isAuthenticated, async (req,res)=>{
    const limit = Math.min(parseInt(req.query.limit||'20',10),100);
    try { const [rows] = await pool.query('SELECT id, topic, intent, sections, created_at FROM advanced_page_generations ORDER BY id DESC LIMIT '+limit); res.json(rows); } catch(e){ res.status(500).json({error:'Fetch error'}); }
});

// --- AI Metadata enrichment endpoints (stubs) ---
async function aiGenerateMetadata(kind, record){
    // Placeholder simple heuristics; integrate real AI later
    const baseTitle = (record.title||'').slice(0,60);
    return {
        seo_title: baseTitle,
        seo_description: `Überblick zu ${baseTitle} – zentrale Punkte & Mehrwert.`,
        meta_keywords: (record.tags||'').split(/[,\s]+/).filter(Boolean).slice(0,8).join(',') || 'security,data,cloud',
        tags: record.tags || 'security, governance'
    };
}
router.post('/posts/:id/ai-metadata', isAuthenticated, async (req,res)=>{
    await ensureExtendedContentMetadata();
    try { const [rows] = await pool.query('SELECT * FROM posts WHERE id=?',[req.params.id]); if(!rows.length) return res.status(404).send('Post nicht gefunden'); const meta = await aiGenerateMetadata('post', rows[0]); await pool.query('UPDATE posts SET seo_title=?, seo_description=?, meta_keywords=?, tags=? WHERE id=?',[meta.seo_title, meta.seo_description, meta.meta_keywords, meta.tags, req.params.id]); res.redirect('back'); } catch(e){ console.error('AI Meta Post Fehler', e); res.status(500).send('Fehler'); }
});
router.post('/podcasts/:id/ai-metadata', isAuthenticated, async (req,res)=>{
    await ensureExtendedContentMetadata();
    try { const [rows] = await pool.query('SELECT * FROM podcasts WHERE id=?',[req.params.id]); if(!rows.length) return res.status(404).send('Podcast nicht gefunden'); const meta = await aiGenerateMetadata('podcast', rows[0]); await pool.query('UPDATE podcasts SET seo_title=?, seo_description=?, meta_keywords=?, tags=? WHERE id=?',[meta.seo_title, meta.seo_description, meta.meta_keywords, meta.tags, req.params.id]); res.redirect('back'); } catch(e){ console.error('AI Meta Podcast Fehler', e); res.status(500).send('Fehler'); }
});
router.post('/media/:id/ai-metadata', isAuthenticated, async (req,res)=>{
    await ensureExtendedContentMetadata();
    try { const [rows] = await pool.query('SELECT * FROM media_files WHERE id=?',[req.params.id]); if(!rows.length) return res.status(404).send('Media nicht gefunden'); const m = rows[0]; const meta = { seo_alt: (m.alt_text||m.name||'').slice(0,120), seo_description: `Visual zu ${(m.category||'Thema')}`, meta_keywords: (m.category||'visual,media') }; await pool.query('UPDATE media_files SET seo_alt=?, seo_description=?, meta_keywords=? WHERE id=?',[meta.seo_alt, meta.seo_description, meta.meta_keywords, req.params.id]); res.redirect('back'); } catch(e){ console.error('AI Meta Media Fehler', e); res.status(500).send('Fehler'); }
});
// In-Memory Cache für AI Konfiguration (wird aus DB geladen)
let aiConfigCache = null; let aiConfigLoadedAt = 0;
async function getAIConfig(){
    try {
        // Tabelle sicherstellen
        await pool.query(`CREATE TABLE IF NOT EXISTS ai_config (
            id INT PRIMARY KEY DEFAULT 1,
            primary_key_choice VARCHAR(16) NOT NULL DEFAULT 'paid',
            max_daily_calls INT NOT NULL DEFAULT 500,
            limits JSON NULL,
            prompts JSON NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
        const [rows] = await pool.query('SELECT * FROM ai_config WHERE id=1');
        if(!rows.length){
            const defaultPrompts = JSON.stringify({
                whats_new_research: 'Recherchiere öffentlich bekannte Data Security & Governance News der letzten 14 Tage und liefere DE+EN Titel & Inhalte sowie einen deutschen Teaser (max 140 Zeichen).',
                translate: 'Übersetze gegebenen Titel und HTML-Inhalt nach Englisch. Behalte grundlegende HTML Struktur bei.',
                media_alt_text: 'Erzeuge prägnanten deutschen ALT-Text (<=12 Wörter) und kurze Beschreibung (<=30 Wörter) für den Dateinamen.',
                blog_sample: 'Erzeuge beispielhaften Blogbeitrag DE+EN zu Data Security Grundlagen mit HTML Absätzen.',
                blog_tags: 'security, governance, compliance, purview, azure',
                media_categories: 'Blog-Titelbild, Titelbild, Podcast, Icon, Illustration, Banner'
            });
            const defaultLimits = JSON.stringify({ max_response_chars:10000, max_translate_chars:10000, max_sample_chars:8000 });
            await pool.query('INSERT INTO ai_config (id, primary_key_choice, max_daily_calls, limits, prompts) VALUES (1, "paid", 500, ?, ?)', [defaultLimits, defaultPrompts]);
            return { id:1, primary_key_choice:'paid', max_daily_calls:500, limits: JSON.parse(defaultLimits), prompts: JSON.parse(defaultPrompts) };
        }
        const cfg = rows[0];
        try { cfg.prompts = cfg.prompts ? JSON.parse(cfg.prompts) : {}; } catch(_) { cfg.prompts = {}; }
        try { cfg.limits = cfg.limits ? JSON.parse(cfg.limits) : {}; } catch(_) { cfg.limits = {}; }
        // Auffüllen mit Defaults falls leer oder fehlend
        const baseDefaults = {
            whats_new_research: 'Recherchiere öffentlich bekannte Data Security & Governance News der letzten 14 Tage und liefere DE+EN Titel & Inhalte sowie einen deutschen Teaser (max 140 Zeichen).',
            translate: 'Übersetze gegebenen Titel und HTML-Inhalt nach Englisch. Behalte grundlegende HTML Struktur bei.',
            media_alt_text: 'Erzeuge prägnanten deutschen ALT-Text (<=12 Wörter) und kurze Beschreibung (<=30 Wörter) für den Dateinamen.',
            blog_sample: 'Erzeuge beispielhaften Blogbeitrag DE+EN zu Data Security Grundlagen mit HTML Absätzen.',
            blog_tags: 'security, governance, compliance, purview, azure',
            media_categories: 'Blog-Titelbild, Titelbild, Podcast, Icon, Illustration, Banner'
        };
        let changed=false;
        for(const k of Object.keys(baseDefaults)){
            const v = (cfg.prompts && typeof cfg.prompts[k] !== 'undefined') ? cfg.prompts[k] : '';
            if(!v || (typeof v === 'string' && v.trim()==='')){ cfg.prompts[k] = baseDefaults[k]; changed=true; }
        }
        if(changed){
            try { await pool.query('UPDATE ai_config SET prompts=? WHERE id=1',[ JSON.stringify(cfg.prompts) ]); }
            catch(e){ console.error('AI Config Default Auffüllen fehlgeschlagen:', e.message); }
        }
        return cfg;
    } catch(e){ console.error('AI Config Load Fehler:', e); return { id:1, primary_key_choice:'paid', max_daily_calls:500, prompts:{} }; }
}
async function refreshAIConfig(force=false){
    if(!force && aiConfigCache && (Date.now()-aiConfigLoadedAt)<60000) return aiConfigCache;
    aiConfigCache = await getAIConfig(); aiConfigLoadedAt = Date.now(); return aiConfigCache;
}
// --- AI Usage Tracking (simple per-day aggregated counts) ---
async function ensureAIUsageTable(){
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS ai_usage (
            id INT AUTO_INCREMENT PRIMARY KEY,
            day DATE NOT NULL,
            endpoint VARCHAR(64) NOT NULL,
            calls INT NOT NULL DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_day_ep (day, endpoint)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
        // Detail Log Tabelle (einzelne Aufrufe)
        await pool.query(`CREATE TABLE IF NOT EXISTS ai_call_log (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            endpoint VARCHAR(64) NOT NULL,
            prompt_text MEDIUMTEXT NULL,
            response_chars INT NULL,
            error_message VARCHAR(255) NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
    } catch(e){ console.error('AI Usage Table Fehler:', e.message); }
}
async function incrementAIUsage(endpoint){
    try { await ensureAIUsageTable(); await pool.query('INSERT INTO ai_usage (day, endpoint, calls) VALUES (CURDATE(), ?, 1) ON DUPLICATE KEY UPDATE calls=calls+1',[endpoint]); }
    catch(e){ console.error('AI Usage Increment Fehler:', e.message); }
}
async function getTotalCallsToday(){
    try { await ensureAIUsageTable(); const [r] = await pool.query('SELECT SUM(calls) as c FROM ai_usage WHERE day=CURDATE()'); return (r[0]&&r[0].c)||0; }
    catch(e){ return 0; }
}
function pickGeminiKey(cfg){
    const paid = process.env.GEMINI_API_KEY_PAID || process.env.GEMINI_API_KEY;
    const free = process.env.GEMINI_API_KEY_FREE || process.env.GEMINI_API_KEY_FALLBACK || process.env.GEMINI_API_KEY;
    if(cfg && cfg.primary_key_choice === 'free') return free || paid;
    return paid || free; // prefer paid
}
// --- Helper: Sanitization für "whatsnew" Kurztext / Hashtag-Block ---
function sanitizeWhatsNew(input){
    if(!input || typeof input !== 'string') return input;
    let text = input.replace(/[ \t\n\r]+/g,' ').trim();
    // 1) Wiederholte identische Wörter >=4 Zeichen hintereinander reduzieren ("Rechtsentwicklung Rechtsentwicklung" -> einmal)
    text = text.replace(/\b([A-Za-zÄÖÜäöüß]{4,})\b(?:\s+\1\b){1,}/g,'$1');
    // 2) Hashtags eindeutiger machen (case-insensitive) – nur erstes Auftreten behalten
    const seenTags = new Set();
    text = text.replace(/#([A-Za-zÄÖÜäöüß0-9_\-]+)/g,(m,tag)=>{
        const key = tag.toLowerCase();
        if(seenTags.has(key)) return '';
        seenTags.add(key);
        return '#'+tag;
    }).replace(/\s{2,}/g,' ').trim();
    // 3) Anzahl Hashtags begrenzen (z.B. max 15) – Rest entfernen
    const parts = text.split(/\s+/);
    let hashtagCount = 0;
    for(let i=0;i<parts.length;i++){
        if(parts[i].startsWith('#')){
            hashtagCount++;
            if(hashtagCount>15){ parts[i]=''; }
        }
    }
    text = parts.filter(Boolean).join(' ');
    // 4) Gesamtlänge begrenzen (Soft Cap 500 Zeichen)
    const MAX_LEN = 500;
    if(text.length>MAX_LEN){ text = text.slice(0,MAX_LEN).replace(/\s+[^^\s]*$/,'').trim() + '…'; }
    return text;
}
async function geminiTwoStageInvoke({ baseDescription, userPayloadBuilder }){
    const cfg = await refreshAIConfig();
    const key = pickGeminiKey(cfg);
    if(!key) throw new Error('Kein API Key konfiguriert');
    // Rate Limit
    const todayTotal = await getTotalCallsToday();
    if(todayTotal >= cfg.max_daily_calls){ throw new Error('AI Tageslimit erreicht'); }
    const fetch = (await import('node-fetch')).default;
    const model = 'gemini-1.5-flash-latest';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=`;
    const AI_DEBUG = process.env.AI_DEBUG === '1' || process.env.AI_DEBUG === 'true';
    // Stage 1: Prompt-Baustein generieren (Meta-Prompt)
    const metaPrompt = `Du bist Prompt-Engineer. Erzeuge einen optimierten finalen Prompt (nur Text, kein JSON) basierend auf dieser Funktionsbeschreibung: ${baseDescription}. Antworte ausschließlich mit dem finalen Prompt.`;
    let stage1Text;
    try {
        const r1 = await fetch(apiUrl+key, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ contents:[{ parts:[{ text: metaPrompt }]}] }) });
        if(!r1.ok) throw new Error('Stage1 HTTP '+r1.status);
        const d1 = await r1.json();
        stage1Text = d1.candidates?.[0]?.content?.parts?.[0]?.text || baseDescription;
        if(AI_DEBUG){ console.log('[AI][Stage1] Optimized Prompt:', stage1Text.slice(0,400)); }
    } catch(e){ stage1Text = baseDescription; }
    // Stage 2: Final Payload (kann JSON Schema erwarten)
    const { finalPrompt, schema } = userPayloadBuilder(stage1Text);
    if(AI_DEBUG){ console.log('[AI][Stage2] Final Prompt (trunc):', finalPrompt.slice(0,400)); }
    const payload = { contents:[{ parts:[{ text: finalPrompt }]}], generationConfig:{} };
    if(schema){ payload.generationConfig.response_mime_type='application/json'; payload.generationConfig.responseSchema=schema; }
    const r2 = await fetch(apiUrl+key, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if(!r2.ok){
        // Fallback: anderer Key falls verfügbar
        const altKey = key === (process.env.GEMINI_API_KEY_PAID||process.env.GEMINI_API_KEY) ? (process.env.GEMINI_API_KEY_FREE||process.env.GEMINI_API_KEY_FALLBACK) : (process.env.GEMINI_API_KEY_PAID||process.env.GEMINI_API_KEY);
        if(altKey && altKey !== key){
            const r2b = await fetch(apiUrl+altKey, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
            if(r2b.ok){ return await r2b.json(); }
        }
        const errTxt = await r2.text().catch(()=>'(no body)');
        if(AI_DEBUG){ console.error('[AI][Stage2] HTTP Fehler', r2.status, errTxt.slice(0,500)); }
        throw new Error('Stage2 HTTP '+r2.status+' '+errTxt.slice(0,160));
    }
    const json = await r2.json();
    try {
        const raw = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
        await pool.query('INSERT INTO ai_call_log (endpoint, prompt_text, response_chars) VALUES (?,?,?)',[ 'generic', finalPrompt.slice(0,64000), raw.length ]);
    } catch(logErr){ /* logging best effort */ }
    if(AI_DEBUG){ const raw = json.candidates?.[0]?.content?.parts?.[0]?.text; console.log('[AI][Stage2] Raw Output (trunc):', (raw||'').slice(0,400)); }
    incrementAIUsage('generic');
    return json;
}

// Middleware zur Überprüfung der Authentifizierung
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Standard-Titel für Admin-Views, falls keiner gesetzt
router.use((req, res, next) => {
    if (typeof res.locals.title === 'undefined') {
        res.locals.title = 'Admin';
    }
    next();
});

// Multer-Konfiguration für Dateiuploads
const storage = multer.diskStorage({
    destination: './httpdocs/uploads/',
    filename: function(req, file, cb){
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage }).single('mediafile');
// Neuer Upload Handler für mehrere Dateien (separate Instanz, um bestehende Funktionalität nicht abrupt zu brechen)
const multiUpload = multer({ storage: storage }).array('mediaFiles', 20);

// Admin Dashboard
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const [postCountRows] = await pool.query("SELECT COUNT(*) as count FROM posts");
        const [mediaCountRows] = await pool.query("SELECT COUNT(*) as count FROM media");
        const [podcastCountRows] = await pool.query("SELECT COUNT(*) as count FROM podcasts");
        const [latestPosts] = await pool.query("SELECT * FROM posts ORDER BY updated_at DESC LIMIT 5");
        // Additional KPIs
        let advPageCount=0, templateCount=0, genLogCount=0, aiCallsToday=0;
        try { await ensureAdvancedPagesTable(); const [ap] = await pool.query('SELECT SUM(CASE WHEN is_template=0 THEN 1 ELSE 0 END) AS pages, SUM(CASE WHEN is_template=1 THEN 1 ELSE 0 END) AS templates FROM advanced_pages'); advPageCount = ap[0].pages||0; templateCount = ap[0].templates||0; } catch(_){}
        try { const [gl] = await pool.query('SELECT COUNT(*) as c FROM advanced_page_generations WHERE created_at>=DATE_SUB(NOW(), INTERVAL 24 HOUR)'); genLogCount = gl[0].c||0; } catch(_){}
        try { await ensureAIUsageTable(); const [aiu] = await pool.query('SELECT SUM(calls) as c FROM ai_usage WHERE day=CURDATE()'); aiCallsToday = (aiu[0] && aiu[0].c)||0; } catch(_){}

        res.render('admin_dashboard', {
            title: 'Admin Dashboard',
            postCount: postCountRows[0].count,
            mediaCount: mediaCountRows[0].count,
            podcastCount: podcastCountRows[0].count,
            latestPosts: latestPosts,
            advPageCount, templateCount, genLogCount, aiCallsToday
        });
    } catch (err) {
        console.error('Fehler beim Laden des Admin-Dashboards:', err);
        res.status(500).send("Fehler beim Laden des Dashboards.");
    }
});

// --- ADVANCED PAGES (MVP) ---
router.get('/advanced-pages', isAuthenticated, async (req,res)=>{
    await ensureAdvancedPagesTable();
    try {
    const [rows] = await pool.query('SELECT id, title, slug, status, is_template, updated_at FROM advanced_pages ORDER BY updated_at DESC LIMIT 400');
    const pages = rows.filter(r=>!r.is_template);
    const templates = rows.filter(r=>r.is_template);
    res.render('admin_advanced_pages_list', { title:'Advanced Pages', pages, templates });
    } catch(e){ console.error('Advanced Pages List Fehler:', e); res.status(500).send('Fehler'); }
});
router.get('/advanced-pages/new', isAuthenticated, async (req,res)=>{
    await ensureAdvancedPagesTable();
    const blankLayout = { version:1, rows:[] };
    res.render('admin_advanced_pages_edit', { title:'Neue Advanced Page', page:null, layoutJSON: JSON.stringify(blankLayout) });
});
router.get('/advanced-pages/edit/:id', isAuthenticated, async (req,res)=>{
    await ensureAdvancedPagesTable();
    try {
        const [rows] = await pool.query('SELECT * FROM advanced_pages WHERE id=?',[req.params.id]);
        if(!rows.length) return res.status(404).send('Nicht gefunden');
        res.render('admin_advanced_pages_edit', { title:'Advanced Page bearbeiten', page: rows[0], layoutJSON: rows[0].layout_json || '{"version":1,"rows":[]}' });
    } catch(e){ res.status(500).send('Fehler Laden'); }
});
router.post('/advanced-pages/save', isAuthenticated, async (req,res)=>{
    await ensureAdvancedPagesTable();
    const { id, title, slug, layout_json, make_template } = req.body;
    if(!title || !slug) return res.status(400).send('Titel & Slug nötig');
    let layout; try { layout = JSON.parse(layout_json); } catch(e){ return res.status(400).send('Layout JSON ungültig'); }
    // Simple validation
    if(!layout || typeof layout !== 'object' || !Array.isArray(layout.rows)){ return res.status(400).send('Layout Struktur ungültig'); }
    // HTML Sanitization (allow moderate formatting for admin input; blocks may include headings, lists, links, basic inline formatting)
    let DOMPurify, JSDOM;
    try {
        JSDOM = require('jsdom').JSDOM;
        const window = (new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>')).window;
        DOMPurify = require('dompurify')(window);
    } catch(e){ DOMPurify = null; }
    function cleanHtml(html){
        if(!html || typeof html!=='string') return '';
        if(!DOMPurify) return html; // Fallback: unsanitized (should not happen in prod if deps installed)
        return DOMPurify.sanitize(html, { ALLOWED_TAGS:['p','b','strong','i','em','u','s','br','ul','ol','li','h1','h2','h3','h4','blockquote','code','pre','span','a','img','figure','figcaption','hr'], ALLOWED_ATTR:['href','target','rel','class','id','style','src','alt','title','loading'], ADD_ATTR:['data-*'], ALLOW_DATA_ATTR: true });
    }
    // Render HTML
    let htmlParts = [];
    htmlParts.push('<div class="ap-page">');
        (layout.rows||[]).forEach((row,rowIndex)=>{
        const preset = row.preset || 'custom';
        htmlParts.push(`<section class="ap-row ap-preset-${preset}" data-row="${rowIndex}"><div class="container-fluid"><div class="row g-4">`);
        (row.columns||[]).forEach((col,colIndex)=>{
            const width = parseInt(col.width,10)||12;
            htmlParts.push(`<div class="col-md-${Math.min(Math.max(width,1),12)} ap-col" data-col="${colIndex}">`);
            (col.blocks||[]).forEach(block=>{
                if(!block || typeof block!=='object') return;
                const bType = block.type || 'html';
                                if(bType==='html' || bType==='text'){
                                    const styleParts = [];
                                    if(block.textColor && /^#[0-9a-fA-F]{3,8}$/.test(block.textColor)) styleParts.push(`color:${block.textColor}`);
                                    if(block.bgColor && /^#[0-9a-fA-F]{3,8}$/.test(block.bgColor)) styleParts.push(`background:${block.bgColor}`);
                                    const styleAttr = styleParts.length?` style="${styleParts.join(';')}"`:'';
                                    // Sanitize custom classes
                                    const custom = (block.classes||'').replace(/[^a-zA-Z0-9_\-\s]/g,' ').trim();
                                    const classList = [ 'ap-block', `ap-block-${bType}` ];
                                    if(custom) custom.split(/\s+/).forEach(c=>{ if(c) classList.push(c); });
                                    // Spacing utility (whitelist)
                                    const spacing = (block.spacing||'').trim();
                                    if(['pad-s','pad-m','pad-l'].includes(spacing)) classList.push(spacing);
                                    // Visibility flags -> bootstrap responsive helper classes
                                    if(block.hideSM) classList.push('d-none','d-sm-block');
                                    if(block.hideMD) classList.push('d-sm-none','d-md-block');
                                    if(block.hideLG) classList.push('d-lg-none');
                                    const classesAttr = classList.join(' ');
                                    htmlParts.push(`<div class="${classesAttr}" data-block="${block.id||''}"${styleAttr}>${cleanHtml(block.html||'')}</div>`);
                } else if(bType==='image'){
                    const src = (block.src||'').replace(/"/g,'&quot;');
                    const alt = (block.alt||'').replace(/"/g,'&quot;');
                    const caption = block.caption ? `<figcaption>${cleanHtml(block.caption)}</figcaption>` : '';
                    htmlParts.push(`<figure class="ap-block ap-block-image text-center" data-block="${block.id||''}"><img src="${src}" alt="${alt}" class="img-fluid" loading="lazy"/>${caption}</figure>`);
                } else if(bType==='background'){
                    const bgColor = block.bgColor && /^#[0-9a-fA-F]{3,8}$/.test(block.bgColor) ? block.bgColor : '#f5f5f5';
                    const padding = block.padding && /^[0-9a-zA-Z% \-_.]+$/.test(block.padding) ? block.padding : '40px 20px';
                    htmlParts.push(`<div class="ap-block ap-block-background" data-block="${block.id||''}" style="background:${bgColor};padding:${padding};">${cleanHtml(block.html||'')}</div>`);
                                } else if(bType==='post-link'){
                                        const pid = parseInt(block.postId,10)||null; const title = cleanHtml(block.title||''); const slug = cleanHtml(block.slug||'');
                                        if(pid && title){
                                                htmlParts.push(`<div class="ap-block ap-block-post-link" data-block="${block.id||''}"><a href="/blog/${slug}" class="ap-post-link">${title}</a></div>`);
                                        }
                                } else if(bType==='podcast-link'){
                                        const pid = parseInt(block.podcastId,10)||null; const title = cleanHtml(block.title||'');
                                        if(pid && title){ htmlParts.push(`<div class="ap-block ap-block-podcast-link" data-block="${block.id||''}"><a href="/podcasts#ep-${pid}" class="ap-podcast-link">${title}</a></div>`); }
                                } else if(bType==='hero'){
                                        const img = (block.image||'').replace(/"/g,'&quot;');
                                        const title = cleanHtml(block.title||'');
                                        const subtitle = cleanHtml(block.subtitle||'');
                                        const ctaText = cleanHtml(block.ctaText||'');
                                        const ctaUrl = (block.ctaUrl||'').replace(/"/g,'&quot;');
                                        const height = (block.height||'60vh').replace(/[^0-9a-zA-Z%vhrem.\-]/g,'');
                                        let overlay = parseFloat(block.overlayOpacity); if(isNaN(overlay)||overlay<0) overlay=0; if(overlay>1) overlay=1;
                                        const align = ['left','center','right'].includes(block.align)?block.align:'center';
                                        htmlParts.push(`<div class="ap-block ap-block-hero" data-block="${block.id||''}">`+
                                            `<div class="ap-hero" style="position:relative;background:${img?`url('${img}') center/cover no-repeat`:'#222'};height:${height};">`+
                                                `<div class="ap-hero-overlay" style="position:absolute;inset:0;background:#000;opacity:${overlay};"></div>`+
                                                `<div class="ap-hero-inner container h-100 d-flex flex-column justify-content-center text-${align}" style="position:relative;z-index:2;">`+
                                                    `<div class="ap-hero-title display-6 fw-bold text-white">${title}</div>`+
                                                    (subtitle?`<p class="ap-hero-sub lead text-white-50">${subtitle}</p>`:'')+
                                                    (ctaText&&ctaUrl?`<p><a href="${ctaUrl}" class="btn btn-primary btn-lg">${ctaText}</a></p>`:'')+
                                                `</div>`+
                                            `</div>`+
                                        `</div>`);
                }
            });
            htmlParts.push('</div>');
        });
        htmlParts.push('</div></div></section>');
    });
    htmlParts.push('</div>');
    const rendered = htmlParts.join('');
    try {
        const tmplFlag = make_template ? 1 : 0;
        if(id){
            await pool.query('UPDATE advanced_pages SET title=?, slug=?, layout_json=?, rendered_html=?, is_template=? WHERE id=?',[title, slug, JSON.stringify(layout), rendered, tmplFlag, id]);
        } else {
            await pool.query('INSERT INTO advanced_pages (title, slug, layout_json, rendered_html, is_template, author_id) VALUES (?,?,?,?,?,?)',[title, slug, JSON.stringify(layout), rendered, tmplFlag, req.session.userId||null]);
        }
        res.redirect('/admin/advanced-pages');
    } catch(e){ console.error('Save Fehler', e); res.status(500).send('Speichern fehlgeschlagen'); }
});
// Create new page from template (clone layout)
router.post('/advanced-pages/from-template/:id', isAuthenticated, async (req,res)=>{
    await ensureAdvancedPagesTable();
    try {
        const [rows] = await pool.query('SELECT * FROM advanced_pages WHERE id=? AND is_template=1',[req.params.id]);
        if(!rows.length) return res.status(404).send('Template nicht gefunden');
        const base = rows[0];
        const newSlug = (base.slug+'-'+Date.now()).slice(0,190);
        await pool.query('INSERT INTO advanced_pages (title, slug, layout_json, rendered_html, status, author_id, is_template) VALUES (?,?,?,?,?,?,0)', [ base.title+' Copy', newSlug, base.layout_json, base.rendered_html, 'draft', req.session.userId||null ]);
        res.redirect('/admin/advanced-pages');
    } catch(e){ console.error('Template Clone Fehler', e); res.status(500).send('Klonen fehlgeschlagen'); }
});
router.post('/advanced-pages/delete/:id', isAuthenticated, async (req,res)=>{
    try { await pool.query('DELETE FROM advanced_pages WHERE id=?',[req.params.id]); res.redirect('/admin/advanced-pages'); }
    catch(e){ res.status(500).send('Löschung fehlgeschlagen'); }
});
router.get('/advanced-pages/preview/:id', isAuthenticated, async (req,res)=>{
    try { const [rows] = await pool.query('SELECT title, rendered_html FROM advanced_pages WHERE id=?',[req.params.id]); if(!rows.length) return res.status(404).send('Nicht gefunden'); res.render('admin_advanced_pages_preview',{ title:'Preview '+rows[0].title, page:rows[0] }); }
    catch(e){ res.status(500).send('Preview Fehler'); }
});

// --- BEITRAGSVERWALTUNG ---
router.get('/posts', isAuthenticated, async (req, res) => {
    try {
        // add soft delete + featured flags if missing
        try { await pool.query("ALTER TABLE posts ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0"); } catch(_) {}
        try { await pool.query("ALTER TABLE posts ADD COLUMN is_featured TINYINT(1) NOT NULL DEFAULT 0"); } catch(_) {}
        try { await pool.query("ALTER TABLE posts ADD COLUMN published_at DATETIME NULL AFTER status"); } catch(_) {}

        const showArchived = req.query.archived === '1';
        const sql = showArchived
            ? "SELECT * FROM posts WHERE is_deleted=1 ORDER BY updated_at DESC, created_at DESC"
            : "SELECT * FROM posts WHERE is_deleted=0 ORDER BY updated_at DESC, created_at DESC";
        const [posts] = await pool.query(sql);
        res.render('admin_posts', { title: showArchived ? 'Archivierte Beiträge' : 'Beiträge', posts: posts, archived: showArchived });
    } catch (err) { res.status(500).send("Fehler beim Laden der Beiträge."); }
});

router.get('/posts/new', isAuthenticated, async (req, res) => {
    try {
        const [media] = await pool.query("SELECT * FROM media ORDER BY uploaded_at DESC");
        const cfg = await refreshAIConfig();
    const tagsList = (cfg.prompts && cfg.prompts.blog_tags ? cfg.prompts.blog_tags.split(',').map(s=>s.trim()).filter(Boolean) : []);
    // Kategorien aus Config + DB distinct mergen -> Sync
    let cfgCats = (cfg.prompts && cfg.prompts.media_categories ? cfg.prompts.media_categories.split(',').map(s=>s.trim()).filter(Boolean) : []);
    let dbCats = [];
    try { const [catRows] = await pool.query("SELECT DISTINCT category FROM media WHERE category IS NOT NULL AND category<>'' ORDER BY category ASC LIMIT 500"); dbCats = catRows.map(r=>r.category).filter(Boolean); } catch(_){}
    const catSet = new Set([ ...cfgCats, ...dbCats ]);
    const mediaCats = Array.from(catSet);
    res.render('admin_edit_post', { title: 'Neuer Beitrag', post: null, media: media, tagsList, mediaCats });
    } catch (err) {
        res.status(500).send("Fehler beim Laden des Editors.");
    }
});

router.post('/posts/new', isAuthenticated, async (req, res) => {
    const { title, content, status, title_en, content_en, whatsnew, featured_image_id, published_at, tags, seo_title, seo_description, meta_keywords } = req.body;
    const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
    let whatsNewSan = sanitizeWhatsNew(whatsnew);
    if(whatsNewSan && whatsNewSan.length>180) whatsNewSan = whatsNewSan.slice(0,180).trim();
    // Content Plaintext Begrenzung 2000 Zeichen
    let contentSan = content || '';
    try {
        const plain = (contentSan||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
        if(plain.length>2000){
            // naive Kürzung: plain kürzen und als einfachen Absatz zurückschreiben
            const cut = plain.slice(0,2000).replace(/\s+[^\s]*$/,'');
            contentSan = '<p>'+cut+'…</p>';
        }
    } catch(_) {}
    try {
        try {
            await pool.query(
                'INSERT INTO posts (title, slug, content, author_id, status, title_en, content_en, whatsnew, featured_image_id, published_at, tags, seo_title, seo_description, meta_keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [title, slug, contentSan, req.session.userId, status, title_en, content_en, whatsNewSan, featured_image_id || null, published_at || null, tags || null, seo_title || null, seo_description || null, meta_keywords || null]
            );
        } catch (e) {
            if (e.code === 'ER_BAD_FIELD_ERROR' && e.message.includes('published_at')) {
                await pool.query('ALTER TABLE posts ADD COLUMN published_at DATETIME NULL AFTER status');
                await pool.query('INSERT INTO posts (title, slug, content, author_id, status, title_en, content_en, whatsnew, featured_image_id, published_at, tags, seo_title, seo_description, meta_keywords) VALUES (?,?,?,?, ?,?,?, ?,?,?, ?,?,?,?)',[title, slug, contentSan, req.session.userId, status, title_en, content_en, whatsNewSan, featured_image_id || null, published_at || null, tags || null, seo_title || null, seo_description || null, meta_keywords || null]);
            } else if (e.code === 'ER_BAD_FIELD_ERROR' && e.message.includes('tags')) {
                await pool.query("ALTER TABLE posts ADD COLUMN tags VARCHAR(255) NULL AFTER whatsnew");
                await pool.query('INSERT INTO posts (title, slug, content, author_id, status, title_en, content_en, whatsnew, featured_image_id, published_at, tags, seo_title, seo_description, meta_keywords) VALUES (?,?,?,?, ?,?,?, ?,?,?, ?,?,?,?)',[title, slug, contentSan, req.session.userId, status, title_en, content_en, whatsNewSan, featured_image_id || null, published_at || null, tags || null, seo_title || null, seo_description || null, meta_keywords || null]);
            } else { throw e; }
        }
        res.redirect('/admin/posts');
    } catch (err) {
        console.error(err);
        res.status(500).send("Fehler beim Speichern des Beitrags.");
    }
});

router.get('/posts/edit/:id', isAuthenticated, async (req, res) => {
    try {
        const [posts] = await pool.query("SELECT p.*, m.path AS featured_image_path FROM posts p LEFT JOIN media m ON p.featured_image_id = m.id WHERE p.id = ?", [req.params.id]);
        if (posts.length === 0) {
            return res.status(404).send("Beitrag nicht gefunden.");
        }
        const [media] = await pool.query("SELECT * FROM media ORDER BY uploaded_at DESC");
        const cfg = await refreshAIConfig();
    const tagsList = (cfg.prompts && cfg.prompts.blog_tags ? cfg.prompts.blog_tags.split(',').map(s=>s.trim()).filter(Boolean) : []);
    let cfgCats = (cfg.prompts && cfg.prompts.media_categories ? cfg.prompts.media_categories.split(',').map(s=>s.trim()).filter(Boolean) : []);
    let dbCats = [];
    try { const [catRows] = await pool.query("SELECT DISTINCT category FROM media WHERE category IS NOT NULL AND category<>'' ORDER BY category ASC LIMIT 500"); dbCats = catRows.map(r=>r.category).filter(Boolean); } catch(_){}
    const catSet = new Set([ ...cfgCats, ...dbCats ]);
    const mediaCats = Array.from(catSet);
    res.render('admin_edit_post', { title: 'Beitrag bearbeiten', post: posts[0], media: media, tagsList, mediaCats });
    } catch (err) {
        res.status(500).send("Fehler beim Laden des Editors.");
    }
});

router.post('/posts/edit/:id', isAuthenticated, async (req, res) => {
    const { title, content, status, title_en, content_en, whatsnew, featured_image_id, published_at, tags, seo_title, seo_description, meta_keywords } = req.body;
    const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
    let whatsNewSan = sanitizeWhatsNew(whatsnew);
    if(whatsNewSan && whatsNewSan.length>180) whatsNewSan = whatsNewSan.slice(0,180).trim();
    let contentSan = content || '';
    try {
        const plain = (contentSan||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
        if(plain.length>2000){
            const cut = plain.slice(0,2000).replace(/\s+[^\s]*$/,'');
            contentSan = '<p>'+cut+'…</p>';
        }
    } catch(_) {}
    try {
        try {
            await pool.query(
                'UPDATE posts SET title = ?, slug = ?, content = ?, status = ?, title_en = ?, content_en = ?, whatsnew = ?, featured_image_id = ?, published_at = ?, tags = ?, seo_title = ?, seo_description = ?, meta_keywords = ? WHERE id = ?',
                [title, slug, contentSan, status, title_en, content_en, whatsNewSan, featured_image_id || null, published_at || null, tags || null, seo_title || null, seo_description || null, meta_keywords || null, req.params.id]
            );
        } catch (e) {
            if (e.code === 'ER_BAD_FIELD_ERROR' && e.message.includes('published_at')) {
                await pool.query('ALTER TABLE posts ADD COLUMN published_at DATETIME NULL AFTER status');
                await pool.query('UPDATE posts SET title = ?, slug = ?, content = ?, status = ?, title_en = ?, content_en = ?, whatsnew = ?, featured_image_id = ?, published_at = ?, tags = ?, seo_title = ?, seo_description = ?, meta_keywords = ? WHERE id = ?', [title, slug, contentSan, status, title_en, content_en, whatsNewSan, featured_image_id || null, published_at || null, tags || null, seo_title || null, seo_description || null, meta_keywords || null, req.params.id]);
            } else if (e.code === 'ER_BAD_FIELD_ERROR' && e.message.includes('tags')) {
                await pool.query("ALTER TABLE posts ADD COLUMN tags VARCHAR(255) NULL AFTER whatsnew");
                await pool.query('UPDATE posts SET title = ?, slug = ?, content = ?, status = ?, title_en = ?, content_en = ?, whatsnew = ?, featured_image_id = ?, published_at = ?, tags = ?, seo_title = ?, seo_description = ?, meta_keywords = ? WHERE id = ?', [title, slug, contentSan, status, title_en, content_en, whatsNewSan, featured_image_id || null, published_at || null, tags || null, seo_title || null, seo_description || null, meta_keywords || null, req.params.id]);
            } else { throw e; }
        }
        res.redirect('/admin/posts');
    } catch (err) {
        console.error(err);
        res.status(500).send("Fehler beim Aktualisieren des Beitrags.");
    }
});

// Aktionen: Publish / Draft toggle
router.post('/posts/:id/publish', isAuthenticated, async (req, res) => {
    try { await pool.query("UPDATE posts SET status='published', published_at=COALESCE(published_at,NOW()) WHERE id=?", [req.params.id]); res.redirect('/admin/posts'); }
    catch(e){ res.status(500).send('Fehler Publish'); }
});
router.post('/posts/:id/draft', isAuthenticated, async (req, res) => {
    try { await pool.query("UPDATE posts SET status='draft' WHERE id=?", [req.params.id]); res.redirect('/admin/posts'); }
    catch(e){ res.status(500).send('Fehler Draft'); }
});
// Fokus (featured flag)
router.post('/posts/:id/focus', isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id,10);
    if(isNaN(id)) return res.status(400).send('Bad id');
    try {
        // Spalte sicherstellen
        try { await pool.query("ALTER TABLE posts ADD COLUMN is_featured TINYINT(1) NOT NULL DEFAULT 0"); } catch(_) {}
        // Prüfen ob dieser Post bereits featured ist
        const [rows] = await pool.query('SELECT is_featured FROM posts WHERE id=?',[id]);
        if(!rows.length) return res.status(404).send('Nicht gefunden');
        const currently = rows[0].is_featured === 1;
        if(currently){
            // Deaktivieren -> einfach Flag auf 0
            await pool.query('UPDATE posts SET is_featured=0 WHERE id=?',[id]);
        } else {
            // Zuerst alle anderen zurücksetzen, dann diesen setzen (nur veröffentlichte behalten ihr Flag nicht)
            await pool.query('UPDATE posts SET is_featured=0');
            await pool.query('UPDATE posts SET is_featured=1 WHERE id=?',[id]);
        }
        res.redirect('/admin/posts');
    } catch(e){ console.error('Focus Fehler', e); res.status(500).send('Fehler Fokus'); }
});
// Verstecken (soft delete)
router.post('/posts/:id/hide', isAuthenticated, async (req, res) => {
    try { await pool.query("UPDATE posts SET is_deleted=1 WHERE id=?", [req.params.id]); res.redirect('/admin/posts'); }
    catch(e){ res.status(500).send('Fehler Hide'); }
});
// Wiederherstellen (optional future) – hier nur intern
router.post('/posts/:id/restore', isAuthenticated, async (req, res) => {
    try { await pool.query("UPDATE posts SET is_deleted=0 WHERE id=?", [req.params.id]); res.redirect('/admin/posts?archived=1'); }
    catch(e){ res.status(500).send('Fehler Restore'); }
});

// Beispiel-Posts anlegen (Seed)
router.post('/posts/sample', isAuthenticated, async (req, res) => {
    try {
        // Ensure columns exist (published_at etc.)
        try { await pool.query("ALTER TABLE posts ADD COLUMN published_at DATETIME NULL AFTER status"); } catch(_) {}
        try { await pool.query("ALTER TABLE posts ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0"); } catch(_) {}
        try { await pool.query("ALTER TABLE posts ADD COLUMN is_featured TINYINT(1) NOT NULL DEFAULT 0"); } catch(_) {}
        const samples = [
            { title:'Sample Data Security Trends', content:'<p>Dies ist ein Beispiel-Inhalt über aktuelle Data-Security Trends. Zero Trust, Klassifizierung und Automatisierung.</p>', whats:'Kurzbeispiel Trend Update.' },
            { title:'Beispiel: Purview Governance', content:'<p>Kurzer Beispieltext zu Microsoft Purview und Governance Features.</p>', whats:'Governance Beispiel.' },
            { title:'Demo Post: Compliance Automation', content:'<p>Compliance Automatisierung Beispiel-Post mit <strong>HTML</strong> Formatierung.</p>', whats:'Automation Demo.' }
        ];
        for (const s of samples) {
            const slugBase = s.title.toLowerCase().replace(/\s+/g,'-').replace(/[^\w-]+/g,'');
            const slug = slugBase + '-' + Date.now() + '-' + Math.floor(Math.random()*1000);
            await pool.query("INSERT INTO posts (title, slug, content, author_id, status, title_en, content_en, whatsnew, featured_image_id, published_at) VALUES (?,?,?,?, 'draft', ?, ?, ?, NULL, NULL)", [s.title, slug, s.content, req.session.userId, s.title, s.content, s.whats]);
        }
        res.redirect('/admin/posts');
    } catch(e){ console.error('Sample Seed Fehler:', e); res.status(500).send('Sample Seed fehlgeschlagen'); }
});


// --- PODCAST-VERWALTUNG ---
router.get('/podcasts', isAuthenticated, async (req, res) => {
    try {
        const [podcasts] = await pool.query("SELECT * FROM podcasts ORDER BY published_at DESC");
    res.render('admin_podcasts', { title: 'Podcasts', podcasts: podcasts });
    } catch (err) { res.render('admin_podcasts', { podcasts: [] }); }
});

// Podcast neu
router.get('/podcasts/new', isAuthenticated, (req, res) => {
    res.render('admin_edit_podcast', { title: 'Neuer Podcast', podcast: null });
});
router.post('/podcasts/new', isAuthenticated, async (req, res) => {
    const { title, description, audio_url, tags, seo_title, seo_description, meta_keywords } = req.body;
    try {
        try {
            await pool.query('INSERT INTO podcasts (title, description, audio_url, published_at, tags, seo_title, seo_description, meta_keywords) VALUES (?,?,?, NOW(), ?, ?, ?, ?)', [title, description, audio_url, tags || null, seo_title || null, seo_description || null, meta_keywords || null]);
        } catch(e){
            if(e.code==='ER_BAD_FIELD_ERROR' && e.message.includes('tags')){ await pool.query('ALTER TABLE podcasts ADD COLUMN tags VARCHAR(255) NULL'); await pool.query('INSERT INTO podcasts (title, description, audio_url, published_at, tags, seo_title, seo_description, meta_keywords) VALUES (?,?,?, NOW(), ?, ?, ?, ?)', [title, description, audio_url, tags || null, seo_title || null, seo_description || null, meta_keywords || null]); }
            else { throw e; }
        }
        res.redirect('/admin/podcasts');
    } catch (e) { console.error('Podcast Insert Fehler:', e); res.status(500).send('Fehler beim Speichern'); }
});
// Podcast bearbeiten
router.get('/podcasts/edit/:id', isAuthenticated, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM podcasts WHERE id = ?', [req.params.id]);
        if(!rows.length) return res.status(404).send('Nicht gefunden');
        res.render('admin_edit_podcast', { title: 'Podcast bearbeiten', podcast: rows[0] });
    } catch(e){ res.status(500).send('Fehler beim Laden'); }
});
router.post('/podcasts/edit/:id', isAuthenticated, async (req, res) => {
    const { title, description, audio_url, tags, seo_title, seo_description, meta_keywords } = req.body;
    try {
        try { await pool.query('UPDATE podcasts SET title=?, description=?, audio_url=?, tags=?, seo_title=?, seo_description=?, meta_keywords=? WHERE id=?', [title, description, audio_url, tags || null, seo_title || null, seo_description || null, meta_keywords || null, req.params.id]); }
        catch(e){ if(e.code==='ER_BAD_FIELD_ERROR' && e.message.includes('tags')){ await pool.query('ALTER TABLE podcasts ADD COLUMN tags VARCHAR(255) NULL'); await pool.query('UPDATE podcasts SET title=?, description=?, audio_url=?, tags=?, seo_title=?, seo_description=?, meta_keywords=? WHERE id=?',[title, description, audio_url, tags || null, seo_title || null, seo_description || null, meta_keywords || null, req.params.id]); } else { throw e; } }
        res.redirect('/admin/podcasts');
    } catch(e){ console.error('Podcast Update Fehler:', e); res.status(500).send('Fehler beim Aktualisieren'); }
});
// Podcast löschen (einfach)
router.post('/podcasts/delete/:id', isAuthenticated, async (req, res) => {
    try { await pool.query('DELETE FROM podcasts WHERE id=?', [req.params.id]); res.redirect('/admin/podcasts'); } catch(e){ res.status(500).send('Fehler beim Löschen'); }
});

// --- TOOLS & MEDIEN ---
router.get('/tools', isAuthenticated, async (req, res) => {
    try {
        const [posts] = await pool.query('SELECT id, title, status as is_visible, 0 as is_featured, 0 as is_deleted, created_at as published_at FROM posts ORDER BY created_at DESC LIMIT 200');
        res.render('admin_tools', { title: 'Tools', posts });
    } catch(e){ res.render('admin_tools', { title: 'Tools', posts: [] }); }
});

// --- TIMELINE EDITOR (Panda's Way 5) ---
router.get('/timeline-editor', isAuthenticated, async (req, res) => {
    const site = (req.query.site||'pandas_way_5');
    const level = req.query.level ? parseInt(req.query.level,10) : null;
    try {
        // Tabellen sicherstellen
        await pool.query(`CREATE TABLE IF NOT EXISTS timeline_entries (
          id INT AUTO_INCREMENT PRIMARY KEY,
          site_key VARCHAR(64) NOT NULL,
          level INT NOT NULL DEFAULT 1,
          position INT NOT NULL DEFAULT 0,
          title VARCHAR(255) NOT NULL,
          phase VARCHAR(100) NULL,
          content_html MEDIUMTEXT NULL,
          is_active TINYINT(1) NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX(site_key), INDEX(level), INDEX(position)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
        try { await pool.query('ALTER TABLE timeline_entries ADD COLUMN level INT NOT NULL DEFAULT 1 AFTER site_key'); } catch(_) {}
        await pool.query(`CREATE TABLE IF NOT EXISTS timeline_site_config (
          site_key VARCHAR(64) PRIMARY KEY,
          level_count INT NOT NULL DEFAULT 3,
          design_theme VARCHAR(32) NOT NULL DEFAULT 'glass',
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
        await pool.query(`CREATE TABLE IF NOT EXISTS timeline_levels (
          id INT AUTO_INCREMENT PRIMARY KEY,
          site_key VARCHAR(64) NOT NULL,
          level_index INT NOT NULL,
          title VARCHAR(255) NOT NULL DEFAULT '',
          content_html MEDIUMTEXT NULL,
          image_path VARCHAR(255) NULL,
                    icon VARCHAR(64) NULL,
          UNIQUE KEY uniq_level (site_key, level_index),
          INDEX(site_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
                try { await pool.query('ALTER TABLE timeline_levels ADD COLUMN icon VARCHAR(64) NULL AFTER image_path'); } catch(_) {}

        // Site Config sicherstellen
        let [cfgRows] = await pool.query('SELECT * FROM timeline_site_config WHERE site_key=?',[site]);
        if(!cfgRows.length){
            await pool.query('INSERT INTO timeline_site_config (site_key, level_count, design_theme) VALUES (?,?,?)',[site, 3, 'glass']);
            ;[cfgRows] = await pool.query('SELECT * FROM timeline_site_config WHERE site_key=?',[site]);
        }
        const siteCfg = cfgRows[0];

        // Level Datensätze sicherstellen
        for(let i=1;i<=siteCfg.level_count;i++){
            const [exists] = await pool.query('SELECT id FROM timeline_levels WHERE site_key=? AND level_index=?',[site,i]);
            if(!exists.length){
                await pool.query('INSERT INTO timeline_levels (site_key, level_index, title) VALUES (?,?,?)',[site,i,'Level '+i]);
            }
        }

        if(!level){
            // Level Übersicht + Config
            const [levels] = await pool.query('SELECT l.level_index, l.title, l.image_path, (SELECT COUNT(*) FROM timeline_entries te WHERE te.site_key=l.site_key AND te.level=l.level_index) AS entry_count FROM timeline_levels l WHERE l.site_key=? ORDER BY l.level_index ASC',[site]);
            return res.render('admin_timeline_levels', { title:'Timeline Levels', site, config: siteCfg, levels });
        }

        // Einzelnes Level bearbeiten
    const [levelMetaRows] = await pool.query('SELECT * FROM timeline_levels WHERE site_key=? AND level_index=?',[site, level]);
        if(!levelMetaRows.length){
            return res.status(404).send('Level nicht gefunden');
        }
        const levelMeta = levelMetaRows[0];
        const [entries] = await pool.query('SELECT id, position, title, phase, LEFT(content_html,200) AS preview, is_active FROM timeline_entries WHERE site_key=? AND level=? ORDER BY position ASC, id ASC',[site, level]);
    res.render('admin_timeline_editor', { title:'Timeline Editor', site, level, levelMeta, entries, siteConfig: siteCfg });
    } catch (e){ console.error('Timeline Editor Fehler:', e); res.status(500).send('Fehler beim Laden Timeline Editor'); }
});

router.post('/timeline-editor/add', isAuthenticated, async (req, res) => {
    const { site_key, level, position, title, phase, content_html } = req.body;
    if(!title) return res.status(400).send('Titel erforderlich');
    const site = site_key || 'pandas_way_5';
    const lvl = parseInt(level||1,10);
    try {
        try { await pool.query('ALTER TABLE timeline_entries ADD COLUMN level INT NOT NULL DEFAULT 1 AFTER site_key'); } catch(_) {}
        await pool.query('INSERT INTO timeline_entries (site_key, level, position, title, phase, content_html) VALUES (?,?,?,?,?,?)',[site, lvl, parseInt(position||0,10), title, phase||null, content_html||null]);
        res.redirect('/admin/timeline-editor?site='+encodeURIComponent(site)+'&level='+lvl);
    } catch(e){ console.error('Add Timeline Fehler:', e); res.status(500).send('Speichern fehlgeschlagen'); }
});

router.post('/timeline-editor/delete/:id', isAuthenticated, async (req, res) => {
    // Soft delete: is_active=0 statt physischem DELETE
    try { await pool.query('UPDATE timeline_entries SET is_active=0 WHERE id=?',[req.params.id]); res.redirect('back'); }
    catch(e){ res.status(500).send('Soft-Delete fehlgeschlagen'); }
});

router.post('/timeline-editor/reorder', isAuthenticated, async (req, res) => {
    const { orders } = req.body; // erwartet JSON string: [{id,position},...]
    try {
        const list = JSON.parse(orders||'[]');
        for(const item of list){
            if(item.id && typeof item.position !== 'undefined'){
                await pool.query('UPDATE timeline_entries SET position=? WHERE id=?',[parseInt(item.position,10), item.id]);
            }
        }
        res.json({ok:true});
    } catch(e){ console.error('Reorder Fehler:', e); res.status(500).json({error:'Reorder fehlgeschlagen'}); }
});

// Update einzelner Timeline Eintrag (Titel, Phase, Inhalt, Aktiv-Flag)
router.post('/timeline-editor/update/:id', isAuthenticated, async (req, res) => {
    const { title, phase, content_html, is_active } = req.body;
    if(!title) return res.status(400).send('Titel fehlt');
    try {
        await pool.query('UPDATE timeline_entries SET title=?, phase=?, content_html=?, is_active=COALESCE(?,is_active) WHERE id=?',[title, phase||null, content_html||null, (typeof is_active!=='undefined'? (is_active?1:0): null), req.params.id]);
        res.redirect('back');
    } catch(e){ console.error('Timeline Update Fehler:', e); res.status(500).send('Update fehlgeschlagen'); }
});

// Aktivierung toggeln
router.post('/timeline-editor/toggle/:id', isAuthenticated, async (req, res) => {
    try { await pool.query('UPDATE timeline_entries SET is_active=CASE WHEN is_active=1 THEN 0 ELSE 1 END WHERE id=?',[req.params.id]); res.redirect('back'); }
    catch(e){ console.error('Toggle Fehler:', e); res.status(500).send('Toggle fehlgeschlagen'); }
});

// Site Config speichern
router.post('/timeline-editor/site-config', isAuthenticated, async (req, res) => {
    const { site_key, level_count, design_theme } = req.body;
    const site = site_key || 'pandas_way_5';
    const count = Math.min(12, Math.max(1, parseInt(level_count||3,10)));
    const theme = (design_theme||'glass').toLowerCase();
    try {
        await pool.query('INSERT INTO timeline_site_config (site_key, level_count, design_theme) VALUES (?,?,?) ON DUPLICATE KEY UPDATE level_count=VALUES(level_count), design_theme=VALUES(design_theme)',[site, count, theme]);
        // Sicherstellen dass Level Datensätze existieren
        for(let i=1;i<=count;i++){
            const [e] = await pool.query('SELECT id FROM timeline_levels WHERE site_key=? AND level_index=?',[site,i]);
            if(!e.length){ await pool.query('INSERT INTO timeline_levels (site_key, level_index, title) VALUES (?,?,?)',[site,i,'Level '+i]); }
        }
        res.redirect('/admin/timeline-editor?site='+encodeURIComponent(site));
    } catch(e){ console.error('SiteConfig Fehler:', e); res.status(500).send('Speichern fehlgeschlagen'); }
});

// Level Meta speichern
router.post('/timeline-editor/level-meta/:site/:level', isAuthenticated, async (req, res) => {
    const site = req.params.site; const level = parseInt(req.params.level,10);
    const { title, content_html, image_path, icon } = req.body;
    try {
        await pool.query('UPDATE timeline_levels SET title=?, content_html=?, image_path=?, icon=? WHERE site_key=? AND level_index=?',[title||'', content_html||null, image_path||null, icon||null, site, level]);
        res.redirect('/admin/timeline-editor?site='+encodeURIComponent(site)+'&level='+level);
    } catch(e){ console.error('LevelMeta Fehler:', e); res.status(500).send('Level Meta Update fehlgeschlagen'); }
});

// API: Einzelnen Timeline Eintrag abrufen (volle HTML) für Edit Modal
router.get('/api/timeline-entry/:id', isAuthenticated, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, title, phase, content_html, is_active FROM timeline_entries WHERE id=?',[req.params.id]);
        if(!rows.length) return res.status(404).json({error:'Nicht gefunden'});
        res.json(rows[0]);
    } catch(e){ console.error('Timeline Fetch Fehler:', e); res.status(500).json({error:'Fetch fehlgeschlagen'}); }
});

// Debug Ansicht
router.get('/debug/posts', isAuthenticated, async (req, res) => {
    try {
        const [posts] = await pool.query('SELECT id, title, (status="published") as is_visible, 0 as is_deleted, 0 as is_featured, created_at as published_at FROM posts ORDER BY created_at DESC LIMIT 500');
        res.render('admin_debug', { title: 'Debug Beiträge', posts });
    } catch(e){ res.render('admin_debug', { title:'Debug Beiträge', posts: [] }); }
});

// Reparatur Route (setzt drafts auf published & published_at falls null)
router.post('/fix-posts', isAuthenticated, async (req, res) => {
    try {
        await pool.query("UPDATE posts SET status='published' WHERE status!='published'");
        res.redirect('/admin/tools');
    } catch(e){ res.status(500).send('Reparatur fehlgeschlagen'); }
});

router.get('/media', isAuthenticated, async (req, res) => {
    try {
        // Auto-Import von Audio-Dateien aus /httpdocs/audio
        const audioDir = path.join(__dirname, '../httpdocs/audio');
        try {
            const filesFs = await fs.readdir(audioDir);
            if(filesFs && filesFs.length){
                // vorhandene Medien-Pfade laden
                const [existing] = await pool.query("SELECT path FROM media WHERE path LIKE '/audio/%'");
                const existingSet = new Set(existing.map(r=>r.path));
                const toInsert = [];
                for(const f of filesFs){
                    if(!/\.(mp3|m4a|wav|ogg)$/i.test(f)) continue;
                    const mediaPath = '/audio/'+f;
                    if(existingSet.has(mediaPath)) continue;
                    // MIME rudimentär
                    let mime = 'audio/mpeg';
                    if(/\.m4a$/i.test(f)) mime='audio/mp4';
                    else if(/\.wav$/i.test(f)) mime='audio/wav';
                    else if(/\.ogg$/i.test(f)) mime='audio/ogg';
                    toInsert.push([f, mime, mediaPath, null, null, 'Audio']);
                }
                if(toInsert.length){
                    try { await pool.query("INSERT INTO media (name, type, path, alt_text, description, category) VALUES ?", [toInsert]); }
                    catch(e){
                        if(e.code==='ER_BAD_FIELD_ERROR' && e.message.includes('category')){
                            await pool.query("ALTER TABLE media ADD COLUMN category VARCHAR(100) NULL AFTER description");
                            await pool.query("INSERT INTO media (name, type, path, alt_text, description, category) VALUES ?", [toInsert]);
                        } else { throw e; }
                    }
                }
            }
        } catch(importErr){ /* Ordner evtl. nicht vorhanden -> ignorieren */ }

        const [rows] = await pool.query("SELECT * FROM media ORDER BY uploaded_at DESC");
        res.render('media_library', { title: 'Medien', files: rows });
    } catch (err) {
        res.status(500).send("Fehler beim Abrufen der Mediendateien.");
    }
});

let mediaSequentialCache = { loaded:false, next:1 };
async function ensureMediaSequentialStart(){
    if(mediaSequentialCache.loaded) return;
    try { const [r] = await pool.query('SELECT MAX(id) AS maxId FROM media'); mediaSequentialCache.next = (r[0].maxId||0)+1; } catch(e){ /* fallback bleibt 1 */ }
    mediaSequentialCache.loaded = true;
}
router.post('/upload', isAuthenticated, (req, res) => {
    multiUpload(req, res, async (err) => {
        if (err) { return res.status(500).send("Fehler beim Hochladen der Datei(en)."); }
        if (!req.files || req.files.length === 0) { return res.status(400).send('Keine Datei ausgewählt.'); }
        const { alt_text, description, category, base_name } = req.body;
        await ensureMediaSequentialStart();
        const desiredBase = (base_name||'').trim();
        const fsSync = require('fs');
        const path = require('path');
        const renameMap = [];
        // Erzeuge neue Dateinamen
        req.files.forEach((file, idx)=>{
            const ext = path.extname(file.originalname||file.filename).toLowerCase();
            let newBase;
            if(desiredBase){ newBase = req.files.length===1 ? desiredBase : desiredBase+'-'+(idx+1); }
            else { newBase = String(mediaSequentialCache.next).padStart(4,'0'); mediaSequentialCache.next++; }
            const newFilename = newBase + ext;
            if(newFilename !== file.filename){
                try { fsSync.renameSync(path.join('./httpdocs/uploads/', file.filename), path.join('./httpdocs/uploads/', newFilename)); file.filename = newFilename; }
                catch(e){ console.warn('Rename fehlgeschlagen für', file.filename, '->', newFilename, e.message); }
            }
            renameMap.push(file.filename);
        });
        const entries = req.files.map(f => [f.filename, f.mimetype, '/uploads/' + f.filename, alt_text || null, description || null, category || null]);
        try {
            try { await pool.query("INSERT INTO media (name, type, path, alt_text, description, category) VALUES ?", [entries]); }
            catch (e) {
                if (e.code === 'ER_BAD_FIELD_ERROR' && e.message.includes('category')) {
                    await pool.query("ALTER TABLE media ADD COLUMN category VARCHAR(100) NULL AFTER description");
                    await pool.query("INSERT INTO media (name, type, path, alt_text, description, category) VALUES ?", [entries]);
                } else { throw e; }
            }
            res.redirect('/admin/media');
        } catch (dbErr) {
            console.error('Upload DB Fehler:', dbErr);
            res.status(500).send("Fehler beim Speichern der Dateiinformationen.");
        }
    });
});

// Inline Bild Upload (AJAX, Einzeldatei) für Rich-Text-Editor
router.post('/api/upload-inline-image', isAuthenticated, multer({ storage }).single('file'), async (req, res) => {
    try {
        if(!req.file) return res.status(400).json({ error: 'Keine Datei' });
        const f = req.file;
        const relPath = '/uploads/' + f.filename;
        // In Medien DB eintragen
        try {
            await pool.query("INSERT INTO media (name, type, path, alt_text, description, category) VALUES (?,?,?,?,?,?)", [f.originalname, f.mimetype, relPath, null, null, 'Inline']);
        } catch(e){
            if(e.code==='ER_BAD_FIELD_ERROR' && e.message.includes('category')){
                await pool.query("ALTER TABLE media ADD COLUMN category VARCHAR(100) NULL AFTER description");
                await pool.query("INSERT INTO media (name, type, path, alt_text, description, category) VALUES (?,?,?,?,?,?)", [f.originalname, f.mimetype, relPath, null, null, 'Inline']);
            } else { console.error('Inline Upload DB Fehler', e); }
        }
        res.json({ path: relPath, name: f.originalname });
    } catch(e){ console.error('Inline Upload Fehler', e); res.status(500).json({ error: 'Upload fehlgeschlagen' }); }
});

router.get('/media/edit/:id', isAuthenticated, async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM media WHERE id = ?", [req.params.id]);
        if (rows.length === 0) { return res.status(404).send("Mediendatei nicht gefunden."); }
    res.render('admin_edit_media', { title: 'Media bearbeiten', file: rows[0] });
    } catch (err) {
        res.status(500).send("Fehler beim Abrufen der Mediendatei.");
    }
});

// --- Simple APIs for Advanced Pages pickers ---
router.get('/api/posts/simple', isAuthenticated, async (req,res)=>{
    try {
        const [rows] = await pool.query('SELECT id, title, slug, LEFT(REPLACE(REPLACE(content, "<[^>]+>", ""), "  ", " "), 160) AS excerpt FROM posts WHERE is_deleted=0 ORDER BY updated_at DESC LIMIT 250');
        res.json(rows.map(r=>({ id:r.id, title:r.title, slug:r.slug, excerpt:r.excerpt })));
    } catch(e){ res.status(500).json({error:'Fetch Posts fehlgeschlagen'}); }
});
router.get('/api/podcasts/simple', isAuthenticated, async (req,res)=>{
    try {
        const [rows] = await pool.query('SELECT id, title, LEFT(REPLACE(description, "<[^>]+>", ""), 200) AS description FROM podcasts ORDER BY published_at DESC LIMIT 250');
        res.json(rows);
    } catch(e){ res.status(500).json({error:'Fetch Podcasts fehlgeschlagen'}); }
});

router.post('/media/edit/:id', isAuthenticated, async (req, res) => {
    const { name, alt_text, description, category, seo_alt, seo_description, meta_keywords } = req.body;
    try {
        try {
            await pool.query("UPDATE media SET name = ?, alt_text = ?, description = ?, category = ?, seo_alt = ?, seo_description = ?, meta_keywords = ? WHERE id = ?", [name, alt_text, description, category || null, seo_alt || null, seo_description || null, meta_keywords || null, req.params.id]);
        } catch (e) {
            // Ensure columns one by one if missing
            if(e.code==='ER_BAD_FIELD_ERROR'){
                if(e.message.includes('seo_alt')){ try { await pool.query("ALTER TABLE media ADD COLUMN seo_alt VARCHAR(255) NULL"); } catch(_){} }
                if(e.message.includes('seo_description')){ try { await pool.query("ALTER TABLE media ADD COLUMN seo_description VARCHAR(255) NULL"); } catch(_){} }
                if(e.message.includes('meta_keywords')){ try { await pool.query("ALTER TABLE media ADD COLUMN meta_keywords VARCHAR(255) NULL"); } catch(_){} }
                if(e.message.includes('category')){ try { await pool.query("ALTER TABLE media ADD COLUMN category VARCHAR(100) NULL AFTER description"); } catch(_){} }
                await pool.query("UPDATE media SET name = ?, alt_text = ?, description = ?, category = ?, seo_alt = ?, seo_description = ?, meta_keywords = ? WHERE id = ?", [name, alt_text, description, category || null, seo_alt || null, seo_description || null, meta_keywords || null, req.params.id]);
            } else { throw e; }
        }
        res.redirect('/admin/media');
    } catch (err) {
        console.error('Media Update Fehler:', err);
        res.status(500).send("Fehler beim Aktualisieren der Mediendatei.");
    }
});

router.post('/media/delete/:id', isAuthenticated, async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT path FROM media WHERE id = ?", [req.params.id]);
        if (rows.length > 0) {
            const filePath = path.join(__dirname, '../httpdocs', rows[0].path);
            try { await fs.unlink(filePath); } catch (unlinkErr) { /* Ignorieren */ }
        }
        await pool.query("DELETE FROM media WHERE id = ?", [req.params.id]);
        res.redirect('/admin/media');
    } catch (err) {
        res.status(500).send("Ein Fehler ist beim Löschen aufgetreten.");
    }
});

// Media JSON API (für Modale / Filter)
router.get('/api/media', isAuthenticated, async (req, res) => {
    const { category, type } = req.query;
    try {
        let sql = 'SELECT id, name, type, path, alt_text, description, category, uploaded_at FROM media';
        const params = [];
        const where = [];
        if (category) { where.push('category = ?'); params.push(category); }
        if (type === 'image') { where.push("type LIKE 'image/%'"); }
        if (type === 'audio') { where.push("type LIKE 'audio/%'"); }
        if (where.length) sql += ' WHERE ' + where.join(' AND ');
        sql += ' ORDER BY uploaded_at DESC LIMIT 500';
        const [rows] = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Fehler beim Abrufen der Medien' });
    }
});

// KI Alt-Text & Beschreibung generieren (einzelne Datei anhand Dateiname)
router.post('/generate-alt-text', isAuthenticated, async (req, res) => {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: 'Filename fehlt' });
    try {
        const cfg = await refreshAIConfig();
        const baseDesc = (cfg.prompts && cfg.prompts.media_alt_text) || 'Erzeuge ALT-Text und Beschreibung.';
        const data = await geminiTwoStageInvoke({
            baseDescription: baseDesc + ` Dateiname: ${filename}`,
            userPayloadBuilder: (optimized) => ({
                finalPrompt: optimized + `\nAntworte als JSON: {"alt":"...","description":"..."}`,
                schema: { type:'OBJECT', properties:{ alt:{type:'STRING'}, description:{type:'STRING'} } }
            })
        });
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        let parsed={}; try { parsed=JSON.parse(raw); } catch(_) {}
        res.json({ alt: parsed.alt||'', description: parsed.description||'' });
    } catch(e){ console.error('AltText Fehler', e.message); res.status(500).json({error:'Generierung fehlgeschlagen'}); }
});

// KI "What's New" Generator: liefert vorgeschlagene Titel/Content (DE+EN) und Kurztext whatsnew
router.post('/generate-whats-new', isAuthenticated, async (req, res) => {
    try {
        const cfg = await refreshAIConfig();
        const maxChars = (cfg.limits && cfg.limits.max_response_chars) || 10000;
        const desc = (cfg.prompts && cfg.prompts.whats_new_research) || 'Recherchiere aktuelle Data Security & Governance News und generiere nur DEUTSCHEN Content.';
        const data = await geminiTwoStageInvoke({
            baseDescription: desc + ` Erzeuge zuerst einen mehrabschnittigen HTML-Artikel (mit <h2>, <p>, optional <ul>, Bootstrap Icons wie <i class=\"bi bi-shield-lock\"></i>). Verwende wenn passend illustrative Bilder (Platzhalter <img src=\"/uploads/Panda_Banner.png\" alt=\"\"> falls unsicher). Danach prägnanten Teaser (max 180 Zeichen) und Titel. Kürze gesamt auf <= ${maxChars} Zeichen.`,
            userPayloadBuilder: (optimized)=>({
                finalPrompt: optimized + `\nAntwort JSON: {"title_de":"...","content_de":"<p>...</p>","whatsnew":"..."}\nRegeln: Nur Deutsch. content_de vollständiger HTML Artikel (max ${maxChars} Zeichen). whatsnew max 180 Zeichen ohne HTML. Keine Skripte.`,
                schema:{ type:'OBJECT', properties:{ title_de:{type:'STRING'}, content_de:{type:'STRING'}, whatsnew:{type:'STRING'} } }
            })
        });
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        let parsed={};
        try{ parsed=JSON.parse(raw);}catch(_){
            // Toleranter Fallback: Regex Felder extrahieren
            const rx = (key)=>{ const m = raw.match(new RegExp('"'+key+'"\\s*:\\s*"([\\s\\S]*?)"\\s*(,|})')); return m? m[1] : ''; };
            const unescape = (s)=> s.replace(/\\n/g,'\n').replace(/\\r/g,'').replace(/\\t/g,'\t').replace(/\\"/g,'"');
            parsed={
                parse_error:true,
                raw,
                title_de: unescape(rx('title_de')), 
                content_de: unescape(rx('content_de')),
                whatsnew: unescape(rx('whatsnew'))
            };
        }
        // Sanitisiere Fälle wo whatsnew versehentlich im content landet
        if(parsed.content_de && /whatsnew"\s*:/.test(parsed.content_de)){ parsed.content_de = parsed.content_de.replace(/"whatsnew"\s*:\s*"[^"]*"/g,''); }
        // Rückwärtskompatibilität: Fülle leere EN Felder für Frontend, falls Code noch darauf zugreift
        parsed.title_en = '';
        parsed.content_en = '';
        incrementAIUsage('whats_new');
    try { await pool.query('INSERT INTO ai_call_log (endpoint, prompt_text, response_chars) VALUES (?,?,?)',[ 'whats_new', desc.slice(0,64000), raw.length ]);} catch(_){ }
        res.json(parsed);
    } catch(e){ console.error("What's New Fehler", e); res.status(500).json({error:'Generierung fehlgeschlagen', detail:e.message, stack:e.stack}); }
});

// Sample Content Generator (Posts) – liefert beispielhafte Felder
router.post('/posts/generate-sample', isAuthenticated, async (req, res) => {
    try {
        const cfg = await refreshAIConfig();
        const maxChars = (cfg.limits && cfg.limits.max_sample_chars) || 8000;
        const desc = (cfg.prompts && cfg.prompts.blog_sample) || 'Beispiel Blog (nur Deutsch)';
        const data = await geminiTwoStageInvoke({
            baseDescription: desc + ` Erzeuge realistischen deutschen Beispiel-Artikel mit HTML-Struktur (<h2>, <p>, <ul>, Icons <i class=\"bi bi-cloud-lock\"></i>, optional 1-2 Bilder mit Platzhalter /uploads/Panda_Banner.png). Danach Titel (DE) und Teaser (max 180 Zeichen). Beschränke gesamte Ausgabe auf ${maxChars} Zeichen.`,
            userPayloadBuilder: (optimized)=>({
                finalPrompt: optimized + `\nAntwort JSON: {"title_de":"...","content_de":"<p>...</p>","whatsnew":"..."}\nRegeln: Nur Deutsch. content_de volle HTML Struktur, gesamter JSON Inhalt max ${maxChars} Zeichen. whatsnew max 180 Zeichen ohne HTML.`,
                schema:{ type:'OBJECT', properties:{ title_de:{type:'STRING'}, content_de:{type:'STRING'}, whatsnew:{type:'STRING'} } }
            })
        });
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        let parsed={};
        try{ parsed=JSON.parse(raw);}catch(_){
            const rx = (key)=>{ const m = raw.match(new RegExp('"'+key+'"\\s*:\\s*"([\\s\\S]*?)"\\s*(,|})')); return m? m[1] : ''; };
            const unescape = (s)=> s.replace(/\\n/g,'\n').replace(/\\r/g,'').replace(/\\t/g,'\t').replace(/\\"/g,'"');
            parsed={ parse_error:true, raw, title_de: unescape(rx('title_de')), content_de: unescape(rx('content_de')), whatsnew: unescape(rx('whatsnew')) };
        }
        if(parsed.content_de && /whatsnew"\s*:/.test(parsed.content_de)){ parsed.content_de = parsed.content_de.replace(/"whatsnew"\s*:\s*"[^"]*"/g,''); }
        parsed.title_en=''; parsed.content_en='';
        incrementAIUsage('blog_sample');
    try { await pool.query('INSERT INTO ai_call_log (endpoint, prompt_text, response_chars) VALUES (?,?,?)',[ 'blog_sample', desc.slice(0,64000), raw.length ]);} catch(_){ }
        res.json(parsed);
    } catch(e){ console.error('Sample generation AI Fehler:', e); res.status(500).json({error:'Sample generation failed', detail:e.message, stack:e.stack}); }
});

// API-Endpunkt für die Übersetzung
router.post('/api/translate', isAuthenticated, async (req, res) => {
    const { text } = req.body;
    try {
        const cfg = await refreshAIConfig();
        const maxChars = (cfg.limits && cfg.limits.max_translate_chars) || 10000;
        const desc = (cfg.prompts && cfg.prompts.translate) || 'Übersetze Titel UND gesamten HTML-Inhalt präzise nach Englisch. Erhalte HTML-Struktur, keine Zusammenfassung.';
        const data = await geminiTwoStageInvoke({
            baseDescription: desc,
            userPayloadBuilder: (optimized)=>({
                finalPrompt: optimized + `\nBegrenze Antwort (JSON Werte gesamt) auf ${maxChars} Zeichen. Quelltext (Deutsch):\n${text}\nAntwort als JSON {"title":"...","content":"<p>...</p>"}. Behalte vorhandene Tags, übersetze nur Text.`,
                schema:{ type:'OBJECT', properties:{ title:{type:'STRING'}, content:{type:'STRING'} } }
            })
        });
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    try { await pool.query('INSERT INTO ai_call_log (endpoint, prompt_text, response_chars) VALUES (?,?,?)',[ 'translate', desc.slice(0,64000)+"\n---INPUT---\n"+String(text).slice(0,32000), raw.length ]);} catch(_){ }
    res.json({ translation: raw });
    } catch(e){ console.error('Translate Fehler:', e); res.status(500).json({error:'Translation failed', detail:e.message, stack:e.stack}); }
});

// Blog AI Config View & Update
router.get('/blog-config', isAuthenticated, async (req, res) => {
    try { const cfg = await refreshAIConfig(true); res.render('admin_blog_config', { title:'Blog Konfiguration', ai: cfg, saved: req.query.saved==='1' }); }
    catch(e){ res.status(500).send('Config Laden fehlgeschlagen'); }
});
router.post('/blog-config', isAuthenticated, async (req, res) => {
    const { primary_key_choice, max_daily_calls, whats_new_research, translate_prompt, media_alt_text, blog_sample, blog_tags, media_categories, max_response_chars, max_translate_chars, max_sample_chars, seo_title_prefix, enable_generator, generator_default_sections } = req.body;
    try {
        // Stelle sicher, dass Tabelle existiert (sicherheitsnetz, falls initialer Load scheiterte)
        await pool.query(`CREATE TABLE IF NOT EXISTS ai_config (
            id INT PRIMARY KEY DEFAULT 1,
            primary_key_choice VARCHAR(16) NOT NULL DEFAULT 'paid',
            max_daily_calls INT NOT NULL DEFAULT 500,
            limits JSON NULL,
            prompts JSON NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
    // Falls historische Installation ohne limits/prompts Spalten: nachrüsten
    try { await pool.query('ALTER TABLE ai_config ADD COLUMN limits JSON NULL AFTER max_daily_calls'); } catch(_) {}
    try { await pool.query('ALTER TABLE ai_config ADD COLUMN prompts JSON NULL AFTER limits'); } catch(_) {}
        // Auto-Insert falls Datensatz fehlt
        const [exists] = await pool.query('SELECT id FROM ai_config WHERE id=1');
        if(!exists.length){
            await pool.query('INSERT INTO ai_config (id, primary_key_choice, max_daily_calls, limits, prompts) VALUES (1, "paid", 500, ?, ?)', [ JSON.stringify({ max_response_chars:10000, max_translate_chars:10000, max_sample_chars:8000 }), JSON.stringify({ whats_new_research: whats_new_research||'', translate: translate_prompt||'', media_alt_text: media_alt_text||'', blog_sample: blog_sample||'', blog_tags: blog_tags||'', media_categories: media_categories||'' }) ]);
        }
        const limits = { 
            max_response_chars: parseInt(max_response_chars||10000,10),
            max_translate_chars: parseInt(max_translate_chars||10000,10),
            max_sample_chars: parseInt(max_sample_chars||8000,10)
        };
    const promptsObj = { whats_new_research, translate: translate_prompt, media_alt_text, blog_sample, blog_tags, media_categories, seo_title_prefix, generator_default_sections, enable_generator: enable_generator ? 1 : 0 };
    await pool.query('UPDATE ai_config SET primary_key_choice=?, max_daily_calls=?, limits=?, prompts=? WHERE id=1',[ (primary_key_choice==='free'?'free':'paid'), parseInt(max_daily_calls||500,10), JSON.stringify(limits), JSON.stringify(promptsObj) ]);
        aiConfigLoadedAt = 0; // invalidate cache
    res.redirect('/admin/blog-config?saved=1');
    } catch(e){ console.error('Config Update Fehler:', e); res.status(500).send('Speichern fehlgeschlagen: '+ e.message); }
});

// AI Usage Dashboard (einfach)
router.get('/ai-usage', isAuthenticated, async (req, res) => {
    try {
        await ensureAIUsageTable();
        const [today] = await pool.query('SELECT endpoint, calls FROM ai_usage WHERE day=CURDATE() ORDER BY calls DESC');
    const [history] = await pool.query('SELECT day, endpoint, calls FROM ai_usage WHERE day>=DATE_SUB(CURDATE(), INTERVAL 14 DAY) ORDER BY day DESC, calls DESC');
    const [log] = await pool.query('SELECT id, created_at, endpoint, LEFT(prompt_text, 400) AS prompt_snippet, response_chars, error_message FROM ai_call_log WHERE created_at>=DATE_SUB(NOW(), INTERVAL 14 DAY) ORDER BY id DESC LIMIT 1000');
        const totalToday = today.reduce((a,b)=>a+(b.calls||0),0);
    res.render('admin_ai_usage', { title:'AI Usage', today, history, totalToday, log });
    } catch(e){ console.error('AI Usage View Fehler:', e.message); res.status(500).send('Usage Laden fehlgeschlagen'); }
});

module.exports = router;
