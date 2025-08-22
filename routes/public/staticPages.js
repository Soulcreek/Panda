const express = require('express');
const router = express.Router();

// Note: /purview route moved to purview.js for dynamic content
router.get('/autor', (req, res) => res.render('autor', { title: 'Über den Autor' }));
router.get('/impressum', (req, res) => res.render('impressum', { title: 'Impressum' }));

module.exports = router;
