// dashboard/handlers/bettingInteraction.js
// ─── รับ button/modal interaction จากปุ่มเดิมพันใน Discord ──────────────────

const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require('discord.js');

const GuildConfig = require('../../models/GuildConfig');
const User        = require('../../models/User');

const { buildBetEmbed, buildBetButtons } = require('../routes/betting');

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
async function handleBettingInteraction(interaction) {
    const { customId, guildId, user } = interaction;

    // ── กดปุ่ม bet_A_{betId} / bet_B_{betId} → เปิด Modal ──
    if (customId.startsWith('bet_A_') || customId.startsWith('bet_B_')) {
        const parts  = customId.split('_');
        const option = parts[1]; // 'A' or 'B'
        const betId  = parts[2];

        const config = await GuildConfig.findOne({ guildId });
        const bet    = config?.bettings?.find(b => b.betId === betId || b._id?.toString() === betId);

        if (!bet || !bet.isOpen) {
            return interaction.reply({ content: '❌ การเดิมพันนี้ปิดรับแล้ว', ephemeral: true });
        }

        // เช็คเดิมพันซ้ำ
        const already = bet.bets.find(b => b.userId === user.id);
        if (already) {
            const sideName = already.option === 'A' ? bet.optionA : bet.optionB;
            return interaction.reply({
                content: `❌ คุณได้เดิมพัน **${sideName}** ไปแล้ว จำนวน **${already.amount.toLocaleString()}** ${config.currencyEmoji || '🪙'}`,
                ephemeral: true
            });
        }

        const sideName = option === 'A' ? bet.optionA : bet.optionB;
        const minBet   = bet.minBet || 1;
        const maxBet   = bet.maxBet || 0;
        const limitLabel = maxBet > 0
            ? `${minBet.toLocaleString()} – ${maxBet.toLocaleString()} ${config.currencyEmoji || '🪙'}`
            : `ขั้นต่ำ ${minBet.toLocaleString()} ${config.currencyEmoji || '🪙'}`;

        const modal = new ModalBuilder()
            .setCustomId(`bet_modal_${option}_${betId}`)
            .setTitle(`🎲 เดิมพัน — ${sideName}`);

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('bet_amount')
                    .setLabel(`จำนวนเหรียญ (${limitLabel})`)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('เช่น 500')
                    .setMinLength(1)
                    .setMaxLength(12)
                    .setRequired(true)
            )
        );
        return interaction.showModal(modal);
    }

    // ── Modal submit: bet_modal_{option}_{betId} ──
    if (customId.startsWith('bet_modal_')) {
        const parts  = customId.split('_');
        // parts: ['bet', 'modal', option, betId]
        const option = parts[2]; // 'A' or 'B'
        const betId  = parts[3];

        const amountRaw = interaction.fields.getTextInputValue('bet_amount');
        const amount    = parseInt(amountRaw);

        if (isNaN(amount) || amount <= 0) {
            return interaction.reply({ content: '❌ กรุณากรอกจำนวนเป็นตัวเลขที่มากกว่า 0', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const config = await GuildConfig.findOne({ guildId });
            const bet    = config?.bettings?.find(b => b.betId === betId || b._id?.toString() === betId);

            if (!bet || !bet.isOpen) {
                return interaction.editReply({ content: '❌ การเดิมพันนี้ปิดรับแล้ว' });
            }

            // เช็คซ้ำ (อีกครั้งหลัง defer)
            const already = bet.bets.find(b => b.userId === user.id);
            if (already) {
                return interaction.editReply({ content: '❌ คุณได้เดิมพันไปแล้ว' });
            }

            const minBet = bet.minBet || 1;
            const maxBet = bet.maxBet || 0;
            if (amount < minBet) {
                return interaction.editReply({ content: `❌ เดิมพันขั้นต่ำ **${minBet.toLocaleString()}** ${config.currencyEmoji || '🪙'}` });
            }
            if (maxBet > 0 && amount > maxBet) {
                return interaction.editReply({ content: `❌ เดิมพันสูงสุด **${maxBet.toLocaleString()}** ${config.currencyEmoji || '🪙'}` });
            }

            // เช็ค wallet
            const userData = await User.findOne({ userId: user.id, guildId });
            if (!userData) {
                return interaction.editReply({ content: '❌ ยังไม่มีบัญชีในระบบ ลองใช้คำสั่งในเซิร์ฟก่อน' });
            }
            const balance = userData.coins || 0;
            if (balance < amount) {
                return interaction.editReply({
                    content: `❌ เงินไม่พอ! มี **${balance.toLocaleString()}** ${config.currencyEmoji || '🪙'} ต้องการ **${amount.toLocaleString()}**`
                });
            }

            // หักเงิน + บันทึก
            await User.findOneAndUpdate(
                { userId: user.id, guildId },
                { $inc: { coins: -amount } }
            );

            bet.bets.push({ userId: user.id, username: user.username, option, amount });
            if (option === 'A') bet.poolA = (bet.poolA || 0) + amount;
            else               bet.poolB = (bet.poolB || 0) + amount;
            config.markModified('bettings');
            await config.save();

            // อัพเดต embed
            try {
                const guild   = await interaction.client.guilds.fetch(guildId);
                const channel = await guild.channels.fetch(bet.channelId);
                if (channel && bet.messageId) {
                    const msg = await channel.messages.fetch(bet.messageId);
                    await msg.edit({
                        embeds:     [buildBetEmbed(bet, config.currencyEmoji || '🪙')],
                        components: [buildBetButtons(bet)]
                    });
                }
            } catch (e) {
                console.error('[Betting] update embed:', e.message);
            }

            const sideName  = option === 'A' ? bet.optionA : bet.optionB;
            const myPool    = option === 'A' ? bet.poolA : bet.poolB;
            const totalPool = bet.poolA + bet.poolB;
            const odds      = myPool > 0 ? (totalPool / myPool).toFixed(2) : '—';
            const estPayout = myPool > 0 ? Math.floor(amount * parseFloat(odds)) : amount;
            const newBal    = balance - amount;

            return interaction.editReply({
                content: [
                    `✅ เดิมพัน **${sideName}** สำเร็จ!`,
                    `💰 จำนวน: **${amount.toLocaleString()}** ${config.currencyEmoji || '🪙'}`,
                    `📊 Odds ปัจจุบัน: **${odds}x** (ถ้าชนะได้รับประมาณ **${estPayout.toLocaleString()}**)`,
                    `👛 เงินคงเหลือ: **${newBal.toLocaleString()}** ${config.currencyEmoji || '🪙'}`
                ].join('\n')
            });

        } catch (err) {
            console.error('[Betting] modal submit error:', err);
            return interaction.editReply({ content: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่' });
        }
    }
}

module.exports = { handleBettingInteraction };
