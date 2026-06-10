const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
    getSchedule, getNextRace, getDriverStandings,
    getConstructorStandings, getLivePositions, getCurrentSession,
    getLastRaceResult,
} = require('../services/f1Service');

const F1_RED = 0xE8002D;

function fmtTime(dt) {
    if (!dt) return 'ไม่ระบุ';
    const ts = Math.floor(dt.getTime() / 1000);
    return `<t:${ts}:F>`;
}
function relTime(dt) {
    if (!dt) return '';
    const ts = Math.floor(dt.getTime() / 1000);
    return `<t:${ts}:R>`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('f1')
        .setDescription('ข้อมูล Formula 1 🏎️')
        .addSubcommand(s => s.setName('schedule').setDescription('ตารางแข่งทั้งซีซัน'))
        .addSubcommand(s => s.setName('next').setDescription('สนามถัดไป + ตารางเวลา'))
        .addSubcommand(s => s.setName('live').setDescription('อันดับแข่งสด (ต้องมี session ที่กำลังแข่ง)'))
        .addSubcommand(s => s.setName('drivers').setDescription('อันดับนักขับ Championship'))
        .addSubcommand(s => s.setName('teams').setDescription('อันดับทีม (Constructor) Championship'))
        .addSubcommand(s => s.setName('lastrace').setDescription('ผลการแข่งสนามล่าสุด')),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        await interaction.deferReply();

        try {
            // ── ตารางทั้งซีซัน ────────────────────────────────────────────────
            if (sub === 'schedule') {
                const races = await getSchedule();
                if (!races.length) return interaction.editReply({ content: '❌ ไม่พบข้อมูลตารางแข่ง' });

                const now  = Date.now();
                const upcoming = races.filter(r => r.dateTime && r.dateTime > now).slice(0, 6);
                const past     = races.filter(r => !r.dateTime || r.dateTime <= now).slice(-3);

                const embed = new EmbedBuilder()
                    .setColor(F1_RED)
                    .setTitle('🏎️ F1 — ตารางแข่งซีซัน')
                    .setTimestamp();

                if (past.length) {
                    embed.addFields({
                        name: '✅ สนามล่าสุด',
                        value: past.map(r => `R${r.round} **${r.name}** — ${r.date}`).join('\n'),
                        inline: false,
                    });
                }

                if (upcoming.length) {
                    embed.addFields({
                        name: '🏁 สนามถัดไป',
                        value: upcoming.map(r => {
                            const ts = r.dateTime ? Math.floor(r.dateTime / 1000) : 0;
                            return `R${r.round} **${r.name}**\n└ ${r.location} — <t:${ts}:D>`;
                        }).join('\n'),
                        inline: false,
                    });
                }

                embed.setFooter({ text: 'ข้อมูลจาก Jolpica F1 API (Ergast)' });
                return interaction.editReply({ embeds: [embed] });
            }

            // ── สนามถัดไป ─────────────────────────────────────────────────────
            if (sub === 'next') {
                const r = await getNextRace();
                if (!r) return interaction.editReply({ content: '❌ ไม่พบข้อมูลสนามถัดไป' });

                const embed = new EmbedBuilder()
                    .setColor(F1_RED)
                    .setTitle(`🏎️ F1 สนามที่ ${r.round} — ${r.name}`)
                    .addFields(
                        { name: '🏁 สนาม',    value: r.circuit,  inline: true  },
                        { name: '📍 สถานที่', value: r.location,  inline: true  },
                    );

                if (r.fp1)        embed.addFields({ name: '🔧 FP1', value: `${fmtTime(r.fp1)} ${relTime(r.fp1)}`, inline: false });
                if (r.fp2)        embed.addFields({ name: '🔧 FP2', value: `${fmtTime(r.fp2)} ${relTime(r.fp2)}`, inline: false });
                if (r.fp3)        embed.addFields({ name: '🔧 FP3', value: `${fmtTime(r.fp3)} ${relTime(r.fp3)}`, inline: false });
                if (r.sprint)     embed.addFields({ name: '⚡ Sprint Race', value: `${fmtTime(r.sprint)} ${relTime(r.sprint)}`, inline: false });
                if (r.qualifying) embed.addFields({ name: '⏱️ Qualifying',  value: `${fmtTime(r.qualifying)} ${relTime(r.qualifying)}`, inline: false });
                if (r.dateTime)   embed.addFields({ name: '🏁 Race',        value: `${fmtTime(r.dateTime)} ${relTime(r.dateTime)}`, inline: false });

                embed.setFooter({ text: 'ข้อมูลจาก Jolpica F1 API' }).setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            // ── อันดับสด ──────────────────────────────────────────────────────
            if (sub === 'live') {
                const session = await getCurrentSession();
                if (!session) {
                    return interaction.editReply({ content: '❌ ไม่มี F1 Session ที่กำลังแข่งอยู่ในขณะนี้' });
                }

                const positions = await getLivePositions(session.session_key);
                if (!positions.length) {
                    return interaction.editReply({ content: `❌ ยังไม่มีข้อมูลอันดับสำหรับ **${session.session_name}**` });
                }

                const lines = positions.slice(0, 22).map(p =>
                    `\`P${String(p.pos).padStart(2)}\` **${p.code || p.name}** — ${p.team}`
                ).join('\n');

                const embed = new EmbedBuilder()
                    .setColor(F1_RED)
                    .setTitle(`🔴 F1 LIVE — ${session.session_name || 'Race'}`)
                    .setDescription(lines)
                    .setFooter({ text: `OpenF1 • อัปเดตล่าสุด` })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // ── อันดับนักขับ ──────────────────────────────────────────────────
            if (sub === 'drivers') {
                const list = await getDriverStandings();
                if (!list.length) return interaction.editReply({ content: '❌ ไม่พบข้อมูลอันดับ' });

                const rows = list.slice(0, 22).map(d =>
                    `\`${String(d.pos).padStart(2)}\` **${d.code || d.driver}** (${d.constructor}) — **${d.points}** pts ${d.wins > 0 ? `(${d.wins} wins)` : ''}`
                ).join('\n');

                const embed = new EmbedBuilder()
                    .setColor(F1_RED)
                    .setTitle('🏎️ F1 Driver Championship Standings')
                    .setDescription(rows)
                    .setFooter({ text: 'ข้อมูลจาก Jolpica F1 API' })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // ── อันดับทีม ─────────────────────────────────────────────────────
            if (sub === 'teams') {
                const list = await getConstructorStandings();
                if (!list.length) return interaction.editReply({ content: '❌ ไม่พบข้อมูลอันดับ' });

                const rows = list.map(t =>
                    `\`${String(t.pos).padStart(2)}\` **${t.name}** — **${t.points}** pts ${t.wins > 0 ? `(${t.wins} wins)` : ''}`
                ).join('\n');

                const embed = new EmbedBuilder()
                    .setColor(F1_RED)
                    .setTitle('🏎️ F1 Constructor Championship Standings')
                    .setDescription(rows)
                    .setFooter({ text: 'ข้อมูลจาก Jolpica F1 API' })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // ── ผลสนามล่าสุด ─────────────────────────────────────────────────
            if (sub === 'lastrace') {
                const result = await getLastRaceResult();
                if (!result) return interaction.editReply({ content: '❌ ไม่พบข้อมูลผลการแข่ง' });

                const rows = result.results.map(r =>
                    `\`P${String(r.pos).padStart(2)}\` **${r.code}** — ${r.team} | ${r.time} | **${r.points}** pts`
                ).join('\n');

                const embed = new EmbedBuilder()
                    .setColor(F1_RED)
                    .setTitle(`🏁 ผลการแข่ง — ${result.name}`)
                    .setDescription(rows)
                    .addFields({ name: '📅 วันที่', value: result.date, inline: true })
                    .setFooter({ text: 'ข้อมูลจาก Jolpica F1 API' })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

        } catch (err) {
            console.error('[f1]', err);
            return interaction.editReply({ content: '❌ เกิดข้อผิดพลาดในการดึงข้อมูล F1 กรุณาลองใหม่' });
        }
    },
};
