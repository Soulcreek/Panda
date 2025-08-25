const express = require('express');
const router = express.Router();
const { isAdmin } = require('../../lib/auth');
let pool;
try {
  pool = require('../../db');
} catch (_) {
  pool = null;
}

router.get('/consent-events', isAdmin, async (req, res) => {
  try {
    let rows = [];
    if (pool) {
      try {
        const [r] = await pool.query(
          'SELECT id, categories, meta, created_at FROM consent_events ORDER BY created_at DESC LIMIT 100'
        );
        rows = r || [];
      } catch (e) {
        console.warn('[admin/consent] DB fetch failed', e.message);
      }
    }
    res.render('admin_consent', { events: rows, errors: [] });
  } catch (e) {
    res.status(500).send('Fehler');
  }
});

// Purge consent events older than N days (default 365)
router.post('/consent-events/purge', isAdmin, async (req, res) => {
  try {
    const days = parseInt(req.body.days || '365', 10) || 365;
    if (!pool) return res.status(500).send('DB not available');
    await pool.query('DELETE FROM consent_events WHERE created_at < NOW() - INTERVAL ? DAY', [
      days,
    ]);
    return res.redirect('/admin/consent-events');
  } catch (e) {
    console.error('Purge failed', e);
    return res.status(500).send('Purge failed');
  }
});

module.exports = router;
