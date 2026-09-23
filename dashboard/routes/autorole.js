// dashboard/routes/autorole.js
const express    = require('express');
const router     = express.Router();
const { EmbedBuilder } = require('discord.js');
const GuildConfig = require('../../models/GuildConfig');

// ─── helper: สร้าง embed สำหรับ reaction role group ──────────────────────
function buildReactionEmbed(group) {
    const color = parseInt((group.color || '#5865F2').replace('#',''), 16) || 0x5865F2;
    const lines = group.roles.map(r =>
        `${r.emoji}  **${r.roleName || r.roleId}**${r.description ? ` — ${r.description}` : ''}`
    );
    const modeLabel = group.mode === 'unique'
        ? '*(เลือกได้แค่ 1 role ในกลุ่มนี้)*'
        : group.mode === 'verify'
        ? '*(react แล้วถอนไม่ได้)*'
        : '*(react = รับ · un-react = ถอน)*';

    return new EmbedBuilder()
        .setColor(color)
        .setTitle(group.title || 'เลือก Role')
        .setDescription(
            (group.description ? group.description + '\n\n' : '') +
            lines.join('\n') + '\n\n' + modeLabel
        )
        .setFooter({ text: `กลุ่ม: ${group.groupId}` });
}

// ─── POST /api/:guildId/autorole/join ────────────────────────────────────
// บันทึก Join Roles + Bot Join Roles + Sticky
router.post('/api/:guildId/autorole/join', async (req, res) => {
    const { guildId } = req.params;
    try {
        let config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
        const b = req.body;

        if (Array.isArray(b.joinRoles)) {
            config.joinRoles = b.joinRoles
                .filter(r => r.roleId)
                .map(r => ({ roleId: r.roleId, roleName: r.roleName || '', delaySeconds: parseInt(r.delaySeconds) || 0 }));
            config.markModified('joinRoles');
        }
        if (Array.isArray(b.botJoinRoles)) {
            config.botJoinRoles = b.botJoinRoles
                .filter(r => r.roleId)
                .map(r => ({ roleId: r.roleId, roleName: r.roleName || '' }));
            config.markModified('botJoinRoles');
        }
        config.stickyRolesEnabled = !!b.stickyRolesEnabled;
        await config.save();
        res.json({ success: true });
    } catch (err) {
        console.error('[AutoRole Join Save]', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/:guildId/autorole/group ───────────────────────────────────
// สร้าง reaction role group ใหม่ + ให้บอทส่ง embed ไปใน channel
router.post('/api/:guildId/autorole/group', async (req, res) => {
    const { guildId } = req.params;
    const client = req.app.locals.discordClient;
    if (!client) return res.status(503).json({ error: 'Bot not ready' });

    try {
        let config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
        const b = req.body;

        if (!b.channelId) return res.status(400).json({ error: 'ต้องระบุ channel' });
        if (!Array.isArray(b.roles) || !b.roles.length)
            return res.status(400).json({ error: 'ต้องมีอย่างน้อย 1 role' });

        const mongoose = require('mongoose');
        const groupId = new mongoose.Types.ObjectId().toString();
        const group = {
            groupId,
            channelId:   b.channelId,
            messageId:   '',
            title:       b.title       || 'เลือก Role',
            description: b.description || '',
            color:       b.color       || '#5865F2',
            mode:        ['toggle','unique','verify'].includes(b.mode) ? b.mode : 'toggle',
            roles:       b.roles.filter(r => r.emoji && r.roleId).map(r => ({
                emoji:       r.emoji.trim(),
                roleId:      r.roleId,
                roleName:    r.roleName    || r.roleId,
                description: r.description || ''
            }))
        };

        // ส่ง embed ผ่านบอท
        try {
            const channel = await client.channels.fetch(b.channelId);
            if (!channel) return res.status(404).json({ error: 'ไม่พบ channel' });

            const embed   = buildReactionEmbed(group);
            const msg     = await channel.send({ embeds: [embed] });
            group.messageId = msg.id;

            // เพิ่ม reactions ให้ครบ
            for (const r of group.roles) {
                await msg.react(r.emoji).catch(() => {});
            }
        } catch (e) {
            return res.status(400).json({ error: 'ส่งข้อความไม่ได้: ' + e.message });
        }

        config.reactionRoleGroups.push(group);
        config.markModified('reactionRoleGroups');
        await config.save();
        res.json({ success: true, groupId, messageId: group.messageId });
    } catch (err) {
        console.error('[AutoRole Create Group]', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── DELETE /api/:guildId/autorole/group/:groupId ─────────────────────────
// ลบ group + ลบข้อความบอทออกจาก channel
router.delete('/api/:guildId/autorole/group/:groupId', async (req, res) => {
    const { guildId, groupId } = req.params;
    const client = req.app.locals.discordClient;
    try {
        const config = await GuildConfig.findOne({ guildId });
        if (!config) return res.status(404).json({ error: 'ไม่พบ config' });

        const group = config.reactionRoleGroups.find(g => g.groupId === groupId);
        if (group && group.messageId && client) {
            try {
                const ch  = await client.channels.fetch(group.channelId);
                const msg = await ch?.messages.fetch(group.messageId);
                await msg?.delete();
            } catch {}
        }

        config.reactionRoleGroups = config.reactionRoleGroups.filter(g => g.groupId !== groupId);
        config.markModified('reactionRoleGroups');
        await config.save();
        res.json({ success: true });
    } catch (err) {
        console.error('[AutoRole Delete Group]', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/:guildId/autorole/group/:groupId/resend ────────────────────
// ส่ง embed ใหม่ (ถ้า message เดิมหาย)
router.post('/api/:guildId/autorole/group/:groupId/resend', async (req, res) => {
    const { guildId, groupId } = req.params;
    const client = req.app.locals.discordClient;
    if (!client) return res.status(503).json({ error: 'Bot not ready' });

    try {
        const config = await GuildConfig.findOne({ guildId });
        if (!config) return res.status(404).json({ error: 'ไม่พบ config' });

        const group = config.reactionRoleGroups.find(g => g.groupId === groupId);
        if (!group) return res.status(404).json({ error: 'ไม่พบ group' });

        // ลบ message เก่า
        if (group.messageId) {
            try {
                const ch  = await client.channels.fetch(group.channelId);
                const msg = await ch?.messages.fetch(group.messageId);
                await msg?.delete();
            } catch {}
        }

        const channel = await client.channels.fetch(group.channelId);
        if (!channel) return res.status(404).json({ error: 'ไม่พบ channel' });

        const embed = buildReactionEmbed(group);
        const msg   = await channel.send({ embeds: [embed] });
        group.messageId = msg.id;
        for (const r of group.roles) {
            await msg.react(r.emoji).catch(() => {});
        }

        config.markModified('reactionRoleGroups');
        await config.save();
        res.json({ success: true, messageId: group.messageId });
    } catch (err) {
        console.error('[AutoRole Resend]', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
