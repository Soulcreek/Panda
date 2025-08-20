// Redirect/stub: Advanced Pages moved to /editors/advanced-pages
const express = require('express');
const router = express.Router();
router.get(['/advanced-pages','/advanced-pages/*'], (req,res)=> res.redirect(302,'/editors/advanced-pages'));
module.exports = router;
