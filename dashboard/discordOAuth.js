const axios = require('axios');

// Shared by dashboard OAuth requests in this process. Never retry an OAuth code automatically.
let blockedUntil = 0;
function retrySeconds(response) {
    const body = Number(response?.data?.retry_after);
    const raw = response?.headers?.['retry-after'];
    const header = Number(raw);
    const date = raw && !Number.isFinite(header) ? (Date.parse(raw) - Date.now()) / 1000 : NaN;
    const values = [body, header, date].filter(n => Number.isFinite(n) && n > 0);
    // Some temporary blocks omit timing; this is a conservative local pause, not a recovery guarantee.
    return values.length ? Math.ceil(Math.max(...values)) : 60;
}
async function request(config) {
    const remaining = Math.ceil((blockedUntil - Date.now()) / 1000);
    if (remaining > 0) {
        const error = new Error('Discord OAuth requests are paused after a rate limit');
        error.response = { status: 429, data: { retry_after: remaining } };
        throw error;
    }
    try {
        return await axios({ timeout: 15000, ...config });
    } catch (error) {
        if (error.response?.status === 429) {
            blockedUntil = Math.max(blockedUntil, Date.now() + retrySeconds(error.response) * 1000);
        }
        throw error;
    }
}
module.exports = { request, retrySeconds };
