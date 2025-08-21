// Core & deps
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const csurf = require('csurf');
const path = require('path');

// Local modules
const pool = require('./db');
const { dbHealth } = require('./db');
const { resolveSiteKey, ensureMultiTenant } = require('./lib/multiTenant');
const metrics = require('./lib/metrics');
const featureFlags = require('./lib/featureFlags');

// Routes (public + admin with graceful fallbacks)
const publicRoutes = require('./routes/public');
let adminRoutes;
try { adminRoutes = require('./routes/admin/index.js'); }
catch(e){
    console.warn('[server] modular admin router failed:', e.message);
    try { adminRoutes = require('./routes/admin.js'); }
    catch(e1){
        console.warn('[server] legacy admin.js load failed:', e1.message);
        adminRoutes = express.Router();
    }
}
try { adminRoutes.use(require('./routes/admin/featureFlags')); } catch(_) { /* optional */ }

const app = express();
// -----------------------------------------------------------------------------
// One-time startup checks / lightweight schema enforcement
// -----------------------------------------------------------------------------
if(!global.__startup_enforced){
    (async ()=>{
        try {
            // Enforce podcasts.slug NOT NULL after ensuring no NULL/empty remain
            const [[missing]] = await pool.query('SELECT COUNT(*) c FROM podcasts WHERE slug IS NULL OR slug=""');
            if(missing.c){
                const { baseSlug } = require('./lib/slug');
                const [rows] = await pool.query('SELECT id,title FROM podcasts WHERE slug IS NULL OR slug=""');
                for(const r of rows){
                    let s = baseSlug(r.title||'episode');
                    // ensure uniqueness
                    let i=2; while(true){ const [[dupe]] = await pool.query('SELECT COUNT(*) c FROM podcasts WHERE slug=?',[s]); if(!dupe.c) break; s = baseSlug(r.title||'episode')+'-'+i++; }
                    await pool.query('UPDATE podcasts SET slug=? WHERE id=?',[s, r.id]);
                }
            }
            try { await pool.query('ALTER TABLE podcasts MODIFY slug VARCHAR(255) NOT NULL'); } catch(e){ if(!/Duplicate|contains null|Cannot/.test(e.message)) console.warn('[startup][podcasts.slug enforce]', e.message); }
        } catch(e){ console.warn('[startup enforcement warn]', e.message); }
    })();
    global.__startup_enforced=true;
}
// i18n (lightweight JSON-based)
const i18n = require('./i18n');
// Error helpers early so routes can use res.apiError
const { ApiError, buildError, attachResponseHelpers } = require('./lib/errors');

// Trust proxy (for correct req.ip & secure cookies behind LB)
app.set('trust proxy', 1);

// Optional: Clear all sessions on start (set CLEAR_SESSIONS_ON_START=true)
if (process.env.CLEAR_SESSIONS_ON_START === 'true') {
    pool.query('DELETE FROM sessions')
    .then(() => console.log('[Session] cleared on startup'))
    .catch(err => console.warn('[Session] clear failed:', err.message));
}

// Early default locale / translator fallback
app.use((req,res,next)=>{ if(typeof res.locals.locale==='undefined'){ res.locals.locale='de'; } if(typeof res.locals.t==='undefined'){ res.locals.t=(k)=>k; } next(); });

// Body parsing & static
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'httpdocs')));
app.use(attachResponseHelpers);

// EJS als Template-Engine einrichten
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session-Speicher in der Datenbank einrichten
const sessionStore = new MySQLStore({}, pool);

// Sessions
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

