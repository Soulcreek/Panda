// Temporary clean admin router (admin_clean.js)
// Purpose: bypass corrupted original admin.js while reconstruction proceeds.
const express = require('express');
const router = express.Router();

function isAuthenticated(req,res,next){
  if(req.session && (req.session.isLoggedIn || req.session.userId || req.session.adminTokenValid)) return next();
  return res.redirect('/login');
}

router.get('/health', isAuthenticated, (req,res)=>{
  res.json({ ok:true, module:'admin_clean', ts: Date.now() });
});

module.exports = router;
