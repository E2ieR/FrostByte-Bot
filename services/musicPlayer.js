'use strict';

const {
    createAudioPlayer,
    createAudioResource,
    joinVoiceChannel,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    StreamType,
} = require('@discordjs/voice');
const playdl = require('play-dl');

// ─── Spotify token init ───────────────────────────────────────────────────────
async function initSpotify() {
    if (
        process.env.SPOTIFY_CLIENT_ID &&
        process.env.SPOTIFY_CLIENT_SECRET &&
        process.env.SPOTIFY_REFRESH_TOKEN
    ) {
        try {
            await playdl.setToken({
                spotify: {
                    client_id: process.env.SPOTIFY_CLIENT_ID,
                    client_secret: process.env.SPOTIFY_CLIENT_SECRET,
                    refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
                    market: 'TH',
                },
            });
            console.log('[Music] Spotify token ตั้งค่าเรียบร้อย');
        } catch (err) {
            console.warn('[Music] ไม่สามารถตั้งค่า Spotify token:', err.message);
        }
    }
}
initSpotify();

// ─── Queue store ─────────────────────────────────────────────────────────────
/** @type {Map<string, GuildQueue>} */
const queues = new Map();

/**
 * @typedef {Object} Track
 * @property {string} title
 * @property {string} url         — YouTube URL เสมอ
 * @property {number} duration    — วินาที
 * @property {string} thumbnail
 * @property {import('discord.js').User} requestedBy
 */

/**
 * @typedef {Object} GuildQueue
 * @property {Track[]} tracks
 * @property {Track|null} currentTrack
 * @property {import('@discordjs/voice').AudioPlayer} player
 * @property {import('@discordjs/voice').VoiceConnection} connection
 * @property {number} volume          — 0-100
 * @property {'off'|'track'|'queue'} loop
 * @property {import('discord.js').TextChannel} textChannel
 * @property {ReturnType<typeof setTimeout>|null} leaveTimer
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────
function secondsToTimestamp(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
}

function makeProgressBar(current, total, length = 15) {
    const pct = total > 0 ? Math.min(current / total, 1) : 0;
    const filled = Math.round(pct * length);
    const bar = '▬'.repeat(filled) + '●' + '▬'.repeat(length - filled);
    return `\`${bar}\` ${secondsToTimestamp(current)} / ${secondsToTimestamp(total)}`;
}

// ─── Core ─────────────────────────────────────────────────────────────────────
/**
 * ดึง GuildQueue หรือสร้างใหม่
 * @param {string} guildId
 * @param {import('@discordjs/voice').VoiceChannel} voiceChannel
 * @param {import('discord.js').TextChannel} textChannel
 * @param {import('discord.js').Client} client
 * @returns {GuildQueue}
 */
function getOrCreateQueue(guildId, voiceChannel, textChannel, client) {
    if (queues.has(guildId)) return queues.get(guildId);

    const player = createAudioPlayer();
    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    connection.subscribe(player);

    /** @type {GuildQueue} */
    const queue = {
        tracks: [],
        currentTrack: null,
        player,
        connection,
        volume: 50,
        loop: 'off',
        textChannel,
        leaveTimer: null,
        startedAt: null,
    };

    // เมื่อ player ว่าง → เล่นถัดไป
    player.on(AudioPlayerStatus.Idle, async () => {
        if (queue.loop === 'track' && queue.currentTrack) {
            // วนซ้ำเพลงเดิม
            await _playTrack(queue, queue.currentTrack);
            return;
        }
        if (queue.loop === 'queue' && queue.currentTrack) {
            queue.tracks.push(queue.currentTrack);
        }
        await playNext(guildId);
    });

    player.on('error', err => {
        console.error('[MusicPlayer] AudioPlayer error:', err.message);
        playNext(guildId).catch(() => {});
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
        } catch {
            stop(guildId);
        }
    });

    queues.set(guildId, queue);
    return queue;
}

/**
 * Resolve URL/text → Track[]
 * @param {string} query
 * @param {import('discord.js').User} requestedBy
 * @returns {Promise<Track[]>}
 */
