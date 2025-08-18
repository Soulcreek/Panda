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

// Routen einbinden
app.use('/', publicRoutes);
app.use('/admin', adminRoutes);

// Fehlerbehandlung
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Etwas ist schiefgelaufen!');
});

// Server starten
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});
