const express = require('express');
const router = express.Router();

// Static / lightly dynamic informational page about Microsoft Purview
// Future: could add cached fetches to MS docs or curated knowledge base.
router.get('/purview', async (req,res)=>{
  res.render('purview_public', { title: 'Microsoft Purview – Überblick' });
});

module.exports = router;
