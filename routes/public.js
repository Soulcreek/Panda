const express = require('express');
const router = express.Router();

// Datenbank-Objekte müssen übergeben werden
module.exports = (postsDb, podcastsDb, siteDb) => {

    const publicPostQuery = (lang) => `
        SELECT p.*, c.title, c.content, 
        (SELECT GROUP_CONCAT(t.name_de) FROM tags t JOIN post_tags pt ON t.id = pt.tag_id WHERE pt.post_id = p.id) as tags
        FROM posts p JOIN posts_content c ON p.id = c.post_id 
        WHERE p.is_deleted = 0 AND p.is_visible = 1 AND (p.published_at IS NULL OR p.published_at <= date('now')) AND c.lang = ?`;

    router.get('/', (req, res) => {
        const lang = res.locals.lang;
        postsDb.get(`${publicPostQuery(lang)} AND p.is_featured = 1 LIMIT 1`, [lang], (err, featuredPost) => {
            if (err) { console.error(err); return res.status(500).send("Datenbankfehler beim Laden des hervorgehobenen Beitrags."); }
            const excludeId = featuredPost ? featuredPost.id : 0;
            postsDb.all(`${publicPostQuery(lang)} AND p.is_featured = 0 AND p.id != ? ORDER BY p.createdAt DESC LIMIT 3`, [lang, excludeId], (err, latestPosts) => {
                if (err) { console.error(err); return res.status(500).send("Datenbankfehler beim Laden der neuesten Beiträge."); }
                podcastsDb.get(`SELECT pc.*, p.audio_filename FROM podcasts p JOIN podcasts_content pc ON p.id = pc.podcast_id WHERE pc.lang = ? ORDER BY p.createdAt DESC LIMIT 1`, [lang], (err, latestPodcast) => {
                     if (err) { console.error(err); return res.status(500).send("Datenbankfehler beim Laden des Podcasts."); }
                     res.render('index', { featuredPost, latestPosts: latestPosts || [], latestPodcast });
                });
            });
        });
    });

    router.get('/blog', (req, res) => {
        const lang = res.locals.lang;
        postsDb.all(`${publicPostQuery(lang)} ORDER BY p.createdAt DESC`, [lang], (err, posts) => {
            if (err) { console.error(err); return res.status(500).send("Datenbankfehler beim Laden der Blog-Beiträge."); }
            res.render('blog', { posts: posts || [] });
        });
    });

    router.get('/blog/tag/:tag', (req, res) => {
        const lang = res.locals.lang;
        const tagName = req.params.tag;
        const query = `
            SELECT p.*, c.title, c.content, 
            (SELECT GROUP_CONCAT(t.name_de) FROM tags t JOIN post_tags pt ON t.id = pt.tag_id WHERE pt.post_id = p.id) as tags
            FROM posts p 
            JOIN posts_content c ON p.id = c.post_id
            JOIN post_tags pt ON p.id = pt.post_id
            JOIN tags t ON pt.tag_id = t.id
            WHERE p.is_deleted = 0 AND p.is_visible = 1 AND (p.published_at IS NULL OR p.published_at <= date('now')) 
            AND c.lang = ? AND t.name_de = ?
            ORDER BY p.createdAt DESC`;
        postsDb.all(query, [lang, tagName], (err, posts) => {
            if (err) { console.error(err); return res.status(500).send("Datenbankfehler beim Filtern nach Tags."); }
            res.render('blog_tag', { posts: posts || [], tagName });
        });
    });

    // NEU: Route für die Blog-Suche
    router.get('/blog/search', (req, res) => {
        const lang = res.locals.lang;
        const searchTerm = req.query.q;

        if (!searchTerm) {
            return res.redirect('/blog');
        }

        const query = `${publicPostQuery(lang)} AND (c.title LIKE ? OR c.content LIKE ?) ORDER BY p.createdAt DESC`;
        const params = [lang, `%${searchTerm}%`, `%${searchTerm}%`];

        postsDb.all(query, params, (err, posts) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Fehler bei der Blog-Suche.");
            }
            res.render('blog_search_results', { posts: posts || [], searchTerm });
        });
    });

    router.get('/pandas-way', (req, res) => {
        const lang = res.locals.lang;
        siteDb.all("SELECT * FROM pandas_way_content WHERE lang = ? ORDER BY level ASC", [lang], (err, levels) => {
            if (err) { console.error(err); return res.status(500).send("Datenbankfehler beim Laden der 'Panda's Way'-Inhalte."); }
            res.render('pandas_way', { levels: levels || [] });
        });
    });
    
    router.get('/purview', (req, res) => res.render('purview'));
    
    router.get('/podcasts', (req, res) => { 
        podcastsDb.all("SELECT pc.*, p.audio_filename, p.createdAt FROM podcasts p JOIN podcasts_content pc ON p.id = pc.podcast_id WHERE pc.lang = ? ORDER BY p.createdAt DESC", [res.locals.lang], (err, podcasts) => { 
            if (err) { console.error(err); return res.status(500).send("Datenbankfehler beim Laden der Podcasts."); } 
            res.render('podcasts', { podcasts: podcasts || [] }); 
        }); 
    });

    router.get('/autor', (req, res) => res.render('autor'));
    router.get('/impressum', (req, res) => res.render('impressum'));

    // KORREKTUR: Fehlende API-Route für das Popup wieder hinzugefügt
    router.get('/api/blog/:id', (req, res) => {
        const lang = req.session.lang || 'de';
        postsDb.get(`${publicPostQuery(lang)} AND p.id = ?`, [lang, req.params.id], (err, post) => {
            if (err) return res.status(500).json({ error: 'Datenbankfehler' });
            if (!post) return res.status(404).json({ error: 'Post not found' });
            res.json(post);
        });
    });

    return router;
};
