const express = require('express');
const router = express.Router();
const axios = require('axios');
const GuildConfig = require('../../models/GuildConfig');

// หน้าแรก — Login
router.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/selector');
    const authorizeUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent('http://localhost:3000/auth/discord/callback')}&response_type=code&scope=identify%20guilds`;
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
            discordRoles
        });
    } catch (err) {
        console.error(err);
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
    const code = req.query.code;
    if (!code) return res.redirect('/');
    try {
        const tokenResponse = await axios.post('https://discord.com/api/v10/oauth2/token', new URLSearchParams({
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: 'http://localhost:3000/auth/discord/callback',
            scope: 'identify guilds'
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

        const accessToken = tokenResponse.data.access_token;
        const userResponse = await axios.get('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${accessToken}` } });
        const guildsResponse = await axios.get('https://discord.com/api/v10/users/@me/guilds', { headers: { Authorization: `Bearer ${accessToken}` } });
        const botGuildsResponse = await axios.get('https://discord.com/api/v10/users/@me/guilds', { headers: { Authorization: `Bot ${process.env.TOKEN}` } });
        const botGuildIds = botGuildsResponse.data.map(g => g.id);

        const adminGuilds = guildsResponse.data.filter(guild => {
            const perms = BigInt(guild.permissions);
            return guild.owner === true || (perms & 0x20n) === 0x20n || (perms & 0x8n) === 0x8n;
        });

        req.session.user = userResponse.data;
        req.session.guilds = adminGuilds.map(g => ({
            id: g.id,
            name: g.name,
            icon: g.icon,
            hasBot: botGuildIds.includes(g.id)
        }));
        res.redirect('/selector');
    } catch (err) {
        console.error(err);
        res.status(500).send('Auth Error');
    }
});

module.exports = router;