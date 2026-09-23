// models/NotifyConfig.js
const mongoose = require('mongoose');

const notifyConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },

    // ─── Esports (Liquipedia) ─────────────────────────────
    esports: {
        enabled:   { type: Boolean, default: false },
        channelId: { type: String,  default: '' },
        games: {
            cs2:      { type: Boolean, default: true  },
            valorant: { type: Boolean, default: true  },
            lol:      { type: Boolean, default: true  },
            mlbb:     { type: Boolean, default: false },
        },
        // event toggles
        notifyMatchStart:  { type: Boolean, default: true  },
        notifyMatchEnd:    { type: Boolean, default: true  },
        notifyTournament:  { type: Boolean, default: true  },
        // extra: mention role id (ว่าง = ไม่ mention)
        mentionRoleId: { type: String, default: '' },
    },

    // ─── F1 (OpenF1 API) ──────────────────────────────────
    f1: {
        enabled:           { type: Boolean, default: false },
        channelId:         { type: String,  default: '' },
        notifyRaceStart:   { type: Boolean, default: true  }, // แจ้งเตือนเริ่มแข่ง
        notifyQualifying:  { type: Boolean, default: true  }, // แจ้งเตือน qualifying
        notifyPractice:    { type: Boolean, default: false }, // แจ้งเตือน practice
        notifyLive:        { type: Boolean, default: true  }, // live update ทุก 30 วิ
        notifyResult:      { type: Boolean, default: true  }, // แจ้งเตือนผล
        liveChannelId:     { type: String,  default: '' },    // ส่ง live update คนละช่องได้
        mentionRoleId:     { type: String,  default: '' },
        // track which session is being live-updated (ป้องกัน dup)
        _activeLiveSession:  { type: String, default: '' },
        _activeLiveMessage:  { type: String, default: '' }, // message id ที่ edit
    },

    // ─── Football (football-data.org) ─────────────────────
    football: {
        enabled:          { type: Boolean, default: false },
        channelId:        { type: String,  default: '' },
        // leagues ที่ต้องการ ใช้ competition code จาก football-data.org
        // PL=Premier League, BL1=Bundesliga, SA=Serie A, PD=La Liga,
        // FL1=Ligue 1, CL=Champions League, EL=Europa League, WC=World Cup
        leagues: {
            type: [String],
            default: ['PL', 'CL'],
        },
        notifyLineup:     { type: Boolean, default: true  }, // 1 ชม ก่อนแข่ง
        notifyKickoff:    { type: Boolean, default: true  }, // ตอนเริ่มแข่ง
        notifyHalfTime:   { type: Boolean, default: false }, // พักครึ่ง
        notifyResult:     { type: Boolean, default: true  }, // ผลสุดท้าย
        mentionRoleId:    { type: String,  default: '' },
        // track sent notifications ป้องกันส่งซ้ำ (key = matchId, value = flags)
        _sentNotifs: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
}, { timestamps: true });

module.exports = mongoose.model('NotifyConfig', notifyConfigSchema);
