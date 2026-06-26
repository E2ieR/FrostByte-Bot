const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getWCSchedule, getWCGroups, getLiveMatches, getMatchLineup, leagueLogoCache } = require('../services/footballService');

function fmtTime(dt) {
    if (!dt) return 'TBD';
    const ts = Math.floor(new Date(dt).getTime() / 1000);
    return `<t:${ts}:F> (<t:${ts}:R>)`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('worldcup')
        .setDescription('🌍 FIFA World Cup 2026')
        .addSubcommand(s => s.setName('matches').setDescription('แมตช์บอลโลก 7 วันข้างหน้า'))
        .addSubcommand(s => s.setName('live').setDescription('แมตช์บอลโลกที่กำลังแข่งอยู่'))
        .addSubcommand(s => s.setName('groups').setDescription('ตารางกลุ่มทั้งหมด'))
        .addSubcommand(s => s
            .setName('lineup')
            .setDescription('ดู lineup ของแมตช์บอลโลก')
            .addIntegerOption(o => o
                .setName('match_id')
                .setDescription('Match ID จาก /worldcup matches')
                .setRequired(true)
            )
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        await interaction.deferReply();

        try {
            // ── แมตช์ที่กำลังจะมา ────────────────────────────────────────────
            if (sub === 'matches') {
                const matches = await getWCSchedule(7);
                if (!matches.length) return interaction.editReply({ content: '❌ ไม่พบแมตช์บอลโลกในช่วง 7 วันข้างหน้า' });

                const wcLogo = leagueLogoCache['WC'];
                const embed = new EmbedBuilder()
                    .setColor(0xFFD700)
                    .setTitle('🌍 FIFA World Cup 2026 — Upcoming Matches')
                    .setThumbnail(wcLogo)
                    .setTimestamp();

                for (const m of matches.slice(0, 10)) {
                    const score = m.status === 'IN_PLAY'
                        ? `🔴 **${m.homeScore} – ${m.awayScore}**${m.minute ? ` • ${m.minute}'` : ''}`
                        : fmtTime(m.dateTime);
                    embed.addFields({
                        name: `🆚 ${m.homeTeam} vs ${m.awayTeam}`,
                        value: `${score}\n🆔 Match ID: \`${m.id}\``,
                        inline: false,
                    });
                }
                embed.setFooter({ text: 'ใช้ /worldcup lineup match_id: เพื่อดู lineup' });
                return interaction.editReply({ embeds: [embed] });
            }

            // ── แมตช์สด ──────────────────────────────────────────────────────
            if (sub === 'live') {
                const allLive = await getLiveMatches();
                const matches = allLive.filter(m => m.leagueCode === 'WC');
                if (!matches.length) return interaction.editReply({ content: '❌ ไม่มีแมตช์บอลโลกที่กำลังแข่งในขณะนี้' });

                const wcLogo2 = leagueLogoCache['WC'];
                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('🔴 FIFA World Cup 2026 — LIVE')
                    .setThumbnail(wcLogo2)
                    .setTimestamp();

                for (const m of matches) {
                    const homeLogo = m.homeLogo ? `[🏠](${m.homeLogo})` : '🏠';
                    const awayLogo = m.awayLogo ? `[✈️](${m.awayLogo})` : '✈️';
                    embed.addFields({
                        name: `🆚 ${m.homeTeam} vs ${m.awayTeam}`,
                        value: `${homeLogo} **${m.homeScore} – ${m.awayScore}** ${awayLogo}${m.minute ? ` • นาที ${m.minute}'` : ''}\n🆔 Match ID: \`${m.id}\``,
                        inline: false,
                    });
                }
                return interaction.editReply({ embeds: [embed] });
            }

            // ── ตารางกลุ่ม ────────────────────────────────────────────────────
            if (sub === 'groups') {
                const groups = await getWCGroups();
                if (!groups.length) return interaction.editReply({ content: '❌ ไม่พบตารางกลุ่มบอลโลกในขณะนี้' });

                const wcLogo3 = leagueLogoCache['WC'];
                const embed = new EmbedBuilder()
                    .setColor(0xFFD700)
                    .setTitle('🌍 FIFA World Cup 2026 — Group Standings')
                    .setThumbnail(wcLogo3)
                    .setTimestamp();

                for (const g of groups) {
                    const lines = g.entries.map(e =>
                        `\`${e.pos}\` **${e.team.substring(0, 13).padEnd(13)}** ${String(e.played).padStart(2)}G  ${String(e.pts).padStart(2)}pts  GD${e.gd >= 0 ? '+' : ''}${e.gd}`
                    ).join('\n');
                    embed.addFields({ name: `📋 ${g.name}`, value: lines, inline: true });
                }

                return interaction.editReply({ embeds: [embed] });
            }

            // ── Lineup ────────────────────────────────────────────────────────
            if (sub === 'lineup') {
                const matchId = interaction.options.getInteger('match_id');
                const lineup  = await getMatchLineup(matchId);
                if (!lineup) return interaction.editReply({ content: `❌ ไม่พบข้อมูล lineup สำหรับ Match ID \`${matchId}\`\n(Lineup จะแสดงเมื่อใกล้เวลาแข่ง)` });

                const homeStr = lineup.homeLineup.length
                    ? lineup.homeLineup.map((p, i) => `${i + 1}. ${p}`).join('\n')
                    : 'ยังไม่มี lineup';
                const awayStr = lineup.awayLineup.length
                    ? lineup.awayLineup.map((p, i) => `${i + 1}. ${p}`).join('\n')
                    : 'ยังไม่มี lineup';

                const embed = new EmbedBuilder()
                    .setColor(0xFFD700)
                    .setTitle(`🌍 Lineup — ${lineup.homeTeam} vs ${lineup.awayTeam}`)
                    .addFields(
                        { name: `🏠 ${lineup.homeTeam} (${lineup.homeFormation})`, value: homeStr, inline: true },
                        { name: `✈️ ${lineup.awayTeam} (${lineup.awayFormation})`, value: awayStr, inline: true },
                    )
                    .setFooter({ text: `Match ID: ${matchId}` })
                    .setTimestamp();

                if (lineup.homeLogo) embed.setThumbnail(lineup.homeLogo);

                if (lineup.homeBench?.length) embed.addFields({ name: `🪑 สำรอง — ${lineup.homeTeam}`, value: lineup.homeBench.slice(0, 7).join(', '), inline: false });
                if (lineup.awayBench?.length) embed.addFields({ name: `🪑 สำรอง — ${lineup.awayTeam}`, value: lineup.awayBench.slice(0, 7).join(', '), inline: false });

                return interaction.editReply({ embeds: [embed] });
            }

        } catch (err) {
            console.error('[worldcup]', err);
            return interaction.editReply({ content: '❌ เกิดข้อผิดพลาดในการดึงข้อมูลบอลโลก กรุณาลองใหม่' });
        }
    },
};
