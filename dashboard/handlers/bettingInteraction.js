// dashboard/handlers/bettingInteraction.js
// ─── รับ button interaction จากปุ่มเดิมพันใน Discord ───────────────────────

const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder
} = require('discord.js');

const GuildConfig = require('../../models/GuildConfig');

const User = require('../../models/User');
const WALLET_FIELD = 'coins';

// ─── rebuild embed (copy จาก betting.js) ──────────────────────────────────
function buildBetEmbed(bet, currencyEmoji) {
    const totalPool = (bet.poolA || 0) + (bet.poolB || 0);
    const pctA = totalPool > 0 ? ((bet.poolA / totalPool) * 100).toFixed(1) : '50.0';
    const pctB = totalPool > 0 ? ((bet.poolB / totalPool) * 100).toFixed(1) : '50.0';
    const oddsA = bet.poolA > 0 ? (totalPool / bet.poolA).toFixed(2) : '—';
    const oddsB = bet.poolB > 0 ? (totalPool / bet.poolB).toFixed(2) : '—';

    const barTotal = 20;
    const filledA  = Math.round((parseFloat(pctA) / 100) * barTotal);
    const bar      = '█'.repeat(filledA) + '░'.repeat(barTotal - filledA);

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

    if (bet.imageA) embed.setThumbnail(bet.imageA);

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

function buildBetButtons(bet, disabled = false) {
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────
async function handleBettingInteraction(interaction) {
    const { customId, guildId, user } = interaction;

    // ── กดปุ่มเดิมพัน → เปิด Modal ให้กรอกจำนวน ──
    if (customId.startsWith('bet_A_') || customId.startsWith('bet_B_')) {
        const option = customId.startsWith('bet_A_') ? 'A' : 'B';

        // เช็คว่า betting เปิดอยู่ไหม
        const config = await GuildConfig.findOne({ guildId });
        if (!config || !config.betting || !config.betting.isOpen) {
            return interaction.reply({ content: '❌ การเดิมพันปิดรับแล้ว', ephemeral: true });
        }

        // เช็คว่าเดิมพันซ้ำไหม
        const already = config.betting.bets.find(b => b.userId === user.id);
        if (already) {
            return interaction.reply({
                content: `❌ คุณได้เดิมพัน **${already.option === 'A' ? config.betting.optionA : config.betting.optionB}** ไปแล้ว จำนวน **${already.amount.toLocaleString()}** ${config.currencyEmoji || '🪙'}`,
                ephemeral: true
            });
        }

        const sideName = option === 'A' ? config.betting.optionA : config.betting.optionB;
        const minBet   = config.betting.minBet || 1;

        const modal = new ModalBuilder()
            .setCustomId(`bet_modal_${option}`)
            .setTitle(`🎲 เดิมพัน — ${sideName}`);

        const amountInput = new TextInputBuilder()
            .setCustomId('bet_amount')
            .setLabel(`จำนวนเหรียญ (ขั้นต่ำ ${minBet.toLocaleString()} ${config.currencyEmoji || '🪙'})`)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(`เช่น 500`)
            .setMinLength(1)
            .setMaxLength(10)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
        return interaction.showModal(modal);
    }

    // ── กรอก Modal เสร็จ → หักเงิน + บันทึก ──
    if (customId.startsWith('bet_modal_')) {
        const option = customId === 'bet_modal_A' ? 'A' : 'B';
        const amount = parseInt(interaction.fields.getTextInputValue('bet_amount'));

        if (isNaN(amount) || amount <= 0) {
            return interaction.reply({ content: '❌ กรุณากรอกจำนวนเป็นตัวเลขที่มากกว่า 0', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const config = await GuildConfig.findOne({ guildId });

            if (!config || !config.betting || !config.betting.isOpen) {
                return interaction.editReply({ content: '❌ การเดิมพันปิดรับแล้ว' });
            }

            const minBet = config.betting.minBet || 1;
            if (amount < minBet) {
                return interaction.editReply({ content: `❌ เดิมพันขั้นต่ำ **${minBet.toLocaleString()}** ${config.currencyEmoji || '🪙'}` });
            }

            // ── ดึง User และเช็ค wallet ──
            let userData = await User.findOne({ userId: user.id, guildId });
            if (!userData) {
                return interaction.editReply({ content: '❌ ยังไม่มีบัญชีในระบบ ลองใช้คำสั่งในเซิร์ฟก่อนครับ' });
            }

            const currentWallet = userData[WALLET_FIELD] || 0;
            if (currentWallet < amount) {
                return interaction.editReply({
                    content: `❌ เงินไม่พอ! คุณมี **${currentWallet.toLocaleString()}** ${config.currencyEmoji || '🪙'} แต่ต้องการ **${amount.toLocaleString()}**`
                });
            }

            // ── หักเงิน ──
            await User.findOneAndUpdate(
                { userId: user.id, guildId },
                { $inc: { [WALLET_FIELD]: -amount } }
            );

            // ── บันทึกการเดิมพัน ──
            config.betting.bets.push({
                userId:   user.id,
                username: user.username,
                option,
                amount
            });

            if (option === 'A') config.betting.poolA += amount;
            else               config.betting.poolB += amount;

            config.markModified('betting');
            await config.save();

            // ── อัพเดต embed ใน channel ──
            try {
                const guild   = await interaction.client.guilds.fetch(guildId);
                const channel = await guild.channels.fetch(config.betting.channelId);
                if (channel && config.betting.messageId) {
                    const msg = await channel.messages.fetch(config.betting.messageId);
                    await msg.edit({
                        embeds: [buildBetEmbed(config.betting, config.currencyEmoji || '🪙')],
                        components: [buildBetButtons(config.betting, false)]
                    });
                }
            } catch (e) {
                console.error('[Betting] update embed error:', e.message);
            }

            const sideName = option === 'A' ? config.betting.optionA : config.betting.optionB;
            const newBalance = currentWallet - amount;
            const totalPool  = config.betting.poolA + config.betting.poolB;
            const myPool     = option === 'A' ? config.betting.poolA : config.betting.poolB;
            const odds       = myPool > 0 ? (totalPool / myPool).toFixed(2) : '—';

            return interaction.editReply({
                content: [
                    `✅ เดิมพัน **${sideName}** สำเร็จ!`,
                    `💰 จำนวน: **${amount.toLocaleString()}** ${config.currencyEmoji || '🪙'}`,
                    `📊 Odds ปัจจุบัน: **${odds}x** (ถ้าชนะได้รับประมาณ ${Math.floor(amount * parseFloat(odds)).toLocaleString()})`,
                    `👛 เงินคงเหลือ: **${newBalance.toLocaleString()}** ${config.currencyEmoji || '🪙'}`
                ].join('\n')
            });

        } catch (err) {
            console.error('[Betting] modal submit error:', err);
            return interaction.editReply({ content: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่' });
        }
    }
}

module.exports = { handleBettingInteraction };