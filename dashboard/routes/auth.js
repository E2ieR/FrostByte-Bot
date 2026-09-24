const express = require('express');
const router = express.Router();
const { getGuild } = require('../guildData');
const GuildConfig = require('../../models/GuildConfig');
const discordOAuth = require('../discordOAuth');
const activeLogins = new Set();
const { randomBytes } = require('node:crypto');
const oauthStore = require('../oauthStore');

function authFailure(res, err, stage) {
    res.set('Cache-Control', 'no-store');
    if (err.response?.status === 429) {
        const seconds = discordOAuth.retrySeconds(err.response);
        const resumeAt = new Date(Date.now() + seconds * 1000).toISOString();
        console.warn('[Auth] ' + (err.localCooldown ? 'local cooldown' : 'Discord rejected request') +
            ' stage=' + stage + ' retry_after=' + seconds + 's resumeAt=' + resumeAt);
        res.set('Retry-After', String(seconds));
        return res.status(429).send('Discord จำกัดคำขอชั่วคราว กรุณารออย่างน้อย ' + seconds +
            ' วินาที แล้วกลับหน้าแรกเพื่อเริ่ม Login ใหม่ เวลา UTC: ' + resumeAt +
            ' — อย่ารีเฟรช callback หรือรีสตาร์ตซ้ำ');
    }
    // Do not log Axios request/config, authorization codes, tokens or full response bodies.
    console.error('[Auth] failed stage=' + stage + ' status=' + (err.response?.status || err.status || 'internal'));
    return res.status(503).send('Login is temporarily unavailable. Please return to the home page and try again later.');
}

// หน้าแรก — Login
router.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/selector');
    res.render('login', { authorizeUrl: '/auth/discord' });
});

// Only a deliberate login action creates state; health checks to / do not call Discord.
router.get('/auth/discord', async (req, res) => {
    if (req.session.user) return res.redirect('/selector');
    try {
        await discordOAuth.assertAvailable();
        const state = randomBytes(32).toString('hex');
        await oauthStore.issueState(state, req.sessionID);
        req.session.oauthStartedAt = Date.now();
        await new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
        const redirectUri = (process.env.BASE_URL || 'http://localhost:3000') + '/auth/discord/callback';
        const params = new URLSearchParams({ client_id: process.env.CLIENT_ID,
            redirect_uri: redirectUri, response_type: 'code', scope: 'identify guilds', state });
        res.set('Cache-Control', 'no-store');
        res.redirect('https://discord.com/oauth2/authorize?' + params);
    } catch (err) { return authFailure(res, err, 'start'); }
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

        const discordRoles = getGuild(req, guildId).roles.cache
            .filter(r => r.id !== guildId).map(r => ({ id: r.id, name: r.name, color: r.color }));

        res.render('manage', {
            user: req.session.user,
            guild,
            guildId,
            config,
            discordRoles,
            query: req.query
        });
    } catch (err) {
        if (err.status === 503) return res.status(503).send(err.message);
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
    let stage = 'validation';
    try {
        res.set('Cache-Control', 'no-store');
        const state = req.query.state;
        if (typeof state !== 'string' || !/^[a-f0-9]{64}$/.test(state) || code.length > 2048 ||
            !await oauthStore.consumeState(state, req.sessionID)) {
            return res.status(400).send('Login expired or already used. Return to the home page to start again.');
        }
        await discordOAuth.assertAvailable();
        if (!await oauthStore.claimCode(code)) {
            return res.status(400).send('This login code has already been used. Return to the home page.');
        }
        stage = 'token';
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
        return authFailure(res, err, stage);
    } finally {
        activeLogins.delete(req.sessionID);
    }
});

module.exports = router;