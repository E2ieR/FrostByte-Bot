'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
    getOrCreateQueue,
    getQueue,
    resolveTracks,
    addTracks,
    playNext,
    stop,
    skip,
    pause,
    resume,
    setVolume,
    shuffle,
    removeTrack,
    toggleLoop,
    secondsToTimestamp,
    makeProgressBar,
} = require('../services/musicPlayer');
const { AudioPlayerStatus } = require('@discordjs/voice');

// ─── Colors ───────────────────────────────────────────────────────────────────
const COLOR_MAIN   = 0x9b59b6; // สีม่วง
const COLOR_ERROR  = 0xe74c3c;
const COLOR_INFO   = 0x3498db;
const COLOR_WARN   = 0xf39c12;

// ─── Guard helpers ────────────────────────────────────────────────────────────
function getUserVoiceChannel(interaction) {
    return interaction.member?.voice?.channel || null;
}

function errEmbed(msg) {
    return new EmbedBuilder().setColor(COLOR_ERROR).setDescription(`❌ ${msg}`);
}

function infoEmbed(msg) {
    return new EmbedBuilder().setColor(COLOR_INFO).setDescription(msg);
}

// ─── /play ────────────────────────────────────────────────────────────────────
const playCommand = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('เล่นเพลงจาก YouTube หรือ Spotify')
        .addStringOption(opt =>
            opt.setName('query')
                .setDescription('ลิ้งก์ YouTube / Spotify หรือชื่อเพลง')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        const voiceChannel = getUserVoiceChannel(interaction);
        if (!voiceChannel) {
            return interaction.editReply({ embeds: [errEmbed('คุณต้องอยู่ใน Voice Channel ก่อนนะ!')] });
        }

        // ตรวจสอบว่าบอทอยู่ channel อื่นหรือไม่
        const botVoice = interaction.guild.members.me?.voice?.channel;
        if (botVoice && botVoice.id !== voiceChannel.id) {
            return interaction.editReply({ embeds: [errEmbed(`บอทกำลังเล่นเพลงใน <#${botVoice.id}> อยู่นะ!`)] });
        }

        const query = interaction.options.getString('query');

        try {
            const tracks = await resolveTracks(query, interaction.user);

            if (!tracks.length) {
                return interaction.editReply({ embeds: [errEmbed('ไม่พบเพลงที่ค้นหา ลองใช้คำค้นอื่นดูนะ')] });
            }

            const queue = getOrCreateQueue(
                interaction.guildId,
                voiceChannel,
                interaction.channel,
                interaction.client
            );

            const wasEmpty = !queue.currentTrack && queue.tracks.length === 0;
            addTracks(interaction.guildId, tracks);

            if (wasEmpty) {
                await playNext(interaction.guildId);
            }

            const currentQueue = getQueue(interaction.guildId);
            const track = tracks[0];

            if (tracks.length === 1) {
                const embed = new EmbedBuilder()
                    .setColor(COLOR_MAIN)
                    .setAuthor({ name: '🎵 เพิ่มเพลงเข้า Queue' })
                    .setTitle(track.title)
                    .setURL(track.url)
                    .setThumbnail(track.thumbnail)
                    .addFields(
                        { name: '⏱ ความยาว', value: secondsToTimestamp(track.duration), inline: true },
                        { name: '📋 ลำดับใน Queue', value: wasEmpty ? '▶️ กำลังเล่น' : `#${(currentQueue?.tracks.length || 0)}`, inline: true },
                        { name: '👤 ขอโดย', value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setFooter({ text: `FrostByte Music` });
                return interaction.editReply({ embeds: [embed] });
            }

            // Playlist / album
            const embed = new EmbedBuilder()
                .setColor(COLOR_MAIN)
                .setAuthor({ name: '🎵 เพิ่ม Playlist เข้า Queue' })
                .setDescription(`เพิ่ม **${tracks.length} เพลง** เข้า Queue สำเร็จ\nเพลงแรก: **${track.title}**`)
                .setThumbnail(track.thumbnail)
                .addFields(
                    { name: '👤 ขอโดย', value: `<@${interaction.user.id}>`, inline: true }
                )
                .setFooter({ text: 'FrostByte Music' });
            return interaction.editReply({ embeds: [embed] });

        } catch (err) {
            console.error('[/play]', err);
            return interaction.editReply({ embeds: [errEmbed(`เกิดข้อผิดพลาด: ${err.message}`)] });
        }
    },
};

// ─── /skip ────────────────────────────────────────────────────────────────────
const skipCommand = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('ข้ามเพลงปัจจุบัน'),

    async execute(interaction) {
        if (!getUserVoiceChannel(interaction)) {
            return interaction.reply({ embeds: [errEmbed('คุณต้องอยู่ใน Voice Channel ก่อน!')], ephemeral: true });
        }

        const queue = getQueue(interaction.guildId);
        if (!queue || !queue.currentTrack) {
            return interaction.reply({ embeds: [errEmbed('ไม่มีเพลงที่กำลังเล่นอยู่')], ephemeral: true });
        }

        const skippedTitle = queue.currentTrack.title;
        skip(interaction.guildId);

        const embed = infoEmbed(`⏭ ข้ามเพลง **${skippedTitle}** แล้ว`);
        return interaction.reply({ embeds: [embed] });
    },
};

