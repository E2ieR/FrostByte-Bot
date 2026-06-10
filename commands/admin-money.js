const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const User = require('../models/User');
const GuildConfig = require('../models/GuildConfig');

// ─── /add-money ────────────────────────────────────────────────────────────
const addMoney = {
    data: new SlashCommandBuilder()
        .setName('add-money')
        .setDescription('[Admin] เพิ่มเงินให้สมาชิก')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addUserOption(o => o.setName('target').setDescription('สมาชิก').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('จำนวน').setRequired(true).setMinValue(1))
        .addStringOption(o => o.setName('wallet').setDescription('กระเป๋าไหน?').addChoices(
            { name: '👛 กระเป๋า (Cash)', value: 'cash' },
            { name: '🏦 ธนาคาร (Bank)', value: 'bank' }
        )),
    async execute(interaction) {
        const target = interaction.options.getUser('target');
        const amount = interaction.options.getInteger('amount');
        const wallet = interaction.options.getString('wallet') || 'cash';
        const { id: guildId } = interaction.guild;
        try {
            const config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
            let user = await User.findOne({ userId: target.id, guildId }) || new User({ userId: target.id, guildId });
            if (wallet === 'bank') user.bank += amount; else user.coins += amount;
            await user.save();
            const e = new EmbedBuilder().setColor(0x57F287).setTitle('✅ เพิ่มเงินสำเร็จ')
                .setDescription(`เพิ่ม **${amount.toLocaleString()}** ${config.currencyEmoji} ให้ **${target.username}** (${wallet === 'bank' ? '🏦 ธนาคาร' : '👛 กระเป๋า'})`)
                .setTimestamp();
            return interaction.reply({ embeds: [e] });
        } catch (err) { console.error(err); return interaction.reply({ content: 'เกิดข้อผิดพลาด', ephemeral: true }); }
    }
};

// ─── /remove-money ─────────────────────────────────────────────────────────
const removeMoney = {
    data: new SlashCommandBuilder()
        .setName('remove-money')
        .setDescription('[Admin] ลดเงินจากสมาชิก')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addUserOption(o => o.setName('target').setDescription('สมาชิก').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('จำนวน').setRequired(true).setMinValue(1))
        .addStringOption(o => o.setName('wallet').setDescription('กระเป๋าไหน?').addChoices(
            { name: '👛 กระเป๋า (Cash)', value: 'cash' },
            { name: '🏦 ธนาคาร (Bank)', value: 'bank' }
        )),
    async execute(interaction) {
        const target = interaction.options.getUser('target');
        const amount = interaction.options.getInteger('amount');
        const wallet = interaction.options.getString('wallet') || 'cash';
        const { id: guildId } = interaction.guild;
        try {
            const config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
            let user = await User.findOne({ userId: target.id, guildId }) || new User({ userId: target.id, guildId });
            if (wallet === 'bank') user.bank = Math.max(0, user.bank - amount);
            else user.coins = Math.max(0, user.coins - amount);
            await user.save();
            const e = new EmbedBuilder().setColor(0xED4245).setTitle('✅ ลดเงินสำเร็จ')
                .setDescription(`ลด **${amount.toLocaleString()}** ${config.currencyEmoji} จาก **${target.username}**`)
                .setTimestamp();
            return interaction.reply({ embeds: [e] });
        } catch (err) { console.error(err); return interaction.reply({ content: 'เกิดข้อผิดพลาด', ephemeral: true }); }
    }
};

// ─── /reset-money ──────────────────────────────────────────────────────────
const resetMoney = {
    data: new SlashCommandBuilder()
        .setName('reset-money')
        .setDescription('[Admin] รีเซ็ตเงินของสมาชิก')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addUserOption(o => o.setName('target').setDescription('สมาชิก (ว่าง = รีเซ็ตตัวเอง)')),
    async execute(interaction) {
        const target = interaction.options.getUser('target') || interaction.user;
        const { id: guildId } = interaction.guild;
        try {
            await User.findOneAndUpdate({ userId: target.id, guildId }, { coins: 0, bank: 0 });
            return interaction.reply({ content: `✅ รีเซ็ตเงินของ **${target.username}** เรียบร้อย`, ephemeral: true });
        } catch (err) { console.error(err); return interaction.reply({ content: 'เกิดข้อผิดพลาด', ephemeral: true }); }
    }
};

module.exports = [addMoney, removeMoney, resetMoney];
