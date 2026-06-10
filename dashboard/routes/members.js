const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const User        = require('../../models/User');
const GuildConfig = require('../../models/GuildConfig');

// ─── GET /api/:guildId/members ─────────────────────────────────────────────
// ดึงรายชื่อสมาชิก + ข้อมูล economy + roles (paginated + search)
router.get('/api/:guildId/members', async (req, res) => {
    const { guildId } = req.params;
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = 20;
    const search = (req.query.search || '').toLowerCase().trim();

    try {
        // ดึง users จาก MongoDB
        const dbUsers = await User.find({ guildId }).lean();

        // ดึง members + roles จาก Discord API (best-effort)
        let discordMembers = [];
        let rolesMap = {};
        try {
            const [mRes, rRes] = await Promise.all([
                axios.get(`https://discord.com/api/v10/guilds/${guildId}/members?limit=1000`, {
                    headers: { Authorization: `Bot ${process.env.TOKEN}` }
                }),
                axios.get(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
                    headers: { Authorization: `Bot ${process.env.TOKEN}` }
                })
            ]);
            discordMembers = mRes.data;
            rRes.data.forEach(r => {
                if (r.name !== '@everyone')
                    rolesMap[r.id] = { id: r.id, name: r.name, color: r.color || 0 };
            });
        } catch (e) {
            console.warn('[Members API] Discord fetch failed:', e.message);
        }

        // รวมข้อมูล
        const combined = dbUsers.map(u => {
            const dm       = discordMembers.find(m => m.user?.id === u.userId);
            const username = dm ? (dm.nick || dm.user.global_name || dm.user.username) : u.userId;
            const avatar   = dm?.user?.avatar
                ? `https://cdn.discordapp.com/avatars/${u.userId}/${dm.user.avatar}.png?size=32`
                : `https://cdn.discordapp.com/embed/avatars/${parseInt(u.userId) % 6}.png`;
            const roles = dm
                ? dm.roles.map(rid => rolesMap[rid]).filter(Boolean)
                : [];

            return {
                userId:    u.userId,
                username,
                avatar,
                roles,
                coins:     u.coins     || 0,
                bank:      u.bank      || 0,
                inventory: (u.inventory || []).map(i => ({ itemName: i.itemName, quantity: i.quantity })),
            };
        });

        // ค้นหา
        const filtered = search
            ? combined.filter(m => m.username.toLowerCase().includes(search))
            : combined;

        // เรียงตามเงินมากสุด
        filtered.sort((a, b) => (b.coins + b.bank) - (a.coins + a.bank));

        const total = filtered.length;
        const pages = Math.max(1, Math.ceil(total / limit));
        const data  = filtered.slice((page - 1) * limit, page * limit);

        res.json({ members: data, total, page, pages });
    } catch (err) {
        console.error('[Members API]', err);
        res.status(500).json({ error: 'โหลดข้อมูลล้มเหลว' });
    }
});

// ─── POST /api/:guildId/member/:userId/edit ────────────────────────────────
// แก้ไข coins / bank ของสมาชิก
router.post('/api/:guildId/member/:userId/edit', async (req, res) => {
    const { guildId, userId } = req.params;
    const coins = parseInt(req.body.coins);
    const bank  = parseInt(req.body.bank);

    if (isNaN(coins) || isNaN(bank) || coins < 0 || bank < 0)
        return res.status(400).json({ error: 'ค่าไม่ถูกต้อง (ต้องเป็นตัวเลข ≥ 0)' });

    try {
        let user = await User.findOne({ userId, guildId });
        if (!user) user = new User({ userId, guildId });
        user.coins = coins;
        user.bank  = bank;
        await user.save();
        res.json({ success: true, coins: user.coins, bank: user.bank });
    } catch (err) {
        console.error('[Member Edit]', err);
        res.status(500).json({ error: 'บันทึกล้มเหลว' });
    }
});

// ─── POST /api/:guildId/store-item/:itemId/edit ────────────────────────────
// แก้ไขข้อมูลสินค้าในร้าน
router.post('/api/:guildId/store-item/:itemId/edit', async (req, res) => {
    const { guildId, itemId } = req.params;
    try {
        const config = await GuildConfig.findOne({ guildId });
        if (!config) return res.status(404).json({ error: 'ไม่พบ config' });

        const item = config.storeItems.find(
            i => (i._id || i.itemId).toString() === itemId
        );
        if (!item) return res.status(404).json({ error: 'ไม่พบสินค้า' });

        if (req.body.itemName)      item.itemName      = req.body.itemName.trim();
        if (req.body.price !== undefined) {
            const p = parseInt(req.body.price);
            if (!isNaN(p) && p >= 0) item.price = p;
        }
        if (req.body.description !== undefined) item.description   = req.body.description;
        if (req.body.itemImage   !== undefined) item.itemImage     = req.body.itemImage.trim() || null;
        item.unlimitedStock = req.body.unlimitedStock === 'true';
        if (!item.unlimitedStock) {
            const s = parseInt(req.body.stock);
            if (!isNaN(s) && s >= 0) item.stock = s;
        } else {
            item.stock = 0;
        }
        item.listedInStore = req.body.listedInStore === 'true';
        item.sellable      = req.body.sellable      === 'true';
        item.inventoryItem = req.body.inventoryItem === 'true';

        config.markModified('storeItems');
        await config.save();
        res.json({ success: true });
    } catch (err) {
        console.error('[Store Item Edit]', err);
        res.status(500).json({ error: 'บันทึกล้มเหลว' });
    }
});

