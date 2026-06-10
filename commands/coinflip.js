const { SlashCommandBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('โยนเหรียญทายหัว-ก้อย 🪙')
        .addStringOption(option =>
            option.setName('side')
                .setDescription('ทายหน้าเหรียญ')
                .setRequired(true)
                .addChoices(
                    { name: '🪙 หัว (Heads)', value: 'heads' },
                    { name: '🪙 ก้อย (Tails)', value: 'tails' }
                ))
        .addIntegerOption(option =>
            option.setName('bet')
                .setDescription('จำนวนเงินเดิมพัน')
                .setRequired(true)),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const playerSide = interaction.options.getString('side');
        const bet = interaction.options.getInteger('bet');

        if (bet <= 0) return interaction.reply({ content: '❌ เงินเดิมพันต้องมากกว่า 0 นะ', ephemeral: true });

        try {
            let userData = await User.findOne({ userId, guildId }) || new User({ userId, guildId });
            if (userData.coins < bet) return interaction.reply({ content: '❌ คุณมีเงินไม่พอลงเดิมพัน!', ephemeral: true });

            const flipResult = Math.random() > 0.5 ? 'heads' : 'tails';
            const sideThai = flipResult === 'heads' ? 'หัว' : 'ก้อย';

            if (playerSide === flipResult) {
                userData.coins += bet;
                await userData.save();
                return interaction.reply({
                    content: `🪙 ผลการดีดเหรียญออกมาเป็น: **[ ${sideThai} ]**\n\n🎉 **ตาดีได้ตาดีเด่น!** คุณทายถูก รับไปเลย **${bet}** เหรียญ! (คงเหลือ: ${userData.coins})`
                });
            } else {
                userData.coins -= bet;
                await userData.save();
                return interaction.reply({
                    content: `🪙 ผลการดีดเหรียญออกมาเป็น: **[ ${sideThai} ]**\n\n💸 **ดวงตกซะงั้น!** คุณทายผิด เสียไป **${bet}** เหรียญ (คงเหลือ: ${userData.coins})`
                });
            }
        } catch (error) {
            console.error(error);
            return interaction.reply({ content: 'เกิดข้อผิดพลาดในระบบ', ephemeral: true });
        }
    }
};