async function resolveTracks(query, requestedBy) {
    const tracks = [];

    // ─── Spotify ───────────────────────────────────────────────
    if (playdl.is_expired()) await playdl.refreshToken();

    const spType = playdl.sp_validate ? await playdl.sp_validate(query).catch(() => false) : false;

    if (spType && spType !== false) {
        if (spType === 'track') {
            const spData = await playdl.spotify(query);
            const ytResults = await playdl.search(
                `${spData.name} ${spData.artists[0]?.name || ''}`,
                { limit: 1, source: { youtube: 'video' } }
            );
            if (ytResults[0]) {
                tracks.push({
                    title: spData.name + (spData.artists[0] ? ` — ${spData.artists[0].name}` : ''),
                    url: ytResults[0].url,
                    duration: Math.floor(spData.durationInSec || ytResults[0].durationInSec || 0),
                    thumbnail: spData.thumbnail?.url || ytResults[0].thumbnails?.[0]?.url || '',
                    requestedBy,
                });
            }
        } else if (spType === 'playlist' || spType === 'album') {
            const spData = await playdl.spotify(query);
            const items = spData.fetched_tracks
                ? await spData.all_tracks()
                : spData.tracks || [];
            for (const t of items.slice(0, 50)) {
                const ytRes = await playdl.search(
                    `${t.name} ${t.artists?.[0]?.name || ''}`,
                    { limit: 1, source: { youtube: 'video' } }
                ).catch(() => []);
                if (ytRes[0]) {
                    tracks.push({
                        title: t.name + (t.artists?.[0] ? ` — ${t.artists[0].name}` : ''),
                        url: ytRes[0].url,
                        duration: Math.floor(t.durationInSec || ytRes[0].durationInSec || 0),
                        thumbnail: t.thumbnail?.url || ytRes[0].thumbnails?.[0]?.url || '',
                        requestedBy,
                    });
                }
            }
        }
        return tracks;
    }

    // ─── YouTube URL ───────────────────────────────────────────
    const ytType = playdl.yt_validate ? playdl.yt_validate(query) : false;

    if (ytType === 'video') {
        const info = await playdl.video_info(query);
        tracks.push({
            title: info.video_details.title,
            url: info.video_details.url,
            duration: Number(info.video_details.durationInSec) || 0,
            thumbnail: info.video_details.thumbnails?.[0]?.url || '',
            requestedBy,
        });
        return tracks;
    }

    if (ytType === 'playlist') {
        const pl = await playdl.playlist_info(query, { incomplete: true });
        const videos = await pl.all_videos();
        for (const v of videos.slice(0, 50)) {
            tracks.push({
                title: v.title,
                url: v.url,
                duration: Number(v.durationInSec) || 0,
                thumbnail: v.thumbnails?.[0]?.url || '',
                requestedBy,
            });
        }
        return tracks;
    }

    // ─── Search text ───────────────────────────────────────────
    const results = await playdl.search(query, { limit: 1, source: { youtube: 'video' } });
    if (results[0]) {
        tracks.push({
            title: results[0].title,
            url: results[0].url,
            duration: Number(results[0].durationInSec) || 0,
            thumbnail: results[0].thumbnails?.[0]?.url || '',
            requestedBy,
        });
    }
    return tracks;
}

/**
 * เพิ่ม tracks เข้า queue
 * @param {string} guildId
 * @param {Track[]} tracks
 */
function addTracks(guildId, tracks) {
    const queue = queues.get(guildId);
    if (!queue) return;
    queue.tracks.push(...tracks);
}

/**
 * เล่นเพลงจาก queue
 * @param {string} guildId
 */
async function playNext(guildId) {
    const queue = queues.get(guildId);
    if (!queue) return;

    if (queue.tracks.length === 0) {
        queue.currentTrack = null;
        // ตั้ง timer disconnect 30 วิ
        queue.leaveTimer = setTimeout(() => {
            stop(guildId);
        }, 30_000);
        return;
    }

    if (queue.leaveTimer) {
        clearTimeout(queue.leaveTimer);
        queue.leaveTimer = null;
    }

    const track = queue.tracks.shift();
    await _playTrack(queue, track);
}

async function _playTrack(queue, track) {
    queue.currentTrack = track;
    queue.startedAt = Date.now();

    try {
        const stream = await playdl.stream(track.url, { quality: 2 });
        const resource = createAudioResource(stream.stream, {
            inputType: stream.type,
            inlineVolume: true,
        });
        resource.volume?.setVolume(queue.volume / 100);
        queue.player.play(resource);
    } catch (err) {
        console.error('[MusicPlayer] _playTrack error:', err.message);
        // ข้ามไปเพลงถัดไป
        const guildId = [...queues.entries()].find(([, q]) => q === queue)?.[0];
        if (guildId) await playNext(guildId);
    }
}

/**
 * หยุดและล้าง queue
 * @param {string} guildId
 */
function stop(guildId) {
    const queue = queues.get(guildId);
    if (!queue) return;
    if (queue.leaveTimer) clearTimeout(queue.leaveTimer);
    queue.tracks = [];
    queue.currentTrack = null;
    queue.player.stop(true);
    try { queue.connection.destroy(); } catch {}
    queues.delete(guildId);
}

/**
 * ข้ามเพลง
 * @param {string} guildId
 */
function skip(guildId) {
    const queue = queues.get(guildId);
    if (!queue) return false;
    queue.loop = queue.loop === 'track' ? 'off' : queue.loop; // force skip แม้ track loop
    queue.player.stop();
    return true;
}

function pause(guildId) {
    const queue = queues.get(guildId);
    if (!queue) return false;
    return queue.player.pause();
}

function resume(guildId) {
    const queue = queues.get(guildId);
    if (!queue) return false;
    return queue.player.unpause();
}

function setVolume(guildId, vol) {
    const queue = queues.get(guildId);
    if (!queue) return false;
    queue.volume = vol;
    // อัปเดต resource ปัจจุบัน
    const state = queue.player.state;
    if (state?.status !== AudioPlayerStatus.Idle && state?.resource?.volume) {
        state.resource.volume.setVolume(vol / 100);
    }
    return true;
}

function shuffle(guildId) {
    const queue = queues.get(guildId);
    if (!queue || queue.tracks.length < 2) return false;
    for (let i = queue.tracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue.tracks[i], queue.tracks[j]] = [queue.tracks[j], queue.tracks[i]];
    }
    return true;
}

function removeTrack(guildId, position) {
    const queue = queues.get(guildId);
    if (!queue || position < 1 || position > queue.tracks.length) return null;
    const [removed] = queue.tracks.splice(position - 1, 1);
    return removed;
}

function toggleLoop(guildId) {
    const queue = queues.get(guildId);
    if (!queue) return null;
    const modes = ['off', 'track', 'queue'];
    const next = modes[(modes.indexOf(queue.loop) + 1) % modes.length];
    queue.loop = next;
    return next;
}

function getQueue(guildId) {
    return queues.get(guildId) || null;
}

module.exports = {
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
};
