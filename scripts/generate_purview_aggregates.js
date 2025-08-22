#!/usr/bin/env node
// Small script to compute lightweight aggregates and store them in purview_aggregates
const pool = require('../db');

async function run(){
  try{
    const q = {
      posts: 'SELECT COUNT(*) c FROM posts',
      podcasts: 'SELECT COUNT(*) c FROM podcasts',
      media: 'SELECT COUNT(*) c FROM media'
    };
    const out = { counts: {} };
    for(const k of Object.keys(q)){
      try{ const [[r]] = await pool.query(q[k]); out.counts[k]=r.c||0; }catch(e){ out.counts[k]=null; }
    }
    const payload = JSON.stringify(out);
    await pool.query('INSERT INTO purview_aggregates (payload) VALUES (?)',[payload]);
    console.log('Inserted aggregate:', out);
    process.exit(0);
  }catch(e){ console.error('Aggregate error', e); process.exit(2); }
}

run();
