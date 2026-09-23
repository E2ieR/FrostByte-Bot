const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const GuildConfig = require('../models/GuildConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('อันดับผู้มีทรัพย์ประจำเซิร์ฟ')
        .addStringOption(o => o.setName('type').setDescription('ประเภท').addChoices(
            { name: '💰 รวม (Total)', value: 'total' },
            { name: '👛 กระเป๋า (Cash)', value: 'cash' },
            { name: '🏦 ธนาคาร (Bank)', value: 'bank' }
        )),
    async execute(interaction) {
        const { id: guildId } = interaction.guild;
        const type = interaction.options.getString('type') || 'total';
        await interaction.deferReply();
        try {
            const config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
            const users  = await User.find({ guildId });
            const sorted = users
                .map(u => ({ userId: u.userId, total: type === 'cash' ? u.coins : type === 'bank' ? u.bank : u.coins + u.bank }))
                .sort((a, b) => b.total - a.total)
                .slice(0, 10);

            const medals = ['🥇','🥈','🥉'];
            const lines  = await Promise.all(sorted.map(async (entry, i) => {
                let name = `User ${entry.userId}`;
                try { const m = await interaction.guild.members.fetch(entry.userId); name = m.displayName; } catch {}
                const medal = medals[i] || `**${i+1}.**`;
                return `${medal} ${name} — **${entry.total.toLocaleString()}** ${config.currencyEmoji}`;
            }));

            const typeLabel = type === 'cash' ? '👛 กระเป๋า' : type === 'bank' ? '🏦 ธนาคาร' : '💰 รวม';
            const e = new EmbedBuilder()
                .setColor(0xFEE75C)
                .setTitle(`🏆 Leaderboard — ${typeLabel}`)
                .setDescription(lines.join('\n') || 'ยังไม่มีข้อมูล')
                .setFooter({ text: interaction.guild.name })
                .setTimestamp();
            return interaction.editReply({ embeds: [e] });
        } catch (err) { console.error(err); return interaction.editReply({ content: 'เกิดข้อผิดพลาด' }); }
    }
};
