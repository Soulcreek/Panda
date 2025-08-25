const express = require('express');
const router = express.Router();

// Placeholder AI admin endpoints (migrate from admin_ai.js)
router.get('/ai/config/status', (req, res) => res.json({ status: 'pending-migration' }));

module.exports = router;
