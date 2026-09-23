const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const GuildConfig = require('../models/GuildConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('give')
        .setDescription('โอนเงินให้สมาชิกคนอื่น')
        .addUserOption(o => o.setName('target').setDescription('ผู้รับเงิน').setRequired(true))
        .addStringOption(o => o.setName('amount').setDescription('จำนวน หรือ "all"').setRequired(true)),
    async execute(interaction) {
        const { id: userId } = interaction.user;
        const { id: guildId } = interaction.guild;
        const target = interaction.options.getUser('target');
        const raw    = interaction.options.getString('amount');
        if (target.id === userId) return interaction.reply({ content: '❌ โอนให้ตัวเองไม่ได้', ephemeral: true });
        if (target.bot) return interaction.reply({ content: '❌ โอนให้บอทไม่ได้', ephemeral: true });
        try {
            const config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
            let sender   = await User.findOne({ userId, guildId }) || new User({ userId, guildId, coins: config.startCoins });
            let receiver = await User.findOne({ userId: target.id, guildId }) || new User({ userId: target.id, guildId, coins: config.startCoins });
            const amount = raw.toLowerCase() === 'all' ? sender.coins : parseInt(raw);
            if (isNaN(amount) || amount <= 0) return interaction.reply({ content: '❌ จำนวนไม่ถูกต้อง', ephemeral: true });
            if (sender.coins < amount) return interaction.reply({ content: `❌ เงินไม่พอ (มี ${sender.coins.toLocaleString()})`, ephemeral: true });
            sender.coins   -= amount;
            receiver.coins += amount;
            await Promise.all([sender.save(), receiver.save()]);
            const e = new EmbedBuilder().setColor(0xFEE75C).setTitle('💸 โอนเงินสำเร็จ')
                .setDescription(`**${interaction.user.username}** โอนเงินให้ **${target.username}**`)
                .addFields(
                    { name: 'จำนวนที่โอน', value: `**${amount.toLocaleString()}** ${config.currencyEmoji}`, inline: true },
                    { name: '👛 คงเหลือ', value: `${sender.coins.toLocaleString()} ${config.currencyEmoji}`, inline: true }
                ).setTimestamp();
            return interaction.reply({ embeds: [e] });
        } catch (err) { console.error(err); return interaction.reply({ content: 'เกิดข้อผิดพลาด', ephemeral: true }); }
    }
};