// ─── /stop ────────────────────────────────────────────────────────────────────
const stopCommand = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('หยุดเพลงและล้าง Queue ทั้งหมด'),

    async execute(interaction) {
        if (!getUserVoiceChannel(interaction)) {
            return interaction.reply({ embeds: [errEmbed('คุณต้องอยู่ใน Voice Channel ก่อน!')], ephemeral: true });
        }

        const queue = getQueue(interaction.guildId);
        if (!queue) {
            return interaction.reply({ embeds: [errEmbed('ไม่มีเพลงที่กำลังเล่นอยู่')], ephemeral: true });
        }

        stop(interaction.guildId);
        return interaction.reply({ embeds: [infoEmbed('⏹ หยุดเล่นเพลงและล้าง Queue เรียบร้อยแล้ว')] });
    },
};

// ─── /pause ───────────────────────────────────────────────────────────────────
const pauseCommand = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('หยุดเพลงชั่วคราว'),

    async execute(interaction) {
        if (!getUserVoiceChannel(interaction)) {
            return interaction.reply({ embeds: [errEmbed('คุณต้องอยู่ใน Voice Channel ก่อน!')], ephemeral: true });
        }

        const queue = getQueue(interaction.guildId);
        if (!queue || !queue.currentTrack) {
            return interaction.reply({ embeds: [errEmbed('ไม่มีเพลงที่กำลังเล่นอยู่')], ephemeral: true });
        }

        if (queue.player.state.status === AudioPlayerStatus.Paused) {
            return interaction.reply({ embeds: [errEmbed('เพลงหยุดชั่วคราวอยู่แล้ว ใช้ `/resume` เพื่อเล่นต่อ')], ephemeral: true });
        }

        pause(interaction.guildId);
        return interaction.reply({ embeds: [infoEmbed(`⏸ หยุด **${queue.currentTrack.title}** ชั่วคราวแล้ว`)] });
    },
};

// ─── /resume ──────────────────────────────────────────────────────────────────
const resumeCommand = {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('เล่นเพลงต่อจากที่หยุดไว้'),

    async execute(interaction) {
        if (!getUserVoiceChannel(interaction)) {
            return interaction.reply({ embeds: [errEmbed('คุณต้องอยู่ใน Voice Channel ก่อน!')], ephemeral: true });
        }

        const queue = getQueue(interaction.guildId);
        if (!queue || !queue.currentTrack) {
            return interaction.reply({ embeds: [errEmbed('ไม่มีเพลงที่กำลังเล่นอยู่')], ephemeral: true });
        }

        if (queue.player.state.status !== AudioPlayerStatus.Paused) {
            return interaction.reply({ embeds: [errEmbed('เพลงไม่ได้อยู่ในสถานะหยุดชั่วคราว')], ephemeral: true });
        }

        resume(interaction.guildId);
        return interaction.reply({ embeds: [infoEmbed(`▶️ เล่น **${queue.currentTrack.title}** ต่อแล้ว`)] });
    },
};

