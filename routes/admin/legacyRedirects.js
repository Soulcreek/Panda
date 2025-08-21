const express = require('express');
const { isAuth } = require('../../lib/auth');
const router = express.Router();

// Redirect legacy admin content editing paths to editors namespace
const redirects = [
  ['/advanced-pages', '/editors/advanced-pages'],
  ['/advanced-pages/*', '/editors/advanced-pages'],
  ['/timeline-editor', '/editors/timeline-editor'],
  ['/timeline-editor*', '/editors/timeline-editor'],
  ['/posts', '/editors/posts'],
  ['/media', '/editors/media'],
  ['/podcasts', '/editors/podcasts']
];

redirects.forEach(([from,to])=>{
  router.get(from, isAuth, (req,res)=>{
    const q = Object.keys(req.query||{}).length ? ('?'+Object.entries(req.query).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&')) : '';
    res.redirect(301, to + q);
  });
});

module.exports = router;
