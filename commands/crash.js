const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');
const GuildConfig = require('../models/GuildConfig');

// เก็บ active crash sessions
const crashGames = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('crash')
        .setDescription('เกม Crash — กดถอนก่อนระเบิด! 🚀')
        .addIntegerOption(o => o.setName('bet').setDescription('จำนวนเงินเดิมพัน').setRequired(true).setMinValue(1)),

    async execute(interaction) {
        const { id: userId } = interaction.user;
        const { id: guildId } = interaction.guild;
        const bet = interaction.options.getInteger('bet');
        if (crashGames.has(`${userId}-${guildId}`)) return interaction.reply({ content: '❌ คุณมีเกมค้างอยู่', ephemeral: true });
        try {
            const config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
            let user = await User.findOne({ userId, guildId }) || new User({ userId, guildId });
            if (user.coins < bet) return interaction.reply({ content: `❌ เงินไม่พอ`, ephemeral: true });

            // สุ่ม crash point 1.0x–10x (weighted ต่ำกว่าโอกาสมากกว่า)
            const crashAt = parseFloat(Math.max(1.0, Math.pow(1 / (Math.random()), 0.6)).toFixed(2));
            let multiplier = 1.0;
            const key = `${userId}-${guildId}`;
            crashGames.set(key, { bet, crashAt, multiplier, userId, guildId });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`crash_cashout_${userId}`).setLabel('💰 ถอนเงิน').setStyle(ButtonStyle.Success)
            );

            const embed = () => new EmbedBuilder()
                .setColor(0x5865F2).setTitle('🚀 Crash!')
                .setDescription(`ตัวคูณปัจจุบัน: **${multiplier.toFixed(2)}x**\nเดิมพัน: **${bet.toLocaleString()}** ${config.currencyEmoji}\nถ้าถอนตอนนี้ได้: **${Math.floor(bet * multiplier).toLocaleString()}** ${config.currencyEmoji}`)
                .setFooter({ text: 'กด "ถอนเงิน" ก่อนจรวดระเบิด!' });

            const msg = await interaction.reply({ embeds: [embed()], components: [row], fetchReply: true });

            // อัพเดทตัวคูณทุก 1.5 วินาที
            const interval = setInterval(async () => {
                const game = crashGames.get(key);
                if (!game) { clearInterval(interval); return; }
                game.multiplier = parseFloat((game.multiplier + 0.1 + Math.random() * 0.15).toFixed(2));
                if (game.multiplier >= game.crashAt) {
                    clearInterval(interval);
                    crashGames.delete(key);
                    const user2 = await User.findOne({ userId, guildId });
                    user2.coins = Math.max(0, user2.coins - bet);
                    await user2.save();
                    const disabledRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('crash_done').setLabel('💥 ระเบิดแล้ว!').setStyle(ButtonStyle.Danger).setDisabled(true)
                    );
                    await msg.edit({
                        embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('💥 CRASH!')
                            .setDescription(`จรวดระเบิดที่ **${game.crashAt}x**!\nคุณเสียไป **${bet.toLocaleString()}** ${config.currencyEmoji}`)], components: [disabledRow]
                    });
                } else {
                    try { await msg.edit({ embeds: [embed()], components: [row] }); } catch { }
                }
            }, 1500);

        } catch (err) { console.error(err); return interaction.reply({ content: 'เกิดข้อผิดพลาด', ephemeral: true }); }
    },
    crashGames
};
