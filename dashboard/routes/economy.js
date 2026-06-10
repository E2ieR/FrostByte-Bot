const express    = require('express');
const router     = express.Router();
const GuildConfig = require('../../models/GuildConfig');

// ─── บันทึก currency / work ─────────────────────────────────────────────
router.post('/save-settings/:guildId', async (req, res) => {
    const { guildId } = req.params;
    const tab = req.query.tab || 'currency';
    let config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });

    if (tab === 'currency') {
        config.currencyName  = req.body.currencyName;
        config.currencyEmoji = req.body.currencyEmoji;
        config.startCoins    = parseInt(req.body.startCoins)  || 0;
        config.startBank     = parseInt(req.body.startBank)   || 0;

    } else if (tab === 'work') {
        config.cooldownDays    = parseInt(req.body.cooldownDays)    || 0;
        config.cooldownHours   = parseInt(req.body.cooldownHours)   || 0;
        config.cooldownMinutes = parseInt(req.body.cooldownMinutes) || 0;
        config.cooldownSeconds = parseInt(req.body.cooldownSeconds) || 0;
        config.minWorkGain     = parseInt(req.body.minWorkGain)     || 50;
        config.maxWorkGain     = parseInt(req.body.maxWorkGain)     || 200;
        config.msgWorkCooldown = req.body.msgWorkCooldown || config.msgWorkCooldown;

    } else if (tab === 'rob') {
        config.robEnabled       = req.body.robEnabled === 'true';
        config.robCooldownMin   = parseInt(req.body.robCooldownMin)   || 30;
        config.robSuccessChance = parseInt(req.body.robSuccessChance) || 50;
        config.robMinCoins      = parseInt(req.body.robMinCoins)      || 50;
        config.robMinPercent    = parseInt(req.body.robMinPercent)    || 20;
        config.robMaxPercent    = parseInt(req.body.robMaxPercent)    || 50;
        config.robPenalty       = parseInt(req.body.robPenalty)       || 100;

    } else if (tab === 'active-bonus') {
        config.activeBonusEnabled   = req.body.activeBonusEnabled === 'true';
        config.activeBonusThreshold = parseInt(req.body.activeBonusThreshold) || 20;
        config.activeBonusAmount    = parseInt(req.body.activeBonusAmount)    || 100;
        config.activeBonusChannelId = req.body.activeBonusChannelId || '';

        config.voiceBonusEnabled   = req.body.voiceBonusEnabled === 'true';
        config.voiceBonusThreshold = parseInt(req.body.voiceBonusThreshold) || 30;
        config.voiceBonusAmount    = parseInt(req.body.voiceBonusAmount)    || 150;
        config.voiceBonusChannelId = req.body.voiceBonusChannelId || '';

        config.commandBonusEnabled   = req.body.commandBonusEnabled === 'true';
        config.commandBonusThreshold = parseInt(req.body.commandBonusThreshold) || 10;
        config.commandBonusAmount    = parseInt(req.body.commandBonusAmount)    || 80;

        config.reactBonusEnabled   = req.body.reactBonusEnabled === 'true';
        config.reactBonusThreshold = parseInt(req.body.reactBonusThreshold) || 15;
        config.reactBonusAmount    = parseInt(req.body.reactBonusAmount)    || 60;

    } else if (tab === 'seniority') {
        // รับ array ของ tiers จาก form
        const minDaysArr  = [].concat(req.body['tier_minDays[]']  || []);
        const amountArr   = [].concat(req.body['tier_amount[]']   || []);
        config.seniorityBonusEnabled = req.body.seniorityBonusEnabled === 'true';
        config.seniorityTiers = minDaysArr.map((d, i) => ({
            minDays: parseInt(d)      || 0,
            amount:  parseInt(amountArr[i]) || 0
        })).filter(t => t.amount > 0);
        config.markModified('seniorityTiers');

    } else if (tab === 'daily-quests') {
        config.dailyQuestsEnabled = req.body.dailyQuestsEnabled === 'true';
        config.dailyQuestCount    = parseInt(req.body.dailyQuestCount) || 3;

    } else if (tab === 'level') {
        config.levelEnabled       = req.body.levelEnabled === 'true';
        config.xpPerMessageMin    = parseInt(req.body.xpPerMessageMin)   || 15;
        config.xpPerMessageMax    = parseInt(req.body.xpPerMessageMax)   || 25;
        config.xpCooldownSeconds  = parseInt(req.body.xpCooldownSeconds) || 60;
        config.levelUpChannelId   = req.body.levelUpChannelId   || '';
        config.levelUpMessage     = req.body.levelUpMessage     || '🎉 {user} เลื่อนระดับเป็น **Level {level}** แล้ว!';

        // Level Roles: รับ array คู่ level + roleId
        const levels  = [].concat(req.body['lr_level[]']  || []);
        const roleIds = [].concat(req.body['lr_roleId[]'] || []);
        const names   = [].concat(req.body['lr_roleName[]'] || []);
        config.levelRoles = levels
            .map((lv, i) => ({ level: parseInt(lv) || 0, roleId: roleIds[i] || '', roleName: names[i] || '' }))
            .filter(r => r.level > 0 && r.roleId);
        config.markModified('levelRoles');
    }

    await config.save();
    res.redirect(`/manage/${guildId}?tab=${tab}&success=true`);
});

