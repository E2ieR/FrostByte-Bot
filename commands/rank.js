// commands/rank.js
// /rank — แสดง rank card (รูปภาพ) ของผู้ใช้
// /xpleaderboard — อันดับ EXP/Level ของเซิร์ฟ

const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const User        = require('../models/User');
const GuildConfig = require('../models/GuildConfig');
const { calcLevel, xpNeeded, generateRankCard } = require('../utils/rankCard');

// ─── /rank ────────────────────────────────────────────────────────────────
const rankCommand = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('ดู rank card และ level ของคุณหรือสมาชิกคนอื่น')
        .addUserOption(o => o.setName('member').setDescription('สมาชิกที่ต้องการดู').setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();

        const target  = interaction.options.getUser('member') || interaction.user;
        const guildId = interaction.guild.id;

        try {
            const config = await GuildConfig.findOne({ guildId });
            if (!config?.levelEnabled) {
                return interaction.editReply({ content: '❌ ระบบ Level ยังไม่ได้เปิดใช้งานในเซิร์ฟนี้', ephemeral: true });
            }

            let user = await User.findOne({ userId: target.id, guildId });
            if (!user) user = { xp: 0, level: 0 };

            const totalXp = user.xp || 0;
            const { level, currentLevelXp, neededForNext } = calcLevel(totalXp);

            // หา rank (อันดับในเซิร์ฟ)
            const allUsers = await User.find({ guildId }).sort({ xp: -1 }).lean();
            const rank = allUsers.findIndex(u => u.userId === target.id) + 1 || '—';

            // Avatar URL (512px)
            const avatarURL = target.displayAvatarURL({ extension: 'png', size: 256 });

            // สี accent จาก role สูงสุดของ member
            let accentColor = '#5865F2';
            try {
                const member = await interaction.guild.members.fetch(target.id);
                const topRole = member.roles.cache
                    .filter(r => r.color !== 0)
                    .sort((a, b) => b.position - a.position)
                    .first();
                if (topRole) accentColor = `#${topRole.color.toString(16).padStart(6, '0')}`;
            } catch {}

            // Generate rank card
            const buffer = await generateRankCard({
                username: target.displayName || target.username,
                avatarURL,
                xp: totalXp,
                level,
                rank,
                currentLevelXp,
                neededForNext,
                accentColor,
            });

            if (buffer) {
                const attachment = new AttachmentBuilder(buffer, { name: 'rank.png' });
                return interaction.editReply({ files: [attachment] });
            }

            // Fallback embed (ถ้า canvas ไม่ได้ติดตั้ง)
            const bar  = progressBar(currentLevelXp, neededForNext, 12);
            const pct  = neededForNext > 0 ? Math.round((currentLevelXp / neededForNext) * 100) : 0;
            const e = new EmbedBuilder()
                .setColor(accentColor)
                .setAuthor({ name: target.displayName || target.username, iconURL: avatarURL })
                .setThumbnail(avatarURL)
                .addFields(
                    { name: '🎖️ Level', value: `**${level}**`, inline: true },
                    { name: '🏆 Rank', value: `**#${rank}**`, inline: true },
                    { name: '✨ Total XP', value: `**${totalXp.toLocaleString()}**`, inline: true },
                    { name: `📊 Progress (${pct}%)`, value: `${bar}\n${currentLevelXp.toLocaleString()} / ${neededForNext.toLocaleString()} XP` }
                )
                .setFooter({ text: `🎯 ต้องการอีก ${(neededForNext - currentLevelXp).toLocaleString()} XP เพื่อ Level ${level + 1}` });
            return interaction.editReply({ embeds: [e] });

        } catch (err) {
            console.error('[Rank]', err);
            return interaction.editReply({ content: '❌ เกิดข้อผิดพลาด' });
        }
    }
};

// ─── /xpleaderboard ───────────────────────────────────────────────────────
const xpLeaderboardCommand = {
    data: new SlashCommandBuilder()
        .setName('xpleaderboard')
        .setDescription('อันดับ Level/EXP ของสมาชิกในเซิร์ฟ'),

    async execute(interaction) {
        await interaction.deferReply();
        const guildId = interaction.guild.id;

        try {
            const config = await GuildConfig.findOne({ guildId });
            if (!config?.levelEnabled) {
                return interaction.editReply({ content: '❌ ระบบ Level ยังไม่ได้เปิดใช้งานในเซิร์ฟนี้' });
            }

            const users  = await User.find({ guildId, xp: { $gt: 0 } }).sort({ xp: -1 }).limit(10).lean();
            if (!users.length) return interaction.editReply({ content: '📭 ยังไม่มีข้อมูล XP ในเซิร์ฟนี้' });

            const medals = ['🥇', '🥈', '🥉'];
            const lines  = await Promise.all(users.map(async (u, i) => {
                let name = `<@${u.userId}>`;
                const { level, currentLevelXp, neededForNext } = calcLevel(u.xp || 0);
                const medal = medals[i] || `**${i + 1}.**`;
                const pct = Math.round((currentLevelXp / neededForNext) * 100);
                return `${medal} ${name} — Lv.**${level}** · ${u.xp?.toLocaleString() || 0} XP *(${pct}%)*`;
            }));

            const e = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🏆 XP Leaderboard')
                .setDescription(lines.join('\n'))
                .setFooter({ text: interaction.guild.name })
                .setTimestamp();
            return interaction.editReply({ embeds: [e] });

        } catch (err) {
            console.error('[XP Leaderboard]', err);
            return interaction.editReply({ content: '❌ เกิดข้อผิดพลาด' });
        }
    }
};

// ─── Helper ───────────────────────────────────────────────────────────────
function progressBar(current, total, length = 10) {
    const filled = total > 0 ? Math.round((current / total) * length) : 0;
    return '█'.repeat(filled) + '░'.repeat(length - filled);
}

module.exports = [rankCommand, xpLeaderboardCommand];
