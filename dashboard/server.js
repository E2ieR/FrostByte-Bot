const express = require('express');
const session = require('express-session');
const path = require('path');
const i18n = require('./i18n');

const app = express();
const PORT = process.env.PORT || 3000;

let discordClient = null;

// parse cookies manually (no cookie-parser dependency)
app.use((req, res, next) => {
    req.cookies = {};
    const header = req.headers.cookie;
    if (header) {
        header.split(';').forEach((pair) => {
            const i = pair.indexOf('=');
            if (i > 0) {
                const k = pair.slice(0, i).trim();
                const v = pair.slice(i + 1).trim();
                try { req.cookies[k] = decodeURIComponent(v); } catch (_) { req.cookies[k] = v; }
            }
        });
    }
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(session({
    secret: process.env.SESSION_SECRET || 'ickez-super-secret-key',
    resave: false,
    saveUninitialized: false
}));

// i18n: default EN, switchable via ?lang / cookie / session
app.use(i18n.middleware);

// language switch: GET /lang/en | /lang/th?back=/manage/123
app.get('/lang/:lang', (req, res) => i18n.setLang(req, res));

// serve locale JSON for client bootstrap if needed
app.get('/i18n/:locale.json', (req, res) => {
    const loc = i18n.normalize(req.params.locale);
    res.json(loc === 'th' ? i18n.th : i18n.en);
});

app.use((req, res, next) => {
    req.app.locals.discordClient = discordClient;
    next();
});

const authRoutes     = require('./routes/auth');
const economyRoutes  = require('./routes/economy');
const storeRoutes    = require('./routes/store');
const bettingRoutes  = require('./routes/betting');
const membersRoutes  = require('./routes/members');
const autoroleRoutes = require('./routes/autorole');
const sportsRoutes   = require('./routes/sports');
const commandsRoutes = require('./routes/commands');

app.use('/', authRoutes);
app.use('/', economyRoutes);
app.use('/', storeRoutes);
app.use('/', bettingRoutes);
app.use('/', membersRoutes);
app.use('/', autoroleRoutes);
app.use('/', sportsRoutes);
app.use('/', commandsRoutes);

function startServer(client) {
    discordClient = client;
    app.listen(PORT, () =>
        console.log(`🖥️ [Dashboard] ready at: ${process.env.BASE_URL || `http://localhost:${PORT}`}`)
    );
}

module.exports = { startServer };
