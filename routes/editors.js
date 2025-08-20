// Legacy editors.js has been deprecated in favor of modular routers under routes/editors/.
// This file now only exports a router with a redirect notice for any access, to avoid breaking imports.
const express = require('express');
const router = express.Router();
router.use((req,res)=>{ res.redirect(301, '/editors'+(req.path==='/'?'':req.path)); });
module.exports = router;
