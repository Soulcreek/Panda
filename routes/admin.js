// soulcreek/panda/Panda-master/routes/admin.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const pool = require('../db');
// In-Memory Cache für AI Konfiguration (wird aus DB geladen)
let aiConfigCache = null; let aiConfigLoadedAt = 0;
async function getAIConfig(){
    try {
        // Tabelle sicherstellen
        await pool.query(`CREATE TABLE IF NOT EXISTS ai_config (
            id INT PRIMARY KEY DEFAULT 1,
            primary_key_choice VARCHAR(16) NOT NULL DEFAULT 'paid',
            max_daily_calls INT NOT NULL DEFAULT 500,
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
            await pool.query('INSERT INTO ai_config (id, primary_key_choice, max_daily_calls, prompts) VALUES (1, "paid", 500, ?)', [defaultPrompts]);
            return { id:1, primary_key_choice:'paid', max_daily_calls:500, prompts: JSON.parse(defaultPrompts) };
        }
        const cfg = rows[0];
        try { cfg.prompts = cfg.prompts ? JSON.parse(cfg.prompts) : {}; } catch(_) { cfg.prompts = {}; }
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

        res.render('admin_dashboard', {
            title: 'Admin Dashboard',
            postCount: postCountRows[0].count,
            mediaCount: mediaCountRows[0].count,
            podcastCount: podcastCountRows[0].count,
            latestPosts: latestPosts
        });
    } catch (err) {
        console.error('Fehler beim Laden des Admin-Dashboards:', err);
        res.status(500).send("Fehler beim Laden des Dashboards.");
    }
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
        const mediaCats = (cfg.prompts && cfg.prompts.media_categories ? cfg.prompts.media_categories.split(',').map(s=>s.trim()).filter(Boolean) : []);
        res.render('admin_edit_post', { title: 'Neuer Beitrag', post: null, media: media, tagsList, mediaCats });
    } catch (err) {
        res.status(500).send("Fehler beim Laden des Editors.");
    }
});

router.post('/posts/new', isAuthenticated, async (req, res) => {
    const { title, content, status, title_en, content_en, whatsnew, featured_image_id, published_at, tags } = req.body;
    const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
    try {
        try {
            await pool.query(
                'INSERT INTO posts (title, slug, content, author_id, status, title_en, content_en, whatsnew, featured_image_id, published_at, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [title, slug, content, req.session.userId, status, title_en, content_en, whatsnew, featured_image_id || null, published_at || null, tags || null]
            );
        } catch (e) {
            if (e.code === 'ER_BAD_FIELD_ERROR' && e.message.includes('published_at')) {
                await pool.query('ALTER TABLE posts ADD COLUMN published_at DATETIME NULL AFTER status');
                await pool.query(
                    'INSERT INTO posts (title, slug, content, author_id, status, title_en, content_en, whatsnew, featured_image_id, published_at, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [title, slug, content, req.session.userId, status, title_en, content_en, whatsnew, featured_image_id || null, published_at || null, tags || null]
                );
            } else if (e.code === 'ER_BAD_FIELD_ERROR' && e.message.includes('tags')) {
                await pool.query("ALTER TABLE posts ADD COLUMN tags VARCHAR(255) NULL AFTER whatsnew");
                await pool.query(
                    'INSERT INTO posts (title, slug, content, author_id, status, title_en, content_en, whatsnew, featured_image_id, published_at, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [title, slug, content, req.session.userId, status, title_en, content_en, whatsnew, featured_image_id || null, published_at || null, tags || null]
                );
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
        const mediaCats = (cfg.prompts && cfg.prompts.media_categories ? cfg.prompts.media_categories.split(',').map(s=>s.trim()).filter(Boolean) : []);
        res.render('admin_edit_post', { title: 'Beitrag bearbeiten', post: posts[0], media: media, tagsList, mediaCats });
    } catch (err) {
        res.status(500).send("Fehler beim Laden des Editors.");
    }
});

router.post('/posts/edit/:id', isAuthenticated, async (req, res) => {
    const { title, content, status, title_en, content_en, whatsnew, featured_image_id, published_at, tags } = req.body;
    const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
    try {
        try {
            await pool.query(
                'UPDATE posts SET title = ?, slug = ?, content = ?, status = ?, title_en = ?, content_en = ?, whatsnew = ?, featured_image_id = ?, published_at = ?, tags = ? WHERE id = ?',
                [title, slug, content, status, title_en, content_en, whatsnew, featured_image_id || null, published_at || null, tags || null, req.params.id]
            );
        } catch (e) {
            if (e.code === 'ER_BAD_FIELD_ERROR' && e.message.includes('published_at')) {
                await pool.query('ALTER TABLE posts ADD COLUMN published_at DATETIME NULL AFTER status');
                await pool.query(
                    'UPDATE posts SET title = ?, slug = ?, content = ?, status = ?, title_en = ?, content_en = ?, whatsnew = ?, featured_image_id = ?, published_at = ?, tags = ? WHERE id = ?',
                    [title, slug, content, status, title_en, content_en, whatsnew, featured_image_id || null, published_at || null, tags || null, req.params.id]
                );
            } else if (e.code === 'ER_BAD_FIELD_ERROR' && e.message.includes('tags')) {
                await pool.query("ALTER TABLE posts ADD COLUMN tags VARCHAR(255) NULL AFTER whatsnew");
                await pool.query(
                    'UPDATE posts SET title = ?, slug = ?, content = ?, status = ?, title_en = ?, content_en = ?, whatsnew = ?, featured_image_id = ?, published_at = ?, tags = ? WHERE id = ?',
                    [title, slug, content, status, title_en, content_en, whatsnew, featured_image_id || null, published_at || null, tags || null, req.params.id]
                );
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
    const { title, description, audio_url } = req.body;
    try {
        await pool.query('INSERT INTO podcasts (title, description, audio_url, published_at) VALUES (?, ?, ?, NOW())', [title, description, audio_url]);
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
    const { title, description, audio_url } = req.body;
    try {
        await pool.query('UPDATE podcasts SET title=?, description=?, audio_url=? WHERE id=?', [title, description, audio_url, req.params.id]);
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
          UNIQUE KEY uniq_level (site_key, level_index),
          INDEX(site_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

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
    const { title, content_html, image_path } = req.body;
    try {
        await pool.query('UPDATE timeline_levels SET title=?, content_html=?, image_path=? WHERE site_key=? AND level_index=?',[title||'', content_html||null, image_path||null, site, level]);
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

router.post('/upload', isAuthenticated, (req, res) => {
    multiUpload(req, res, async (err) => {
        if (err) { return res.status(500).send("Fehler beim Hochladen der Datei(en)."); }
        if (!req.files || req.files.length === 0) { return res.status(400).send('Keine Datei ausgewählt.'); }

        const { alt_text, description, category } = req.body;
        const entries = req.files.map(f => [f.filename, f.mimetype, '/uploads/' + f.filename, alt_text || null, description || null, category || null]);

        try {
            try {
                await pool.query("INSERT INTO media (name, type, path, alt_text, description, category) VALUES ?", [entries]);
            } catch (e) {
                if (e.code === 'ER_BAD_FIELD_ERROR' && e.message.includes('category')) {
                    // Spalte hinzufügen und erneut versuchen
                    await pool.query("ALTER TABLE media ADD COLUMN category VARCHAR(100) NULL AFTER description");
                    await pool.query("INSERT INTO media (name, type, path, alt_text, description, category) VALUES ?", [entries]);
                } else {
                    throw e;
                }
            }
            res.redirect('/admin/media');
        } catch (dbErr) {
            console.error('Upload DB Fehler:', dbErr);
            res.status(500).send("Fehler beim Speichern der Dateiinformationen.");
        }
    });
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

router.post('/media/edit/:id', isAuthenticated, async (req, res) => {
    const { name, alt_text, description, category } = req.body;
    try {
        try {
            await pool.query("UPDATE media SET name = ?, alt_text = ?, description = ?, category = ? WHERE id = ?", [name, alt_text, description, category || null, req.params.id]);
        } catch (e) {
            if (e.code === 'ER_BAD_FIELD_ERROR' && e.message.includes('category')) {
                await pool.query("ALTER TABLE media ADD COLUMN category VARCHAR(100) NULL AFTER description");
                await pool.query("UPDATE media SET name = ?, alt_text = ?, description = ?, category = ? WHERE id = ?", [name, alt_text, description, category || null, req.params.id]);
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
        const desc = (cfg.prompts && cfg.prompts.whats_new_research) || 'Data Security News';
        const data = await geminiTwoStageInvoke({
            baseDescription: desc,
            userPayloadBuilder: (optimized)=>({
                finalPrompt: optimized + '\nAntworte als JSON: {"title_de":"...","content_de":"<p>...</p>","title_en":"...","content_en":"<p>...</p>","whatsnew":"..."}',
                schema:{ type:'OBJECT', properties:{ title_de:{type:'STRING'}, content_de:{type:'STRING'}, title_en:{type:'STRING'}, content_en:{type:'STRING'}, whatsnew:{type:'STRING'} } }
            })
        });
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        let parsed={}; try{ parsed=JSON.parse(raw);}catch(_){ }
        incrementAIUsage('whats_new');
        res.json(parsed);
    } catch(e){ console.error("What's New Fehler", e.message); res.status(500).json({error:'Generierung fehlgeschlagen', detail:e.message}); }
});

// Sample Content Generator (Posts) – liefert beispielhafte Felder
router.post('/posts/generate-sample', isAuthenticated, async (req, res) => {
    try {
        const cfg = await refreshAIConfig();
        const desc = (cfg.prompts && cfg.prompts.blog_sample) || 'Beispiel Blog';
        const data = await geminiTwoStageInvoke({
            baseDescription: desc,
            userPayloadBuilder: (optimized)=>({
                finalPrompt: optimized + '\nAntworte als JSON: {"title_de":"...","content_de":"<p>...</p>","title_en":"...","content_en":"<p>...</p>","whatsnew":"..."}',
                schema:{ type:'OBJECT', properties:{ title_de:{type:'STRING'}, content_de:{type:'STRING'}, title_en:{type:'STRING'}, content_en:{type:'STRING'}, whatsnew:{type:'STRING'} } }
            })
        });
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        let parsed={}; try{ parsed=JSON.parse(raw);}catch(_){ parsed={}; }
        incrementAIUsage('blog_sample');
        res.json(parsed);
    } catch(e){ console.error('Sample generation AI Fehler:', e.message); res.status(500).json({error:'Sample generation failed', detail:e.message}); }
});

// API-Endpunkt für die Übersetzung
router.post('/api/translate', isAuthenticated, async (req, res) => {
    const { text } = req.body;
    try {
        const cfg = await refreshAIConfig();
        const desc = (cfg.prompts && cfg.prompts.translate) || 'Übersetze nach Englisch und liefere JSON.';
        const data = await geminiTwoStageInvoke({
            baseDescription: desc,
            userPayloadBuilder: (optimized)=>({
                finalPrompt: optimized + `\nQuelltext:\n${text}\nAntwort JSON {"title":"...","content":"..."}`,
                schema:{ type:'OBJECT', properties:{ title:{type:'STRING'}, content:{type:'STRING'} } }
            })
        });
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        res.json({ translation: raw });
    } catch(e){ console.error('Translate Fehler:', e.message); res.status(500).json({error:'Translation failed'}); }
});

// Blog AI Config View & Update
router.get('/blog-config', isAuthenticated, async (req, res) => {
    try { const cfg = await refreshAIConfig(true); res.render('admin_blog_config', { title:'Blog Konfiguration', ai: cfg }); }
    catch(e){ res.status(500).send('Config Laden fehlgeschlagen'); }
});
router.post('/blog-config', isAuthenticated, async (req, res) => {
    const { primary_key_choice, max_daily_calls, whats_new_research, translate_prompt, media_alt_text, blog_sample, blog_tags, media_categories } = req.body;
    try {
        await pool.query('UPDATE ai_config SET primary_key_choice=?, max_daily_calls=?, prompts=? WHERE id=1',[ (primary_key_choice==='free'?'free':'paid'), parseInt(max_daily_calls||500,10), JSON.stringify({ whats_new_research, translate: translate_prompt, media_alt_text, blog_sample, blog_tags, media_categories }) ]);
        aiConfigLoadedAt = 0; // invalidate cache
        res.redirect('/admin/blog-config');
    } catch(e){ console.error('Config Update Fehler:', e.message); res.status(500).send('Speichern fehlgeschlagen'); }
});

// AI Usage Dashboard (einfach)
router.get('/ai-usage', isAuthenticated, async (req, res) => {
    try {
        await ensureAIUsageTable();
        const [today] = await pool.query('SELECT endpoint, calls FROM ai_usage WHERE day=CURDATE() ORDER BY calls DESC');
        const [history] = await pool.query('SELECT day, endpoint, calls FROM ai_usage WHERE day>=DATE_SUB(CURDATE(), INTERVAL 14 DAY) ORDER BY day DESC, calls DESC');
        const totalToday = today.reduce((a,b)=>a+(b.calls||0),0);
        res.render('admin_ai_usage', { title:'AI Usage', today, history, totalToday });
    } catch(e){ console.error('AI Usage View Fehler:', e.message); res.status(500).send('Usage Laden fehlgeschlagen'); }
});

module.exports = router;
