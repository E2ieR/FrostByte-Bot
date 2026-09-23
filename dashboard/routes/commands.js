const express = require('express');
const router  = express.Router();
const GuildConfig = require('../../models/GuildConfig');

// GET all available commands list
router.get('/api/:guildId/commands-list', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
    res.json([
        { name: 'balance',    category: 'economy',  label: '/balance',    desc: 'ดูยอดเงิน' },
        { name: 'daily',      category: 'economy',  label: '/daily',      desc: 'รับเงินประจำวัน' },
        { name: 'deposit',    category: 'economy',  label: '/deposit',    desc: 'ฝากเงินธนาคาร' },
        { name: 'withdraw',   category: 'economy',  label: '/withdraw',   desc: 'ถอนเงินธนาคาร' },
        { name: 'give',       category: 'economy',  label: '/give',       desc: 'โอนเงินให้ผู้อื่น' },
        { name: 'work',       category: 'economy',  label: '/work',       desc: 'ทำงานหาเงิน' },
        { name: 'rob',        category: 'economy',  label: '/rob',        desc: 'ปล้นเงิน' },
        { name: 'leaderboard',category: 'economy',  label: '/leaderboard',desc: 'อันดับความรวย' },
        { name: 'rank',       category: 'economy',  label: '/rank',       desc: 'ดูอันดับ Level' },
        { name: 'blackjack',  category: 'gambling', label: '/blackjack',  desc: 'เกม Blackjack' },
        { name: 'coinflip',   category: 'gambling', label: '/coinflip',   desc: 'ทายหัว-ก้อย' },
        { name: 'crash',      category: 'gambling', label: '/crash',      desc: 'เกม Crash' },
        { name: 'rps',        category: 'gambling', label: '/rps',        desc: 'เป่ายิ้งฉุบ' },
        { name: 'roulette',   category: 'gambling', label: '/roulette',   desc: 'รูเล็ต' },
        { name: 'slots',      category: 'gambling', label: '/slots',      desc: 'สล็อตแมชชีน' },
        { name: 'esports',    category: 'sports',   label: '/esports',    desc: 'ข้อมูล Esports' },
        { name: 'f1',         category: 'sports',   label: '/f1',         desc: 'ข้อมูล Formula 1' },
        { name: 'football',   category: 'sports',   label: '/football',   desc: 'ข้อมูลฟุตบอล' },
        { name: 'worldcup',   category: 'sports',   label: '/worldcup',   desc: 'FIFA World Cup 2026' },
        { name: 'music',      category: 'other',    label: '/music',      desc: 'ระบบเพลง' },
        { name: 'items',      category: 'other',    label: '/items',      desc: 'จัดการไอเทม' },
        { name: 'fun',        category: 'other',    label: '/fun',        desc: 'คำสั่งสนุก' },
        { name: 'admin-money',category: 'other',    label: '/admin-money',desc: 'จัดการเงิน (Admin)' },
    ]);
});

// POST save disabled commands
router.post('/api/:guildId/commands', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
    const { guildId } = req.params;
    const { disabledCommands = [] } = req.body;
    try {
        await GuildConfig.findOneAndUpdate(
            { guildId },
            { $set: { disabledCommands: [].concat(disabledCommands).filter(Boolean) } },
            { upsert: true }
        );
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
