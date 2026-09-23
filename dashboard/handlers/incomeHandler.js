// dashboard/handlers/incomeHandler.js
// ─── Active Bonus / Seniority Bonus / Daily Quests / Level System ─────────

const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const GuildConfig = require('../../models/GuildConfig');
const User        = require('../../models/User');
const { calcLevel, generateRankCard } = require('../../utils/rankCard');

// ── helper: รีเซ็ต daily counter ถ้าเป็นวันใหม่ ────────────────────────────
function resetIfNewDay(user, dateField, ...countFields) {
    const today    = new Date().toDateString();
    const lastDate = user[dateField] ? new Date(user[dateField]).toDateString() : null;
    if (lastDate !== today) {
        for (const f of countFields) user[f] = 0;
        return true;
    }
    return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// Active Bonus: Message — รางวัลคนที่พิมพ์บ่อย
// ═══════════════════════════════════════════════════════════════════════════
async function handleActiveBonus(message) {
    if (message.author.bot || !message.guild) return;
    const guildId = message.guild.id;
    const userId  = message.author.id;
    try {
        const config = await GuildConfig.findOne({ guildId });
        if (!config || !config.activeBonusEnabled) return;
        if (config.activeBonusChannelId && message.channel.id !== config.activeBonusChannelId) return;

        let user = await User.findOne({ userId, guildId });
        if (!user) user = new User({ userId, guildId, coins: config.startCoins || 0 });

        const wasReset = resetIfNewDay(user, 'lastMessageDate', 'messageCountToday');
        if (wasReset) user.activeBonusPaid = false;

        user.messageCountToday += 1;
        user.lastMessageDate    = new Date();

        const threshold = config.activeBonusThreshold || 20;
        let bonusMsg = null;
        if (user.messageCountToday >= threshold && !user.activeBonusPaid) {
            const bonus = config.activeBonusAmount || 100;
            user.coins       += bonus;
            user.activeBonusPaid = true;
            bonusMsg = `🎉 <@${userId}> พูดคุยครบ **${threshold}** ข้อความวันนี้! ได้รับโบนัส **${bonus.toLocaleString()}** ${config.currencyEmoji || '💰'}`;
        }

        await checkQuestProgress(user, config, 'message_count', user.messageCountToday);
        await user.save();
        if (bonusMsg) await message.channel.send({ content: bonusMsg }).catch(() => {});
    } catch (err) { console.error('[MessageBonus] error:', err.message); }
}

// ═══════════════════════════════════════════════════════════════════════════
// Active Bonus: Voice — รางวัลคนที่อยู่ใน voice นาน
// ═══════════════════════════════════════════════════════════════════════════
async function handleVoiceBonus(oldState, newState) {
    const guild  = newState.guild || oldState.guild;
    const userId = newState.id    || oldState.id;
    if (!guild || !userId) return;
    if (newState.member?.user?.bot || oldState.member?.user?.bot) return;

    const guildId = guild.id;
    try {
        const config = await GuildConfig.findOne({ guildId });
        if (!config?.voiceBonusEnabled) return;

        const wasInVoice = oldState.channelId && !oldState.selfDeaf && !oldState.selfMute;
        const isInVoice  = newState.channelId && !newState.selfDeaf && !newState.selfMute;
        if (wasInVoice === isInVoice) return;

        let user = await User.findOne({ userId, guildId });
        if (!user) user = new User({ userId, guildId, coins: config.startCoins || 0 });

        // เข้า voice — บันทึกเวลาเริ่ม (voiceBonusJoinedAt แยกจาก XP system)
        if (!wasInVoice && isInVoice) {
            if (!user.voiceBonusJoinedAt) {
                user.voiceBonusJoinedAt = new Date();
                await user.save();
            }
            return;
        }

        // ออก voice — คำนวณนาที
        if (wasInVoice && !isInVoice) {
            if (!user.voiceBonusJoinedAt) return;
            const minutes = (Date.now() - new Date(user.voiceBonusJoinedAt).getTime()) / 60000;
            user.voiceBonusJoinedAt = null;
            if (minutes < 1) { await user.save(); return; }

            const wasReset = resetIfNewDay(user, 'lastVoiceBonusDate', 'voiceMinutesToday');
            if (wasReset) user.voiceBonusPaid = false;

            user.voiceMinutesToday  += Math.floor(minutes);
            user.lastVoiceBonusDate  = new Date();

            const threshold = config.voiceBonusThreshold || 30;
            let bonusMsg = null;
            if (user.voiceMinutesToday >= threshold && !user.voiceBonusPaid) {
                const bonus = config.voiceBonusAmount || 150;
                user.coins       += bonus;
                user.voiceBonusPaid = true;
                bonusMsg = `🎤 <@${userId}> อยู่ใน voice ครบ **${threshold}** นาทีวันนี้! ได้รับโบนัส **${bonus.toLocaleString()}** ${config.currencyEmoji || '💰'}`;
            }
            await user.save();
            if (bonusMsg) {
                const ch = config.voiceBonusChannelId
                    ? guild.channels.cache.get(config.voiceBonusChannelId)
                    : (newState.channel || oldState.channel);
                if (ch) await ch.send({ content: bonusMsg }).catch(() => {});
            }
        }
    } catch (err) { console.error('[VoiceBonus] error:', err.message); }
}

// ═══════════════════════════════════════════════════════════════════════════
// Active Bonus: Command — รางวัลคนที่ใช้คำสั่งบ่อย
// ═══════════════════════════════════════════════════════════════════════════
async function handleCommandBonus(interaction) {
    if (!interaction.guild || !interaction.user) return;
    const guildId = interaction.guild.id;
    const userId  = interaction.user.id;
    try {
        const config = await GuildConfig.findOne({ guildId });
        if (!config?.commandBonusEnabled) return;

        let user = await User.findOne({ userId, guildId });
        if (!user) user = new User({ userId, guildId, coins: config.startCoins || 0 });

        const wasReset = resetIfNewDay(user, 'lastCommandBonusDate', 'commandCountToday');
        if (wasReset) user.commandBonusPaid = false;

        user.commandCountToday   += 1;
        user.lastCommandBonusDate = new Date();

        const threshold = config.commandBonusThreshold || 10;
        let bonusMsg = null;
        if (user.commandCountToday >= threshold && !user.commandBonusPaid) {
            const bonus = config.commandBonusAmount || 80;
            user.coins          += bonus;
            user.commandBonusPaid = true;
            bonusMsg = `⚡ <@${userId}> ใช้คำสั่งครบ **${threshold}** ครั้งวันนี้! ได้รับโบนัส **${bonus.toLocaleString()}** ${config.currencyEmoji || '💰'}`;
        }
        await user.save();
        if (bonusMsg) {
            const ch = interaction.channel || interaction.guild.channels.cache.get(interaction.channelId);
            if (ch) await ch.send({ content: bonusMsg }).catch(() => {});
        }
    } catch (err) { console.error('[CommandBonus] error:', err.message); }
}

// ═══════════════════════════════════════════════════════════════════════════
// Active Bonus: React — รางวัลคนที่ react บ่อย
// ═══════════════════════════════════════════════════════════════════════════
async function handleReactBonus(reaction, discordUser) {
    if (discordUser.bot) return;
    const guild = reaction.message?.guild;
    if (!guild) return;
    const guildId = guild.id;
    const userId  = discordUser.id;
    try {
        const config = await GuildConfig.findOne({ guildId });
        if (!config?.reactBonusEnabled) return;

        let user = await User.findOne({ userId, guildId });
        if (!user) user = new User({ userId, guildId, coins: config.startCoins || 0 });

        const wasReset = resetIfNewDay(user, 'lastReactBonusDate', 'reactCountToday');
        if (wasReset) user.reactBonusPaid = false;

        user.reactCountToday   += 1;
        user.lastReactBonusDate = new Date();

        const threshold = config.reactBonusThreshold || 15;
        let bonusMsg = null;
        if (user.reactCountToday >= threshold && !user.reactBonusPaid) {
            const bonus = config.reactBonusAmount || 60;
            user.coins       += bonus;
            user.reactBonusPaid = true;
            bonusMsg = `🎭 <@${userId}> react ครบ **${threshold}** ครั้งวันนี้! ได้รับโบนัส **${bonus.toLocaleString()}** ${config.currencyEmoji || '💰'}`;
        }
        await user.save();
        if (bonusMsg) {
            await reaction.message.channel.send({ content: bonusMsg }).catch(() => {});
        }
    } catch (err) { console.error('[ReactBonus] error:', err.message); }
}

// ═══════════════════════════════════════════════════════════════════════════
// Level System — shared helper
// ═══════════════════════════════════════════════════════════════════════════

// คำนวณ multiplier จาก roles ของ member
function getXpMultiplier(memberRoles, config) {
    if (!config.xpMultiplierRoles?.length) return 1;
    let best = 1;
    for (const mr of config.xpMultiplierRoles) {
        if (memberRoles.has(mr.roleId)) {
            best = Math.max(best, mr.multiplier || 1);
        }
    }
    return best;
}

// ตรวจว่า channel/role ถูก ignore
function isIgnored(channelId, memberRoles, config) {
    if (config.levelIgnoreChannels?.includes(channelId)) return true;
    if (config.levelIgnoreRoles?.some(rid => memberRoles?.has(rid))) return true;
    return false;
}

// level up notification + role reward + rank card (shared across XP sources)
async function handleLevelUp(guild, userId, username, newLevel, config, sourceChannelOrInteraction = null) {
    // ── Role rewards ──────────────────────────────────────
    let member = null;
    if (config.levelRoles?.length) {
        try {
            member = await guild.members.fetch(userId);
            for (const lr of config.levelRoles) {
                if (lr.level === newLevel) {
                    const role = guild.roles.cache.get(lr.roleId)
                        || await guild.roles.fetch(lr.roleId).catch(() => null);
                    if (role) await member.roles.add(role).catch(() => {});
                }
            }
        } catch {}
    }

    // ── Build notification embed ──────────────────────────
    const title   = (config.levelUpTitle || '🎉 Level Up!').replace('{level}', String(newLevel)).replace('{username}', username);
    const msgTmpl = config.levelUpMessage || '{user} เลื่อนระดับเป็น **Level {level}** แล้ว!';
    const desc    = msgTmpl
        .replace('{user}',     `<@${userId}>`)
        .replace('{level}',    String(newLevel))
        .replace('{username}', username);

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(desc)
        .setColor(config.rankCardAccent || '#5865F2')
        .setTimestamp();

    // ── Rank card ─────────────────────────────────────────
    let files = [];
    if (config.rankCardEnabled !== false) {
        try {
            if (!member) member = await guild.members.fetch(userId).catch(() => null);

            // หา role style ที่กำหนดไว้ (ตามยศสูงสุดของ member)
            let cardAccent  = config.rankCardAccent  || null;
            let cardBg1     = config.rankCardBg      || '#0f0f17';
            let cardBg2     = config.rankCardBg2     || '#1a1a2e';
            let cardBgImage = config.rankCardBgImage || '';
            let cardFooter  = config.rankCardFooter  || '';

            if (member && config.rankCardRoleStyles?.length) {
                const sortedRoles = member.roles.cache
                    .filter(r => r.id !== guild.id)
                    .sort((a, b) => b.position - a.position);
                for (const [, role] of sortedRoles) {
                    const style = config.rankCardRoleStyles.find(s => s.roleId === role.id);
                    if (style) {
                        if (style.accentColor) cardAccent  = style.accentColor;
                        if (style.bgColor)     cardBg1     = style.bgColor;
                        if (style.bg2Color)    cardBg2     = style.bg2Color;
                        if (style.bgImage)     cardBgImage = style.bgImage;
                        break;
                    }
                }
            }

            // ถ้ายังไม่มี accent ให้ใช้สี top role
            if (!cardAccent && member) {
                const topRole = member.roles.cache
                    .filter(r => r.color !== 0)
                    .sort((a, b) => b.position - a.position)
                    .first();
                if (topRole) cardAccent = `#${topRole.color.toString(16).padStart(6, '0')}`;
            }
            cardAccent = cardAccent || '#5865F2';

            // ดึง XP/rank ของ user
            const dbUser   = await User.findOne({ userId, guildId: guild.id }).lean();
            const totalXp  = dbUser?.xp || 0;
            const { currentLevelXp, neededForNext } = calcLevel(totalXp);
            const allUsers = await User.find({ guildId: guild.id }).sort({ xp: -1 }).lean();
            const rank     = allUsers.findIndex(u => u.userId === userId) + 1 || '—';
            const avatarURL = (await guild.client.users.fetch(userId).catch(() => null))
                ?.displayAvatarURL({ extension: 'png', size: 256 }) || '';

            const buffer = await generateRankCard({
                username, avatarURL,
                xp: totalXp, level: newLevel, rank,
                currentLevelXp, neededForNext,
                accentColor: cardAccent,
                bg1: cardBg1, bg2: cardBg2,
                bgImage: cardBgImage,
                footerText: cardFooter
            });

            if (buffer) {
                embed.setImage('attachment://rank.png');
                files = [new AttachmentBuilder(buffer, { name: 'rank.png' })];
            }
        } catch (e) { console.error('[LevelUp rankcard]', e.message); }
    }

    // ── ส่งแจ้งเตือน ─────────────────────────────────────
    const notifChannel = config.levelUpChannelId
        ? guild.channels.cache.get(config.levelUpChannelId)
        : (sourceChannelOrInteraction?.channel || sourceChannelOrInteraction || null);

    const payload = { embeds: [embed], files };
    if (notifChannel) {
        await notifChannel.send(payload).catch(() => {});
    }
    return desc; // ส่งกลับให้ caller ใช้ถ้าต้องการ
}

// ─── Message XP ───────────────────────────────────────────────────────────
async function handleXpGain(message) {
    if (message.author.bot || !message.guild) return;
    const guildId = message.guild.id;
    const userId  = message.author.id;
    try {
        const config = await GuildConfig.findOne({ guildId });
        if (!config?.levelEnabled) return;

        // Ignore checks
        const member = await message.guild.members.fetch(userId).catch(() => null);
        if (!member) return;
        if (isIgnored(message.channel.id, member.roles.cache, config)) return;

        const now = Date.now();
        let user = await User.findOne({ userId, guildId });
        if (!user) user = new User({ userId, guildId, coins: config.startCoins || 0 });
        if (user.xpCooldownUntil && new Date(user.xpCooldownUntil).getTime() > now) return;

        const min       = config.xpPerMessageMin ?? 15;
        const max       = config.xpPerMessageMax ?? 25;
        const base      = Math.floor(Math.random() * (max - min + 1)) + min;
        const mult      = getXpMultiplier(member.roles.cache, config);
        const gained    = Math.round(base * mult);

        const oldLevel  = calcLevel(user.xp || 0).level;
        user.xp         = (user.xp || 0) + gained;
        const newLevel  = calcLevel(user.xp).level;
        user.xpCooldownUntil = new Date(now + (config.xpCooldownSeconds ?? 60) * 1000);
        await user.save();

        if (newLevel > oldLevel) {
            await handleLevelUp(message.guild, userId, message.author.username, newLevel, config, message.channel);
        }
    } catch (err) { console.error('[XP Gain] error:', err.message); }
}

// ─── Command XP ───────────────────────────────────────────────────────────
async function handleCommandXp(interaction) {
    if (!interaction.guild || !interaction.user) return;
    const guildId = interaction.guild.id;
    const userId  = interaction.user.id;
    try {
        const config = await GuildConfig.findOne({ guildId });
        if (!config?.levelEnabled || !config.commandXpEnabled) return;

        const member = await interaction.guild.members.fetch(userId).catch(() => null);
        if (!member) return;
        if (isIgnored(interaction.channelId, member.roles.cache, config)) return;

        const now = Date.now();
        let user = await User.findOne({ userId, guildId });
        if (!user) user = new User({ userId, guildId, coins: config.startCoins || 0 });
        if (user.commandXpCooldownUntil && new Date(user.commandXpCooldownUntil).getTime() > now) return;

        const min    = config.commandXpMin ?? 5;
        const max    = config.commandXpMax ?? 15;
        const base   = Math.floor(Math.random() * (max - min + 1)) + min;
        const mult   = getXpMultiplier(member.roles.cache, config);
        const gained = Math.round(base * mult);

        const oldLevel = calcLevel(user.xp || 0).level;
        user.xp        = (user.xp || 0) + gained;
        const newLevel = calcLevel(user.xp).level;
        user.commandXpCooldownUntil = new Date(now + (config.commandXpCooldownSeconds ?? 30) * 1000);
        await user.save();

        if (newLevel > oldLevel) {
            const ch = interaction.channel || interaction.guild.channels.cache.get(interaction.channelId);
            await handleLevelUp(interaction.guild, userId, interaction.user.username, newLevel, config, ch);
        }
    } catch (err) { console.error('[Command XP] error:', err.message); }
}

// ─── Reaction XP ──────────────────────────────────────────────────────────
async function handleReactionXp(reaction, user) {
    if (user.bot) return;
    const guild = reaction.message?.guild;
    if (!guild) return;
    const guildId = guild.id;
    const userId  = user.id;
    try {
        const config = await GuildConfig.findOne({ guildId });
        if (!config?.levelEnabled || !config.reactionXpEnabled) return;

        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return;
        if (isIgnored(reaction.message.channelId, member.roles.cache, config)) return;

        const now = Date.now();
        let dbUser = await User.findOne({ userId, guildId });
        if (!dbUser) dbUser = new User({ userId, guildId, coins: config.startCoins || 0 });
        if (dbUser.reactionXpCooldownUntil && new Date(dbUser.reactionXpCooldownUntil).getTime() > now) return;

        const base   = config.reactionXpAmount ?? 5;
        const mult   = getXpMultiplier(member.roles.cache, config);
        const gained = Math.round(base * mult);

        const oldLevel = calcLevel(dbUser.xp || 0).level;
        dbUser.xp      = (dbUser.xp || 0) + gained;
        const newLevel = calcLevel(dbUser.xp).level;
        dbUser.reactionXpCooldownUntil = new Date(now + (config.reactionXpCooldownSeconds ?? 120) * 1000);
        await dbUser.save();

        if (newLevel > oldLevel) {
            await handleLevelUp(guild, userId, user.username, newLevel, config, reaction.message.channel);
        }
    } catch (err) { console.error('[Reaction XP] error:', err.message); }
}

// ─── Voice XP ─────────────────────────────────────────────────────────────
// เรียกใน voiceStateUpdate: เมื่อ join → บันทึก voiceJoinedAt
//                           เมื่อ leave/mute → คำนวณ XP จาก time spent
async function handleVoiceXp(oldState, newState) {
    const guild   = newState.guild || oldState.guild;
    const userId  = newState.id || oldState.id;
    if (!guild || !userId) return;

    const guildId = guild.id;
    const member  = newState.member || oldState.member;
    if (member?.user?.bot) return;

    try {
        const config = await GuildConfig.findOne({ guildId });
        if (!config?.levelEnabled || !config.voiceXpEnabled) return;

        const wasInVoice = oldState.channelId && !oldState.selfDeaf && !oldState.selfMute;
        const isInVoice  = newState.channelId && !newState.selfDeaf && !newState.selfMute;

        let dbUser = await User.findOne({ userId, guildId });
        if (!dbUser) dbUser = new User({ userId, guildId, coins: config.startCoins || 0 });

        // ── เข้า voice ──
        if (!wasInVoice && isInVoice) {
            dbUser.voiceJoinedAt = new Date();
            await dbUser.save();
            return;
        }

        // ── ออก voice หรือ mute ──
        if (wasInVoice && !isInVoice) {
            if (!dbUser.voiceJoinedAt) return;
            const minutes = (Date.now() - new Date(dbUser.voiceJoinedAt).getTime()) / 60000;
            dbUser.voiceJoinedAt = null;
            if (minutes < 1) { await dbUser.save(); return; } // อยู่น้อยกว่า 1 นาที ไม่ให้ XP

            const xpRate = config.voiceXpPerMinute ?? 5;
            const mult   = member ? getXpMultiplier(member.roles.cache, config) : 1;
            const gained = Math.round(Math.floor(minutes) * xpRate * mult);

            const oldLevel = calcLevel(dbUser.xp || 0).level;
            dbUser.xp      = (dbUser.xp || 0) + gained;
            const newLevel = calcLevel(dbUser.xp).level;
            await dbUser.save();

            if (newLevel > oldLevel) {
                await handleLevelUp(guild, userId, member?.user?.username || userId, newLevel, config, null);
            }
        }
    } catch (err) { console.error('[Voice XP] error:', err.message); }
}

// ─── Reset on Leave / Ban ─────────────────────────────────────────────────
async function handleMemberLeave(member) {
    const guildId = member.guild.id;
    const userId  = member.id;
    try {
        const config = await GuildConfig.findOne({ guildId });
        if (!config?.levelResetOnLeave) return;
        await User.updateOne({ userId, guildId }, { $set: { xp: 0, level: 0 } });
    } catch (err) { console.error('[Level Reset Leave]', err.message); }
}

async function handleMemberBan(guild, user) {
    const guildId = guild.id;
    const userId  = user.id;
    try {
        const config = await GuildConfig.findOne({ guildId });
        if (!config?.levelResetOnBan) return;
        await User.updateOne({ userId, guildId }, { $set: { xp: 0, level: 0 } });
    } catch (err) { console.error('[Level Reset Ban]', err.message); }
}

// ═══════════════════════════════════════════════════════════════════════════
// Seniority Bonus — จ่ายรายวันตามอายุการเป็นสมาชิก
// เรียกจาก daily cron หรือ /claim
// ═══════════════════════════════════════════════════════════════════════════
async function getSeniorityBonus(member, config) {
    if (!config || !config.seniorityBonusEnabled) return 0;
    if (!config.seniorityTiers || config.seniorityTiers.length === 0) return 0;

    const joinedAt  = member.joinedAt || new Date();
    const daysIn    = Math.floor((Date.now() - new Date(joinedAt).getTime()) / 86400000);

    // เรียง tier จากมากไปน้อย หาอันที่ผ่านเกณฑ์
    const sorted = [...config.seniorityTiers].sort((a, b) => b.minDays - a.minDays);
    const tier   = sorted.find(t => daysIn >= t.minDays);
    return tier ? tier.amount : 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// Daily Quests — สุ่มและตรวจสอบภารกิจรายวัน
// ═══════════════════════════════════════════════════════════════════════════

// สร้าง quests ใหม่สำหรับวันนี้
async function refreshDailyQuests(user, config) {
    if (!config.dailyQuestsEnabled || !config.questPool || config.questPool.length === 0) return;

    const today    = new Date().toDateString();
    const lastDate = user.lastQuestDate ? new Date(user.lastQuestDate).toDateString() : null;
    if (lastDate === today) return; // สร้างแล้วในวันนี้

    // สุ่ม quests จาก pool
    const pool   = [...config.questPool];
    const count  = Math.min(config.dailyQuestCount || 3, pool.length);
    const chosen = [];
    while (chosen.length < count) {
        const idx = Math.floor(Math.random() * pool.length);
        chosen.push(pool.splice(idx, 1)[0]);
    }

    user.dailyQuests  = chosen.map(q => ({
        questId:     q.questId,
        description: q.description,
        completed:   false,
        reward:      q.reward
    }));
    user.lastQuestDate = new Date();
}

// ตรวจว่าทำ quest เสร็จไหม
async function checkQuestProgress(user, config, questType, value) {
    if (!user.dailyQuests || user.dailyQuests.length === 0) return;
    if (!config.questPool) return;

    for (const quest of user.dailyQuests) {
        if (quest.completed) continue;
        const def = config.questPool.find(q => q.questId === quest.questId);
        if (!def || def.type !== questType) continue;
        if (value >= (def.target || 1)) {
            quest.completed = true;
            user.coins += quest.reward || 0;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// /daily command logic — ให้ call จาก slash command
// ═══════════════════════════════════════════════════════════════════════════
async function claimDailyRewards(interaction) {
    const userId  = interaction.user.id;
    const guildId = interaction.guild.id;

    try {
        const config = await GuildConfig.findOne({ guildId });
        if (!config) return interaction.reply({ content: '❌ ยังไม่มีการตั้งค่าเซิร์ฟ', ephemeral: true });

        let user = await User.findOne({ userId, guildId });
        if (!user) {
            user = new User({ userId, guildId, coins: config.startCoins || 0 });
        }

        // บันทึก joinedAt ครั้งแรก
        if (!user.joinedAt && interaction.member.joinedAt) {
            user.joinedAt = interaction.member.joinedAt;
        }

        // สร้าง / refresh quests
        await refreshDailyQuests(user, config);

        // Seniority Bonus
        const senBonus = await getSeniorityBonus(interaction.member, config);

        let lines = [`📅 **Daily Report ของ ${interaction.user.username}**\n`];

        if (senBonus > 0) {
            user.coins += senBonus;
            const daysIn = Math.floor((Date.now() - new Date(user.joinedAt).getTime()) / 86400000);
            lines.push(`🏅 **Seniority Bonus**: +**${senBonus.toLocaleString()}** ${config.currencyEmoji || '💰'} (อยู่มา ${daysIn} วัน)`);
        }

        // แสดง quest list
        if (config.dailyQuestsEnabled && user.dailyQuests.length > 0) {
            lines.push(`\n📋 **Daily Quests วันนี้:**`);
            for (const q of user.dailyQuests) {
                const icon = q.completed ? '✅' : '⬜';
                lines.push(`${icon} ${q.description} → รางวัล **${q.reward.toLocaleString()}** ${config.currencyEmoji || '💰'}`);
            }
        }

        lines.push(`\n👛 เงินปัจจุบัน: **${user.coins.toLocaleString()}** ${config.currencyEmoji || '💰'}`);

        await user.save();
        return interaction.reply({ content: lines.join('\n'), ephemeral: true });

    } catch (err) {
        console.error('[Daily] error:', err);
        return interaction.reply({ content: 'เกิดข้อผิดพลาด', ephemeral: true });
    }
}

module.exports = {
    handleActiveBonus, handleVoiceBonus, handleCommandBonus, handleReactBonus,
    handleXpGain, handleCommandXp, handleReactionXp, handleVoiceXp,
    handleMemberLeave, handleMemberBan,
    getSeniorityBonus, refreshDailyQuests, checkQuestProgress, claimDailyRewards
};
