const axios = require('axios');
const store = require('./oauthStore');

function retrySeconds(response, now = Date.now()) {
    const raw = response?.headers?.['retry-after'];
    const header = Number(raw);
    const date = raw && !Number.isFinite(header) ? (Date.parse(raw) - now) / 1000 : NaN;
    const values = [Number(response?.data?.retry_after), header, date,
        Number(response?.headers?.['x-ratelimit-reset-after'])]
        .filter(n => Number.isFinite(n) && n > 0);
    // Conservative local pause only when Discord omits timing, not a recovery guarantee.
    return values.length ? Math.ceil(Math.max(...values)) : 60;
}
function createOAuth({ storage = store, transport = axios, now = Date.now, logger = console } = {}) {
    let blockedUntil = 0;
    let unsavedUntil = 0;
    let queue = Promise.resolve();
    async function assertAvailable() {
        if (unsavedUntil) {
            await storage.extendCooldown(unsavedUntil);
            unsavedUntil = 0;
        }
        blockedUntil = Math.max(blockedUntil, await storage.readCooldown());
        const remaining = Math.ceil((blockedUntil - now()) / 1000);
        if (remaining > 0) {
            const error = new Error('Discord OAuth cooldown is active');
            error.localCooldown = true;
            error.response = { status: 429, data: { retry_after: remaining } };
            throw error;
        }
    }
    async function perform(config) {
        await assertAvailable();
        try {
            return await transport({ timeout: 15000, maxRedirects: 0, ...config });
        } catch (error) {
            if (error.response?.status === 429) {
                const seconds = retrySeconds(error.response, now());
                blockedUntil = Math.max(blockedUntil, now() + seconds * 1000);
                unsavedUntil = blockedUntil;
                try { await storage.extendCooldown(blockedUntil); unsavedUntil = 0; }
                catch { logger.error('[Auth] cooldown persistence failed; OAuth requests remain stopped locally'); }
                const headers = error.response.headers || {};
                logger.warn('[Auth] upstream rate limit ' + JSON.stringify({
                    endpoint: new URL(config.url).pathname,
                    retry_after: seconds, resumeAt: new Date(blockedUntil).toISOString(),
                    global: error.response.data?.global ?? headers['x-ratelimit-global'] ?? null,
                    scope: headers['x-ratelimit-scope'] || null,
                    cfRay: headers['cf-ray'] || null,
                }));
            }
            throw error;
        }
    }
    function request(config) {
        // Recheck when queued work starts, and never automatically retry OAuth codes.
        const result = queue.then(() => perform(config));
        queue = result.catch(() => {});
        return result;
    }
    return { request, assertAvailable };
}
module.exports = { ...createOAuth(), retrySeconds, createOAuth };
