const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createOAuth, retrySeconds } = require('../dashboard/discordOAuth');
const silent = { warn() {}, error() {} };
const config = { url: 'https://discord.com/api/v10/oauth2/token', method: 'POST' };
function storage() {
    let until = 0;
    return { readCooldown: async () => until, extendCooldown: async value => { until = Math.max(until, value); } };
}
test('uses the longest upstream delay, dates, fractions and missing-header fallback', () => {
    assert.equal(retrySeconds({ data: { retry_after: 1021 }, headers: { 'retry-after': '1000' } }), 1021);
    assert.equal(retrySeconds({ data: { retry_after: 0.25 } }), 1);
    assert.equal(retrySeconds({ headers: { 'retry-after': 'Thu, 01 Jan 1970 00:02:00 GMT' } }, 100000), 20);
    assert.equal(retrySeconds({}), 60);
});
test('queued requests stop after 429; persisted block survives creating a new client', async () => {
    let now = 100000, calls = 0;
    const state = storage();
    const transport = async () => { calls++; throw { response: { status: 429, data: { retry_after: 1021 } } }; };
    const first = createOAuth({ storage: state, transport, now: () => now, logger: silent });
    const results = await Promise.allSettled([first.request(config), first.request(config), first.request(config)]);
    assert.equal(calls, 1);
    assert.equal(results[1].reason.localCooldown, true);
    const restarted = createOAuth({ storage: state, transport, now: () => now, logger: silent });
    await assert.rejects(restarted.request(config), e => e.localCooldown && e.response.data.retry_after === 1021);
    assert.equal(calls, 1);
    now += 1021001;
    await assert.rejects(restarted.request(config), e => e.response.status === 429);
    assert.equal(calls, 2);
});
test('no upstream calls when protection storage is unavailable', async () => {
    let calls = 0;
    const api = createOAuth({ storage: { readCooldown: async () => { throw Error('DB unavailable'); } }, transport: async () => { calls++; } });
    await assert.rejects(api.request(config), /DB unavailable/);
    assert.equal(calls, 0);
});
test('failed persistence keeps local traffic stopped until saving succeeds', async () => {
    let calls = 0, fail = true;
    const state = storage();
    const save = state.extendCooldown;
    state.extendCooldown = async value => { if (fail) throw Error('offline'); await save(value); };
    const api = createOAuth({ storage: state, logger: silent, transport: async () => {
        calls++; throw { response: { status: 429, data: { retry_after: 100 } } };
    } });
    await assert.rejects(api.request(config));
    await assert.rejects(api.request(config), /offline/);
    fail = false;
    await assert.rejects(api.request(config), e => e.localCooldown);
    assert.equal(calls, 1);
});
function routesFixture() {
    const routes = {}, states = new Map(), codes = new Set();
    let blocked = false, calls = 0;
    const store = {
        issueState: async (value, session) => states.set(value, session),
        consumeState: async (value, session) => { if (states.get(value) !== session) return false; states.delete(value); return true; },
        claimCode: async value => { if (codes.has(value)) return false; codes.add(value); return true; },
    };
    const guard = {
        retrySeconds,
        assertAvailable: async () => { if (blocked) throw { localCooldown: true, response: { status: 429, data: { retry_after: 30 } } }; },
        request: async ({ url }) => {
            calls++;
            return { data: url.endsWith('/token') ? { access_token: 'test' } : url.endsWith('/guilds') ? [{ id: 'g', permissions: '32' }] : { id: 'u' } };
        },
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dashboard/routes/auth.js'), 'utf8'), {
        require: name => {
            if (name === 'express') return { Router: () => ({ get: (key, fn) => { routes[key] = fn; } }) };
            if (name === '../discordOAuth') return guard;
            if (name === '../oauthStore') return store;
            if (name === 'node:crypto') return require(name);
            return {};
        }, module: { exports: {} }, URLSearchParams, Date, console: silent, process: { env: { CLIENT_ID: 'test' } },
    });
    const response = () => ({ statusCode: 200, headers: {}, set(k,v) { this.headers[k]=v; return this; }, status(n) { this.statusCode=n; return this; }, send(s) { this.body=s; return this; }, redirect(s) { this.location=s; }, render(v,d) { this.data=d; } });
    const req = () => ({ sessionID: 's1', session: { save: cb => cb() }, query: {}, app: { locals: {} } });
    return { routes, req, response, calls: () => calls, block: () => { blocked = true; } };
}
test('health-check home page makes no OAuth calls; blocked login never redirects to Discord', async () => {
    const f = routesFixture(), r = f.response();
    f.routes['/'](f.req(), r);
    assert.equal(r.data.authorizeUrl, '/auth/discord');
    assert.equal(f.calls(), 0);
    f.block();
    await f.routes['/auth/discord'](f.req(), r);
    assert.equal(r.statusCode, 429);
    assert.equal(r.location, undefined);
    assert.equal(r.headers['Retry-After'], '30');
});
test('missing, wrong-session and replayed states cannot exchange a token', async () => {
    const f = routesFixture(), req = f.req();
    req.query = { code: 'code' };
    let r = f.response();
    await f.routes['/auth/discord/callback'](req, r);
    assert.equal(r.statusCode, 400);
    r = f.response();
    await f.routes['/auth/discord'](req, r);
    const state = new URL(r.location).searchParams.get('state');
    const wrong = f.req(); wrong.sessionID = 'other'; wrong.query = { state, code: 'code' };
    r = f.response(); await f.routes['/auth/discord/callback'](wrong, r);
    assert.equal(r.statusCode, 400); assert.equal(f.calls(), 0);
    req.query = { state, code: 'code' };
    r = f.response(); await f.routes['/auth/discord/callback'](req, r);
    assert.equal(r.location, '/selector'); assert.equal(f.calls(), 3);
    req.session = { save: cb => cb() };
    r = f.response(); await f.routes['/auth/discord/callback'](req, r);
    assert.equal(r.statusCode, 400); assert.equal(f.calls(), 3);
    r = f.response(); await f.routes['/auth/discord'](req, r);
    req.query.state = new URL(r.location).searchParams.get('state');
    r = f.response(); await f.routes['/auth/discord/callback'](req, r);
    assert.equal(r.statusCode, 400); assert.equal(f.calls(), 3);
});
test('production storage fails closed without connecting to MongoDB', async () => {
    await assert.rejects(require('../dashboard/oauthStore').readCooldown(), e => e.status === 503);
});
