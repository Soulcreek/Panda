const express = require('express');
const pool = require('../../db');
const router = express.Router();

// Public media list (basic) for pickers / blog modal
router.get('/api/media', async (req, res) => {
  try {
    const { type } = req.query;
    let sql = 'SELECT id, name, type, path FROM media';
    const where = [];
    if (type === 'image') where.push("type LIKE 'image/%'");
    if (type === 'audio') where.push("type LIKE 'audio/%'");
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY uploaded_at DESC LIMIT 200';
    const [rows] = await pool.query(sql);
    res.json(rows);
  } catch (e) {
    res.apiError(500,{ error:'Media Fehler', code:'MEDIA_FETCH', detail:e.message });
  }
});

module.exports = router;
