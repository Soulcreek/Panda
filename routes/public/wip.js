const express = require('express');
const router = express.Router();

// Show small WIP overlay unless cookie allow_wip=1 is present
router.get('/__wip/continue', (req, res) => {
  // set a cookie for 1 day
  res.cookie('allow_wip', '1', { maxAge: 24*60*60*1000, httpOnly: false });
  res.redirect('/');
});

// Middleware to intercept public pages
router.use((req, res, next) => {
  // skip for assets, API, wip route itself and admin/editor paths
  if (req.path.startsWith('/__wip') || req.path.startsWith('/api') || req.path.startsWith('/admin') || req.path.startsWith('/editor') || req.path.startsWith('/static') ) return next();
  // support environments without cookie-parser: inspect raw header
  const cookieHeader = req.get('Cookie') || req.get('cookie') || '';
  if (cookieHeader && /(^|;\s*)allow_wip=1($|;)/.test(cookieHeader)) return next();
  // Render a simple maintenance/preview notice
  return res.render('maintenance', { 
    title: 'Work in Progress',
    redirectTo: '/', 
    __wipView: true 
  });
});

module.exports = router;
