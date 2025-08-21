require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const csurf = require('csurf');
const path = require('path');
const pool = require('./db'); // Stellt sicher, dass db.js den Pool exportiert
const { dbHealth } = require('./db');

// Modular public routes (aggregated index)
const publicRoutes = require('./routes/public');
let adminRoutes;
// Prefer new modular admin (routes/admin/index.js). Fallback sequence: legacy aggregated admin.js.
try { adminRoutes = require('./routes/admin/index.js'); }
catch(e){
    console.warn('[server] modular admin router failed:', e.message);
    try { adminRoutes = require('./routes/admin.js'); }
    catch(e1){
    console.warn('[server] legacy admin.js load failed:', e1.message);
    adminRoutes = express.Router();
    }
}

const app = express();
// Internationalization (lightweight JSON-based)
const i18n = require('./i18n');
// Error helpers early so routes can use res.apiError
const { ApiError, buildError, attachResponseHelpers } = require('./lib/errors');

// Vertrauen in Proxy (Netcup Load Balancer) für korrekte req.ip & secure Cookies
app.set('trust proxy', 1);

// Optional: Sessions beim Start leeren (Standard: aus). Setze CLEAR_SESSIONS_ON_START=true in .env für komplettes Logout aller Nutzer nach Restart.
if (process.env.CLEAR_SESSIONS_ON_START === 'true') {
    pool.query('DELETE FROM sessions')
        .then(() => console.log('[Session] Alle Sessions beim Start gelöscht.'))
        .catch(err => console.warn('[Session] Konnte Sessions nicht löschen:', err.message));
}

// Frühe Default-Locale & t Fallback, falls späterer Fehler vor i18n auftritt (z.B. JSON Parse Error)
app.use((req,res,next)=>{ if(typeof res.locals.locale==='undefined'){ res.locals.locale='de'; } if(typeof res.locals.t==='undefined'){ res.locals.t=(k)=>k; } next(); });

// Middleware für JSON & Form-POST-Daten und statische Dateien
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'httpdocs')));
app.use(attachResponseHelpers);

// EJS als Template-Engine einrichten
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session-Speicher in der Datenbank einrichten
const sessionStore = new MySQLStore({}, pool);

// Session-Middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'eine_sehr_geheime_zeichenkette',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Nur über HTTPS in Produktion
        maxAge: 24 * 60 * 60 * 1000 // 24 Stunden
    }
}));

// CSRF-Schutz-Middleware
// Hinweis: Bei multipart/form-data POSTs (File Upload via multer) ist der Body zum Zeitpunkt von csurf noch nicht geparst,
// daher findet csurf das _csrf Feld nicht und wir erhalten EBADCSRFTOKEN. Für Upload-Endpunkte (admin + editors) wird CSRF
// daher übersprungen. Diese Endpunkte sind nur für eingeloggte Editoren zugänglich (isEditor Guard) und somit relativ risikoarm.
// TODO (Hardening): Custom Middleware vor Upload: Token aus Query/Header validieren und erst danach multer ausführen, um CSRF auch hier zu erzwingen.
const csrfProtection = csurf();
const csrfSkipExact = new Set([
    '/admin/upload',
    '/editors/upload',
    '/editors/api/upload-inline-image'
]);
const csrfSkipStartsWith = [
    // media API (reine GETs / einige POSTs für Upload bereits einzeln oben)
];
const csrfSkipRegex = [
    /^\/editors\/podcasts\/\d+\/ai-metadata$/
];
// Enhanced CSRF: allow token via header CSRF-Token for JSON POST if body already read
app.use((req, res, next) => {
    if (req.method === 'POST') {
        const p = req.path;
        if (csrfSkipExact.has(p) || csrfSkipStartsWith.some(pre=> p.startsWith(pre)) || csrfSkipRegex.some(r=> r.test(p))) {
            return next();
        }
        // For fetch JSON requests we accept header 'CSRF-Token' mapping to body _csrf to satisfy csurf
        if(!req.body || !req.body._csrf){
            const hdr = req.get('CSRF-Token') || req.get('x-csrf-token');
            if(hdr){ req.body = req.body || {}; req.body._csrf = hdr; }
        }
    }
    return csrfProtection(req, res, next);
});

// Globale Middleware, um Variablen für alle Templates verfügbar zu machen
app.use(i18n);
app.use((req, res, next) => {
    // CSRF-Token für Formulare (falls verfügbar)
    try { res.locals.csrfToken = req.csrfToken(); } catch (_) { res.locals.csrfToken = ''; }
    // Locale Fallback (falls i18n Middleware nichts gesetzt hat oder bei Fehlerpfaden)
    if (typeof res.locals.locale === 'undefined' || !res.locals.locale) {
        res.locals.locale = 'de';
    }

    // Admin Access Token (stabiler als IP Whitelist)
    const adminAccessToken = process.env.ADMIN_ACCESS_TOKEN || '';
    if (adminAccessToken && req.query.admin_token === adminAccessToken) {
        req.session.adminTokenValid = true;
    }

    // Login-Status (klassisch) oder Token
    const hasSessionAdmin = !!(req.session && req.session.isLoggedIn && req.session.userId);
    const hasTokenAdmin = !!(req.session && req.session.adminTokenValid);
    // Rollentrennung: Admin (mit Token oder spezieller Rolle) vs. Editor (eingeloggt, darf Editors Center sehen)
    // Aktuell existiert keine separate Rollen-Flag in der Session; daher wird ein eingeloggter Nutzer als Editor betrachtet.
    // Admin bleibt (Token oder klassischer Login). Falls später Rollen kommen (req.session.role), hier verfeinern.
    res.locals.isAdmin = hasSessionAdmin || hasTokenAdmin;
    res.locals.isEditor = hasSessionAdmin || hasTokenAdmin; // Derzeit identisch; ermöglicht getrennte Anzeige-Logik im Template
    res.locals.isWhitelisted = hasTokenAdmin; // für bestehende Checks

    // Aktueller Pfad
    res.locals.currentPath = req.path || '';
    // DB Health snapshot (only for editor/admin pages to minimize overhead)
    if(req.path.startsWith('/editors') || req.path.startsWith('/admin')){
    res.locals.dbHealth = { degraded: dbHealth.degraded, lastPingMs: dbHealth.lastPingMs, lastError: dbHealth.lastError, slowThresholdMs: dbHealth.slowThresholdMs, rollingAvgMs: dbHealth.rollingAvgMs, slowQueries: dbHealth.slowQueries, totalQueries: dbHealth.totalQueries };
    }
    next();
});