// CSRF (skip limited upload endpoints until custom pre-multer validation is added)
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
// Timing / metrics instrumentation
const __timings = { recent:[], byRoute:new Map() };
function requestTimingMiddleware(req,res,next){
    const start = process.hrtime.bigint();
    metrics.inc('http_requests_total');
    res.on('finish',()=>{
        try {
            const durMs = Number((process.hrtime.bigint()-start)/1000000n);
            const base = req.baseUrl || req.path.split('?')[0];
            const key = base.replace(/\d+/g,':id');
            __timings.recent.push({ path:key, ms:durMs, ts:Date.now(), method:req.method, status:res.statusCode });
            if(__timings.recent.length>500) __timings.recent.shift();
            const agg = __timings.byRoute.get(key)||{count:0,total:0,max:0};
            agg.count++; agg.total+=durMs; if(durMs>agg.max) agg.max=durMs; agg.avg=Math.round(agg.total/agg.count);
            __timings.byRoute.set(key, agg);
            metrics.observe('http_request_duration_seconds', durMs/1000);
            metrics.inc(`http_requests_status_${res.statusCode}`);
            const sc = Math.floor(res.statusCode/100)+'xx';
            metrics.inc(`http_requests_status_class_${sc}`);
            if(res.statusCode>=400 && res.statusCode<500) metrics.inc('http_client_errors_total');
            if(res.statusCode>=500) metrics.inc('http_server_errors_total');
            metrics.inc(`http_route_requests_total_${req.method}_${key.replace(/[^a-zA-Z0-9_:]/g,'_')}`);
        } catch(_) { /* swallow */ }
    });
    next();
}
app.use(requestTimingMiddleware);

// Memory gauges
setInterval(()=>{ try { const mu=process.memoryUsage(); metrics.setGauge('memory_rss_bytes', mu.rss); metrics.setGauge('memory_heap_used_bytes', mu.heapUsed); metrics.setGauge('memory_heap_total_bytes', mu.heapTotal); } catch(_){} }, 10000);
app.use(async (req, res, next) => {
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
app.use(async (req, res, next) => {
    // CSP Nonce pro Request
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    // CSRF-Token für Formulare (falls verfügbar)
    try { res.locals.csrfToken = req.csrfToken(); } catch (_) { res.locals.csrfToken = ''; }
    // Locale Fallback (falls i18n Middleware nichts gesetzt hat oder bei Fehlerpfaden)
    if (typeof res.locals.locale === 'undefined' || !res.locals.locale) {
        res.locals.locale = 'de';
    }

    // Admin access token
    const adminAccessToken = process.env.ADMIN_ACCESS_TOKEN || '';
    if (adminAccessToken && req.query.admin_token === adminAccessToken) {
        req.session.adminTokenValid = true;
    }

    // Login status (session or token)
    const hasSessionAdmin = !!(req.session && req.session.isLoggedIn && req.session.userId);
    const hasTokenAdmin = !!(req.session && req.session.adminTokenValid);
    // Rollentrennung: Admin (mit Token oder spezieller Rolle) vs. Editor (eingeloggt, darf Editors Center sehen)
    // Aktuell existiert keine separate Rollen-Flag in der Session; daher wird ein eingeloggter Nutzer als Editor betrachtet.
    // Admin bleibt (Token oder klassischer Login). Falls später Rollen kommen (req.session.role), hier verfeinern.
    // Ensure role column exists (run lightweight check first to avoid noisy duplicate errors)
    if(!global.__usersRoleEnsured){
        try {
            const [[col]] = await pool.query('SELECT COUNT(*) c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME="users" AND COLUMN_NAME="role"');
            if(!col.c){
                try { await pool.query('ALTER TABLE users ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT "editor"'); }
                catch(e){ if(e.code!=='ER_DUP_FIELDNAME') console.warn('[users.role add warn]', e.code); }
            }
        } catch(e){ console.warn('[users.role introspect warn]', e.code||e.message); }
        global.__usersRoleEnsured = true;
    }
    // Roles: admin > editor > anonymous (viewer collapsed)
    let rawRole = (req.session && req.session.role) || (hasTokenAdmin ? 'admin' : (hasSessionAdmin ? 'editor' : 'anonymous'));
    // Treat viewer as pure public/anonymous (no gating) – collapse to anonymous
    if(rawRole === 'viewer') rawRole = 'anonymous';
    const role = rawRole;
    res.locals.isAdmin = role==='admin';
    res.locals.isEditor = role==='admin' || role==='editor';
    res.locals.role = role;
    const siteKey = resolveSiteKey(req); req.siteKey = siteKey; res.locals.siteKey = siteKey; if(!global.__mtEnsured){ ensureMultiTenant(pool).catch(()=>{}); global.__mtEnsured=true; }
    // Feature flag helper (async wrapper simplified for EJS usage with minimal await usage in templates)
    res.locals.flag = (k)=>({ enabled:false, variant:null, promise: featureFlags.getFlag(siteKey,k) });
    res.locals.isFlag = async (k)=> (await featureFlags.isEnabled(siteKey,k));
    res.locals.isWhitelisted = hasTokenAdmin; // für bestehende Checks

    // Current path
    res.locals.currentPath = req.path || '';
    // DB health snapshot (only for editor/admin pages)
    if(req.path.startsWith('/editors') || req.path.startsWith('/admin')){
    res.locals.dbHealth = { degraded: dbHealth.degraded, lastPingMs: dbHealth.lastPingMs, lastError: dbHealth.lastError, slowThresholdMs: dbHealth.slowThresholdMs, rollingAvgMs: dbHealth.rollingAvgMs, slowQueries: dbHealth.slowQueries, totalQueries: dbHealth.totalQueries };
    }
    next();
});

// Prefetch feature flags for admin & editors pages
app.use((req,res,next)=>{ if(req.path.startsWith('/admin') || req.path.startsWith('/editors')){ featureFlags.listFlags(req.siteKey||'default').then(list=>{ const map={}; list.forEach(f=> map[f.flag_key]=!!f.enabled); res.locals.flags=map; res.locals.flagsList=list; next(); }).catch(()=>next()); } else next(); });

// Security headers (CSP script nonce; style hardening pending)
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    const nonce = res.locals.cspNonce;
    const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' https://cdn.tiny.cloud https://cdn.jsdelivr.net https://unpkg.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data: blob:; media-src 'self'; frame-ancestors 'self'; connect-src 'self';`;
    res.setHeader('Content-Security-Policy', csp);
    // Report-Only variant preparing removal of 'unsafe-inline' (will help collect violations)
    const ro = csp.replace("'unsafe-inline' ", '');
    res.setHeader('Content-Security-Policy-Report-Only', ro);
    next();
});

