const mongoose = require('mongoose');

const guildConfigSchema = new mongoose.Schema({
    guildId:       { type: String, required: true, unique: true },
    currencyName:  { type: String, default: 'เหรียญ' },
    currencyEmoji: { type: String, default: '💰' },
    startCoins:    { type: Number, default: 100 },
    startBank:     { type: Number, default: 0 },

    // ─── /work ───────────────────────────────────────────
    cooldownDays:    { type: Number, default: 0 },
    cooldownHours:   { type: Number, default: 1 },
    cooldownMinutes: { type: Number, default: 0 },
    cooldownSeconds: { type: Number, default: 0 },
    minWorkGain:     { type: Number, default: 50 },
    maxWorkGain:     { type: Number, default: 200 },
    msgWorkCooldown: { type: String, default: '❌ คุณเหนื่อยเกินไปแล้ว! กรุณารออีก **{time}**' },
    workSituations:  { type: [String], default: [] },

    // ─── /rob ────────────────────────────────────────────
    robEnabled:        { type: Boolean, default: true },
    robCooldownMin:    { type: Number, default: 30 },   // นาที
    robSuccessChance:  { type: Number, default: 50 },   // %
    robMinCoins:       { type: Number, default: 50 },   // เหยื่อต้องมีอย่างน้อยเท่านี้
    robMinPercent:     { type: Number, default: 20 },   // % ขั้นต่ำที่ปล้นได้
    robMaxPercent:     { type: Number, default: 50 },   // % สูงสุดที่ปล้นได้
    robPenalty:        { type: Number, default: 100 },  // ค่าปรับถ้าปล้นพลาด

    // ─── Active Bonus: Message ────────────────────────────
    activeBonusEnabled:   { type: Boolean, default: true },
    activeBonusThreshold: { type: Number, default: 20 },
    activeBonusAmount:    { type: Number, default: 100 },
    activeBonusChannelId: { type: String, default: '' },

    // ─── Active Bonus: Voice ──────────────────────────────
    voiceBonusEnabled:   { type: Boolean, default: false },
    voiceBonusThreshold: { type: Number, default: 30 },   // นาที
    voiceBonusAmount:    { type: Number, default: 150 },
    voiceBonusChannelId: { type: String, default: '' },

    // ─── Active Bonus: Command ────────────────────────────
    commandBonusEnabled:   { type: Boolean, default: false },
    commandBonusThreshold: { type: Number, default: 10 },
    commandBonusAmount:    { type: Number, default: 80 },

    // ─── Active Bonus: React ──────────────────────────────
    reactBonusEnabled:   { type: Boolean, default: false },
    reactBonusThreshold: { type: Number, default: 15 },
    reactBonusAmount:    { type: Number, default: 60 },

    // ─── Seniority Bonus ──────────────────────────────────
    seniorityBonusEnabled: { type: Boolean, default: true },
    seniorityTiers: [{
        minDays: { type: Number }, // อยู่มาอย่างน้อยกี่วัน
        amount:  { type: Number }  // รับเงินต่อวัน
    }],

    // ─── Daily Quests ─────────────────────────────────────
    dailyQuestsEnabled: { type: Boolean, default: true },
    questPool: [{
        questId:     { type: String, default: () => new mongoose.Types.ObjectId().toString() },
        description: { type: String },
        type:        { type: String }, // 'send_image' | 'invite' | 'message_count' | 'use_command' | 'custom'
        target:      { type: Number, default: 1 }, // เป้าหมาย เช่น ส่ง 1 รูป
        reward:      { type: Number, default: 200 }
    }],
    dailyQuestCount: { type: Number, default: 3 }, // สุ่มกี่ภารกิจต่อวัน

    // ─── Role Income ──────────────────────────────────────
    roleIncomes: [{
        roleId:        { type: String, required: true },
        roleName:      { type: String, required: true },
        amount:        { type: Number, required: true, default: 0 },
        intervalValue: { type: Number, default: 24 },
        intervalType:  { type: String, default: 'hours' },
        startDate:     { type: Date, default: Date.now }
    }],

    // ─── Store Categories ─────────────────────────────────
    storeCategories: [{
        catId: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
        name:  { type: String, required: true },
        emoji: { type: String, default: '📦' }
    }],

    // ─── Store Item Types ─────────────────────────────────
    storeItemTypes: [{
        typeId: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
        name:   { type: String, required: true },
        emoji:  { type: String, default: '🎁' }
    }],

    // ─── Store ────────────────────────────────────────────
    storeItems: [{
        itemId:        { type: String, default: () => new mongoose.Types.ObjectId().toString() },
        itemName:      { type: String, required: true },
        price:         { type: Number, required: true },
        description:   { type: String, default: '' },
        itemImage:     { type: String, default: '' },
        itemEmoji:     { type: String, default: '' },
        unlimitedStock:{ type: Boolean, default: true },
        stock:         { type: Number, default: 0 },
        listedInStore: { type: Boolean, default: true },
        inventoryItem: { type: Boolean, default: true },
        usable:        { type: Boolean, default: true },
        sellable:      { type: Boolean, default: true },
        expiryDate:    { type: Date, default: null },
        itemType:      { type: String, default: '' },
        roleReward:    { type: String, default: '' },
        sellPercent:   { type: Number, default: 50 },
        maxPerUser:    { type: Number, default: 0 },
        category:      { type: String, default: '' },
        useMessage:    { type: String, default: '' },
        // ─── Market (Supply & Demand) ───────────────────
        marketEnabled: { type: Boolean, default: false },
        basePrice:     { type: Number, default: 0 },
        currentPrice:  { type: Number, default: 0 },
        volatility:    { type: Number, default: 10 },
        totalBought:   { type: Number, default: 0 },
        totalSold:     { type: Number, default: 0 },
        lastTradeAt:   { type: Date,   default: null },
        priceHistory:  [{ price: { type: Number }, date: { type: Date } }]
    }],

    // ─── Level System ─────────────────────────────────────
    levelEnabled:       { type: Boolean, default: false },
    // Message XP
    xpPerMessageMin:    { type: Number,  default: 15 },
    xpPerMessageMax:    { type: Number,  default: 25 },
    xpCooldownSeconds:  { type: Number,  default: 60 },
    // Voice XP
    voiceXpEnabled:     { type: Boolean, default: false },
    voiceXpPerMinute:   { type: Number,  default: 5 },
    // Command XP
    commandXpEnabled:   { type: Boolean, default: false },
    commandXpMin:       { type: Number,  default: 5 },
    commandXpMax:       { type: Number,  default: 15 },
    commandXpCooldownSeconds: { type: Number, default: 30 },
    // Reaction XP
    reactionXpEnabled:  { type: Boolean, default: false },
    reactionXpAmount:   { type: Number,  default: 5 },
    reactionXpCooldownSeconds: { type: Number, default: 120 },
    // XP Options
    levelResetOnLeave:  { type: Boolean, default: false },
    levelResetOnBan:    { type: Boolean, default: false },
    xpMultiplierRoles: [{
        roleId:     { type: String, required: true },
        roleName:   { type: String, default: '' },
        multiplier: { type: Number, default: 2 }
    }],
    levelIgnoreChannels: { type: [String], default: [] },
    levelIgnoreRoles:    { type: [String], default: [] },
    // Notifications
    levelUpChannelId:   { type: String,  default: '' },
    levelUpTitle:       { type: String,  default: '🎉 Level Up!' },
    levelUpMessage:     { type: String,  default: '{user} เลื่อนระดับเป็น **Level {level}** แล้ว!' },
    // Level Roles
    levelRoles: [{
        level:    { type: Number, required: true },
        roleId:   { type: String, required: true },
        roleName: { type: String, default: '' }
    }],
    // Rank Card
    rankCardEnabled: { type: Boolean, default: true },
    rankCardBg:      { type: String, default: '#0f0f17' },
    rankCardBg2:     { type: String, default: '#1a1a2e' },
    rankCardAccent:  { type: String, default: '' },
    rankCardBgImage: { type: String, default: '' },
    rankCardFooter:  { type: String, default: '' },
    rankCardRoleStyles: [{
        roleId:      { type: String, required: true },
        roleName:    { type: String, default: '' },
        accentColor: { type: String, default: '' },
        bgColor:     { type: String, default: '' },
        bg2Color:    { type: String, default: '' },
        bgImage:     { type: String, default: '' }
    }],

    // ─── Auto Roles ───────────────────────────────────────
    joinRoles: [{
        roleId:       { type: String, required: true },
        roleName:     { type: String, default: '' },
        delaySeconds: { type: Number, default: 0 }     // 0 = ทันที
    }],
    botJoinRoles: [{
        roleId:   { type: String, required: true },
        roleName: { type: String, default: '' }
    }],
    stickyRolesEnabled: { type: Boolean, default: false },
    reactionRoleGroups: [{
        groupId:     { type: String, default: () => new mongoose.Types.ObjectId().toString() },
        channelId:   { type: String, required: true },
        messageId:   { type: String, default: '' },    // ID ของ message ที่บอทส่ง
        title:       { type: String, default: 'เลือก Role' },
        description: { type: String, default: '' },
        color:       { type: String, default: '#5865F2' },
        mode:        { type: String, default: 'toggle' }, // 'toggle' | 'unique' | 'verify'
        roles: [{
            emoji:       { type: String, required: true },
            roleId:      { type: String, required: true },
            roleName:    { type: String, default: '' },
            description: { type: String, default: '' }
        }]
    }],

    // ─── Sports Notifications ────────────────────────────
    sportsNotifications: {
        // Esports (Liquipedia)
        esportsEnabled:      { type: Boolean, default: false },
        esportsChannelId:    { type: String,  default: '' },
        esportsGames:        { type: [String], default: ['cs2', 'valorant', 'lol', 'mlbb'] },
        esportsNotifyBefore: { type: Number,  default: 30 },  // นาที

        // F1
        f1Enabled:      { type: Boolean, default: false },
        f1ChannelId:    { type: String,  default: '' },
        f1NotifyBefore: { type: Number,  default: 60 }, // นาที
        f1NotifyLive:   { type: Boolean, default: true },

        // Football
        footballEnabled:      { type: Boolean, default: false },
        footballChannelId:    { type: String,  default: '' },
        footballLeagues:      { type: [String], default: ['PL'] },
        footballTeams:        { type: [String], default: [] },
        footballNotifyBefore: { type: Number,  default: 30 },
        footballNotifyLive:   { type: Boolean, default: true },
        footballNotifyLineup: { type: Boolean, default: true },
        esportsTrackedTeams: { type: mongoose.Schema.Types.Mixed, default: {} },
    },

    // ─── Bettings ─────────────────────────────────────────
    bettings: [{
        betId:       { type: String, default: () => new mongoose.Types.ObjectId().toString() },
        isOpen:      { type: Boolean, default: false },
        title:       { type: String,  default: '' },
        description: { type: String,  default: '' },
        imageA:      { type: String,  default: '' },
        imageB:      { type: String,  default: '' },
        optionA:     { type: String,  default: 'ฝ่าย A' },
        optionB:     { type: String,  default: 'ฝ่าย B' },
        color:       { type: String,  default: '#5865F2' },
        poolA:       { type: Number,  default: 0 },
        poolB:       { type: Number,  default: 0 },
        channelId:   { type: String,  default: '' },
        messageId:   { type: String,  default: '' },
        expiresAt:   { type: Date,    default: null },
        minBet:      { type: Number,  default: 1 },
        maxBet:      { type: Number,  default: 0 },
        winner:      { type: String,  default: '' },
        createdAt:   { type: Date,    default: Date.now },
        bets: [{
            userId:   String,
            username: String,
            option:   String,
            amount:   Number
        }]
    }],

    // ─── Disabled Commands ────────────────────────────────
    disabledCommands: { type: [String], default: [] },
});

module.exports = mongoose.model('GuildConfig', guildConfigSchema);