// ─── Work replies ────────────────────────────────────────────────────────
router.post('/:guildId/add-reply', async (req, res) => {
    let config = await GuildConfig.findOne({ guildId: req.params.guildId });
    if (!config) return res.redirect(`/manage/${req.params.guildId}?tab=work`);
    config.workSituations.push(req.body.newReply);
    await config.save();
    res.redirect(`/manage/${req.params.guildId}?tab=work&success=true`);
});

router.get('/:guildId/delete-reply/:index', async (req, res) => {
    let config = await GuildConfig.findOne({ guildId: req.params.guildId });
    config.workSituations.splice(req.params.index, 1);
    config.markModified('workSituations');
    await config.save();
    res.redirect(`/manage/${req.params.guildId}?tab=work&delete_success=true`);
});

// ─── Role Incomes ────────────────────────────────────────────────────────
router.post('/:guildId/add-role-income', async (req, res) => {
    const axios = require('axios');
    const { guildId } = req.params;
    let config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });

    let roleName = req.body.roleId;
    try {
        const rolesRes = await axios.get(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
            headers: { Authorization: `Bot ${process.env.TOKEN}` }
        });
        const role = rolesRes.data.find(r => r.id === req.body.roleId);
        if (role) roleName = role.name;
    } catch (e) {}

    config.roleIncomes.push({
        roleId:        req.body.roleId,
        roleName,
        amount:        parseInt(req.body.amount)        || 0,
        intervalValue: parseInt(req.body.intervalValue) || 1,
        intervalType:  req.body.intervalType            || 'hours',
        startDate:     req.body.startDate ? new Date(req.body.startDate) : new Date()
    });
    config.markModified('roleIncomes');
    await config.save();
    res.redirect(`/manage/${guildId}?tab=role-income&success=true`);
});

router.get('/:guildId/delete-role-income/:index', async (req, res) => {
    const { guildId } = req.params;
    let config = await GuildConfig.findOne({ guildId });
    if (!config) return res.redirect(`/manage/${guildId}?tab=role-income`);
    config.roleIncomes.splice(parseInt(req.params.index), 1);
    config.markModified('roleIncomes');
    await config.save();
    res.redirect(`/manage/${guildId}?tab=role-income&delete_success=true`);
});

// ─── Seniority tiers ────────────────────────────────────────────────────
router.post('/:guildId/add-seniority-tier', async (req, res) => {
    let config = await GuildConfig.findOne({ guildId: req.params.guildId }) || new GuildConfig({ guildId: req.params.guildId });
    config.seniorityTiers.push({
        minDays: parseInt(req.body.minDays) || 0,
        amount:  parseInt(req.body.amount)  || 0
    });
    config.markModified('seniorityTiers');
    await config.save();
    res.redirect(`/manage/${req.params.guildId}?tab=seniority&success=true`);
});

router.get('/:guildId/delete-seniority-tier/:index', async (req, res) => {
    let config = await GuildConfig.findOne({ guildId: req.params.guildId });
    config.seniorityTiers.splice(req.params.index, 1);
    config.markModified('seniorityTiers');
    await config.save();
    res.redirect(`/manage/${req.params.guildId}?tab=seniority&delete_success=true`);
});

// ─── Daily Quest pool ────────────────────────────────────────────────────
router.post('/:guildId/add-quest', async (req, res) => {
    const mongoose = require('mongoose');
    let config = await GuildConfig.findOne({ guildId: req.params.guildId }) || new GuildConfig({ guildId: req.params.guildId });
    config.questPool.push({
        questId:     new mongoose.Types.ObjectId().toString(),
        description: req.body.description,
        type:        req.body.type        || 'custom',
        target:      parseInt(req.body.target) || 1,
        reward:      parseInt(req.body.reward) || 200
    });
    config.markModified('questPool');
    await config.save();
    res.redirect(`/manage/${req.params.guildId}?tab=daily-quests&success=true`);
});

router.get('/:guildId/delete-quest/:questId', async (req, res) => {
    let config = await GuildConfig.findOne({ guildId: req.params.guildId });
    config.questPool = config.questPool.filter(q => q.questId !== req.params.questId);
    config.markModified('questPool');
    await config.save();
    res.redirect(`/manage/${req.params.guildId}?tab=daily-quests&delete_success=true`);
});

module.exports = router;
