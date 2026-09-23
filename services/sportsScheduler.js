const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const GuildConfig  = require('../models/GuildConfig');
const { getUpcomingMatches, GAME_NAMES, GAME_COLORS } = require('./liquipediaService');
const { getNextRace, getCurrentSession, getLivePositions } = require('./f1Service');
const { getMatches, getLiveMatches, LEAGUE_NAMES }        = require('./footballService');

// ─── ป้องกันแจ้งซ้ำ ─────────────────────────────────────────────────────────
const notified = new Set();
let discordClient = null;

// ─── ส่ง embed ไปยัง channel ─────────────────────────────────────────────────
async function sendToChannel(guildId, channelId, embed, content = '') {
    try {
        const guild   = await discordClient.guilds.fetch(guildId);
        const channel = await guild.channels.fetch(channelId);
        if (!channel?.isTextBased()) return;
        await channel.send({ content: content || undefined, embeds: [embed] });
    } catch (err) {
        console.error('[SportsScheduler] sendToChannel:', err.message);
    }
}

// ─── Esports: แจ้งก่อนแมตช์ ──────────────────────────────────────────────────
async function checkEsports() {
    if (!discordClient) return;
    try {
        const configs = await GuildConfig.find({ 'sportsNotifications.esportsEnabled': true }).lean();
        if (!configs.length) return;

        const allGames = ['cs2', 'valorant', 'lol', 'mlbb'];
        for (const cfg of configs) {
            const n = cfg.sportsNotifications || {};
            if (!n.esportsEnabled || !n.esportsChannelId) continue;
            const games       = n.esportsGames?.length ? n.esportsGames : allGames;
            const alertMs     = (n.esportsNotifyBefore || 30) * 60 * 1000;

            for (const game of games) {
                let matches = [];
                try { matches = await getUpcomingMatches(game); } catch { continue; }

                for (const m of matches) {
                    if (!m.matchTime) continue;
                    const timeUntil = m.matchTime - Date.now();
                    const key = `esp_${cfg.guildId}_${game}_${m.team1}_${m.team2}_${m.matchTime.toDateString()}`;

                    if (!m.isLive && timeUntil > 0 && timeUntil <= alertMs && !notified.has(key)) {
                        notified.add(key);
                        const ts = Math.floor(m.matchTime / 1000);
                        const embed = new EmbedBuilder()
                            .setColor(GAME_COLORS[game] || 0x5865F2)
                            .setTitle(`🎮 ${GAME_NAMES[game]} — แมตช์กำลังจะเริ่ม!`)
                            .addFields(
                                { name: '⚔️ แมตช์', value: `**${m.team1}** vs **${m.team2}**`, inline: false },
                                { name: '🏆 รายการ', value: m.tournament || 'ไม่ระบุ', inline: true },
                                { name: '⏰ เวลาแข่ง', value: `<t:${ts}:F>\n(<t:${ts}:R>)`, inline: true },
                            ).setTimestamp();
                        if (m.streamLink) embed.addFields({ name: '📺 สตรีม', value: m.streamLink });
                        await sendToChannel(cfg.guildId, n.esportsChannelId, embed);
                    }

                    if (m.isLive) {
                        const liveKey = `esp_live_${cfg.guildId}_${game}_${m.team1}_${m.team2}`;
                        if (!notified.has(liveKey)) {
                            notified.add(liveKey);
                            const embed = new EmbedBuilder()
                                .setColor(0xFEE75C)
                                .setTitle(`🔴 LIVE — ${GAME_NAMES[game]}`)
                                .setDescription(`**${m.team1}** ${m.score1 || 0} – ${m.score2 || 0} **${m.team2}**`)
                                .addFields({ name: '🏆 รายการ', value: m.tournament || 'ไม่ระบุ' })
                                .setTimestamp();
                            if (m.streamLink) embed.addFields({ name: '📺 สตรีม', value: m.streamLink });
                            await sendToChannel(cfg.guildId, n.esportsChannelId, embed, '@everyone');
                        }
                    }
                }
                // rate limit ระหว่างเกม
                await new Promise(r => setTimeout(r, 2200));
            }
        }
    } catch (err) {
        console.error('[SportsScheduler] checkEsports:', err.message);
    }
}

