const express = require('express');
const router = express.Router();
const metrics = require('../../lib/metrics');
let pool;
try{ pool = require('../../db'); } catch(_) { pool = null; }

// Optional consent ingest endpoint. We do NOT store identifying info here by default.
// Accepts { categories: { necessary:bool, preferences:bool, analytics:bool }, ts } and responds { ok:true }
router.post('/api/consent', express.json(), async (req,res)=>{
  try{
    const body = req.body || {};
    if(!body.categories) return res.status(400).json({ ok:false, error:'categories required' });
    console.log('[consent] categories=', body.categories, 'ts=', body.ts||'');
    try{ if(metrics && typeof metrics.inc === 'function') metrics.inc('consent_events_total', 1, { prefs: !!body.categories.preferences, analytics: !!body.categories.analytics }); }catch(e){}

    // Try to persist a minimal, non-identifying record if DB available
    if(pool){
      try{
        await pool.query('INSERT INTO consent_events (categories, meta) VALUES (?, ?)', [ JSON.stringify(body.categories), JSON.stringify({ ts: body.ts || null }) ]);
      }catch(e){ console.warn('[consent] DB insert failed', e.message); }
    }

    return res.json({ ok:true });
  }catch(e){ console.error('Consent endpoint error', e); return res.status(500).json({ ok:false, error: e.message }); }
});

module.exports = router;
