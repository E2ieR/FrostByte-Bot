const express = require('express');
const router = express.Router();
const axios = require('axios');
const GuildConfig = require('../../models/GuildConfig');
const discordOAuth = require('../discordOAuth');
const activeLogins = new Set();

// หน้าแรก — Login
router.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/selector');
    const redirectUri = `${process.env.BASE_URL || 'http://localhost:3000'}/auth/discord/callback`;
    const authorizeUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20guilds`;
    res.render('login', { authorizeUrl });
});

// หน้าเลือก Server
router.get('/selector', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    res.render('selector', {
        user: req.session.user,
        guilds: req.session.guilds,
        clientId: process.env.CLIENT_ID
    });
});

// หน้า Manage
router.get('/manage/:guildId', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    try {
        const guildId = req.params.guildId;
        let config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
        const guild = req.session.guilds?.find(g => g.id === guildId) || { name: guildId, id: guildId };

        // ดึง roles จาก Discord API
        const rolesResponse = await axios.get(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
            headers: { Authorization: `Bot ${process.env.TOKEN}` }
        });
        const discordRoles = rolesResponse.data.filter(r => r.name !== '@everyone');

        res.render('manage', {
            user: req.session.user,
            guild,
            guildId,
            config,
            discordRoles,
            query: req.query
        });
    } catch (err) {
        console.error(`[Manage] failed: status=${err.response?.status} msg=${err.response?.data?.message || err.message}`);
        res.redirect('/selector');
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Discord OAuth callback — path ต้องตรงกับ redirect_uri ใน Discord Developer Portal
router.get('/auth/discord/callback', async (req, res) => {
    if (req.session.user) return res.redirect('/selector');
    const code = req.query.code;
    if (typeof code !== 'string' || !code) return res.redirect('/');
    if (activeLogins.has(req.sessionID)) {
        return res.status(409).send('Login is already in progress. Please wait for the first request.');
    }
    activeLogins.add(req.sessionID);
    let stage = 'token';
    try {
        const tokenResponse = await discordOAuth.request({ method: 'POST', url: 'https://discord.com/api/v10/oauth2/token', data: new URLSearchParams({
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: `${process.env.BASE_URL || 'http://localhost:3000'}/auth/discord/callback`,
            scope: 'identify guilds'
        }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

        const accessToken = tokenResponse.data.access_token;
        stage = 'user';
        const userResponse = await discordOAuth.request({ url: 'https://discord.com/api/v10/users/@me', headers: { Authorization: `Bearer ${accessToken}` } });
        stage = 'guilds';
        const guildsResponse = await discordOAuth.request({ url: 'https://discord.com/api/v10/users/@me/guilds', headers: { Authorization: `Bearer ${accessToken}` } });

        // Gateway already maintains this list; no extra bot-token REST request per login.
        const botGuildIds = new Set(req.app.locals.discordClient?.guilds.cache.keys() || []);

        const adminGuilds = guildsResponse.data.filter(guild => {
            const perms = BigInt(guild.permissions);
            return guild.owner === true || (perms & 0x20n) === 0x20n || (perms & 0x8n) === 0x8n;
        });

        req.session.user = userResponse.data;
        req.session.guilds = adminGuilds.map(g => ({
            id: g.id,
            name: g.name,
            icon: g.icon,
            hasBot: botGuildIds.has(g.id)
        }));
        res.redirect('/selector');
    } catch (err) {
        const status = err.response?.status;
        const msg = err.response?.data?.message || err.message;
        console.error(`[Auth] callback failed: stage=${stage} status=${status} msg=${msg}`);
        if (status === 429) {
            const seconds = discordOAuth.retrySeconds(err.response);
            console.warn(`[Auth] Discord cooldown: retry_after=${seconds}s`);
            res.set('Retry-After', String(seconds));
            return res.status(429).send(`Discord จำกัดคำขอชั่วคราว กรุณารออย่างน้อย ${seconds} วินาที แล้วกลับหน้าแรกเพื่อเริ่ม Login ใหม่ อย่ารีเฟรชหน้า callback ซ้ำ`);
        }
        res.status(500).send('Auth Error');
    } finally {
        activeLogins.delete(req.sessionID);
    }
});

module.exports = router;