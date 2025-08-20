// Deprecated legacy AI & media endpoints – use /editors equivalents.
const express = require('express');
const router = express.Router();

function gone(res, target){ return res.status(410).json({ error:'deprecated', use: target }); }

router.all(['/generate-whats-new','/posts/generate-sample','/api/translate','/podcasts/:id/ai-metadata','/api/media','/api/upload-inline-image'], (req,res)=>{
	// Provide 301 for GET requests that might still be bookmarked to a list endpoint
	if(req.method==='GET' && req.path==='/api/media') return res.redirect(301, '/editors/media');
	return gone(res, '/editors/*');
});

router.get('/', (req,res)=>{
	res.status(410).send('Legacy AI Endpoints entfernt. Bitte /editors verwenden.');
});

module.exports = router;
