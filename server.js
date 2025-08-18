require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const csurf = require('csurf');
const path = require('path');
const pool = require('./db'); // Stellt sicher, dass db.js den Pool exportiert

const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

const app = express();
// Internationalization (lightweight JSON-based)
const i18n = require('./i18n');

// Vertrauen in Proxy (Netcup Load Balancer) für korrekte req.ip & secure Cookies
app.set('trust proxy', 1);

// Optional: Sessions beim Start leeren (Standard: aus). Setze CLEAR_SESSIONS_ON_START=true in .env für komplettes Logout aller Nutzer nach Restart.
if (process.env.CLEAR_SESSIONS_ON_START === 'true') {
    pool.query('DELETE FROM sessions')
        .then(() => console.log('[Session] Alle Sessions beim Start gelöscht.'))
        .catch(err => console.warn('[Session] Konnte Sessions nicht löschen:', err.message));
}

// Middleware für JSON & Form-POST-Daten und statische Dateien
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'httpdocs')));

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

// CSRF-Schutz-Middleware (Multipart Upload Sonderfall: /admin/upload überspringen)
const csrfProtection = csurf();
app.use((req, res, next) => {
    if (req.method === 'POST' && req.path === '/admin/upload') {
        return next(); // Skip CSRF Prüfung für Datei-Upload (Token bereits im Form, aber multipart wird sonst blockiert)
    }
    return csrfProtection(req, res, next);
});

// Globale Middleware, um Variablen für alle Templates verfügbar zu machen
app.use(i18n);
app.use((req, res, next) => {
    // CSRF-Token für Formulare (falls verfügbar)
    try { res.locals.csrfToken = req.csrfToken(); } catch (_) { res.locals.csrfToken = ''; }

    // IP ermitteln (X-Forwarded-For bevorzugt, dann normalize)
    const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    let clientIp = xff || req.ip || '';
    if (clientIp.startsWith('::ffff:')) clientIp = clientIp.substring(7); // IPv4-mapped IPv6
    res.locals.clientIp = clientIp;

    // Login-Status
    res.locals.isAdmin = !!(req.session && req.session.isLoggedIn && req.session.userId);

    // Whitelist prüfen
    const whitelistedIps = (process.env.WHITELISTED_IPS || '').split(',').map(ip => ip.trim()).filter(Boolean);
    res.locals.isWhitelisted = whitelistedIps.includes(clientIp);

    // Aktueller Pfad
    res.locals.currentPath = req.path || '';
    next();
});

// Security Header (leichtgewichtige Variante ohne zusätzliche Abhängigkeit)
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Eine sehr konservative CSP (ggf. später verfeinern – TinyMCE/CDN Skripte erlauben)
    // CSP erweitert: bootstrap-icons (cdn.jsdelivr), AOS CSS (unpkg) erlauben. Wenn strenger gewünscht -> Nonces/Hashes statt 'unsafe-inline'.
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://cdn.tiny.cloud https://cdn.jsdelivr.net https://unpkg.com 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data: blob:; media-src 'self'; frame-ancestors 'self'; connect-src 'self';");
    next();
});

// Routen einbinden
app.use('/', publicRoutes);
app.use('/admin', adminRoutes);

// 404 Handler
app.use((req, res) => {
    res.status(404).render('partials/error_404', { title: 'Seite nicht gefunden' });
});

// Fehlerbehandlung
app.use((err, req, res, next) => {
    console.error(err.stack);
    if (res.headersSent) return next(err);
    res.status(500).render('partials/error_500', { title: 'Fehler', error: err });
});

// Server starten
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});