// Security Header (leichtgewichtige Variante ohne zusätzliche Abhängigkeit)
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // CSP Basis (kann weiter verhärtet werden; Quill/JSDelivr erlaubt)
    // CSP erweitert: bootstrap-icons (cdn.jsdelivr), AOS CSS (unpkg) erlauben. Wenn strenger gewünscht -> Nonces/Hashes statt 'unsafe-inline'.
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://cdn.tiny.cloud https://cdn.jsdelivr.net https://unpkg.com 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data: blob:; media-src 'self'; frame-ancestors 'self'; connect-src 'self';");
    next();
});

// Routen einbinden
app.use('/', publicRoutes);
app.use('/admin', adminRoutes);
// Mount new modular editors center (index.js inside routes/editors/) falling back to legacy if needed
try { app.use('/editors', require('./routes/editors/index.js')); }
catch(e){
    console.warn('[server] modular editors router failed, attempting legacy editors.js:', e.message);
    try { app.use('/editors', require('./routes/editors.js')); }
    catch(e2){ console.warn('[server] no editors router available', e2.message); }
}

// NOTE: Legacy /admin content redirects now handled inside modular admin/legacyRedirects router.

// Lightweight health check (no DB to avoid slow fail cascading; add ?deep=1 for a quick DB ping)
app.get('/health', async (req,res)=>{
    if(req.query.deep==='1'){
        try { await pool.query('SELECT 1'); return res.json({ status:'ok', db:true, mode:process.env.NODE_ENV||'dev'}); }
        catch(e){ return res.status(500).json({ status:'degraded', db:false, error:e.message }); }
    }
    return res.json({ status:'ok', mode:process.env.NODE_ENV||'dev' });
});

// DB health API (lightweight)
app.get('/admin/api/db-health', async (req,res)=>{
    try {
        // perform quick ping in background to refresh metrics
        pool.query('SELECT 1').catch(()=>{});
        res.json({ ok:true, degraded: dbHealth.degraded, lastPingMs: dbHealth.lastPingMs, lastError: dbHealth.lastError, threshold: dbHealth.slowThresholdMs, rollingAvgMs: dbHealth.rollingAvgMs, slowQueries: dbHealth.slowQueries, totalQueries: dbHealth.totalQueries });
    } catch(e){ res.status(500).json({ ok:false, error:e.message }); }
});

// AI Usage Info Badge (lightweight; errors ignored)
app.use(async (req, res, next) => {
    if(req.path.startsWith('/admin')){
        try {
            const [cfgRows] = await pool.query('SELECT max_daily_calls FROM ai_config WHERE id=1');
            const maxDaily = (cfgRows[0] && cfgRows[0].max_daily_calls) || 500;
            await pool.query(`CREATE TABLE IF NOT EXISTS ai_usage (id INT AUTO_INCREMENT PRIMARY KEY, day DATE NOT NULL, endpoint VARCHAR(64) NOT NULL, calls INT NOT NULL DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uniq_day_ep (day, endpoint)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
            const [rows] = await pool.query('SELECT SUM(calls) as total FROM ai_usage WHERE day=CURDATE()');
            const used = rows[0] && rows[0].total ? rows[0].total : 0;
            const percent = Math.min(100, Math.round((used / maxDaily)*100));
            res.locals.aiUsageInfo = { used, limit: maxDaily, percent };
        } catch(_) { /* ignore */ }
    }
    next();
});

// 404 Handler
app.use((req, res) => {
    res.status(404).render('partials/error_404', { title: 'Seite nicht gefunden' });
});

// Spezielle CSRF Fehlerseite
app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        console.warn('[CSRF] Ungültiges Token für Pfad', req.path, 'SessionID', req.sessionID);
        if (res.headersSent) return next(err);
        return res.status(403).render('partials/error_csrf', { title: 'Sicherheitsfehler', error: err, path: req.path, sessionId: req.sessionID });
    }
    return next(err);
});

// Allgemeine Fehlerbehandlung
app.use((err, req, res, next) => {
    console.error(err.stack || err);
    if (res.headersSent) return next(err);
    const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.path.startsWith('/editors/') || req.path.startsWith('/admin/api') || req.path.startsWith('/health');
    if (wantsJson) {
        const status = (err instanceof ApiError && err.status) ? err.status : 500;
        if (err instanceof ApiError) {
            return res.status(status).json(buildError({ error: err.error, code: err.code, detail: (process.env.NODE_ENV==='production') ? undefined : err.detail, hint: err.hint, meta: err.meta }));
        }
        return res.status(status).json(buildError({ error: 'Server Fehler', code: err.code || 'SERVER_ERROR', detail: (process.env.NODE_ENV==='production') ? undefined : (err.message||'') }));
    }
    res.status(500).render('partials/error_500', { title: 'Fehler', error: err });
});

// Server starten
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});
