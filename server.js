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

// Vertrauen in Proxy (Netcup Load Balancer) für korrekte req.ip & secure Cookies
app.set('trust proxy', 1);

// Middleware für POST-Daten und statische Dateien
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

// CSRF-Schutz-Middleware
const csrfProtection = csurf();
app.use(csrfProtection);

// Globale Middleware, um Variablen für alle Templates verfügbar zu machen
app.use((req, res, next) => {
    // CSRF-Token für Formulare
    res.locals.csrfToken = req.csrfToken();
    // Login-Status für die Navigation (z.B. Admin-Link)
    res.locals.isAdmin = req.session.isLoggedIn || false;
    // IP-Whitelist für spezielle Links/Features
    const whitelistedIps = (process.env.WHITELISTED_IPS || '').split(',').map(ip => ip.trim());
    res.locals.isWhitelisted = whitelistedIps.includes(req.ip);
    next();
});

// Security Header (leichtgewichtige Variante ohne zusätzliche Abhängigkeit)
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Eine sehr konservative CSP (ggf. später verfeinern – TinyMCE/CDN Skripte erlauben)
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://cdn.tiny.cloud 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self'; frame-ancestors 'self'; connect-src 'self';");
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
