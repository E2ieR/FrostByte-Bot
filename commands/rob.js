const { SlashCommandBuilder } = require('discord.js');
const User = require('../models/User');
const GuildConfig = require('../models/GuildConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rob')
        .setDescription('ปล้นเงินในกระเป๋าของเพื่อน')
        .addUserOption(opt =>
            opt.setName('target')
               .setDescription('คนที่ต้องการปล้น')
               .setRequired(true)
        ),

    async execute(interaction) {
        const userId     = interaction.user.id;
        const guildId    = interaction.guild.id;
        const targetUser = interaction.options.getUser('target');

        if (targetUser.id === userId)
            return interaction.reply({ content: '❌ ปล้นตัวเองไม่ได้นะ!', ephemeral: true });
        if (targetUser.bot)
            return interaction.reply({ content: '❌ ปล้นบอทไม่ได้!', ephemeral: true });

        try {
            let config = await GuildConfig.findOne({ guildId });
            if (!config) config = new GuildConfig({ guildId });

            if (!config.robEnabled)
                return interaction.reply({ content: '❌ ระบบปล้นถูกปิดในเซิร์ฟนี้', ephemeral: true });

            const cooldownMS     = (config.robCooldownMin   || 30) * 60 * 1000;
            const successChance  =  config.robSuccessChance || 50;
            const minCoins       =  config.robMinCoins      || 50;
            const minPct         = (config.robMinPercent    || 20) / 100;
            const maxPct         = (config.robMaxPercent    || 50) / 100;
            const penalty        =  config.robPenalty       || 100;

            let userData   = await User.findOne({ userId, guildId })   || new User({ userId, guildId });
            let targetData = await User.findOne({ userId: targetUser.id, guildId }) || new User({ userId: targetUser.id, guildId });

            // ─── เช็ค cooldown ──────────────────────────────────────
            const now     = Date.now();
            const lastRob = userData.lastRob ? new Date(userData.lastRob).getTime() : 0;
            const elapsed = now - lastRob;

            if (elapsed < cooldownMS) {
                const left = Math.ceil((cooldownMS - elapsed) / 60000);
                return interaction.reply({
                    content: `❌ คุณเพิ่งก่อคดีมา! รออีก **${left} นาที** ตำรวจถึงจะเลิกตามจับ`,
                    ephemeral: true
                });
            }

            // ─── เช็คเงินเหยื่อ ─────────────────────────────────────
            if (targetData.coins <= minCoins) {
                return interaction.reply({
                    content: `❌ **${targetUser.username}** จนเกินไป ไม่มีเงินในกระเป๋าให้ปล้น!`,
                    ephemeral: true
                });
            }

            userData.lastRob = new Date(now);
            const success = Math.random() * 100 < successChance;

            if (success) {
                const pct    = Math.random() * (maxPct - minPct) + minPct;
                const stolen = Math.floor(targetData.coins * pct);
                userData.coins   += stolen;
                targetData.coins -= stolen;
                await Promise.all([userData.save(), targetData.save()]);

                return interaction.reply({
                    content: `🥷 **${interaction.user.username}** ย่องเบาสำเร็จ! ปล้น **${targetUser.username}** ได้ **${stolen.toLocaleString()}** ${config.currencyEmoji || '💰'}`
                });
            } else {
                const fine = Math.min(userData.coins, penalty);
                userData.coins -= fine;
                await userData.save();

                return interaction.reply({
                    content: `🚨 **${interaction.user.username}** ปล้นพลาด! โดนตำรวจจับ ถูกปรับ **${fine.toLocaleString()}** ${config.currencyEmoji || '💰'}`
                });
            }

        } catch (error) {
            console.error('[Rob] error:', error);
            return interaction.reply({ content: 'เกิดข้อผิดพลาดในระบบปล้น', ephemeral: true });
        }
    }
};
