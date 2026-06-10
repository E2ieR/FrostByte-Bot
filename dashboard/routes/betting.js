const express = require('express');
const router = express.Router();
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const GuildConfig = require('../../models/GuildConfig');

// ─── helper: สร้าง embed การเดิมพัน ───────────────────────────────────────
function buildBetEmbed(bet, currencyEmoji) {
    const totalPool = (bet.poolA || 0) + (bet.poolB || 0);
    const pctA = totalPool > 0 ? ((bet.poolA / totalPool) * 100).toFixed(1) : '50.0';
    const pctB = totalPool > 0 ? ((bet.poolB / totalPool) * 100).toFixed(1) : '50.0';
    const oddsA = bet.poolB > 0 ? ((totalPool / bet.poolA) || 0).toFixed(2) : '—';
    const oddsB = bet.poolA > 0 ? ((totalPool / bet.poolB) || 0).toFixed(2) : '—';

    const barTotal = 20;
    const filledA = Math.round((parseFloat(pctA) / 100) * barTotal);
    const bar = '█'.repeat(filledA) + '░'.repeat(barTotal - filledA);

    const embed = new EmbedBuilder()
        .setTitle(`🎲 ${bet.title}`)
        .setColor(bet.isOpen ? 0x5865F2 : 0x4f545c)
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

    if (bet.imageA && !bet.imageB) embed.setThumbnail(bet.imageA);
    if (bet.imageB && !bet.imageA) embed.setThumbnail(bet.imageB);

    if (bet.expiresAt) {
        const ts = Math.floor(new Date(bet.expiresAt).getTime() / 1000);
        embed.addFields({ name: '⏰ หมดเวลา', value: `<t:${ts}:R>`, inline: true });
    }

    if (!bet.isOpen && bet.winner) {
        const winName = bet.winner === 'A' ? bet.optionA : bet.optionB;
        embed.addFields({ name: '🏆 ผู้ชนะ', value: `**${winName}**`, inline: true });
        embed.setColor(0xFEE75C);
    }

    embed.setFooter({ text: bet.isOpen ? '✅ เปิดรับเดิมพัน — ใช้ปุ่มด้านล่าง' : '🔒 ปิดรับเดิมพันแล้ว' });
    embed.setTimestamp();
    return embed;
}

