const { SlashCommandBuilder } = require('discord.js');
const User = require('../models/User');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slots')
        .setDescription('เดิมพันสล็อตแมชชีน 🎰')
        .addIntegerOption(option => 
            option.setName('bet')
                .setDescription('จำนวนเงินที่ต้องการลงเดิมพัน')
                .setRequired(true)),
    
    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const bet = interaction.options.getInteger('bet');

        if (bet <= 0) return interaction.reply({ content: '❌ กรุณาใส่จำนวนเงินเดิมพันที่มากกว่า 0', ephemeral: true });

        try {
            let userData = await User.findOne({ userId, guildId }) || new User({ userId, guildId });

            if (userData.coins < bet) {
                return interaction.reply({ content: `❌ คุณมีเงินในกระเป๋าไม่พอ! (คุณมีอยู่ ${userData.coins} เหรียญ)`, ephemeral: true });
            }

            const emojis = ['🍎', '💎', '👑', '🍀', '🍒'];
            // สุ่มวงล้อ 3 ช่อง
            const slot1 = emojis[Math.floor(Math.random() * emojis.length)];
            const slot2 = emojis[Math.floor(Math.random() * emojis.length)];
            const slot3 = emojis[Math.floor(Math.random() * emojis.length)];

            let resultMessage = '';
            let winAmount = 0;

            userData.coins -= bet;
            if (slot1 === slot2 && slot2 === slot3) {
                // ซ้ำกัน 3 ตัว (Jackpot! คืน 5 เท่า)
                winAmount = bet * 5;
                userData.coins += winAmount;
                resultMessage = `🎉 **JACKPOT!!** คุณชนะได้รับเงินคูณ 5 เท่า! ได้รับ **${winAmount}** เหรียญ!`;
            } else if (slot1 === slot2 || slot2 === slot3 || slot1 === slot3) {
                // ซ้ำกัน 2 ตัว (คืน 2 เท่า)
                winAmount = bet * 2;
                userData.coins += winAmount;
                resultMessage = `✨ **ยินดีด้วย!** รูปซ้ำกัน 2 ช่อง ได้รับเงินคูณ 2 เท่า! ได้รับ **${winAmount}** เหรียญ!`;
            } else {
                // ไม่ซ้ำเลย (เสียเงิน)
                resultMessage = `💸 **เสียใจด้วยคุณกินเรียบ!** คุณสูญเสียเงินเดิมพันไป **${bet}** เหรียญ`;
            }

            await userData.save();

            return interaction.reply({
                content: `🎰 **[ ${slot1} | ${slot2} | ${slot3} ]** 🎰\n\n${resultMessage}\n(ยอดเงินคงเหลือ: ${userData.coins} เหรียญ)`
            });

        } catch (error) {
            console.error(error);
            return interaction.reply({ content: 'เกิดข้อผิดพลาดในระบบคาสิโน', ephemeral: true });
        }
    }
};