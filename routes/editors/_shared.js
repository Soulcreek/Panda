const pool = require('../../db');
const { isEditor } = require('../../lib/auth');
function sanitizeWhatsNew(txt) {
  if (!txt) return '';
  return String(txt)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}
module.exports = { pool, isEditor, sanitizeWhatsNew };
