// soulcreek/panda/Panda-master/server.js

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const csurf = require('csurf');
const bcrypt = require('bcryptjs');
const MySQLStore = require('express-mysql-session')(session);

const pool = require('./db');

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'httpdocs')));
app.use(bodyParser.urlencoded({ extended: false }));

const sessionStoreOptions = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    clearExpired: true,
    checkExpirationInterval: 900000,
};
const sessionStore = new MySQLStore(sessionStoreOptions);

app.use(session({
    secret: process.env.SESSION_SECRET || 'eine_sehr_geheime_zeichenkette',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24
    }
}));

app.use(csurf());

app.use((req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    res.locals.isAuthenticated = req.session.isLoggedIn;
    res.locals.session = req.session;
    res.locals.lang = 'de';
    
    const whitelistedIps = (process.env.WHITELISTED_IPS || '').split(',');
    const userIp = req.ip;
    res.locals.isWhitelisted = whitelistedIps.includes(userIp);
    
    next();
});

const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

app.use('/', publicRoutes);
app.use('/admin', adminRoutes);

// --- AUTHENTIFIZIERUNGS-ROUTEN ---

// KORREKTUR: Leitet eingeloggte Benutzer vom Login weg
app.get('/login', (req, res) => {
    if (req.session.isLoggedIn) {
        return res.redirect('/admin');
    }
    res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        if (users.length === 0) {
            return res.render('login', { error: 'Ungültiger Benutzername oder Passwort.' });
        }
        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
            req.session.userId = user.id;
            req.session.isLoggedIn = true;
            res.redirect('/admin');
        } else {
            res.render('login', { error: 'Ungültiger Benutzername oder Passwort.' });
        }
    } catch (error) {
        res.status(500).send('Ein interner Serverfehler ist aufgetreten.');
    }
});

// KORREKTUR: Leitet eingeloggte Benutzer von der Registrierung weg
app.get('/register', (req, res) => {
    if (req.session.isLoggedIn) {
        return res.redirect('/admin');
    }
    res.render('register', { error: null });
});

app.post('/register', async (req, res) => {
    // ... (Registrierungslogik bleibt gleich)
});

// KORREKTUR: Robuste Logout-Funktion
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Fehler beim Zerstören der Session:", err);
        }
        // Wichtig: Session-Cookie im Browser löschen
        res.clearCookie('connect.sid'); // 'connect.sid' ist der Standardname
        res.redirect('/login');
    });
});


// Globaler Fehler-Handler
app.use((error, req, res, next) => {
    console.error('GLOBALER FEHLER-HANDLER:', error);
    res.status(error.status || 500);
    res.send(`<pre>${error.stack}</pre>`);
});

app.listen(port, () => {
    console.log(`[SERVER] Anwendung erfolgreich gestartet und lauscht auf Port ${port}`);
});
