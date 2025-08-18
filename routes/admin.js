// soulcreek/panda/Panda-master/routes/admin.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const pool = require('../db');

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
    res.render('admin_edit_post', { title: 'Neuer Beitrag', post: null, media: media });
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
    res.render('admin_edit_post', { title: 'Beitrag bearbeiten', post: posts[0], media: media });
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
    try { await pool.query("UPDATE posts SET is_featured = CASE WHEN is_featured=1 THEN 0 ELSE 1 END WHERE id=?", [req.params.id]); res.redirect('/admin/posts'); }
    catch(e){ res.status(500).send('Fehler Fokus'); }
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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || !filename) return res.status(400).json({ error: 'Fehlende Parameter oder API Key' });
    try {
        const fetch = (await import('node-fetch')).default;
        const prompt = `Erzeuge einen prägnanten deutschen ALT-Text (max 12 Wörter) und eine kurze Beschreibung (max 30 Wörter) für eine Bilddatei namens "${filename}". Antworte als JSON: {"alt":"...","description":"..."}`;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
        const payload = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { response_mime_type: 'application/json' } };
        const resp = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!resp.ok) throw new Error('API Fehler ' + resp.status);
        const data = await resp.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        let parsed = {}; try { parsed = JSON.parse(raw); } catch(_) {}
    res.set('Content-Type','application/json');
    return res.json({ alt: parsed.alt || '', description: parsed.description || '' });
    } catch (err) {
        console.error('AltText KI Fehler:', err.message);
        res.status(500).json({ error: 'Generierung fehlgeschlagen' });
    }
});

// KI "What's New" Generator: liefert vorgeschlagene Titel/Content (DE+EN) und Kurztext whatsnew
router.post('/generate-whats-new', isAuthenticated, async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key fehlt' });
    try {
        const fetch = (await import('node-fetch')).default;
        const prompt = `Recherchiere in allgemein bekannten, frei verfügbaren Online-Quellen (ohne vertrauliche Daten) aktuelle Neuigkeiten der letzten 14 Tage rund um Data Security, Microsoft Purview, Compliance, Data Governance (nur öffentlich weithin bekannte Trends). Generiere einen deutschen Blog-Artikel (HTML Absätze), einen englischen Titel+Inhalt (Übersetzung) und einen sehr kurzen DE WhatsNew Teaser (max 140 Zeichen, keine Anführungszeichen).
Antworte als JSON exakt mit Feldern: {"title_de":"...","content_de":"<p>...</p>","title_en":"...","content_en":"<p>...</p>","whatsnew":"..."}`;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
        const payload = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { response_mime_type: 'application/json' } };
        const resp = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!resp.ok) throw new Error('API Fehler ' + resp.status);
        const data = await resp.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        let parsed = {}; try { parsed = JSON.parse(raw); } catch(_) {}
    res.set('Content-Type','application/json');
    return res.json(parsed);
    } catch (err) {
        console.error("What's New KI Fehler:", err.message);
    res.status(500).json({ error: 'Generierung fehlgeschlagen' });
    }
});

// API-Endpunkt für die Übersetzung
router.post('/api/translate', isAuthenticated, async (req, res) => {
    const { text } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'API key not configured.' });
    }
    
    const schema = {
      type: "OBJECT",
      properties: {
        "title": { "type": "STRING" },
        "content": { "type": "STRING" }
      }
    };

    try {
        const fetch = (await import('node-fetch')).default;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
        
        const payload = {
            contents: [{ parts: [{ text: `${text}\n\nPlease provide the translation in a valid JSON format like this: {"title": "...", "content": "..."}` }] }],
            generationConfig: {
                response_mime_type: "application/json",
                responseSchema: schema
            }
        };

        const apiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!apiResponse.ok) {
            throw new Error(`API request failed with status ${apiResponse.status}`);
        }

        const result = await apiResponse.json();
        const translationText = result.candidates[0].content.parts[0].text;
        
    res.set('Content-Type','application/json');
    res.json({ translation: translationText });

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Translation failed' });
    }
});

module.exports = router;
