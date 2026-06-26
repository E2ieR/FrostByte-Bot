const express = require('express');
const router  = express.Router();
const GuildConfig = require('../../models/GuildConfig');
const { searchFotMob, getLeagueTeams } = require('../../services/footballService');
const { getTeamsByRegion } = require('../../services/liquipediaService');

// ─── GET channels (AJAX) ──────────────────────────────────────────────────────
router.get('/api/:guildId/sports-channels', async (req, res) => {
    const discordClient = req.app.locals.discordClient;
    if (!discordClient) return res.json([]);
    try {
        const guild = await discordClient.guilds.fetch(req.params.guildId);
        await guild.channels.fetch();
        const channels = guild.channels.cache
            .filter(c => c.isTextBased && c.isTextBased() && !c.isThread())
            .map(c => ({ id: c.id, name: c.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
        res.json(channels);
    } catch {
        res.json([]);
    }
});

// ─── GET ทีมทั้งหมดในลีก ─────────────────────────────────────────────────────
router.get('/api/:guildId/football-league-teams', async (req, res) => {
    const { league } = req.query;
    if (!league) return res.json([]);
    try {
        const teams = await getLeagueTeams(league);
        res.json(teams);
    } catch (err) {
        console.error('[LeagueTeams]', err.message);
        res.json([]);
    }
});

// ─── GET ค้นหาทีม / นักเตะ จาก FotMob ───────────────────────────────────────
router.get('/api/:guildId/football-search', async (req, res) => {
    const { q, type } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);
    try {
        const results = await searchFotMob(q.trim(), type === 'player' ? 'player' : 'team');
        console.log(`[FootballSearch] q="${q}" type=${type} → ${results.length} results`);
        res.json(Array.isArray(results) ? results : []);
    } catch (err) {
        console.error('[FootballSearch] unhandled:', err.message);
        res.json([]);
    }
});

// ─── GET ทีม Esports จาก Liquipedia (AJAX) ───────────────────────────────────
router.get('/api/:guildId/esports-game-teams', async (req, res) => {
    const { game } = req.query;
    if (!['cs2', 'valorant', 'lol', 'mlbb'].includes(game)) return res.json([]);
    try {
        const regionMap = await getTeamsByRegion(game);
        const all = Object.values(regionMap).flat();
        const seen = new Set();
        const unique = all.filter(t => {
            if (!t.name || seen.has(t.name)) return false;
            seen.add(t.name);
            return true;
        });
        res.json(unique.slice(0, 80));
    } catch (err) {
        console.error('[EsportsGameTeams]', err.message);
        res.json([]);
    }
});

// ─── POST บันทึก Sports Notification settings ─────────────────────────────────
router.post('/api/:guildId/sports', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
    const { guildId } = req.params;
    const b = req.body;

    try {
        let config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });

        config.sportsNotifications = {
            esportsEnabled:      !!b.esportsEnabled,
            esportsChannelId:    b.esportsChannelId || '',
            esportsGames:        [].concat(b.esportsGames || []).filter(Boolean),
            esportsNotifyBefore: parseInt(b.esportsNotifyBefore) || 30,
            esportsTrackedTeams: b.esportsTrackedTeams || {},

            f1Enabled:      !!b.f1Enabled,
            f1ChannelId:    b.f1ChannelId || '',
            f1NotifyBefore: parseInt(b.f1NotifyBefore) || 60,
            f1NotifyLive:   !!b.f1NotifyLive,

            footballEnabled:      !!b.footballEnabled,
            footballChannelId:    b.footballChannelId || '',
            footballLeagues:      [].concat(b.footballLeagues || []).filter(Boolean),
            footballTeams:        Array.isArray(b.footballTeams) ? b.footballTeams : [],
            footballPlayers:      Array.isArray(b.footballPlayers) ? b.footballPlayers : [],
            footballNotifyBefore: parseInt(b.footballNotifyBefore) || 30,
            footballNotifyLive:   !!b.footballNotifyLive,
            footballNotifyLineup: !!b.footballNotifyLineup,
        };

        config.markModified('sportsNotifications');
        await config.save();
        res.json({ ok: true });
    } catch (err) {
        console.error('[Sports route]', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
