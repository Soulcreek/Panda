const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Middleware & Konfiguration
function requireLogin(req, res, next) { if (req.session.loggedin) next(); else res.redirect('/login'); }
const storage = multer.diskStorage({ destination: (req, file, cb) => cb(null, 'httpdocs/uploads/'), filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname) });
const upload = multer({ storage: storage });

// Datenbank-Objekte und Helper-Funktionen müssen übergeben werden
module.exports = (postsDb, mediaDb, podcastsDb) => {

    // --- TAG HELPER FUNKTION ---
    async function handleTags(postId, tagsString) {
        if (!tagsString) {
            postsDb.run("DELETE FROM post_tags WHERE post_id = ?", [postId]);
            return;
        }
        const tagNames = tagsString.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag);
        if (tagNames.length === 0) {
            postsDb.run("DELETE FROM post_tags WHERE post_id = ?", [postId]);
            return;
        }
    
        const tagIds = await Promise.all(tagNames.map(name => {
            return new Promise((resolve, reject) => {
                postsDb.get("SELECT id FROM tags WHERE name_de = ?", [name], (err, row) => {
                    if (err) return reject(err);
                    if (row) return resolve(row.id);
                    postsDb.run("INSERT INTO tags (name_de) VALUES (?)", [name], function(err) {
                        if (err) return reject(err);
                        resolve(this.lastID);
                    });
                });
            });
        }));
    
        postsDb.serialize(() => {
            postsDb.run("DELETE FROM post_tags WHERE post_id = ?", [postId]);
            const stmt = postsDb.prepare("INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)");
            tagIds.forEach(tagId => stmt.run(postId, tagId));
            stmt.finalize();
        });
    }

    // --- DASHBOARD ---
    router.get('/', requireLogin, (req, res) => {
        const queries = {
            postCount: "SELECT COUNT(*) as count FROM posts WHERE is_deleted = 0",
            mediaCount: "SELECT COUNT(*) as count FROM media_library",
            podcastCount: "SELECT COUNT(*) as count FROM podcasts",
            latestPosts: `SELECT p.*, c.title FROM posts p JOIN posts_content c ON p.id = c.post_id WHERE p.is_deleted = 0 AND c.lang = 'de' ORDER BY p.createdAt DESC LIMIT 5`
        };

        postsDb.get(queries.postCount, [], (err, postRow) => {
            mediaDb.get(queries.mediaCount, [], (err, mediaRow) => {
                podcastsDb.get(queries.podcastCount, [], (err, podcastRow) => {
                    postsDb.all(queries.latestPosts, [], (err, latestPosts) => {
                        res.render('admin_dashboard', {
                            postCount: postRow ? postRow.count : 0,
                            mediaCount: mediaRow ? mediaRow.count : 0,
                            podcastCount: podcastRow ? podcastRow.count : 0,
                            latestPosts: latestPosts || []
                        });
                    });
                });
            });
        });
    });

    // --- BLOG POST ROUTEN ---
    router.get('/posts', requireLogin, (req, res) => {
        postsDb.all(`SELECT p.*, c.title FROM posts p JOIN posts_content c ON p.id = c.post_id WHERE p.is_deleted = 0 AND c.lang = 'de' ORDER BY p.createdAt DESC`, [], (err, posts) => {
            if (err) { console.error(err); return res.status(500).send("Fehler beim Laden der Beiträge."); }
            mediaDb.all("SELECT * FROM media_library ORDER BY uploadedAt DESC", [], (err, mediaItems) => {
                if (err) { console.error(err); return res.status(500).send("Fehler beim Laden der Medienbibliothek."); }
                res.render('admin_posts', { posts: posts || [], mediaItems: mediaItems || [] });
            });
        });
    });

    router.get('/post/edit/:id', requireLogin, (req, res) => {
        const query = `
            SELECT p.*, c_de.title as title_de, c_de.content as content_de, c_en.title as title_en, c_en.content as content_en,
            (SELECT GROUP_CONCAT(t.name_de) FROM tags t JOIN post_tags pt ON t.id = pt.tag_id WHERE pt.post_id = p.id) as tags
            FROM posts p
            LEFT JOIN posts_content c_de ON p.id = c_de.post_id AND c_de.lang = 'de'
            LEFT JOIN posts_content c_en ON p.id = c_en.post_id AND c_en.lang = 'en'
            WHERE p.id = ?`;
        postsDb.get(query, [req.params.id], (err, post) => {
            if (err || !post) return res.redirect('/admin/posts');
            mediaDb.all("SELECT * FROM media_library ORDER BY uploadedAt DESC", [], (err, mediaItems) => {
                if (err) { console.error(err); return res.status(500).send("Fehler beim Laden der Medienbibliothek."); }
                res.render('admin_edit_post', { post, mediaItems: mediaItems || [] });
            });
        });
    });

    router.post('/add_post', requireLogin, upload.single('titleImage'), (req, res) => {
        const { title_de, content_de, title_en, content_en, selectedTitleImage, published_at, is_featured, tags } = req.body;
        const imageFilename = selectedTitleImage || (req.file ? req.file.filename : null);
        const isFeatured = is_featured ? 1 : 0;
        
        const insertPost = () => {
            postsDb.run(`INSERT INTO posts (image_filename, published_at, is_featured, is_visible, is_deleted) VALUES (?, ?, ?, 1, 0)`, 
                   [imageFilename, published_at || null, isFeatured], async function(err) {
                if (err) { console.error(err); return res.status(500).send("Fehler beim Einfügen des Beitrags."); }
                const postId = this.lastID;
                await handleTags(postId, tags);
                postsDb.run(`INSERT INTO posts_content (post_id, lang, title, content) VALUES (?, 'de', ?, ?)`, [postId, title_de, content_de]);
                postsDb.run(`INSERT INTO posts_content (post_id, lang, title, content) VALUES (?, 'en', ?, ?)`, [postId, title_en, content_en]);
                res.redirect('/admin/posts');
            });
        };

        if (isFeatured) {
            postsDb.run("UPDATE posts SET is_featured = 0", [], (err) => {
                if (err) { console.error(err); return res.status(500).send("Fehler beim Zurücksetzen des 'Hervorgehoben'-Status."); }
                insertPost();
            });
        } else {
            insertPost();
        }
    });

    router.post('/post/edit/:id', requireLogin, upload.single('titleImage'), (req, res) => {
        const id = req.params.id;
        const { title_de, content_de, title_en, content_en, selectedTitleImage, published_at, is_featured, tags } = req.body;
        const isFeatured = is_featured ? 1 : 0;

        const updatePost = () => {
            postsDb.get("SELECT image_filename FROM posts WHERE id = ?", [id], (err, row) => {
                if (err) { console.error(err); return res.status(500).send("Fehler beim Abrufen des Bildnamens."); }
                const imageFilename = selectedTitleImage || (req.file ? req.file.filename : (row ? row.image_filename : null));
                postsDb.run(`UPDATE posts SET image_filename = ?, published_at = ?, is_featured = ? WHERE id = ?`, [imageFilename, published_at || null, isFeatured, id], async (err) => {
                    if (err) { console.error(err); return res.status(500).send("Fehler beim Aktualisieren des Beitrags."); }
                    await handleTags(id, tags);
                    postsDb.run(`REPLACE INTO posts_content (post_id, lang, title, content) VALUES (?, 'de', ?, ?)`, [id, title_de, content_de]);
                    postsDb.run(`REPLACE INTO posts_content (post_id, lang, title, content) VALUES (?, 'en', ?, ?)`, [id, title_en, content_en]);
                    res.redirect('/admin/posts');
                });
            });
        };
        
        if (isFeatured) {
            postsDb.run("UPDATE posts SET is_featured = 0 WHERE id != ?", [id], (err) => {
                if (err) { console.error(err); return res.status(500).send("Fehler beim Aktualisieren anderer 'Hervorgehoben'-Status."); }
                updatePost();
            });
        } else {
            updatePost();
        }
    });

    router.post('/post/toggle-visibility/:id', requireLogin, (req, res) => { postsDb.run("UPDATE posts SET is_visible = NOT is_visible WHERE id = ?", [req.params.id], () => res.json({ success: true })); });
    router.post('/post/delete/:id', requireLogin, (req, res) => { postsDb.run("UPDATE posts SET is_deleted = 1 WHERE id = ?", [req.params.id], () => res.json({ success: true })); });
    router.post('/post/toggle-featured/:id', requireLogin, (req, res) => { postsDb.run("UPDATE posts SET is_featured = 0", [], () => { postsDb.run("UPDATE posts SET is_featured = 1 WHERE id = ?", [req.params.id], () => res.json({ success: true })); }); });
    
    // --- PODCAST ROUTEN ---
    router.get('/podcasts', requireLogin, (req, res) => {
        podcastsDb.all("SELECT p.*, c.title, c.description FROM podcasts p JOIN podcasts_content c ON p.id = c.podcast_id WHERE c.lang = 'de' ORDER BY p.createdAt DESC", [], (err, podcasts) => {
            if (err) { console.error(err); return res.status(500).send("Fehler beim Laden der Podcasts."); }
            res.render('admin_podcasts', { podcasts: podcasts || [] });
        });
    });

    router.post('/add_podcast', requireLogin, (req, res) => {
        const { title_de, description_de, title_en, description_en, audio_filename } = req.body;
        podcastsDb.run("INSERT INTO podcasts (audio_filename) VALUES (?)", [audio_filename], function(err) {
            if (err) { console.error(err); return res.status(500).send("Fehler beim Hinzufügen des Podcasts."); }
            const podcastId = this.lastID;
            podcastsDb.run("INSERT INTO podcasts_content (podcast_id, lang, title, description) VALUES (?, 'de', ?, ?)", [podcastId, title_de, description_de]);
            podcastsDb.run("INSERT INTO podcasts_content (podcast_id, lang, title, description) VALUES (?, 'en', ?, ?)", [podcastId, title_en, description_en]);
            res.redirect('/admin/podcasts');
        });
    });

    // --- MEDIEN ROUTEN ---
    router.get('/media', requireLogin, (req, res) => { const categories = ['Icons', 'Logos', 'Blog-Titelbild', 'Blog-Inhalt', 'Stockfotos', 'Allgemein']; const currentCategory = req.query.category; let query = "SELECT * FROM media_library ORDER BY uploadedAt DESC"; const params = []; if (currentCategory) { query = "SELECT * FROM media_library WHERE category = ? ORDER BY uploadedAt DESC"; params.push(currentCategory); } mediaDb.all(query, params, (err, mediaItems) => { if (err) { console.error(err); return res.status(500).send("Fehler beim Laden der Medienbibliothek."); } res.render('media_library', { mediaItems: mediaItems || [], categories, currentCategory }); }); });
    
    router.post('/media/upload', requireLogin, upload.array('mediaFiles'), (req, res) => {
        const { category } = req.body;
        if (!req.files || req.files.length === 0) {
            return res.status(400).send('Keine Dateien hochgeladen.');
        }

        const stmt = mediaDb.prepare("INSERT INTO media_library (filename, alt_text, category) VALUES (?, ?, ?)");
        req.files.forEach(file => {
            stmt.run(file.filename, '', category);
        });
        stmt.finalize((err) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Fehler beim Speichern der Bilder in der Datenbank.");
            }
            res.redirect('/admin/media');
        });
    });

    router.get('/media/edit/:id', requireLogin, (req, res) => { const categories = ['Icons', 'Logos', 'Blog-Titelbild', 'Blog-Inhalt', 'Stockfotos', 'Allgemein']; mediaDb.get("SELECT * FROM media_library WHERE id = ?", [req.params.id], (err, item) => { if (err || !item) return res.redirect('/admin/media'); res.render('admin_edit_media', { item, categories }); }); });
    router.post('/media/edit/:id', requireLogin, (req, res) => { const { altText, category } = req.body; mediaDb.run("UPDATE media_library SET alt_text = ?, category = ? WHERE id = ?", [altText, category, req.params.id], (err) => { if (err) { console.error(err); return res.status(500).send("Fehler beim Aktualisieren der Mediendetails."); } res.redirect('/admin/media'); }); });
    router.post('/media/delete/:id', requireLogin, (req, res) => { mediaDb.get("SELECT filename FROM media_library WHERE id = ?", [req.params.id], (err, row) => { if (row) { fs.unlink(path.join(__dirname, '..', 'httpdocs/uploads', row.filename), () => {}); } mediaDb.run("DELETE FROM media_library WHERE id = ?", [req.params.id], () => res.redirect('/admin/media')); }); });

    // --- WERKZEUGE & DEBUG ---
    router.get('/tools', requireLogin, (req, res) => {
        postsDb.all(`SELECT p.*, c.title FROM posts p JOIN posts_content c ON p.id = c.post_id WHERE c.lang = 'de' ORDER BY p.createdAt DESC`, [], (err, posts) => {
             if (err) { console.error(err); return res.status(500).send("Fehler beim Laden der Debug-Daten."); }
            res.render('admin_tools', { posts: posts || [] });
        });
    });

    router.post('/add-test-posts', requireLogin, (req, res) => {
        const testPosts = [
            { de: { title: 'Test: Die Zukunft der Cloud-Sicherheit', content: '<p>Cloud Computing ist nicht mehr wegzudenken. Doch wie sichert man Daten in einer verteilten Umgebung effektiv ab? Dieser Beitrag beleuchtet moderne Ansätze.</p>' }, en: { title: 'Test: The Future of Cloud Security', content: '<p>Cloud computing is here to stay. But how do you effectively secure data in a distributed environment? This post explores modern approaches.</p>' }, image: '1755291534764-Panda_Cloud6.png', tags: 'Cloud, Sicherheit, Test' },
            { de: { title: 'Test: Phishing-Mails im Check', content: '<p>Wir zeigen Ihnen, wie Sie gefälschte E-Mails erkennen und sich vor Betrug schützen können. Mit echten Beispielen!</p>' }, en: { title: 'Test: Phishing Mails Under Review', content: '<p>We show you how to recognize fake emails and protect yourself from fraud. With real examples!</p>' }, image: '1755285422394-Panda_Lurk.png', tags: 'Phishing, E-Mail, Test' },
            { de: { title: 'Test: Ein Leitfaden zur DSGVO', content: '<p>Die Datenschutz-Grundverordnung ist komplex. Wir brechen die wichtigsten Punkte für kleine und mittlere Unternehmen herunter.</p>' }, en: { title: 'Test: A Guide to GDPR', content: '<p>The General Data Protection Regulation is complex. We break down the most important points for small and medium-sized businesses.</p>' }, image: '1755291479738-Lock.png', tags: 'DSGVO, Compliance, Recht' }
        ];
        testPosts.forEach(postData => {
            postsDb.run(`INSERT INTO posts (image_filename, published_at, is_featured, is_visible, is_deleted) VALUES (?, ?, 0, 1, 0)`, [postData.image, new Date().toISOString()], async function(err) {
                if (err) return console.error(err);
                const postId = this.lastID;
                await handleTags(postId, postData.tags);
                postsDb.run(`INSERT INTO posts_content (post_id, lang, title, content) VALUES (?, 'de', ?, ?)`, [postId, postData.de.title, postData.de.content]);
                postsDb.run(`INSERT INTO posts_content (post_id, lang, title, content) VALUES (?, 'en', ?, ?)`, [postId, postData.en.title, postData.en.content]);
            });
        });
        setTimeout(() => res.redirect('/admin/posts'), 500);
    });

    // --- KI-FUNKTIONEN ---
    const runGemini = async (prompt) => {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY ist nicht gesetzt.");
        const model = 'gemini-1.5-flash-latest';
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const apiResponse = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await apiResponse.json();
        if (!apiResponse.ok || !result.candidates || !result.candidates[0].content) {
            console.error("Gemini API Error:", JSON.stringify(result, null, 2));
            throw new Error(result.error ? result.error.message : 'Unbekannter API-Fehler.');
        }
        return result.candidates[0].content.parts[0].text;
    };

    router.post('/generate-whats-new', requireLogin, async (req, res) => {
        const topic = "Die neuesten Entwicklungen bei der NIS2-Richtlinie in der EU und ihre Auswirkungen auf mittelständische Unternehmen in Deutschland.";
        const prompt = `Erstelle einen Blog-Beitrag im "What's New"-Format zum Thema: "${topic}". Gib die Antwort als valides JSON-Objekt mit den Schlüsseln "title_de", "content_de", "title_en", und "content_en". Der Inhalt soll informativ, aber leicht verständlich sein und im HTML-Format mit Absätzen und Listen.`;
        try {
            const textResponse = await runGemini(prompt);
            const jsonResponse = JSON.parse(textResponse.replace(/```json|```/g, '').trim());
            res.json(jsonResponse);
        } catch (error) {
            res.status(500).json({ error: 'Inhalt konnte nicht generiert werden.', details: error.message });
        }
    });

    router.post('/translate-content', requireLogin, async (req, res) => {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'Kein Text zum Übersetzen vorhanden.' });
        const prompt = `Übersetze den folgenden deutschen HTML-Text professionell nach Englisch. Behalte die HTML-Struktur bei. Antworte nur mit dem übersetzten HTML-Text:\n\n${text}`;
        try {
            const translatedText = await runGemini(prompt);
            res.json({ translation: translatedText });
        } catch (error) {
            res.status(500).json({ error: 'Übersetzung fehlgeschlagen.', details: error.message });
        }
    });
    
    router.post('/generate-alt-text', requireLogin, upload.single('image'), async (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'Kein Bild für die Analyse erhalten.' });
        try {
            const imageBuffer = fs.readFileSync(req.file.path);
            const base64ImageData = imageBuffer.toString('base64');
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) throw new Error("GEMINI_API_KEY ist nicht gesetzt.");
            const model = 'gemini-1.5-flash-latest';
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const payload = { contents: [{ parts: [ { text: "Beschreibe dieses Bild in einem kurzen, prägnanten Satz für einen SEO-Alternativtext. Antworte nur mit dem Beschreibungstext." }, { inlineData: { mimeType: req.file.mimetype, data: base64ImageData } } ] }] };
            const apiResponse = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const result = await apiResponse.json();
            if (!apiResponse.ok || !result.candidates || !result.candidates[0].content) {
                const errorDetails = result.error ? result.error.message : 'Unbekannter API-Fehler.';
                throw new Error(`API-Fehler: ${errorDetails}`);
            }
            const altText = result.candidates[0].content.parts[0].text.trim();
            res.json({ altText: altText });
        } catch (error) {
            res.status(500).json({ error: 'Generierung fehlgeschlagen.', details: error.message });
        } finally {
            fs.unlinkSync(req.file.path);
        }
    });

    return router;
};
