const express = require('express');
const router  = express.Router();
const GuildConfig = require('../../models/GuildConfig');

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
            footballTeams:        typeof b.footballTeams === 'string'
                ? b.footballTeams.split(',').map(t => t.trim()).filter(Boolean)
                : [].concat(b.footballTeams || []).filter(Boolean),
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
