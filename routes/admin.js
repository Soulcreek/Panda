// Legacy aggregate admin router now delegating to modular implementation.
// Kept for backward compatibility if server fallback loads ./routes/admin.js
module.exports = require('./admin/index.js');
