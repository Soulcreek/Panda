const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../../db');

const router = express.Router();

// In-memory login attempts for brute force mitigation
const __loginAttempts = new Map();
function rateLimitLogin(req,res,next){
  try {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const windowMs = 15*60*1000; // 15 min
    const maxAttempts = 10; // soft limit
    const arr = (__loginAttempts.get(ip) || []).filter(ts => now - ts < windowMs);
    if(arr.length >= maxAttempts){
      if(req.accepts('json')) return res.apiError(429,{ error:'Zu viele Login-Versuche', code:'LOGIN_RATE_LIMIT', hint:'Bitte später erneut versuchen.' });
      return res.status(429).render('login',{ title:'Login', error:'Zu viele Versuche. Bitte später erneut.' });
    }
    arr.push(now); __loginAttempts.set(ip, arr);
  } catch(_){ /* ignore */ }
  next();
}

// --- User Preferences (Theme, Panda's Way Progress) ---
async function ensureUserPreferencesTable(){
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INT PRIMARY KEY,
      theme VARCHAR(16) NOT NULL DEFAULT 'system',
      pandas_way_level INT NOT NULL DEFAULT 1,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_user_prefs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  } catch(e){ console.error('Prefs Table Fehler:', e.message); }
}
async function getUserPreferences(userId){
  if(!userId) return null;
  try { await ensureUserPreferencesTable(); const [rows] = await pool.query('SELECT * FROM user_preferences WHERE user_id=?',[userId]); return rows[0]||null; }
  catch(e){ return null; }
}
async function saveUserPreferences(userId, { theme, pandas_way_level }){
  if(!userId) return;
  await ensureUserPreferencesTable();
  const t = (theme||'system').toLowerCase();
  const allowed = new Set(['light','dark','system']);
  const finalTheme = allowed.has(t)? t : 'system';
  let lvl = parseInt(pandas_way_level,10); if(!lvl || lvl<1 || lvl>10) lvl = 1; // 1..10 plausible cap
  await pool.query(`INSERT INTO user_preferences (user_id, theme, pandas_way_level) VALUES (?,?,?)
    ON DUPLICATE KEY UPDATE theme=VALUES(theme), pandas_way_level=VALUES(pandas_way_level), updated_at=CURRENT_TIMESTAMP`, [userId, finalTheme, lvl]);
  return { theme: finalTheme, pandas_way_level: lvl };
}

function requireLogin(req, res, next){ if(req.session.userId) return next(); return res.redirect('/login'); }
async function ensureUserSoftDeleteColumns(){
  try { await pool.query('ALTER TABLE users ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0'); } catch(_) {}
}

// Middleware for locals (mirrors old public.js behaviour for account area)
router.use(async (req,res,next)=>{
  res.locals.isLoggedIn = !!req.session.userId;
  if(req.session.userId){
    try { res.locals.userPrefs = await getUserPreferences(req.session.userId); } catch(_){}
  }
  next();
});

// Account page
router.get('/account', requireLogin, async (req, res)=>{
  try {
    await ensureUserSoftDeleteColumns();
    const [rows] = await pool.query('SELECT id, username, is_deleted, created_at, updated_at FROM users WHERE id=?',[req.session.userId]);
    const user = rows[0] || null;
    const prefs = await getUserPreferences(req.session.userId);
    res.render('account', { title:'Account', user, prefs });
  } catch(e){ console.error('Account Load Fehler', e); res.status(500).send('Fehler Account'); }
});

// Export personal data
router.get('/account/export', requireLogin, async (req, res)=>{
  try {
    await ensureUserSoftDeleteColumns();
    const [users] = await pool.query('SELECT id, username, is_deleted, created_at, updated_at FROM users WHERE id=?',[req.session.userId]);
    const prefs = await getUserPreferences(req.session.userId);
    const exportObj = { user: users[0]||null, preferences: prefs||null, ai_calls: 'Aggregierte AI Logs sind anonymisiert / nicht usergebunden' };
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="account-export-'+req.session.userId+'.json"');
    res.send(JSON.stringify(exportObj, null, 2));
  } catch(e){ console.error('Export Fehler', e); res.status(500).send('Export Fehler'); }
});

// Delete account (soft delete + anonymize)
router.post('/account/delete', requireLogin, async (req, res)=>{
  try {
    await ensureUserSoftDeleteColumns();
    const uid = req.session.userId;
    const anonUser = 'deleted_user_'+uid;
    await pool.query('UPDATE users SET username=?, password=REPEAT("x",60), is_deleted=1 WHERE id=?',[anonUser, uid]);
    try { await pool.query('DELETE FROM user_preferences WHERE user_id=?',[uid]); } catch(_) {}
    req.session.destroy(()=>{});
    if(req.accepts('json')) return res.json({ ok:true, deleted:true });
    res.redirect('/');
  } catch(e){ console.error('Delete Fehler', e); res.status(500).send('Löschung fehlgeschlagen'); }
});

// API: Save user preferences
router.post('/api/user/preferences', async (req, res) => {
  if(!req.session.userId) return res.apiError(401,{ error:'Nicht eingeloggt', code:'USER_PREFS_UNAUTH' });
  try {
    const { theme, pandas_way_level } = req.body || {};
    const saved = await saveUserPreferences(req.session.userId, { theme, pandas_way_level });
    res.json({ ok:true, preferences: saved });
  } catch(e){
    console.error('Prefs Save Fehler:', e);
    res.apiError(500,{ error:'Speichern fehlgeschlagen', code:'USER_PREFS_SAVE', detail:e.message });
  }
});

// --- Auth Routes ---
router.get('/login', (req, res) => {
  if (req.session.userId) {
    const target = (req.query.redirect && /^\/[a-zA-Z0-9/_-]+$/.test(req.query.redirect)) ? req.query.redirect : '/editors';
    return res.redirect(target);
  }
  res.render('login', { title: 'Login', error: null, redirect: (req.query.redirect||'') });
});

router.post('/login', rateLimitLogin, async (req, res) => {
  const { username, password, redirect: redirectRaw } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    if (!rows.length) return res.status(401).render('login', { title: 'Login', error: 'Ungültige Zugangsdaten' });
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).render('login', { title: 'Login', error: 'Ungültige Zugangsdaten' });
    req.session.userId = user.id;
    req.session.isLoggedIn = true;
    let target = '/editors';
    if (redirectRaw && /^\/[a-zA-Z0-9/_-]+$/.test(redirectRaw)) target = redirectRaw;
    res.redirect(target);
  } catch (err) {
    console.error('Login Fehler:', err);
    res.status(500).render('login', { title: 'Login', error: 'Interner Fehler' });
  }
});

router.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/')); });
router.get('/register', (req, res) => { res.render('register', { title: 'Registrieren', error: null }); });
router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).render('register', { title: 'Registrieren', error: 'Alle Felder erforderlich' });
  try {
    const hash = await bcrypt.hash(password, 12);
    await pool.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash]);
    res.redirect('/login');
  } catch (err) {
    console.error('Register Fehler:', err);
    const msg = err.code === 'ER_DUP_ENTRY' ? 'Benutzername bereits vergeben' : 'Interner Fehler';
    res.status(500).render('register', { title: 'Registrieren', error: msg });
  }
});

module.exports = router;