// Sitemap (posts, podcasts, advanced pages)
app.get('/sitemap.xml', async (req,res)=>{
    try {
        const siteUrl = process.env.SITE_URL || `https://${req.headers.host}`;
        const [posts] = await pool.query('SELECT slug, updated_at FROM posts WHERE status="published" AND is_deleted=0 ORDER BY updated_at DESC LIMIT 500');
        const [pods] = await pool.query('SELECT slug, published_at FROM podcasts WHERE slug IS NOT NULL ORDER BY published_at DESC LIMIT 200');
        const [pages] = await pool.query('SELECT slug, updated_at FROM advanced_pages WHERE status="published" ORDER BY updated_at DESC LIMIT 200');
        const now = new Date().toISOString();
        function url(loc,lastmod,prio){ return `<url><loc>${siteUrl}${loc}</loc>${lastmod?`<lastmod>${lastmod}</lastmod>`:''}${prio?`<priority>${prio}</priority>`:''}</url>`; }
        const urls = [url('/',now,'1.0')];
        posts.forEach(p=> urls.push(url('/blog/'+p.slug, p.updated_at? new Date(p.updated_at).toISOString():null,'0.8')));
        pods.forEach(p=> urls.push(url('/podcasts/'+p.slug, p.published_at? new Date(p.published_at).toISOString():null,'0.6')));
        pages.forEach(p=> urls.push(url('/p/'+p.slug, p.updated_at? new Date(p.updated_at).toISOString():null,'0.5')));
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
        res.set('Content-Type','application/xml');
        res.send(xml);
    } catch(e){ res.status(500).send('sitemap error'); }
});

// Mount route trees
app.use('/', publicRoutes);
app.use('/admin', adminRoutes);
// Mount new modular editors center (index.js inside routes/editors/) falling back to legacy if needed
try { app.use('/editors', require('./routes/editors/index.js')); }
catch(e){
    console.warn('[server] modular editors router failed, attempting legacy editors.js:', e.message);
    try { app.use('/editors', require('./routes/editors.js')); }
    catch(e2){ console.warn('[server] no editors router available', e2.message); }
}

// Health check (add ?deep=1 for DB ping)
app.get('/health', async (req,res)=>{
    if(req.query.deep==='1'){
        try { await pool.query('SELECT 1'); return res.json({ status:'ok', db:true, mode:process.env.NODE_ENV||'dev'}); }
        catch(e){ return res.status(500).json({ status:'degraded', db:false, error:e.message }); }
    }
    return res.json({ status:'ok', mode:process.env.NODE_ENV||'dev' });
});

