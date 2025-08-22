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
try { router.use(require('./consent')); } catch(_){ }
try { router.use('/users', require('./users')); } catch(_){}
// lightweight health page
router.get('/health', (req,res)=>{ if(!(req.session && (req.session.role==='admin' || req.session.adminTokenValid))) return res.status(403).send('Forbidden'); res.render('admin_health',{ title:'System Health' }); });

module.exports = router;
