const express = require('express');
const router = express.Router();
const pool = require('../../../db');
const { isAdmin } = require('../../../lib/auth');
const bcrypt = require('bcryptjs');

// Ensure users table has role column already (server.js handles globally) & basic indexes + audit table
async function ensureUserIndexes() {
  try {
    await pool.query('ALTER TABLE users ADD INDEX idx_users_role (role)');
  } catch (_) {}
  try {
    await pool.query('ALTER TABLE users ADD INDEX idx_users_created (created_at)');
  } catch (_) {}
  // Simple audit log (who changed what)
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS user_audit (
      id INT AUTO_INCREMENT PRIMARY KEY,
      actor_id INT,
      target_id INT,
      action VARCHAR(32),
      detail JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_user_audit_actor (actor_id),
      KEY idx_user_audit_target (target_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (_) {}
}

async function audit(actorId, targetId, action, detail) {
  try {
    await pool.query('INSERT INTO user_audit (actor_id,target_id,action,detail) VALUES (?,?,?,?)', [
      actorId,
      targetId,
      action,
      detail ? JSON.stringify(detail) : null,
    ]);
  } catch (_) {}
}

// Basic in-memory rate limiter for destructive ops
const __ops = new Map();
function limit(key, max, windowMs) {
  const now = Date.now();
  const arr = (__ops.get(key) || []).filter((ts) => now - ts < windowMs);
  if (arr.length >= max) return false;
  arr.push(now);
  __ops.set(key, arr);
  return true;
}

router.use(isAdmin);
router.use(async (_req, _res, next) => {
  ensureUserIndexes().finally(() => next());
});

// List users
router.get('/', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = 50;
    const off = (page - 1) * pageSize;
    let where = '';
    const params = [];
    if (q) {
      where = 'WHERE username LIKE ?';
      params.push('%' + q + '%');
    }
    const [[cnt]] = await pool.query(`SELECT COUNT(*) c FROM users ${where}`, params);
    params.push(pageSize, off);
    const [rows] = await pool.query(
      `SELECT id, username, role, is_deleted, created_at, updated_at FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      params
    );
    const totalPages = Math.max(1, Math.ceil(cnt.c / pageSize));
    res.render('admin_users_list', {
      title: 'Benutzerverwaltung',
      users: rows,
      q,
      page,
      totalPages,
    });
  } catch (e) {
    res.status(500).send('User Liste Fehler');
  }
});

// JSON list endpoint
router.get('/api/list', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, role, is_deleted, created_at FROM users ORDER BY id DESC LIMIT 1000'
    );
    res.json({ ok: true, users: rows });
  } catch (e) {
    res.apiError
      ? res.apiError(500, { error: 'LIST_FAIL', detail: e.message })
      : res.status(500).json({ error: 'LIST_FAIL' });
  }
});

// Create user form
router.get('/new', (req, res) =>
  res.render('admin_users_new', { title: 'Neuer Benutzer', error: null })
);
router.post('/new', async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password)
    return res.status(400).render('admin_users_new', {
      title: 'Neuer Benutzer',
      error: 'Benutzername & Passwort erforderlich',
    });
  if (!limit('create:' + req.ip, 20, 10 * 60 * 1000))
    return res.status(429).render('admin_users_new', {
      title: 'Neuer Benutzer',
      error: 'Zu viele Vorgänge – später erneut.',
    });
  try {
    const hash = await bcrypt.hash(password, 12);
    const finalRole = ['admin', 'editor', 'viewer'].includes(role) ? role : 'editor';
    const [r] = await pool.query('INSERT INTO users (username,password,role) VALUES (?,?,?)', [
      username,
      hash,
      finalRole,
    ]);
    audit(req.session.userId, r.insertId, 'create', { username, role: finalRole });
    res.redirect('/admin/users');
  } catch (e) {
    const msg = e.code === 'ER_DUP_ENTRY' ? 'Benutzername bereits vergeben' : 'Fehler beim Anlegen';
    res.status(500).render('admin_users_new', { title: 'Neuer Benutzer', error: msg });
  }
});

// Edit user
router.get('/:id', async (req, res) => {
  try {
    const [[user]] = await pool.query(
      'SELECT id, username, role, is_deleted FROM users WHERE id=?',
      [req.params.id]
    );
    if (!user) return res.status(404).send('Nicht gefunden');
    res.render('admin_users_edit', { title: 'Benutzer bearbeiten', user, error: null });
  } catch (e) {
    res.status(500).send('Ladefehler');
  }
});
router.post('/:id', async (req, res) => {
  const { role, password, action } = req.body || {};
  try {
    // Helper to count active admins (not deleted)
    async function activeAdminCount() {
      const [[row]] = await pool.query(
        'SELECT COUNT(*) c FROM users WHERE role="admin" AND is_deleted=0'
      );
      return row.c;
    }
    const targetId = parseInt(req.params.id, 10);
    const [[targetUser]] = await pool.query('SELECT id, role, is_deleted FROM users WHERE id=?', [
      targetId,
    ]);
    if (!targetUser) return res.status(404).send('Nicht gefunden');
    if (action === 'delete') {
      if (!limit('delete:' + req.ip, 10, 10 * 60 * 1000)) return res.status(429).send('Rate Limit');
      if (targetUser.role === 'admin' && targetUser.is_deleted === 0) {
        const admins = await activeAdminCount();
        if (admins <= 1) {
          return res.status(400).send('Letzter Admin kann nicht gelöscht werden');
        }
      }
      await pool.query('UPDATE users SET is_deleted=1 WHERE id=?', [req.params.id]);
      audit(req.session.userId, req.params.id, 'soft_delete');
      return res.redirect('/admin/users');
    }
    if (action === 'restore') {
      await pool.query('UPDATE users SET is_deleted=0 WHERE id=?', [req.params.id]);
      audit(req.session.userId, req.params.id, 'restore');
      return res.redirect('/admin/users/' + req.params.id);
    }
    if (action === 'hard_delete') {
      if (!limit('hard_delete:' + req.ip, 5, 60 * 60 * 1000))
        return res.status(429).send('Rate Limit');
      if (targetUser.role === 'admin' && targetUser.is_deleted === 0) {
        const admins = await activeAdminCount();
        if (admins <= 1) {
          return res.status(400).send('Letzter Admin kann nicht gelöscht werden');
        }
      }
      await pool.query('DELETE FROM users WHERE id=?', [req.params.id]);
      audit(req.session.userId, req.params.id, 'hard_delete');
      return res.redirect('/admin/users');
    }
    const sets = [],
      params = [];
    const detail = {};
    if (role && ['admin', 'editor', 'viewer'].includes(role)) {
      if (targetUser.role === 'admin' && role !== 'admin') {
        const admins = await activeAdminCount();
        if (admins <= 1) {
          return res.status(400).send('Letzter Admin kann nicht herabgestuft werden');
        }
      }
      sets.push('role=?');
      params.push(role);
      detail.role = role;
    }
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      sets.push('password=?');
      params.push(hash);
      detail.passwordChanged = true;
    }
    if (sets.length) {
      params.push(req.params.id);
      await pool.query('UPDATE users SET ' + sets.join(', ') + ' WHERE id=?', params);
      audit(req.session.userId, req.params.id, 'update', detail);
    }
    res.redirect('/admin/users/' + req.params.id);
  } catch (e) {
    res.status(500).send('Update Fehler');
  }
});

// Audit log JSON (latest 200)
router.get('/api/audit', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM user_audit ORDER BY id DESC LIMIT 200');
    res.json({ ok: true, audit: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
