const pool = require('./db');
(async () => {
  try {
    const [rows] = await pool.query('SELECT id, username, role FROM users ORDER BY id DESC LIMIT 20');
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('ERROR', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
