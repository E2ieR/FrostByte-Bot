const mongoose = require('mongoose');
const { createHash } = require('node:crypto');
const schema = new mongoose.Schema({
    _id: String, until: Number, session: String, expiresAt: Date,
}, { bufferCommands: false });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Record = mongoose.models.DiscordOAuthGuard || mongoose.model('DiscordOAuthGuard', schema);
const hash = value => createHash('sha256').update(value).digest('hex');
const key = () => 'cooldown:' + (process.env.CLIENT_ID || 'default');
function ready() {
    if (mongoose.connection.readyState !== 1) {
        const error = new Error('OAuth protection storage is unavailable');
        error.status = 503;
        throw error;
    }
}
module.exports = {
    async readCooldown() {
        ready();
        const row = await Record.findById(key()).lean();
        return row?.until || 0;
    },
    async extendCooldown(until) {
        ready();
        try { await Record.updateOne({ _id: key() }, { $max: { until } }, { upsert: true }); }
        catch (error) {
            if (error.code !== 11000) throw error;
            await Record.updateOne({ _id: key() }, { $max: { until } });
        }
    },
    async issueState(state, sessionID) {
        ready();
        await Record.create({ _id: 'state:' + hash(state), session: hash(sessionID), expiresAt: new Date(Date.now() + 10 * 60000) });
    },
    async consumeState(state, sessionID) {
        ready();
        return Boolean(await Record.findOneAndDelete({ _id: 'state:' + hash(state), session: hash(sessionID), expiresAt: { $gt: new Date() } }));
    },
    async claimCode(code) {
        ready();
        try {
            await Record.create({ _id: 'code:' + hash(code), expiresAt: new Date(Date.now() + 15 * 60000) });
            return true;
        } catch (error) {
            if (error.code === 11000) return false;
            throw error;
        }
    },
};
