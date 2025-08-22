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
// Purview information page (load before staticPages to avoid conflicts)
try { router.use(require('./purview')); } catch(_){ }
router.use(require('./staticPages'));
// Public read API (rate limited)
router.use(require('./apiPublic'));
// Lightweight tracking endpoint
try { router.use(require('./track')); } catch(_) { }
// Optional consent ingestion (non-identifying)
try { router.use(require('./consent')); } catch(_) { }

module.exports = router;