// ─── helper: สร้าง buttons เดิมพัน ────────────────────────────────────────
function buildBetButtons(bet, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`bet_A_${bet._id || 'main'}`)
            .setLabel(`🔵 ${bet.optionA}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`bet_B_${bet._id || 'main'}`)
            .setLabel(`🔴 ${bet.optionB}`)
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled)
    );
}

// ─── helper: โพสต์/อัพเดต embed ใน Discord ───────────────────────────────
async function postOrUpdateEmbed(discordClient, guildId, config) {
    if (!discordClient || !config.betting.channelId) return;
    const bet = config.betting;
    const embed = buildBetEmbed(bet, config.currencyEmoji || '🪙');
    const buttons = buildBetButtons(bet, !bet.isOpen);
    try {
        const guild   = await discordClient.guilds.fetch(guildId);
        const channel = await guild.channels.fetch(bet.channelId);
        if (!channel || !channel.isTextBased()) return;

        if (bet.messageId) {
            // พยายาม edit message เดิมก่อน
            try {
                const msg = await channel.messages.fetch(bet.messageId);
                await msg.edit({ embeds: [embed], components: [buttons] });
                return;
            } catch (_) { /* message ถูกลบไปแล้ว — โพสต์ใหม่ */ }
        }

        const msg = await channel.send({ embeds: [embed], components: [buttons] });
        config.betting.messageId = msg.id;
        config.markModified('betting');
        await config.save();
    } catch (err) {
        console.error('[Betting] postOrUpdateEmbed error:', err.message);
    }
}

// ─── helper: ดึง channels ใน guild ─────────────────────────────────────────
async function getTextChannels(discordClient, guildId) {
    if (!discordClient) return [];
    try {
        const guild = await discordClient.guilds.fetch(guildId);
        await guild.channels.fetch();
        return guild.channels.cache
            .filter(c => c.isTextBased && c.isTextBased() && !c.isThread())
            .map(c => ({ id: c.id, name: c.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /:guildId/setup-bet  — ตั้งค่า/รีเซ็ตการเดิมพัน
// ═══════════════════════════════════════════════════════════════════════════
router.post('/:guildId/setup-bet', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const { guildId } = req.params;
    const discordClient = req.app.locals.discordClient;

    try {
        let config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });

        // คำนวณเวลาหมด
        let expiresAt = null;
        if (req.body.expiryMinutes && parseInt(req.body.expiryMinutes) > 0) {
            expiresAt = new Date(Date.now() + parseInt(req.body.expiryMinutes) * 60 * 1000);
        }

        config.betting = {
            isOpen:    req.body.isOpen === 'true',
            title:     req.body.title || 'การเดิมพัน',
            imageA:    req.body.imageA || '',
            imageB:    req.body.imageB || '',
            optionA:   req.body.optionA || 'ฝ่าย A',
            optionB:   req.body.optionB || 'ฝ่าย B',
            poolA:     0,
            poolB:     0,
            channelId: req.body.channelId || '',
            messageId: '',    // รีเซ็ต — จะโพสต์ใหม่
            expiresAt,
            winner:    '',
            bets:      []
        };
        config.markModified('betting');
        await config.save();

        // โพสต์ embed เข้า Discord
        await postOrUpdateEmbed(discordClient, guildId, config);

        // ตั้ง timer หมดเวลา (ถ้ากำหนด)
        if (expiresAt && req.body.isOpen === 'true') {
            const ms = expiresAt.getTime() - Date.now();
            setTimeout(async () => {
                try {
                    const c = await GuildConfig.findOne({ guildId });
                    if (c && c.betting && c.betting.isOpen) {
                        c.betting.isOpen = false;
                        c.markModified('betting');
                        await c.save();
                        await postOrUpdateEmbed(discordClient, guildId, c);
                        console.log(`[Betting] หมดเวลา — ปิดการเดิมพัน guild ${guildId}`);
                    }
                } catch (e) { console.error('[Betting] timer error:', e.message); }
            }, ms);
        }

        res.redirect(`/manage/${guildId}?tab=betting&success=true`);
    } catch (err) {
        console.error(err);
        res.redirect(`/manage/${guildId}?tab=betting&error=failed`);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /:guildId/toggle-bet  — เปิด/ปิดรับเดิมพัน
// ═══════════════════════════════════════════════════════════════════════════
router.post('/:guildId/toggle-bet', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const { guildId } = req.params;
    const discordClient = req.app.locals.discordClient;
    try {
        const config = await GuildConfig.findOne({ guildId });
        if (!config || !config.betting) return res.redirect(`/manage/${guildId}?tab=betting`);
        config.betting.isOpen = !config.betting.isOpen;
        config.markModified('betting');
        await config.save();
        await postOrUpdateEmbed(discordClient, guildId, config);
        res.redirect(`/manage/${guildId}?tab=betting&success=true`);
    } catch (err) {
        console.error(err);
        res.redirect(`/manage/${guildId}?tab=betting&error=failed`);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /:guildId/settle-bet  — ประกาศผล + แจกเงิน
// ═══════════════════════════════════════════════════════════════════════════
router.post('/:guildId/settle-bet', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const { guildId } = req.params;
    const { winner } = req.body; // 'A' | 'B'
    const discordClient = req.app.locals.discordClient;

    try {
        const config = await GuildConfig.findOne({ guildId });
        if (!config || !config.betting) return res.redirect(`/manage/${guildId}?tab=betting&error=no_bet`);

        const bet = config.betting;
        const totalPool = (bet.poolA || 0) + (bet.poolB || 0);
        const winPool   = winner === 'A' ? bet.poolA : bet.poolB;

        const User = require('../../models/User');
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
        config.markModified('betting');
        await config.save();

        // อัพเดต embed แสดงผลชนะ
        await postOrUpdateEmbed(discordClient, guildId, config);

        // ส่งข้อความประกาศผล
        if (discordClient && bet.channelId) {
            try {
                const guild   = await discordClient.guilds.fetch(guildId);
                const channel = await guild.channels.fetch(bet.channelId);
                const winName = winner === 'A' ? bet.optionA : bet.optionB;
                const announce = new EmbedBuilder()
                    .setTitle('🏆 ประกาศผลการเดิมพัน!')
                    .setDescription(`**${bet.title}**\n\n🎉 ผู้ชนะคือ **${winName}**!\n💰 Pool รวม: **${totalPool.toLocaleString()}** ${config.currencyEmoji || '🪙'}`)
                    .setColor(0xFEE75C)
                    .setTimestamp();
                await channel.send({ embeds: [announce] });
            } catch (e) { console.error('[Betting] announce error:', e.message); }
        }

        res.redirect(`/manage/${guildId}?tab=betting&settle_success=true`);
    } catch (err) {
        console.error(err);
        res.redirect(`/manage/${guildId}?tab=betting&error=failed`);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET  /:guildId/betting-channels  — API คืน list channels (AJAX)
// ═══════════════════════════════════════════════════════════════════════════
router.get('/:guildId/betting-channels', async (req, res) => {
    const discordClient = req.app.locals.discordClient;
    const channels = await getTextChannels(discordClient, req.params.guildId);
    res.json(channels);
});

module.exports = router;
