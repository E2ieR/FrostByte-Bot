const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// discord client จะถูก inject เข้ามาตอน startServer()
let discordClient = null;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(session({ secret: 'ickez-super-secret-key', resave: false, saveUninitialized: false }));

// ทำให้ routes เข้าถึง discordClient ได้ผ่าน req.app.locals
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
    app.listen(PORT, () => console.log(`🖥️ [Dashboard] เปิดระบบเว็บไซต์เรียบร้อยที่: http://localhost:${PORT}`));
}

module.exports = { startServer };