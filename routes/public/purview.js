const express = require('express');
const pool = require('../../db');
const router = express.Router();

// Public Purview knowledge page (informational)
router.get('/purview', async (req,res)=>{
  try {
    res.render('public_purview', { title: 'Microsoft Purview – Knowledge' });
  } catch(e){
    console.error('Render purview error', e);
    res.status(500).send('Error rendering page');
  }
});

// Lightweight public API that serves cached aggregates (populated by scheduled job)
router.get('/api/public/purview', async (req,res)=>{
  try {
    const [rows] = await pool.query('SELECT payload, generated_at FROM purview_aggregates ORDER BY generated_at DESC LIMIT 1');
    if(rows && rows[0]) return res.json({ ok:true, data: rows[0].payload, generated_at: rows[0].generated_at });
    // fallback sample response when no aggregates exist
    const sample = { counts: { posts: 0, podcasts: 0, media: 0 }, last_run: null, notes: 'No aggregates available yet' };
    return res.json({ ok:true, data: sample, generated_at: null });
  } catch(e){
    console.error('Purview API error', e);
    return res.status(500).json({ ok:false, error: e.message });
  }
});

module.exports = router;