// ─── /queue ───────────────────────────────────────────────────────────────────
const queueCommand = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('แสดงรายการเพลงใน Queue')
        .addIntegerOption(opt =>
            opt.setName('page')
                .setDescription('หน้าที่ต้องการดู')
                .setMinValue(1)
                .setRequired(false)),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);
        if (!queue || (!queue.currentTrack && queue.tracks.length === 0)) {
            return interaction.reply({ embeds: [infoEmbed('Queue ว่างเปล่า ลองใช้ `/play` ก่อนนะ')], ephemeral: true });
        }

        const PAGE_SIZE = 10;
        const page = (interaction.options.getInteger('page') || 1) - 1;
        const totalPages = Math.max(1, Math.ceil(queue.tracks.length / PAGE_SIZE));

        const start = page * PAGE_SIZE;
        const slice = queue.tracks.slice(start, start + PAGE_SIZE);

        const list = slice.map((t, i) =>
            `\`${start + i + 1}.\` **${t.title}** — ${secondsToTimestamp(t.duration)} | <@${t.requestedBy.id}>`
        ).join('\n') || '_ไม่มีเพลงรอต่อ_';

        const totalDuration = queue.tracks.reduce((sum, t) => sum + t.duration, 0);

        const embed = new EmbedBuilder()
            .setColor(COLOR_MAIN)
            .setTitle('📋 Queue เพลง')
            .setDescription(
                queue.currentTrack
                    ? `**กำลังเล่น:** ${queue.currentTrack.title}\n\n${list}`
                    : list
            )
            .addFields(
                { name: '🎵 เพลงใน Queue', value: `${queue.tracks.length} เพลง`, inline: true },
                { name: '⏱ รวมเวลา', value: secondsToTimestamp(totalDuration), inline: true },
                { name: '🔁 Loop', value: queue.loop === 'off' ? 'ปิด' : queue.loop === 'track' ? 'เพลงนี้' : 'ทั้ง Queue', inline: true }
            )
            .setFooter({ text: `หน้า ${page + 1}/${totalPages} • FrostByte Music` });

        return interaction.reply({ embeds: [embed] });
    },
};

// ─── /nowplaying ──────────────────────────────────────────────────────────────
const nowplayingCommand = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('แสดงเพลงที่กำลังเล่นอยู่'),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);
        if (!queue || !queue.currentTrack) {
            return interaction.reply({ embeds: [infoEmbed('ไม่มีเพลงที่กำลังเล่นอยู่ตอนนี้')], ephemeral: true });
        }

        const track = queue.currentTrack;
        const elapsed = queue.startedAt ? Math.floor((Date.now() - queue.startedAt) / 1000) : 0;
        const isPaused = queue.player.state.status === AudioPlayerStatus.Paused;

        const embed = new EmbedBuilder()
            .setColor(COLOR_MAIN)
            .setAuthor({ name: isPaused ? '⏸ หยุดชั่วคราว' : '🎵 กำลังเล่นอยู่' })
            .setTitle(track.title)
            .setURL(track.url)
            .setThumbnail(track.thumbnail)
            .addFields(
                { name: '​', value: makeProgressBar(Math.min(elapsed, track.duration), track.duration) },
                { name: '🔁 Loop', value: queue.loop === 'off' ? 'ปิด' : queue.loop === 'track' ? 'เพลงนี้' : 'ทั้ง Queue', inline: true },
                { name: '🔊 ระดับเสียง', value: `${queue.volume}%`, inline: true },
                { name: '📋 เพลงรอต่อ', value: `${queue.tracks.length} เพลง`, inline: true },
                { name: '👤 ขอโดย', value: `<@${track.requestedBy.id}>`, inline: true }
            )
            .setFooter({ text: 'FrostByte Music' });

        return interaction.reply({ embeds: [embed] });
    },
};

// ─── /volume ──────────────────────────────────────────────────────────────────
const volumeCommand = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('ปรับระดับเสียง')
        .addIntegerOption(opt =>
            opt.setName('level')
                .setDescription('ระดับเสียง 1-100')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true)),

    async execute(interaction) {
        if (!getUserVoiceChannel(interaction)) {
            return interaction.reply({ embeds: [errEmbed('คุณต้องอยู่ใน Voice Channel ก่อน!')], ephemeral: true });
        }

        const queue = getQueue(interaction.guildId);
        if (!queue) {
            return interaction.reply({ embeds: [errEmbed('ไม่มีเพลงที่กำลังเล่นอยู่')], ephemeral: true });
        }

        const level = interaction.options.getInteger('level');
        setVolume(interaction.guildId, level);

        const bar = '🔊 ' + '█'.repeat(Math.round(level / 10)) + '░'.repeat(10 - Math.round(level / 10));
        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(COLOR_INFO)
                    .setDescription(`${bar}\nระดับเสียงตั้งเป็น **${level}%** แล้ว`)
            ]
        });
    },
};

