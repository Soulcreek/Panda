// Legacy editors.js is deprecated. Export a no-op router to avoid redirect loops.
const express = require('express');
const router = express.Router();
router.use((req, res, next) => next());
module.exports = router;
