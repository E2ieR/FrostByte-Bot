const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
    getMatches, getLiveMatches, getMatchLineup, getStandings,
    LEAGUE_NAMES, AVAILABLE_LEAGUES,
} = require('../services/footballService');

const LEAGUE_CHOICES = [
    { name: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League',      value: 'PL'  },
    { name: '🇩🇪 Bundesliga',            value: 'BL1' },
    { name: '🇮🇹 Serie A',               value: 'SA'  },
    { name: '🇪🇸 La Liga',               value: 'PD'  },
    { name: '🇫🇷 Ligue 1',               value: 'FL1' },
    { name: '⭐ UEFA Champions League',   value: 'CL'  },
];

function fmtTime(dt) {
    if (!dt) return 'TBD';
    const ts = Math.floor(dt.getTime ? dt.getTime() / 1000 : new Date(dt).getTime() / 1000);
    return `<t:${ts}:F> (<t:${ts}:R>)`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('football')
        .setDescription('ข้อมูลฟุตบอล ⚽')
        .addSubcommand(s => s
            .setName('matches')
            .setDescription('แมตช์ที่กำลังจะมาถึง')
            .addStringOption(o => o.setName('league').setDescription('ลีก').setRequired(true).addChoices(...LEAGUE_CHOICES))
        )
        .addSubcommand(s => s.setName('live').setDescription('แมตช์ที่กำลังแข่งอยู่'))
        .addSubcommand(s => s
            .setName('lineup')
            .setDescription('ดู lineup ของแมตช์ (ต้องการ Match ID)')
            .addIntegerOption(o => o.setName('match_id').setDescription('Match ID จาก /football matches').setRequired(true))
        )
        .addSubcommand(s => s
            .setName('standings')
            .setDescription('ตารางคะแนน')
            .addStringOption(o => o.setName('league').setDescription('ลีก').setRequired(true).addChoices(...LEAGUE_CHOICES))
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        await interaction.deferReply();

        if (!process.env.FOOTBALL_API_KEY) {
            return interaction.editReply({
                content: '⚠️ ระบบฟุตบอลต้องการ `FOOTBALL_API_KEY` ใน .env\nรับได้ฟรีที่ https://www.football-data.org/client/register',
            });
        }

        try {
            // ── แมตช์ที่กำลังจะมาถึง ─────────────────────────────────────────
            if (sub === 'matches') {
                const league  = interaction.options.getString('league');
                const matches = await getMatches(league);
                if (!matches.length) return interaction.editReply({ content: `❌ ไม่พบแมตช์ที่กำลังจะมาถึงของ ${LEAGUE_NAMES[league] || league}` });

                const embed = new EmbedBuilder()
                    .setColor(0x00A651)
                    .setTitle(`⚽ ${LEAGUE_NAMES[league] || league} — Upcoming Matches`)
                    .setTimestamp();

                for (const m of matches.slice(0, 8)) {
                    embed.addFields({
                        name: `🆚 ${m.homeShort || m.homeTeam} vs ${m.awayShort || m.awayTeam}`,
                        value: `⏰ ${fmtTime(m.dateTime)}\n🆔 Match ID: \`${m.id}\``,
                        inline: false,
                    });
                }

                embed.setFooter({ text: 'ใช้ /football lineup match_id: เพื่อดู lineup • football-data.org' });
                return interaction.editReply({ embeds: [embed] });
            }

            // ── แมตช์สด ───────────────────────────────────────────────────────
            if (sub === 'live') {
                const matches = await getLiveMatches();
                if (!matches.length) {
                    return interaction.editReply({ content: '❌ ไม่มีแมตช์ที่กำลังแข่งในขณะนี้' });
                }

                const embed = new EmbedBuilder()
                    .setColor(0xFEE75C)
                    .setTitle('🔴 Football LIVE Scores')
                    .setTimestamp();

                for (const m of matches.slice(0, 10)) {
                    embed.addFields({
                        name: `${m.competition}`,
                        value: `**${m.homeTeam}** ${m.homeScore} – ${m.awayScore} **${m.awayTeam}**${m.minute ? ` • นาที ${m.minute}'` : ''}`,
                        inline: false,
                    });
                }

                embed.setFooter({ text: 'football-data.org' });
                return interaction.editReply({ embeds: [embed] });
            }

            // ── Lineup ────────────────────────────────────────────────────────
            if (sub === 'lineup') {
                const matchId = interaction.options.getInteger('match_id');
                const lineup  = await getMatchLineup(matchId);
                if (!lineup) {
                    return interaction.editReply({ content: `❌ ไม่พบข้อมูล lineup สำหรับ Match ID \`${matchId}\`\n(Lineup จะแสดงเมื่อใกล้เวลาแข่ง)` });
                }

                const homeStr = lineup.homeLineup.length
                    ? lineup.homeLineup.map((p, i) => `${i + 1}. ${p}`).join('\n')
                    : 'ยังไม่มี lineup';
                const awayStr = lineup.awayLineup.length
                    ? lineup.awayLineup.map((p, i) => `${i + 1}. ${p}`).join('\n')
                    : 'ยังไม่มี lineup';

                const embed = new EmbedBuilder()
                    .setColor(0x00A651)
                    .setTitle(`⚽ Lineup — ${lineup.homeTeam} vs ${lineup.awayTeam}`)
                    .addFields(
                        {
                            name: `🏠 ${lineup.homeTeam} (${lineup.homeFormation})`,
                            value: homeStr || '—',
                            inline: true,
                        },
                        {
                            name: `✈️ ${lineup.awayTeam} (${lineup.awayFormation})`,
                            value: awayStr || '—',
                            inline: true,
                        },
                    )
                    .setFooter({ text: `Match ID: ${matchId} • football-data.org` })
                    .setTimestamp();

                if (lineup.homeBench?.length) {
                    embed.addFields({
                        name: `🪑 สำรอง — ${lineup.homeTeam}`,
                        value: lineup.homeBench.slice(0, 7).join(', '),
                        inline: false,
                    });
                }
                if (lineup.awayBench?.length) {
                    embed.addFields({
                        name: `🪑 สำรอง — ${lineup.awayTeam}`,
                        value: lineup.awayBench.slice(0, 7).join(', '),
                        inline: false,
                    });
                }

                return interaction.editReply({ embeds: [embed] });
            }

            // ── ตารางคะแนน ────────────────────────────────────────────────────
            if (sub === 'standings') {
                const league = interaction.options.getString('league');
                const table  = await getStandings(league);
                if (!table.length) return interaction.editReply({ content: `❌ ไม่พบตารางคะแนนสำหรับ ${LEAGUE_NAMES[league] || league}` });

                const lines = table.map(t =>
                    `\`${String(t.pos).padStart(2)}\` **${t.team.substring(0, 18).padEnd(18)}** ${String(t.played).padStart(2)} | ${String(t.won).padStart(2)}W ${String(t.draw).padStart(2)}D ${String(t.lost).padStart(2)}L | GD${t.gd >= 0 ? '+' : ''}${t.gd} | **${t.pts}pts**`
                ).join('\n');

                const embed = new EmbedBuilder()
                    .setColor(0x00A651)
                    .setTitle(`📊 ${LEAGUE_NAMES[league] || league} — Standings`)
                    .setDescription(`\`\`\`\n${table.map(t =>
                        `${String(t.pos).padStart(2)}. ${t.team.substring(0,16).padEnd(16)} ${String(t.played).padStart(2)}G ${String(t.pts).padStart(3)}pts GD${t.gd >= 0 ? '+' : ''}${String(t.gd).padStart(3)}`
                    ).join('\n')}\`\`\``)
                    .setFooter({ text: 'football-data.org' })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

        } catch (err) {
            console.error('[football]', err);
            return interaction.editReply({ content: '❌ เกิดข้อผิดพลาดในการดึงข้อมูลฟุตบอล กรุณาลองใหม่' });
        }
    },
};
