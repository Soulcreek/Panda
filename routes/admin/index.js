// Modular admin router aggregator
// Note: Admin access checks are handled in each sub-router using central auth helpers.
const express = require('express');
const router = express.Router();

// Legacy redirects first to preserve old deep links
try {
  router.use(require('./legacyRedirects'));
} catch (_) {}
// Domain modules (incrementally migrated)
try {
  router.use(require('./settings'));
} catch (_) {}
try {
  router.use(require('./usage'));
} catch (_) {}
try {
  router.use(require('./tools'));
} catch (_) {}
try {
  router.use(require('./ai'));
} catch (_) {}
try {
  router.use(require('./consent'));
} catch (_) {}
try {
  router.use('/users', require('./users'));
} catch (_) {}
// lightweight health page
const { isAdmin } = require('../../lib/auth');
router.get('/health', isAdmin, (req, res) => {
  res.render('admin_health', { title: 'System Health' });
});

module.exports = router;
