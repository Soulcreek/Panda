// Modular admin router aggregator (initial scaffold)
const express = require('express');
const router = express.Router();

// Legacy redirects first to preserve old deep links
try { router.use(require('./legacyRedirects')); } catch(_){}
// Domain modules (incrementally migrated)
try { router.use(require('./settings')); } catch(_){}
try { router.use(require('./usage')); } catch(_){}
try { router.use(require('./tools')); } catch(_){}
try { router.use(require('./ai')); } catch(_){}
try { router.use(require('./contentMigrations')); } catch(_){}

module.exports = router;
