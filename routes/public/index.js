// Aggregates all public facing route modules (split from legacy monolithic public.js)
const express = require('express');
const router = express.Router();

// Maintain original order roughly (auth/account first so their middleware sets locals early if needed)
router.use(require('./account'));
router.use(require('./media'));
router.use(require('./blog'));
router.use(require('./podcasts'));
router.use(require('./pages'));
router.use(require('./pandasWay'));
router.use(require('./staticPages'));

module.exports = router;
