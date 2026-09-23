const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const GuildConfig = require('../models/GuildConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('withdraw')
        .setDescription('ถอนเงินออกจากธนาคาร')
        .addStringOption(o => o.setName('amount').setDescription('จำนวนเงิน หรือ "all"').setRequired(true)),
    async execute(interaction) {
        const { id: userId } = interaction.user;
        const { id: guildId } = interaction.guild;
        const raw = interaction.options.getString('amount');
        try {
            const config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
            let user = await User.findOne({ userId, guildId }) || new User({ userId, guildId, coins: config.startCoins, bank: config.startBank });
            const amount = raw.toLowerCase() === 'all' ? user.bank : parseInt(raw);
            if (isNaN(amount) || amount <= 0) return interaction.reply({ content: '❌ จำนวนไม่ถูกต้อง', ephemeral: true });
            if (user.bank < amount) return interaction.reply({ content: `❌ เงินในธนาคารไม่พอ (มี ${user.bank.toLocaleString()})`, ephemeral: true });
            user.bank  -= amount;
            user.coins += amount;
            await user.save();
            const e = new EmbedBuilder().setColor(0x5865F2).setTitle('🏧 ถอนเงินสำเร็จ')
                .addFields(
                    { name: 'ถอนออก', value: `**${amount.toLocaleString()}** ${config.currencyEmoji}`, inline: true },
                    { name: '👛 กระเป๋า', value: `${user.coins.toLocaleString()} ${config.currencyEmoji}`, inline: true },
                    { name: '🏦 ธนาคาร', value: `${user.bank.toLocaleString()} ${config.currencyEmoji}`, inline: true }
                ).setTimestamp();
            return interaction.reply({ embeds: [e] });
        } catch (err) { console.error(err); return interaction.reply({ content: 'เกิดข้อผิดพลาด', ephemeral: true }); }
    }
};
