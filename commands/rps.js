const { SlashCommandBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rps')
        .setDescription('เป่ายิ้งฉุบเดิมพันเงิน ✊✌️✋')
        .addStringOption(option =>
            option.setName('choice')
                .setDescription('เลือกสิ่งที่จะออก')
                .setRequired(true)
                .addChoices(
                    { name: '✊ ค้อน (Rock)', value: 'rock' },
                    { name: '✌️ กรรไกร (Scissors)', value: 'scissors' },
                    { name: '✋ กระดาษ (Paper)', value: 'paper' }
                ))
        .addIntegerOption(option =>
            option.setName('bet')
                .setDescription('จำนวนเงินเดิมพัน')
                .setRequired(true)),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const playerChoice = interaction.options.getString('choice');
        const bet = interaction.options.getInteger('bet');

        if (bet <= 0) return interaction.reply({ content: '❌ เงินเดิมพันต้องมากกว่า 0 นะ', ephemeral: true });

        try {
            let userData = await User.findOne({ userId, guildId }) || new User({ userId, guildId });
            if (userData.coins < bet) return interaction.reply({ content: '❌ คุณมีเงินไม่พอลงเดิมพัน!', ephemeral: true });

            const botChoices = ['rock', 'scissors', 'paper'];
            const botChoice = botChoices[Math.floor(Math.random() * botChoices.length)];

            const emojiMap = { rock: '✊ ค้อน', scissors: '✌️ กรรไกร', paper: '✋ กระดาษ' };
            let result = '';

            if (playerChoice === botChoice) {
                result = 'tie';
            } else if (
                (playerChoice === 'rock' && botChoice === 'scissors') ||
                (playerChoice === 'scissors' && botChoice === 'paper') ||
                (playerChoice === 'paper' && botChoice === 'rock')
            ) {
                result = 'win';
            } else {
                result = 'lose';
            }

            if (result === 'win') {
                userData.coins += bet;
                await userData.save();
                return interaction.reply({
                    content: `🧒 คุณออก: **${emojiMap[playerChoice]}**\n🤖 บอทออก: **${emojiMap[botChoice]}**\n\n🎉 **คุณชนะ!** ได้รับเงินรางวัล **${bet}** เหรียญ! (คงเหลือ: ${userData.coins})`
                });
            } else if (result === 'lose') {
                userData.coins -= bet;
                await userData.save();
                return interaction.reply({
                    content: `🧒 คุณออก: **${emojiMap[playerChoice]}**\n🤖 บอทออก: **${emojiMap[botChoice]}**\n\n💸 **คุณแพ้!** เสียเงินเดิมพัน **${bet}** เหรียญ (คงเหลือ: ${userData.coins})`
                });
            } else {
                return interaction.reply({
                    content: `🧒 คุณออก: **${emojiMap[playerChoice]}**\n🤖 บอทออก: **${emojiMap[botChoice]}**\n\n🤝 **เสมอขูดรีด!** คุณได้รับเงินเดิมพันคืนทั้งหมด (คงเหลือ: ${userData.coins})`
                });
            }
        } catch (error) {
            console.error(error);
            return interaction.reply({ content: 'เกิดข้อผิดพลาดในระบบ', ephemeral: true });
        }
    }
};