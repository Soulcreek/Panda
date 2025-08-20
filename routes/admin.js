// Settings/Admin center router (content editing moved to /editors)
const express = require('express');
const router = express.Router();

function isAuth(req,res,next){
  if(req.session && (req.session.isLoggedIn || req.session.userId || req.session.adminTokenValid)) return next();
  return res.redirect('/login');
}

router.get('/admin-health', isAuth, (req,res)=> res.json({ ok:true, settings:true, ts: Date.now() }));

function safeMount(name, loader){
  try { const mod = loader(); router.use('/', mod); console.log('[admin] mounted', name); }
  catch(e){ console.warn('[admin] mount failed', name, e.message); }
}

// Only settings & AI endpoints remain here
safeMount('settings', ()=> require('./admin_settings'));
safeMount('ai', ()=> require('./admin_ai'));
// Advanced pages + timeline remain visible read-only; editing handled in editors center
try { safeMount('advanced_pages', require('./admin_advanced_pages')); } catch(e){ console.warn('advanced pages routes missing'); }
try { safeMount('timeline', require('./admin_timeline')); } catch(e){ console.warn('timeline routes missing'); }
try { router.use('/legacy', require('./admin_legacy')); } catch(_){}

module.exports = router;
