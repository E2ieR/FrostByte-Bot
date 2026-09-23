const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const GuildConfig = require('../models/GuildConfig');

const RED_NUMS   = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
const BLACK_NUMS = [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roulette')
        .setDescription('หมุนรูเล็ต 🎡')
        .addIntegerOption(o => o.setName('bet').setDescription('จำนวนเงินเดิมพัน').setRequired(true).setMinValue(1))
        .addStringOption(o => o.setName('choice').setDescription('เลือกประเภทการเดิมพัน').setRequired(true).addChoices(
            { name: '🔴 แดง (x2)', value: 'red' },
            { name: '⚫ ดำ (x2)', value: 'black' },
            { name: '🟢 เลข 0 (x35)', value: '0' },
            { name: '0️⃣ เลขคู่ (x2)', value: 'even' },
            { name: '1️⃣ เลขคี่ (x2)', value: 'odd' },
            { name: '⬇️ ต่ำ 1-18 (x2)', value: 'low' },
            { name: '⬆️ สูง 19-36 (x2)', value: 'high' },
        )),
    async execute(interaction) {
        const { id: userId } = interaction.user;
        const { id: guildId } = interaction.guild;
        const bet    = interaction.options.getInteger('bet');
        const choice = interaction.options.getString('choice');
        try {
            const config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
            let user = await User.findOne({ userId, guildId }) || new User({ userId, guildId });
            if (user.coins < bet) return interaction.reply({ content: `❌ เงินไม่พอ (มี ${user.coins.toLocaleString()})`, ephemeral: true });

            const spin   = Math.floor(Math.random() * 37); // 0-36
            const isRed  = RED_NUMS.includes(spin);
            const color  = spin === 0 ? '🟢' : isRed ? '🔴' : '⚫';

            let win = false, multiplier = 2;
            switch (choice) {
                case 'red':   win = isRed; break;
                case 'black': win = BLACK_NUMS.includes(spin); break;
                case '0':     win = spin === 0; multiplier = 35; break;
                case 'even':  win = spin !== 0 && spin % 2 === 0; break;
                case 'odd':   win = spin % 2 === 1; break;
                case 'low':   win = spin >= 1 && spin <= 18; break;
                case 'high':  win = spin >= 19; break;
            }

            const choiceLabel = { red:'แดง', black:'ดำ', '0':'เลข 0', even:'คู่', odd:'คี่', low:'1-18', high:'19-36' };
            let payout = 0;
            if (win) { payout = bet * (multiplier - 1); user.coins += payout; }
            else      { payout = -bet; user.coins -= bet; }
            await user.save();

            const e = new EmbedBuilder()
                .setColor(win ? 0x57F287 : 0xED4245)
                .setTitle('🎡 Roulette')
                .addFields(
                    { name: 'ลูกบอล', value: `${color} **${spin}**`, inline: true },
                    { name: 'คุณเลือก', value: choiceLabel[choice], inline: true },
                    { name: win ? '🎉 ชนะ!' : '💥 แพ้', value: `${win ? '+' : ''}${payout.toLocaleString()} ${config.currencyEmoji}`, inline: true },
                    { name: '👛 คงเหลือ', value: `${user.coins.toLocaleString()} ${config.currencyEmoji}`, inline: false }
                ).setTimestamp();
            return interaction.reply({ embeds: [e] });
        } catch (err) { console.error(err); return interaction.reply({ content: 'เกิดข้อผิดพลาด', ephemeral: true }); }
    }
};
