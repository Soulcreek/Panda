const pool = require('./db');
(async () => {
  try {
    const [rows] = await pool.query(
      "SELECT id,username,role,email FROM users WHERE username IN ('test','test@example.com') OR username LIKE '%test%' OR email IN ('test@example.com') LIMIT 20"
    );
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('ERROR', e);
    process.exit(1);
  }
})();
