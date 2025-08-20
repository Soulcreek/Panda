const pool = require('../../db');
function isEditor(req,res,next){ if(req.session && (req.session.isLoggedIn || req.session.userId || req.session.adminTokenValid)) return next(); return res.redirect('/login'); }
function sanitizeWhatsNew(txt){ if(!txt) return ''; return String(txt).replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim().slice(0,180); }
module.exports = { pool, isEditor, sanitizeWhatsNew };