// ─── /loop ────────────────────────────────────────────────────────────────────
const loopCommand = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('สลับโหมด Loop (ปิด → เพลงนี้ → ทั้ง Queue)'),

    async execute(interaction) {
        if (!getUserVoiceChannel(interaction)) {
            return interaction.reply({ embeds: [errEmbed('คุณต้องอยู่ใน Voice Channel ก่อน!')], ephemeral: true });
        }

        const queue = getQueue(interaction.guildId);
        if (!queue) {
            return interaction.reply({ embeds: [errEmbed('ไม่มีเพลงที่กำลังเล่นอยู่')], ephemeral: true });
        }

        const mode = toggleLoop(interaction.guildId);
        const labels = { off: '🔁 ปิด Loop', track: '🔂 วนซ้ำเพลงนี้', queue: '🔁 วนซ้ำทั้ง Queue' };
        return interaction.reply({ embeds: [infoEmbed(`${labels[mode]} แล้ว`)] });
    },
};

// ─── /shuffle ─────────────────────────────────────────────────────────────────
const shuffleCommand = {
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('สุ่มลำดับเพลงใน Queue'),

    async execute(interaction) {
        if (!getUserVoiceChannel(interaction)) {
            return interaction.reply({ embeds: [errEmbed('คุณต้องอยู่ใน Voice Channel ก่อน!')], ephemeral: true });
        }

        const queue = getQueue(interaction.guildId);
        if (!queue || queue.tracks.length < 2) {
            return interaction.reply({ embeds: [errEmbed('ต้องมีเพลงใน Queue อย่างน้อย 2 เพลงจึงจะสุ่มได้')], ephemeral: true });
        }

        const ok = shuffle(interaction.guildId);
        if (!ok) return interaction.reply({ embeds: [errEmbed('ไม่สามารถสุ่มได้ตอนนี้')], ephemeral: true });

        return interaction.reply({ embeds: [infoEmbed(`🔀 สุ่มลำดับ Queue ${queue.tracks.length} เพลงเรียบร้อยแล้ว`)] });
    },
};

// ─── /remove ──────────────────────────────────────────────────────────────────
const removeCommand = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('ลบเพลงออกจาก Queue ตามลำดับ')
        .addIntegerOption(opt =>
            opt.setName('position')
                .setDescription('ลำดับเพลงใน Queue (ดูได้จาก /queue)')
                .setMinValue(1)
                .setRequired(true)),

    async execute(interaction) {
        if (!getUserVoiceChannel(interaction)) {
            return interaction.reply({ embeds: [errEmbed('คุณต้องอยู่ใน Voice Channel ก่อน!')], ephemeral: true });
        }

        const queue = getQueue(interaction.guildId);
        if (!queue || queue.tracks.length === 0) {
            return interaction.reply({ embeds: [errEmbed('Queue ว่างเปล่าอยู่แล้ว')], ephemeral: true });
        }

        const pos = interaction.options.getInteger('position');
        const removed = removeTrack(interaction.guildId, pos);

        if (!removed) {
            return interaction.reply({ embeds: [errEmbed(`ไม่มีเพลงในลำดับที่ ${pos} (มีทั้งหมด ${queue.tracks.length} เพลง)`)], ephemeral: true });
        }

        return interaction.reply({
            embeds: [infoEmbed(`🗑️ ลบ **${removed.title}** ออกจากลำดับที่ ${pos} แล้ว`)]
        });
    },
};

// ─── Export ───────────────────────────────────────────────────────────────────
module.exports = [
    playCommand,
    skipCommand,
    stopCommand,
    pauseCommand,
    resumeCommand,
    queueCommand,
    nowplayingCommand,
    volumeCommand,
    loopCommand,
    shuffleCommand,
    removeCommand,
];
