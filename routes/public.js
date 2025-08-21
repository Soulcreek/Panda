// Legacy monolithic public router replaced by modular directory in routes/public/
// Keeping this file so existing requires ('./routes/public') still resolve.
module.exports = require('./public/index.js');
