const { SlashCommandBuilder } = require('discord.js');
const User = require('../models/User');
const GuildConfig = require('../models/GuildConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('ทำงานเพื่อรับเงินสะสมตามเรทของเซิร์ฟเวอร์'),

    async execute(interaction) {
        const userId  = interaction.user.id;
        const guildId = interaction.guild.id;

        try {
            let config = await GuildConfig.findOne({ guildId });
            if (!config) {
                config = new GuildConfig({ guildId });
                await config.save();
            }

            // ─── คำนวณ cooldown เป็น ms ───────────────────────────
            const cooldownMS = (
                ((config.cooldownDays    || 0) * 24 * 60 * 60) +
                ((config.cooldownHours   || 0) * 60 * 60)      +
                ((config.cooldownMinutes || 0) * 60)           +
                 (config.cooldownSeconds || 0)
            ) * 1000;

            let userData = await User.findOne({ userId, guildId });
            if (!userData) {
                userData = new User({
                    userId, guildId,
                    coins: config.startCoins || 0,
                    bank:  config.startBank  || 0
                });
            }

            // ─── เช็ค cooldown จาก lastWork ───────────────────────
            const now      = Date.now();
            const lastWork = userData.lastWork ? new Date(userData.lastWork).getTime() : 0;
            const elapsed  = now - lastWork;

            if (cooldownMS > 0 && elapsed < cooldownMS) {
                const timeLeft = cooldownMS - elapsed;
                const d = Math.floor(timeLeft / 86400000);
                const h = Math.floor((timeLeft % 86400000) / 3600000);
                const m = Math.floor((timeLeft % 3600000)  / 60000);
                const s = Math.floor((timeLeft % 60000)    / 1000);

                let timeString = '';
                if (d > 0) timeString += `${d} วัน `;
                if (h > 0) timeString += `${h} ชั่วโมง `;
                if (m > 0) timeString += `${m} นาที `;
                timeString += `${s} วินาที`;

                const msg = (config.msgWorkCooldown || '❌ คุณเหนื่อยเกินไปแล้ว! กรุณารออีก **{time}**')
                    .replace('{time}', timeString);
                return interaction.reply({ content: msg, ephemeral: true });
            }

            // ─── คำนวณเงินที่ได้ ──────────────────────────────────
            const minGain = config.minWorkGain || 50;
            const maxGain = config.maxWorkGain || 200;
            const amountEarned = Math.floor(Math.random() * (maxGain - minGain + 1)) + minGain;

            userData.coins   += amountEarned;
            userData.lastWork = new Date(now);
            await userData.save();

            // ─── สุ่มข้อความตอบกลับ ───────────────────────────────
            const situations = (config.workSituations && config.workSituations.length > 0)
                ? config.workSituations
                : ['💼 **{user}** ทำงานหนักและได้รับ **{amount}** {emoji}!'];

            const randomMsg = situations[Math.floor(Math.random() * situations.length)];
            const reply = randomMsg
                .replace(/{amount}/g, amountEarned.toLocaleString())
                .replace(/{emoji}/g,  config.currencyEmoji || '💰')
                .replace(/{user}/g,   interaction.user.username);

            return interaction.reply({ content: reply });

        } catch (error) {
            console.error('[Work] error:', error);
            return interaction.reply({ content: 'เกิดข้อผิดพลาดในระบบ', ephemeral: true });
        }
    }
};
