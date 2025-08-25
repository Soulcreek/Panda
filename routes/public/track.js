const express = require('express');
const router = express.Router();
const metrics = require('../../lib/metrics');

// Simple tracking endpoint for lightweight events (no PII). Logs and emits a metric.
router.post('/api/track', express.json(), (req, res) => {
  try {
    const { event, meta } = req.body || {};
    if (!event) return res.status(400).json({ ok: false, error: 'event required' });
    console.log('[track]', event, meta || '');
    try {
      if (metrics && typeof metrics.inc === 'function')
        metrics.inc('events_tracked_total', 1, { event });
    } catch (e) {}
    return res.json({ ok: true });
  } catch (e) {
    console.error('Track error', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
