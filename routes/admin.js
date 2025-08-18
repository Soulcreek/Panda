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

// Multer-Konfiguration für Dateiuploads
const storage = multer.diskStorage({
    destination: './httpdocs/uploads/',
    filename: function(req, file, cb){
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage }).single('mediafile');

// Admin Dashboard
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const [postCountRows] = await pool.query("SELECT COUNT(*) as count FROM posts");
        const [mediaCountRows] = await pool.query("SELECT COUNT(*) as count FROM media");
        const [podcastCountRows] = await pool.query("SELECT COUNT(*) as count FROM podcasts");
        const [latestPosts] = await pool.query("SELECT * FROM posts ORDER BY updated_at DESC LIMIT 5");

        res.render('admin_dashboard', {
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
        const [posts] = await pool.query("SELECT * FROM posts ORDER BY created_at DESC");
        res.render('admin_posts', { posts: posts });
    } catch (err) { res.status(500).send("Fehler beim Laden der Beiträge."); }
});

router.get('/posts/new', isAuthenticated, async (req, res) => {
    try {
        const [media] = await pool.query("SELECT * FROM media ORDER BY uploaded_at DESC");
        res.render('admin_edit_post', { post: null, media: media });
    } catch (err) {
        res.status(500).send("Fehler beim Laden des Editors.");
    }
});

router.post('/posts/new', isAuthenticated, async (req, res) => {
    const { title, content, status, title_en, content_en, whatsnew } = req.body;
    const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
    try {
        await pool.query(
            'INSERT INTO posts (title, slug, content, author_id, status, title_en, content_en, whatsnew) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [title, slug, content, req.session.userId, status, title_en, content_en, whatsnew]
        );
        res.redirect('/admin/posts');
    } catch (err) {
        console.error(err);
        res.status(500).send("Fehler beim Speichern des Beitrags.");
    }
});

router.get('/posts/edit/:id', isAuthenticated, async (req, res) => {
    try {
        const [posts] = await pool.query("SELECT * FROM posts WHERE id = ?", [req.params.id]);
        if (posts.length === 0) {
            return res.status(404).send("Beitrag nicht gefunden.");
        }
        const [media] = await pool.query("SELECT * FROM media ORDER BY uploaded_at DESC");
        res.render('admin_edit_post', { post: posts[0], media: media });
    } catch (err) {
        res.status(500).send("Fehler beim Laden des Editors.");
    }
});

router.post('/posts/edit/:id', isAuthenticated, async (req, res) => {
    const { title, content, status, title_en, content_en, whatsnew } = req.body;
    const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
    try {
        await pool.query(
            'UPDATE posts SET title = ?, slug = ?, content = ?, status = ?, title_en = ?, content_en = ?, whatsnew = ? WHERE id = ?',
            [title, slug, content, status, title_en, content_en, whatsnew, req.params.id]
        );
        res.redirect('/admin/posts');
    } catch (err) {
        console.error(err);
        res.status(500).send("Fehler beim Aktualisieren des Beitrags.");
    }
});

// --- PODCAST-VERWALTUNG ---
router.get('/podcasts', isAuthenticated, async (req, res) => {
    try {
        const [podcasts] = await pool.query("SELECT * FROM podcasts ORDER BY published_at DESC");
        res.render('admin_podcasts', { podcasts: podcasts });
    } catch (err) { res.render('admin_podcasts', { podcasts: [] }); }
});

// --- TOOLS & MEDIEN ---
router.get('/tools', isAuthenticated, (req, res) => {
    res.render('admin_tools', { posts: [] });
});

router.get('/media', isAuthenticated, async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM media ORDER BY uploaded_at DESC");
        res.render('media_library', { files: rows });
    } catch (err) {
        res.status(500).send("Fehler beim Abrufen der Mediendateien.");
    }
});

router.post('/upload', isAuthenticated, (req, res) => {
    upload(req, res, async (err) => {
        if (err) { return res.status(500).send("Fehler beim Hochladen der Datei."); }
        if (!req.file) { return res.status(400).send('Keine Datei ausgewählt.'); }
        try {
            await pool.query("INSERT INTO media (name, type, path) VALUES (?, ?, ?)", [req.file.filename, req.file.mimetype, '/uploads/' + req.file.filename]);
            res.redirect('/admin/media');
        } catch (dbErr) {
            res.status(500).send("Fehler beim Speichern der Dateiinformationen.");
        }
    });
});

router.get('/media/edit/:id', isAuthenticated, async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM media WHERE id = ?", [req.params.id]);
        if (rows.length === 0) { return res.status(404).send("Mediendatei nicht gefunden."); }
        res.render('admin_edit_media', { file: rows[0] });
    } catch (err) {
        res.status(500).send("Fehler beim Abrufen der Mediendatei.");
    }
});

router.post('/media/edit/:id', isAuthenticated, async (req, res) => {
    const { name, alt_text, description } = req.body;
    try {
        await pool.query("UPDATE media SET name = ?, alt_text = ?, description = ? WHERE id = ?", [name, alt_text, description, req.params.id]);
        res.redirect('/admin/media');
    } catch (err) {
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
        
        res.json({ translation: translationText });

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Translation failed' });
    }
});

module.exports = router;
