console.log('Starting DB load test...');
try {
  require('dotenv').config();
  console.log('Dotenv loaded');
  const db = require('../db');
  console.log('DB module loaded successfully');
  console.log('Has query method:', typeof db.query);
  console.log('Has dbHealth:', !!db.dbHealth);
  process.exit(0);
} catch (e) {
  console.error('Error loading DB:', e.message);
  console.error(e.stack);
  process.exit(1);
}