// ─── POST /api/:guildId/level ─────────────────────────────────────────────
// บันทึก level system config ทั้งหมดผ่าน JSON (แก้ bug form array encoding)
router.post('/api/:guildId/level', async (req, res) => {
    const { guildId } = req.params;
    try {
        let config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
        const b = req.body;

        config.levelEnabled           = !!b.levelEnabled;
        // Message XP
        config.xpPerMessageMin        = Math.max(1,  parseInt(b.xpPerMessageMin)  || 15);
        config.xpPerMessageMax        = Math.max(1,  parseInt(b.xpPerMessageMax)  || 25);
        config.xpCooldownSeconds      = Math.max(1,  parseInt(b.xpCooldownSeconds) || 60);
        // Voice XP
        config.voiceXpEnabled         = !!b.voiceXpEnabled;
        config.voiceXpPerMinute       = Math.max(1,  parseInt(b.voiceXpPerMinute)  || 5);
        // Command XP
        config.commandXpEnabled       = !!b.commandXpEnabled;
        config.commandXpMin           = Math.max(1,  parseInt(b.commandXpMin)  || 5);
        config.commandXpMax           = Math.max(1,  parseInt(b.commandXpMax)  || 15);
        config.commandXpCooldownSeconds = Math.max(1, parseInt(b.commandXpCooldownSeconds) || 30);
        // Reaction XP
        config.reactionXpEnabled      = !!b.reactionXpEnabled;
        config.reactionXpAmount       = Math.max(1,  parseInt(b.reactionXpAmount) || 5);
        config.reactionXpCooldownSeconds = Math.max(1, parseInt(b.reactionXpCooldownSeconds) || 120);
        // Options
        config.levelResetOnLeave      = !!b.levelResetOnLeave;
        config.levelResetOnBan        = !!b.levelResetOnBan;
        // XP Multiplier roles
        if (Array.isArray(b.xpMultiplierRoles)) {
            config.xpMultiplierRoles = b.xpMultiplierRoles
                .filter(r => r.roleId)
                .map(r => ({ roleId: r.roleId, roleName: r.roleName || '', multiplier: parseFloat(r.multiplier) || 2 }));
            config.markModified('xpMultiplierRoles');
        }
        // Ignore channels / roles
        config.levelIgnoreChannels    = Array.isArray(b.levelIgnoreChannels) ? b.levelIgnoreChannels.filter(Boolean) : [];
        config.levelIgnoreRoles       = Array.isArray(b.levelIgnoreRoles) ? b.levelIgnoreRoles.filter(Boolean) : [];
        config.markModified('levelIgnoreChannels');
        config.markModified('levelIgnoreRoles');
        // Notifications
        config.levelUpChannelId       = b.levelUpChannelId || '';
        config.levelUpMessage         = b.levelUpMessage   || '🎉 {user} เลื่อนระดับเป็น **Level {level}** แล้ว!';
        // Level roles
        if (Array.isArray(b.levelRoles)) {
            config.levelRoles = b.levelRoles
                .filter(r => r.level > 0 && r.roleId)
                .map(r => ({ level: parseInt(r.level), roleId: r.roleId, roleName: r.roleName || '' }));
            config.markModified('levelRoles');
        }
        // Rank Card
        config.rankCardBg      = b.rankCardBg      || '#0f0f17';
        config.rankCardBg2     = b.rankCardBg2     || '#1a1a2e';
        config.rankCardAccent  = b.rankCardAccent  || '';
        config.rankCardBgImage = b.rankCardBgImage || '';

        await config.save();
        res.json({ success: true });
    } catch (err) {
        console.error('[Level Config Save]', err);
        res.status(500).json({ error: 'บันทึกล้มเหลว: ' + err.message });
    }
});

// ─── GET /api/:guildId/channels ───────────────────────────────────────────
router.get('/api/:guildId/channels', async (req, res) => {
    const { guildId } = req.params;
    try {
        const r = await axios.get(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
            headers: { Authorization: `Bot ${process.env.TOKEN}` }
        });
        res.json(r.data
            .filter(c => c.type === 0 || c.type === 5)
            .sort((a, b) => a.position - b.position)
            .map(c => ({ id: c.id, name: c.name, type: c.type }))
        );
    } catch (err) {
        console.error('[Channels API]', err.message);
        res.status(500).json([]);
    }
});

module.exports = router;
