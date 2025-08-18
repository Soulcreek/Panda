// soulcreek/panda/Panda-master/routes/public.js

const express = require('express');
const router = express.Router();
const pool = require('../db');

// Home page
router.get('/', async (req, res) => {
    try {
        const [allPosts] = await pool.query("SELECT * FROM posts WHERE status = 'published' ORDER BY created_at DESC LIMIT 5");
        
        const featuredPost = allPosts.length > 0 ? allPosts[0] : null;
        const latestPosts = allPosts.length > 1 ? allPosts.slice(1) : [];

        res.render('index', { 
            featuredPost: featuredPost,
            latestPosts: latestPosts
        });
    } catch (err) {
        console.error("Fehler auf der Startseite:", err);
        res.status(500).send("Ein Fehler ist aufgetreten.");
    }
});

// Blog-Übersichtsseite
router.get('/blog', async (req, res) => {
    try {
        const [posts] = await pool.query("SELECT * FROM posts WHERE status = 'published' ORDER BY created_at DESC");
        res.render('blog', { posts: posts });
    } catch (err) {
        console.error("Fehler auf der Blog-Seite:", err);
        res.status(500).send("Fehler auf der Blog-Seite.");
    }
});

// Podcast-Seite
router.get('/podcasts', async (req, res) => {
    try {
        const [podcasts] = await pool.query("SELECT * FROM podcasts ORDER BY published_at DESC");
        res.render('podcasts', { podcasts: podcasts });
    } catch (err) {
        console.error("Fehler auf der Podcast-Seite:", err);
        res.render('podcasts', { podcasts: [] });
    }
});

// Panda's Way Seite
router.get('/pandas-way', async (req, res) => {
    try {
        const [levels] = await pool.query("SELECT * FROM pandas_way_levels ORDER BY display_order ASC");
        res.render('pandas_way', { levels: levels });
    } catch (err) {
        console.error("Fehler auf der Panda's Way Seite:", err);
        res.render('pandas_way', { levels: [] }); 
    }
});

// Autorenseite
router.get('/autor', (req, res) => {
    res.render('autor');
});

// Purview-Seite
router.get('/purview', (req, res) => {
    res.render('purview');
});

// Impressum
router.get('/impressum', (req, res) => {
    res.render('impressum');
});

module.exports = router;
