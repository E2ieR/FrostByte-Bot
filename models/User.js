const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    userId:  { type: String, required: true },

    // 👛 ระบบเงิน
    coins: { type: Number, default: 0 },
    bank:  { type: Number, default: 0 },

    // 🎒 กระเป๋าของ
    inventory: [{
        itemName: { type: String, required: true },
        quantity:  { type: Number, default: 1 }
    }],

    // ⏳ Cooldowns
    workCooldown: { type: Date, default: null },  // ← ชื่อเดิม (ไม่ได้ใช้)
    robCooldown:  { type: Date, default: null },  // ← ชื่อเดิม (ไม่ได้ใช้)
    lastWork: { type: Date, default: null },      // ← ใช้จริงใน /work
    lastRob:  { type: Date, default: null },      // ← ใช้จริงใน /rob

    // 📊 Active Bonus — Message
    messageCountToday: { type: Number, default: 0 },
    lastMessageDate:   { type: Date,   default: null },
    activeBonusPaid:   { type: Boolean, default: false },

    // 📊 Active Bonus — Voice
    voiceMinutesToday: { type: Number,  default: 0 },
    lastVoiceBonusDate:{ type: Date,    default: null },
    voiceBonusPaid:    { type: Boolean, default: false },

    // 📊 Active Bonus — Command
    commandCountToday:  { type: Number,  default: 0 },
    lastCommandBonusDate:{ type: Date,   default: null },
    commandBonusPaid:   { type: Boolean, default: false },

    // 📊 Active Bonus — React
    reactCountToday:  { type: Number,  default: 0 },
    lastReactBonusDate:{ type: Date,   default: null },
    reactBonusPaid:   { type: Boolean, default: false },

    // 🏅 Seniority Bonus — วันที่เข้าเซิร์ฟ (ดึงจาก Discord แล้วบันทึก)
    joinedAt: { type: Date, default: null },

    // 🎖️ Level System
    xp:                       { type: Number, default: 0 },
    level:                    { type: Number, default: 0 },
    xpCooldownUntil:          { type: Date,   default: null },
    voiceJoinedAt:            { type: Date,   default: null }, // เริ่มนับ voice XP
    reactionXpCooldownUntil:  { type: Date,   default: null },
    commandXpCooldownUntil:   { type: Date,   default: null },

    // 🎭 Sticky Roles
    savedRoles: { type: [String], default: [] },

    // 📅 Daily Quests
    dailyQuests: [{
        questId:     { type: String },
        description: { type: String },
        completed:   { type: Boolean, default: false },
        reward:      { type: Number,  default: 0 }
    }],
    lastQuestDate: { type: Date, default: null }, // วันที่สร้าง quests ล่าสุด
}, { timestamps: true });

UserSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('User', UserSchema);
