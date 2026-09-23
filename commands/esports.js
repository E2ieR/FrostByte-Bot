const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const GuildConfig = require('../models/GuildConfig');
const {
    getUpcomingMatches, getLiveMatches, getOngoingTournaments,
    getTeamsByRegion,
    GAME_NAMES, GAME_COLORS, GAME_THUMBS,
} = require('../services/liquipediaService');

const ALL_GAMES = ['cs2', 'valorant', 'lol', 'mlbb'];

const GAME_CHOICES = [
    { name: 'Counter-Strike 2',          value: 'cs2'      },
    { name: 'VALORANT',                   value: 'valorant' },
    { name: 'League of Legends',          value: 'lol'      },
    { name: 'Mobile Legends: Bang Bang',  value: 'mlbb'     },
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('esports')
        .setDescription('ข้อมูล Esports จาก Liquipedia 🎮')
        .addSubcommand(s => s
            .setName('matches')
            .setDescription('ดูแมตช์ที่กำลังจะมาถึง (ไม่ระบุเกม = ดูทุกเกมที่เปิดใช้งาน)')
            .addStringOption(o => o.setName('game').setDescription('เกม (ไม่บังคับ)').setRequired(false).addChoices(...GAME_CHOICES))
        )
        .addSubcommand(s => s
            .setName('tournaments')
            .setDescription('ดูรายการแข่งขันที่กำลังดำเนินอยู่')
            .addStringOption(o => o.setName('game').setDescription('เกม').setRequired(true).addChoices(...GAME_CHOICES))
        )
        .addSubcommand(s => s
            .setName('teams')
            .setDescription('ดูทีมแบ่งตามโซน')
            .addStringOption(o => o.setName('game').setDescription('เกม').setRequired(true).addChoices(...GAME_CHOICES))
        )
        .addSubcommand(s => s
            .setName('live')
            .setDescription('แมตช์ที่กำลังแข่งอยู่ตอนนี้')
        ),

    async execute(interaction) {
        const sub  = interaction.options.getSubcommand();
        const game = interaction.options.getString('game');
        const guildId = interaction.guild?.id;
        await interaction.deferReply();

        try {
            // ── matches: all games or specific game ──────────────────────────
            if (sub === 'matches') {
                if (game) {
                    // Specific game
                    const matches = await getUpcomingMatches(game);
                    if (!matches.length) {
                        return interaction.editReply({ content: `❌ ไม่พบข้อมูลแมตช์สำหรับ **${GAME_NAMES[game]}** ในขณะนี้` });
                    }
                    const embed = buildMatchEmbed(game, matches);
                    return interaction.editReply({ embeds: [embed] });
                }

                // All enabled games
                let enabledGames = ALL_GAMES;
                if (guildId) {
                    try {
                        const cfg = await GuildConfig.findOne({ guildId }).lean();
                        const g = cfg?.sportsNotifications?.esportsGames;
                        if (g?.length) enabledGames = g;
                    } catch {}
                }

                const embeds = [];
                for (const g of enabledGames) {
                    const matches = await getUpcomingMatches(g);
                    if (matches.length) embeds.push(buildMatchEmbed(g, matches.slice(0, 5)));
                    await new Promise(r => setTimeout(r, 2200)); // Liquipedia rate limit
                }

                if (!embeds.length) {
                    return interaction.editReply({ content: '❌ ไม่พบข้อมูลแมตช์จากทุกเกมในขณะนี้' });
                }
                // Discord allows max 10 embeds per message
                return interaction.editReply({ embeds: embeds.slice(0, 10) });
            }

            // ── tournaments ──────────────────────────────────────────────────
            if (sub === 'tournaments') {
                const tours = await getOngoingTournaments(game);
                if (!tours.length) {
                    return interaction.editReply({ content: `❌ ไม่พบข้อมูลรายการแข่งสำหรับ **${GAME_NAMES[game]}** ในขณะนี้` });
                }
                const embed = new EmbedBuilder()
                    .setColor(GAME_COLORS[game])
                    .setTitle(`🏆 ${GAME_NAMES[game]} — Ongoing Tournaments`)
                    .setThumbnail(GAME_THUMBS[game])
                    .setTimestamp();
                for (const t of tours) {
                    embed.addFields({
                        name: t.name,
                        value: [
                            t.tier  && `🏅 Tier: **${t.tier}**`,
                            t.dates && `📅 ${t.dates}`,
                            t.prize && `💰 Prize: **${t.prize}**`,
                            t.url   && `[ดูข้อมูล](${t.url})`,
                        ].filter(Boolean).join('\n') || '—',
                        inline: false,
                    });
                }
                embed.setFooter({ text: 'ข้อมูลจาก Liquipedia.net' });
                return interaction.editReply({ embeds: [embed] });
            }

            // ── teams by region ──────────────────────────────────────────────
            if (sub === 'teams') {
                const regionMap = await getTeamsByRegion(game);
                const regions = Object.entries(regionMap);

                if (!regions.length) {
                    return interaction.editReply({ content: `❌ ไม่พบข้อมูลทีมสำหรับ **${GAME_NAMES[game]}** ในขณะนี้` });
                }

                // Split into multiple embeds if needed (max 25 fields per embed)
                const embeds = [];
                let currentEmbed = new EmbedBuilder()
                    .setColor(GAME_COLORS[game])
                    .setTitle(`👥 ${GAME_NAMES[game]} — Teams by Zone`)
                    .setThumbnail(GAME_THUMBS[game])
                    .setTimestamp();
                let fieldCount = 0;

                for (const [region, teams] of regions) {
                    if (fieldCount >= 24) {
                        currentEmbed.setFooter({ text: 'ข้อมูลจาก Liquipedia.net' });
                        embeds.push(currentEmbed);
                        currentEmbed = new EmbedBuilder()
                            .setColor(GAME_COLORS[game])
                            .setTitle(`👥 ${GAME_NAMES[game]} — Teams (ต่อ)`)
                            .setTimestamp();
                        fieldCount = 0;
                    }
                    currentEmbed.addFields({
                        name: `🌍 ${region}`,
                        value: teams.slice(0, 15).map(t => `• [${t.name}](${t.url})`).join('\n') || '—',
                        inline: true,
                    });
                    fieldCount++;
                }

                currentEmbed.setFooter({ text: 'ข้อมูลจาก Liquipedia.net' });
                embeds.push(currentEmbed);

                return interaction.editReply({ embeds: embeds.slice(0, 10) });
            }

            // ── live ─────────────────────────────────────────────────────────
            if (sub === 'live') {
                let enabledGames = ALL_GAMES;
                if (guildId) {
                    try {
                        const cfg = await GuildConfig.findOne({ guildId }).lean();
                        const g = cfg?.sportsNotifications?.esportsGames;
                        if (g?.length) enabledGames = g;
                    } catch {}
                }

                const liveMatches = await getLiveMatches(enabledGames);
                if (!liveMatches.length) {
                    return interaction.editReply({ content: '❌ ไม่มีแมตช์ Esports ที่กำลังแข่งอยู่ในขณะนี้' });
                }

                const embed = new EmbedBuilder()
                    .setColor(0xFEE75C)
                    .setTitle('🔴 Esports — LIVE Matches')
                    .setThumbnail(GAME_THUMBS[liveMatches[0].game])
                    .setTimestamp();

                for (const m of liveMatches.slice(0, 10)) {
                    const scoreStr = (m.score1 || m.score2) ? ` **(${m.score1||0} – ${m.score2||0})**` : '';
                    embed.addFields({
                        name: `🎮 ${GAME_NAMES[m.game]} — ${m.team1} vs ${m.team2}${scoreStr}`,
                        value: `🏆 ${m.tournament || 'ไม่ระบุ'}${m.streamLink ? `\n📺 [ดูสด](${m.streamLink})` : ''}`,
                        inline: false,
                    });
                }
                embed.setFooter({ text: 'Liquipedia.net' });
                return interaction.editReply({ embeds: [embed] });
            }

        } catch (err) {
            console.error('[esports]', err);
            return interaction.editReply({ content: '❌ เกิดข้อผิดพลาดในการดึงข้อมูล กรุณาลองใหม่' });
        }
    },
};

function buildMatchEmbed(game, matches) {
    const embed = new EmbedBuilder()
        .setColor(GAME_COLORS[game])
        .setTitle(`🎮 ${GAME_NAMES[game]} — Upcoming Matches`)
        .setThumbnail(GAME_THUMBS[game])
        .setTimestamp();

    for (const m of matches.slice(0, 8)) {
        const timeStr = m.matchTime ? `<t:${Math.floor(m.matchTime / 1000)}:F>` : 'TBD';
        const score   = m.isLive && (m.score1 || m.score2)
            ? ` **(${m.score1 || 0}–${m.score2 || 0} 🔴 LIVE)**`
            : '';
        embed.addFields({
            name:  `${m.isLive ? '🔴 LIVE' : '🕐'} ${m.team1} vs ${m.team2}${score}`,
            value: `📅 ${timeStr}\n🏆 ${m.tournament || 'ไม่ระบุ'}`,
            inline: false,
        });
    }
    embed.setFooter({ text: 'Liquipedia.net' });
    return embed;
}
