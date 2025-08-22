#!/usr/bin/env node
// Purge consent_events older than N days. Usage: node scripts/purge_consent_events.js 365
const pool = require('../db');
(async ()=>{
  try{
    const days = parseInt(process.argv[2]||'365',10) || 365;
    console.log('[purge_consent_events] Purging events older than', days, 'days');
    const [res] = await pool.query('DELETE FROM consent_events WHERE created_at < NOW() - INTERVAL ? DAY', [days]);
    console.log('[purge_consent_events] Deleted rows:', res.affectedRows);
    process.exit(0);
  }catch(e){ console.error('[purge_consent_events] Error', e); process.exit(2); }
})();