// DB health API
app.get('/admin/api/db-health', async (req,res)=>{
    try {
        // perform quick ping in background to refresh metrics
        pool.query('SELECT 1').catch(()=>{});
        res.json({ ok:true, degraded: dbHealth.degraded, lastPingMs: dbHealth.lastPingMs, lastError: dbHealth.lastError, threshold: dbHealth.slowThresholdMs, rollingAvgMs: dbHealth.rollingAvgMs, slowQueries: dbHealth.slowQueries, totalQueries: dbHealth.totalQueries });
    } catch(e){ res.status(500).json({ ok:false, error:e.message }); }
});
// Timings API (admin)
app.get('/admin/api/timings', (req,res)=>{ if(!(req.session && (req.session.role==='admin' || req.session.adminTokenValid))) return res.status(403).json({ error:'forbidden' }); const summary=Array.from(__timings.byRoute.entries()).map(([path,v])=>({ path, count:v.count, avg:v.avg, max:v.max })).sort((a,b)=> b.avg - a.avg).slice(0,50); // global percentiles
    const recentDur = __timings.recent.slice(-500).map(r=>r.ms).sort((a,b)=>a-b);
    function percentile(p){ if(!recentDur.length) return null; const idx=Math.min(recentDur.length-1, Math.floor(p*recentDur.length)); return recentDur[idx]; }
    const p95=percentile(0.95), p99=percentile(0.99);
    res.json({ summary, recent: __timings.recent.slice(-50), p95, p99 }); });
// Metrics summary (admin) for dashboard badges
app.get('/admin/api/metrics-summary', (req,res)=>{ if(!(req.session && (req.session.role==='admin' || req.session.adminTokenValid))) return res.status(403).json({ error:'forbidden' });
    try {
        const ok=metrics.getCounter? metrics.getCounter('http_requests_status_class_2xx') : 0;
        const clientErr=metrics.getCounter? metrics.getCounter('http_client_errors_total') : 0;
        const serverErr=metrics.getCounter? metrics.getCounter('http_server_errors_total') : 0;
        const total=metrics.getCounter? metrics.getCounter('http_requests_total') : 0;
        res.json({ total, ok, clientErr, serverErr });
    } catch(e){ res.status(500).json({ error:'summary_fail' }); }
});
app.get('/admin/debug/timings', (req,res)=>{ if(!(req.session && (req.session.role==='admin' || req.session.adminTokenValid))) return res.status(403).send('Forbidden'); res.render('admin_debug_timings',{ title:'Request Timings' }); });
// Metrics exposition (Prometheus format)
app.get('/metrics', (req,res)=>{ res.set('Content-Type','text/plain; version=0.0.4'); res.send(metrics.formatProm()); });

// Site key audit
app.get('/admin/api/site-key-audit', async (req,res)=>{
    if(!(req.session && (req.session.role==='admin' || req.session.adminTokenValid))) return res.status(403).json({ error:'forbidden' });
    try {
        const tables = ['posts','media','podcasts','advanced_pages','timeline_entries','timeline_levels'];
        const results = {};
        for(const t of tables){
            // podcasts may still not have site_key in some older schemas; guard
            const [[has]] = await pool.query('SELECT COUNT(*) c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME="site_key"',[t]);
            if(!has.c){ results[t] = { skipped:true }; continue; }
            const [[row]] = await pool.query(`SELECT COUNT(*) c FROM ${t} WHERE (site_key IS NULL OR site_key='')`);
            results[t] = { missing: row.c };
        }
        res.json({ ok:true, results });
    } catch(e){ res.status(500).json({ ok:false, error:e.message }); }
});

// AI usage info badge (admin only; ignore errors)
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

// 404
app.use((req, res) => {
    res.status(404).render('partials/error_404', { title: 'Seite nicht gefunden' });
});

// CSRF error page
app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        console.warn('[CSRF] Ungültiges Token für Pfad', req.path, 'SessionID', req.sessionID);
        if (res.headersSent) return next(err);
        return res.status(403).render('partials/error_csrf', { title: 'Sicherheitsfehler', error: err, path: req.path, sessionId: req.sessionID });
    }
    return next(err);
});

// Generic error handler
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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});
