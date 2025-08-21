const express = require('express');
const router = express.Router();

router.get('/purview', (req, res) => res.render('purview', { title: 'Microsoft Purview' }));
router.get('/autor', (req, res) => res.render('autor', { title: 'Über den Autor' }));
router.get('/impressum', (req, res) => res.render('impressum', { title: 'Impressum' }));

module.exports = router;
