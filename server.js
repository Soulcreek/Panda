require('dotenv').config(); // Lädt Umgebungsvariablen aus der .env-Datei
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
const port = process.env.PORT || 3000;

// --- DATENBANKVERBINDUNGEN ---
const postsDb = new sqlite3.Database('./posts.db', (err) => { if (err) console.error('Fehler bei der Verbindung zu posts.db:', err.message); else console.log('Connected to posts.db.'); });
const mediaDb = new sqlite3.Database('./media.db', (err) => { if (err) console.error('Fehler bei der Verbindung zu media.db:', err.message); else console.log('Connected to media.db.'); });
const podcastsDb = new sqlite3.Database('./podcasts.db', (err) => { if (err) console.error('Fehler bei der Verbindung zu podcasts.db:', err.message); else console.log('Connected to podcasts.db.'); });
const siteDb = new sqlite3.Database('./site_content.db', (err) => { if (err) console.error('Fehler bei der Verbindung zu site_content.db:', err.message); else console.log('Connected to site_content.db.'); });

// --- MIDDLEWARE SETUP ---
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.static(path.join(__dirname, 'httpdocs')));
app.use('/aos', express.static(path.join(__dirname, 'node_modules/aos/dist')));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({ 
    secret: process.env.SESSION_SECRET || 'fallback-secret-key', 
    resave: false, 
    saveUninitialized: true, 
    cookie: { secure: false }
}));

// Globale Middleware für Sprache und Admin-Status
app.use((req, res, next) => {
    if (req.query.lang) req.session.lang = req.query.lang === 'en' ? 'en' : 'de';
    res.locals.lang = req.session.lang || 'de';
    const safeIps = ['::1', '127.0.0.1', '84.160.49.182', '2003:d0:2747:e100:1c65:e320:25fc:76cd']; 
    const requestIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    res.locals.isWhitelisted = safeIps.includes(requestIp);
    res.locals.session = req.session;
    next();
});

// --- ROUTEN ---
const publicRoutes = require('./routes/public.js')(postsDb, podcastsDb, siteDb);
const adminRoutes = require('./routes/admin.js')(postsDb, mediaDb, podcastsDb);

// KORREKTUR: Auth-Routen direkt hier definieren
app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', async (req, res) => { 
    const { username, password } = req.body; 
    const correctUsername = 'panda_admin'; 
    const correctPasswordHash = '$2b$10$mH/LC6v8Mwn4XPUY.pfF/uDQ.ViueoKbLKPxYAPjmxjnzRO373UDy'; 
    if (username === correctUsername && await bcrypt.compare(password, correctPasswordHash)) { 
        req.session.loggedin = true; 
        res.redirect('/admin'); 
    } else { 
        res.render('login', { error: 'Ungültiger Nutzername oder Passwort!' }); 
    } 
});
app.get('/logout', (req, res) => { 
    req.session.destroy(); 
    res.redirect('/'); 
});

app.use('/', publicRoutes);
app.use('/admin', adminRoutes);

// --- SERVER START ---
app.listen(port, () => console.log(`Purview Panda server listening at http://localhost:${port}`));
