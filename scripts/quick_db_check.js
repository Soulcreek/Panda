require('dotenv').config();
const pool = require('../db');
(async ()=>{
  try {
    const [r1] = await pool.query('SELECT 1');
    console.log('query ok:', r1 && r1[0]);
    const [r2] = await pool.execute('SELECT 1');
    console.log('execute ok:', r2 && r2[0]);
    process.exit(0);
  } catch (e) {
    console.error('err:', e && e.stack ? e.stack : e);
    process.exit(1);
  }
})();