// ─── F1: แจ้งก่อนแข่ง ────────────────────────────────────────────────────────
async function checkF1() {
    if (!discordClient) return;
    try {
        const configs = await GuildConfig.find({ 'sportsNotifications.f1Enabled': true }).lean();
        if (!configs.length) return;

        const nextRace = await getNextRace();
        if (!nextRace?.dateTime) return;

        for (const cfg of configs) {
            const n = cfg.sportsNotifications || {};
            if (!n.f1Enabled || !n.f1ChannelId) continue;
            const alertMs  = (n.f1NotifyBefore || 60) * 60 * 1000;
            const raceKey  = `f1_${cfg.guildId}_race_${nextRace.round}`;
            const qualKey  = `f1_${cfg.guildId}_qual_${nextRace.round}`;

            // แจ้งก่อนแข่ง
            const raceUntil = nextRace.dateTime - Date.now();
            if (raceUntil > 0 && raceUntil <= alertMs && !notified.has(raceKey)) {
                notified.add(raceKey);
                const ts = Math.floor(nextRace.dateTime / 1000);
                const embed = new EmbedBuilder()
                    .setColor(0xE8002D)
                    .setTitle(`🏎️ F1 — ${nextRace.name} กำลังจะเริ่ม!`)
                    .addFields(
                        { name: '🏁 สนาม', value: nextRace.circuit, inline: true },
                        { name: '📍 สถานที่', value: nextRace.location, inline: true },
                        { name: '⏰ เวลาแข่ง', value: `<t:${ts}:F> (<t:${ts}:R>)`, inline: false },
                    )
                    .setFooter({ text: `สนามที่ ${nextRace.round}` })
                    .setTimestamp();
                await sendToChannel(cfg.guildId, n.f1ChannelId, embed, '@everyone');
            }

            // แจ้งก่อน qualifying (1 ชม)
            if (nextRace.qualifying) {
                const qualUntil = nextRace.qualifying - Date.now();
                if (qualUntil > 0 && qualUntil <= 60 * 60 * 1000 && !notified.has(qualKey)) {
                    notified.add(qualKey);
                    const ts = Math.floor(nextRace.qualifying / 1000);
                    const embed = new EmbedBuilder()
                        .setColor(0xFF8700)
                        .setTitle(`🏎️ F1 Qualifying — ${nextRace.name}`)
                        .addFields({ name: '⏰ เวลา Qualifying', value: `<t:${ts}:F> (<t:${ts}:R>)` })
                        .setTimestamp();
                    await sendToChannel(cfg.guildId, n.f1ChannelId, embed);
                }
            }
        }
    } catch (err) {
        console.error('[SportsScheduler] checkF1:', err.message);
    }
}

// ─── F1 Live: อัปเดตอันดับสด ─────────────────────────────────────────────────
let f1LiveInterval = null;
let f1LiveMessage  = null; // เก็บ message ที่ส่งไว้สำหรับ edit

async function startF1LiveUpdates(guildId, channelId) {
    if (f1LiveInterval) return; // กำลัง live อยู่แล้ว

    const session = await getCurrentSession();
    if (!session) return;

    const isRace = session.session_type === 'Race' || session.session_type === 'Sprint';
    if (!isRace) return;

    f1LiveInterval = setInterval(async () => {
        try {
            const positions = await getLivePositions(session.session_key);
            if (!positions.length) return;

            const lines = positions.slice(0, 20).map(p =>
                `**P${p.pos}** ${p.code || p.name} (${p.team})`
            ).join('\n');

            const embed = new EmbedBuilder()
                .setColor(0xE8002D)
                .setTitle(`🔴 F1 LIVE — ${session.session_name || 'Race'}`)
                .setDescription(lines)
                .setTimestamp();

            if (f1LiveMessage) {
                await f1LiveMessage.edit({ embeds: [embed] }).catch(() => {});
            } else {
                const guild   = await discordClient.guilds.fetch(guildId);
                const channel = await guild.channels.fetch(channelId);
                f1LiveMessage = await channel.send({ embeds: [embed] });
            }
        } catch (err) {
            console.error('[SportsScheduler] F1 live update:', err.message);
            clearInterval(f1LiveInterval);
            f1LiveInterval = null;
            f1LiveMessage  = null;
        }
    }, 30 * 1000); // อัปเดตทุก 30 วินาที
}

