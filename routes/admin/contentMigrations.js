const express = require('express');
const router = express.Router();

// Placeholder for legacy content maintenance / migration utilities
router.get('/content/migrations/status', (req, res) => res.json({ ready: false }));

module.exports = router;
