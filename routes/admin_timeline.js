// Redirect/stub: Timeline editing migrated to /editors namespace
const express = require('express');
const router = express.Router();

router.get(['/timeline-editor','/timeline-editor*'], (req,res)=>{
	const q = Object.keys(req.query||{}).length ? ('?'+Object.entries(req.query).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&')) : '';
	return res.redirect(302, '/editors/timeline-editor'+q);
});

module.exports = router;