// ─── Football: แจ้งก่อนแมตช์ ─────────────────────────────────────────────────
async function checkFootball() {
    if (!discordClient) return;
    try {
        const configs = await GuildConfig.find({ 'sportsNotifications.footballEnabled': true }).lean();
        if (!configs.length) return;

        for (const cfg of configs) {
            const n = cfg.sportsNotifications || {};
            if (!n.footballEnabled || !n.footballChannelId) continue;
            const leagues        = n.footballLeagues?.length ? n.footballLeagues : ['PL'];
            const alertMs        = (n.footballNotifyBefore || 30) * 60 * 1000;
            const followedTeams  = n.footballTeams || [];
            const followedIds    = followedTeams.map(t => t.id).filter(Boolean);
            const followedNames  = followedTeams.map(t => (t.name || '').toLowerCase()).filter(Boolean);
            const hasTeamFilter  = followedIds.length > 0 || followedNames.length > 0;

            for (const league of leagues) {
                let matches = [];
                try { matches = await getMatches(league); } catch { continue; }

                for (const m of matches) {
                    if (!m.dateTime) continue;

                    // กรองตามทีมที่ติดตาม (ถ้ากำหนด)
                    if (hasTeamFilter) {
                        const byId   = followedIds.some(id => m.homeTeamId === id || m.awayTeamId === id);
                        const byName = followedNames.some(t =>
                            m.homeTeam.toLowerCase().includes(t) ||
                            m.awayTeam.toLowerCase().includes(t)
                        );
                        if (!byId && !byName) continue;
                    }

                    const key = `fb_${cfg.guildId}_${m.id}`;
                    const timeUntil = m.dateTime - Date.now();
                    if (timeUntil > 0 && timeUntil <= alertMs && !notified.has(key)) {
                        notified.add(key);
                        const ts = Math.floor(m.dateTime / 1000);
                        const embed = new EmbedBuilder()
                            .setColor(0x00A651)
                            .setTitle(`⚽ ${m.league} — แมตช์กำลังจะเริ่ม!`)
                            .addFields(
                                { name: '🆚 แมตช์', value: `**${m.homeTeam}** vs **${m.awayTeam}**`, inline: false },
                                { name: '⏰ เวลา', value: `<t:${ts}:F> (<t:${ts}:R>)`, inline: true },
                                m.venue ? { name: '🏟️ สนาม', value: m.venue, inline: true } : { name: '​', value: '​', inline: true },
                            ).setTimestamp();
                        await sendToChannel(cfg.guildId, n.footballChannelId, embed);
                    }
                }
            }
        }
    } catch (err) {
        console.error('[SportsScheduler] checkFootball:', err.message);
    }
}

// ─── Football Live: แจ้งเตือนแมตช์สด ────────────────────────────────────────
async function checkFootballLive() {
    if (!discordClient) return;
    try {
        const configs = await GuildConfig.find({
            'sportsNotifications.footballEnabled': true,
            'sportsNotifications.footballNotifyLive': true,
        }).lean();
        if (!configs.length) return;

        const liveMatches = await getLiveMatches();
        if (!liveMatches.length) return;

        for (const cfg of configs) {
            const n = cfg.sportsNotifications || {};
            if (!n.footballEnabled || !n.footballChannelId) continue;
            const followedTeams = n.footballTeams || [];
            const followedIds   = followedTeams.map(t => t.id).filter(Boolean);
            const followedNames = followedTeams.map(t => (t.name || '').toLowerCase()).filter(Boolean);
            const hasFilter     = followedIds.length > 0 || followedNames.length > 0;

            for (const m of liveMatches) {
                if (hasFilter) {
                    const byId   = followedIds.some(id => m.homeTeamId === id || m.awayTeamId === id);
                    const byName = followedNames.some(t =>
                        m.homeTeam.toLowerCase().includes(t) ||
                        m.awayTeam.toLowerCase().includes(t)
                    );
                    if (!byId && !byName) continue;
                }

                const key = `fb_live_${cfg.guildId}_${m.id}`;
                if (!notified.has(key)) {
                    notified.add(key);
                    const embed = new EmbedBuilder()
                        .setColor(0xFEE75C)
                        .setTitle(`🔴 LIVE — ${m.competition}`)
                        .setDescription(`**${m.homeTeam}** ${m.homeScore} – ${m.awayScore} **${m.awayTeam}**`)
                        .setFooter({ text: m.minute ? `นาทีที่ ${m.minute}` : 'กำลังแข่ง' })
                        .setTimestamp();
                    await sendToChannel(cfg.guildId, n.footballChannelId, embed, '@everyone');
                }
            }
        }
    } catch (err) {
        console.error('[SportsScheduler] checkFootballLive:', err.message);
    }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init(client) {
    discordClient = client;

    // Esports: ทุก 15 นาที
    cron.schedule('*/15 * * * *', checkEsports);

    // F1: ทุก 5 นาที
    cron.schedule('*/5 * * * *', checkF1);

    // Football upcoming: ทุก 10 นาที
    cron.schedule('*/10 * * * *', checkFootball);

    // Football live: ทุก 3 นาที
    cron.schedule('*/3 * * * *', checkFootballLive);

    console.log('[SportsScheduler] ✅ เริ่ม scheduler กีฬาและ Esports แล้ว');
}

module.exports = { init, startF1LiveUpdates };
