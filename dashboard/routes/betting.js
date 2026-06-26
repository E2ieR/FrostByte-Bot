const express = require('express');
const router  = express.Router();
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const GuildConfig   = require('../../models/GuildConfig');
const User          = require('../../models/User');
const { getMatches, leagueLogoCache } = require('../../services/footballService');

// ─── Shared embed builder ─────────────────────────────────────────────────────
function buildBetEmbed(bet, currencyEmoji = '🪙') {
    const totalPool = (bet.poolA || 0) + (bet.poolB || 0);
    const pctA = totalPool > 0 ? ((bet.poolA / totalPool) * 100).toFixed(1) : '50.0';
    const pctB = totalPool > 0 ? ((bet.poolB / totalPool) * 100).toFixed(1) : '50.0';
    const oddsA = bet.poolA > 0 ? (totalPool / bet.poolA).toFixed(2) : '—';
    const oddsB = bet.poolB > 0 ? (totalPool / bet.poolB).toFixed(2) : '—';

    const barFill = Math.round(parseFloat(pctA) / 5);
    const bar = '█'.repeat(barFill) + '░'.repeat(20 - barFill);

    const colorHex = parseInt((bet.color || '#5865F2').replace('#', ''), 16);
    const embedColor = bet.winner ? 0xFEE75C : (bet.isOpen ? colorHex : 0x4f545c);

    const embed = new EmbedBuilder()
        .setTitle(`🎲 ${bet.title || 'เดิมพัน'}`)
        .setColor(embedColor)
        .addFields(
            {
                name: `🔵 ${bet.optionA}`,
                value: [
                    `> 💰 Pool: **${(bet.poolA || 0).toLocaleString()}** ${currencyEmoji}`,
                    `> 📊 สัดส่วน: **${pctA}%**`,
                    `> ✖️ Odds: **${oddsA}x**`,
                    bet.imageA ? `> [ดูรูป](${bet.imageA})` : ''
                ].filter(Boolean).join('\n'),
                inline: true
            },
            {
                name: `🔴 ${bet.optionB}`,
                value: [
                    `> 💰 Pool: **${(bet.poolB || 0).toLocaleString()}** ${currencyEmoji}`,
                    `> 📊 สัดส่วน: **${pctB}%**`,
                    `> ✖️ Odds: **${oddsB}x**`,
                    bet.imageB ? `> [ดูรูป](${bet.imageB})` : ''
                ].filter(Boolean).join('\n'),
                inline: true
            },
            {
                name: '📈 Pool Progress',
                value: `\`${bar}\`\n🔵 ${pctA}% ← vs → ${pctB}% 🔴`,
                inline: false
            },
            {
                name: '💎 Pool รวม',
                value: `**${totalPool.toLocaleString()}** ${currencyEmoji}  |  ผู้เดิมพัน **${(bet.bets || []).length}** คน`,
                inline: false
            }
        );

    if (bet.description) embed.setDescription(bet.description);
    if (bet.imageA && !bet.imageB) embed.setThumbnail(bet.imageA);
    if (bet.imageB) embed.setImage(bet.imageB);

    if (bet.expiresAt) {
        const ts = Math.floor(new Date(bet.expiresAt).getTime() / 1000);
        embed.addFields({ name: '⏰ หมดเวลา', value: `<t:${ts}:R>`, inline: true });
    }

    if (bet.winner) {
        const winName = bet.winner === 'A' ? bet.optionA : bet.optionB;
        embed.addFields({ name: '🏆 ผู้ชนะ', value: `**${winName}**`, inline: true });
    }

    const minMaxText = bet.maxBet > 0
        ? `ขั้นต่ำ ${(bet.minBet || 1).toLocaleString()} · สูงสุด ${bet.maxBet.toLocaleString()} ${currencyEmoji}`
        : `ขั้นต่ำ ${(bet.minBet || 1).toLocaleString()} ${currencyEmoji}`;
    embed.setFooter({ text: bet.isOpen ? `✅ เปิดรับเดิมพัน — ${minMaxText}` : '🔒 ปิดรับเดิมพันแล้ว' });
    embed.setTimestamp();
    return embed;
}

// ─── Shared button builder ────────────────────────────────────────────────────
function buildBetButtons(bet) {
    const betId    = bet.betId || bet._id?.toString() || 'x';
    const disabled = !bet.isOpen || !!bet.winner;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`bet_A_${betId}`)
            .setLabel(`🔵 ${bet.optionA}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`bet_B_${betId}`)
            .setLabel(`🔴 ${bet.optionB}`)
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled)
    );
}

// ─── Post or update Discord embed ────────────────────────────────────────────
async function postOrUpdateEmbed(discordClient, guildId, bet, config) {
    if (!discordClient || !bet.channelId) return;
    try {
        const guild   = await discordClient.guilds.fetch(guildId);
        const channel = await guild.channels.fetch(bet.channelId);
        if (!channel?.isTextBased()) return;

        const embed   = buildBetEmbed(bet, config.currencyEmoji || '🪙');
        const buttons = buildBetButtons(bet);

        if (bet.messageId) {
            try {
                const msg = await channel.messages.fetch(bet.messageId);
                await msg.edit({ embeds: [embed], components: [buttons] });
                return;
            } catch (_) { bet.messageId = ''; }
        }

        const msg = await channel.send({ embeds: [embed], components: [buttons] });
        bet.messageId = msg.id;
        config.markModified('bettings');
        await config.save();
    } catch (err) {
        console.error('[Betting] postOrUpdateEmbed error:', err.message);
    }
}

// ─── Helper: find bet by betId or _id ────────────────────────────────────────
function findBet(config, betId) {
    return config.bettings.find(b =>
        b.betId === betId || b._id?.toString() === betId
    );
}

// ─── Expiry timer for one bet ─────────────────────────────────────────────────
function scheduleExpiry(discordClient, guildId, bet) {
    if (!bet.expiresAt || !bet.isOpen) return;
    const ms = new Date(bet.expiresAt).getTime() - Date.now();
    if (ms <= 0) return;
    const betId = bet.betId || bet._id?.toString();
    setTimeout(async () => {
        try {
            const c = await GuildConfig.findOne({ guildId });
            if (!c) return;
            const b = findBet(c, betId);
            if (b && b.isOpen && !b.winner) {
                b.isOpen = false;
                c.markModified('bettings');
                await c.save();
                await postOrUpdateEmbed(discordClient, guildId, b, c);
                console.log(`[Betting] หมดเวลา — ปิดเดิมพัน "${b.title}" (${betId})`);
            }
        } catch (e) { console.error('[Betting] timer error:', e.message); }
    }, ms);
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /:guildId/create-bet
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/:guildId/create-bet', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const { guildId } = req.params;
    const discordClient = req.app.locals.discordClient;
    const b = req.body;

    try {
        let config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });

        const expiresAt = b.expiryMinutes && parseInt(b.expiryMinutes) > 0
            ? new Date(Date.now() + parseInt(b.expiryMinutes) * 60000)
            : null;

        config.bettings.push({
            isOpen:      b.isOpen === 'true',
            title:       (b.title  || 'เดิมพัน').trim(),
            description: (b.description || '').trim(),
            optionA:     (b.optionA || 'ฝ่าย A').trim(),
            optionB:     (b.optionB || 'ฝ่าย B').trim(),
            imageA:      (b.imageA || '').trim(),
            imageB:      (b.imageB || '').trim(),
            color:       b.color || '#5865F2',
            channelId:   b.channelId || '',
            minBet:      parseInt(b.minBet)  || 1,
            maxBet:      parseInt(b.maxBet)  || 0,
            expiresAt,
            poolA: 0, poolB: 0, bets: [], winner: ''
        });
        config.markModified('bettings');
        await config.save();

        const newBet = config.bettings[config.bettings.length - 1];
        if (newBet.channelId) await postOrUpdateEmbed(discordClient, guildId, newBet, config);
        if (expiresAt && newBet.isOpen) scheduleExpiry(discordClient, guildId, newBet);

        res.redirect(`/manage/${guildId}?tab=betting&success=true`);
    } catch (err) {
        console.error('[Betting] create-bet:', err);
        res.redirect(`/manage/${guildId}?tab=betting&error=failed`);
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /:guildId/toggle-bet/:betId
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/:guildId/toggle-bet/:betId', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const { guildId, betId } = req.params;
    const discordClient = req.app.locals.discordClient;
    try {
        const config = await GuildConfig.findOne({ guildId });
        if (!config) return res.redirect(`/manage/${guildId}?tab=betting`);
        const bet = findBet(config, betId);
        if (!bet) return res.redirect(`/manage/${guildId}?tab=betting`);

        bet.isOpen = !bet.isOpen;
        config.markModified('bettings');
        await config.save();
        await postOrUpdateEmbed(discordClient, guildId, bet, config);
        if (bet.isOpen && bet.expiresAt) scheduleExpiry(discordClient, guildId, bet);

        res.redirect(`/manage/${guildId}?tab=betting&success=true`);
    } catch (err) {
        console.error('[Betting] toggle-bet:', err);
        res.redirect(`/manage/${guildId}?tab=betting&error=failed`);
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /:guildId/settle-bet/:betId
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/:guildId/settle-bet/:betId', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const { guildId, betId } = req.params;
    const winner = req.body.winner; // 'A' | 'B'
    const discordClient = req.app.locals.discordClient;

    if (!['A', 'B'].includes(winner)) return res.redirect(`/manage/${guildId}?tab=betting`);

    try {
        const config = await GuildConfig.findOne({ guildId });
        if (!config) return res.redirect(`/manage/${guildId}?tab=betting`);
        const bet = findBet(config, betId);
        if (!bet) return res.redirect(`/manage/${guildId}?tab=betting`);

        const totalPool = (bet.poolA || 0) + (bet.poolB || 0);
        const winPool   = winner === 'A' ? bet.poolA : bet.poolB;

        for (const b of bet.bets) {
            if (b.option === winner && winPool > 0) {
                const payout = Math.floor((b.amount / winPool) * totalPool);
                await User.findOneAndUpdate(
                    { userId: b.userId, guildId },
                    { $inc: { coins: payout } }
                );
            }
        }

        bet.isOpen = false;
        bet.winner = winner;
        config.markModified('bettings');
        await config.save();

        await postOrUpdateEmbed(discordClient, guildId, bet, config);

        // ส่งข้อความประกาศผล
        if (discordClient && bet.channelId) {
            try {
                const guild   = await discordClient.guilds.fetch(guildId);
                const channel = await guild.channels.fetch(bet.channelId);
                const winName = winner === 'A' ? bet.optionA : bet.optionB;
                const announce = new EmbedBuilder()
                    .setTitle('🏆 ประกาศผลการเดิมพัน!')
                    .setDescription(
                        `**${bet.title}**\n\n🎉 ผู้ชนะคือ **${winName}**!\n` +
                        `💰 Pool รวม: **${totalPool.toLocaleString()}** ${config.currencyEmoji || '🪙'}`
                    )
                    .setColor(0xFEE75C)
                    .setTimestamp();
                await channel.send({ embeds: [announce] });
            } catch (e) { console.error('[Betting] announce error:', e.message); }
        }

        res.redirect(`/manage/${guildId}?tab=betting&settle_success=true`);
    } catch (err) {
        console.error('[Betting] settle-bet:', err);
        res.redirect(`/manage/${guildId}?tab=betting&error=failed`);
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET  /:guildId/delete-bet/:betId
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/:guildId/delete-bet/:betId', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const { guildId, betId } = req.params;
    try {
        const config = await GuildConfig.findOne({ guildId });
        if (config) {
            config.bettings = config.bettings.filter(b =>
                b.betId !== betId && b._id?.toString() !== betId
            );
            config.markModified('bettings');
            await config.save();
        }
        res.redirect(`/manage/${guildId}?tab=betting&delete_success=true`);
    } catch (err) {
        console.error('[Betting] delete-bet:', err);
        res.redirect(`/manage/${guildId}?tab=betting&error=failed`);
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /:guildId/repost-bet/:betId  — โพสต์ embed ใหม่ (ลบ messageId เดิม)
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/:guildId/repost-bet/:betId', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const { guildId, betId } = req.params;
    const discordClient = req.app.locals.discordClient;
    try {
        const config = await GuildConfig.findOne({ guildId });
        if (!config) return res.redirect(`/manage/${guildId}?tab=betting`);
        const bet = findBet(config, betId);
        if (!bet) return res.redirect(`/manage/${guildId}?tab=betting`);

        bet.messageId = '';
        config.markModified('bettings');
        await config.save();

        await postOrUpdateEmbed(discordClient, guildId, bet, config);
        res.redirect(`/manage/${guildId}?tab=betting&success=true`);
    } catch (err) {
        console.error('[Betting] repost-bet:', err);
        res.redirect(`/manage/${guildId}?tab=betting&error=failed`);
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET  /:guildId/football-matches  — แมตช์จากลีกที่ติดตาม (AJAX, สำหรับสร้างเดิมพัน)
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/:guildId/football-matches', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
    const { guildId } = req.params;
    try {
        const config  = await GuildConfig.findOne({ guildId });
        const leagues = config?.sportsNotifications?.footballLeagues?.length
            ? config.sportsNotifications.footballLeagues
            : ['PL'];

        const allMatches = [];
        await Promise.all(leagues.map(async league => {
            try {
                const m = await getMatches(league, 5);
                for (const match of m) {
                    match.leagueLogo = leagueLogoCache[league] || '';
                    allMatches.push(match);
                }
            } catch (_) {}
        }));

        allMatches.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
        res.json(allMatches.slice(0, 20));
    } catch (err) {
        console.error('[Betting] football-matches:', err.message);
        res.json([]);
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET  /:guildId/betting-channels  — API คืน text channels (AJAX)
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/:guildId/betting-channels', async (req, res) => {
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

module.exports = router;
module.exports.buildBetEmbed     = buildBetEmbed;
module.exports.buildBetButtons   = buildBetButtons;
module.exports.postOrUpdateEmbed = postOrUpdateEmbed;
