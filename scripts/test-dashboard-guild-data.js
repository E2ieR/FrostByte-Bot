const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Collection } = require('discord.js');
const root = path.join(__dirname, '..');
function fixture() {
    let now = 100000;
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'dashboard/guildData.js'), 'utf8'), {
        module, Date: { now: () => now },
    });
    return { ...module.exports, advance: () => { now += 61000; } };
}
test('guild cache reads use no REST, reject unavailable bot', () => {
    const { getGuild } = fixture();
    const guild = { id: 'g' };
    const client = { isReady: () => true, guilds: { cache: new Map([['g', guild]]) } };
    const req = { params: { guildId: 'g' }, app: { locals: { discordClient: client } } };
    assert.equal(getGuild(req), guild);
    client.isReady = () => false;
    assert.throws(() => getGuild(req), e => e.status === 503);
});
test('member requests share in-flight work, cache results and refresh after expiry', async () => {
    const api = fixture();
    let calls = 0, release;
    const members = new Collection([['u', { id: 'u', user: { username: 'user', globalName: 'Name', avatar: 'a' }, nickname: 'Nick', roles: { cache: new Map([['r', {}]]) } }]]);
    const guild = { members: { list: async options => {
        assert.equal(options.limit, 1000);
        calls++;
        if (calls === 1) await new Promise(resolve => { release = resolve; });
        return members;
    } } };
    const first = api.getMembers(guild), second = api.getMembers(guild);
    assert.equal(calls, 1);
    release();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a, b);
    assert.equal(a[0].user.global_name, 'Name');
    assert.equal(a[0].roles[0], 'r');
    await api.getMembers(guild);
    assert.equal(calls, 1);
    api.advance();
    await api.getMembers(guild);
    assert.equal(calls, 2);
});
test('failed member loads do not generate a request on every dashboard refresh', async () => {
    const api = fixture(); let calls = 0;
    const guild = { members: { list: async () => { calls++; throw new Error('unavailable'); } } };
    await assert.rejects(api.getMembers(guild));
    await assert.rejects(api.getMembers(guild));
    assert.equal(calls, 1);
    api.advance();
    await assert.rejects(api.getMembers(guild));
    assert.equal(calls, 2);
});
test('Manage renders cached roles repeatedly and returns 503 when bot is not ready', async () => {
    const routes = {};
    const api = fixture();
    vm.runInNewContext(fs.readFileSync(path.join(root, 'dashboard/routes/auth.js'), 'utf8'), {
        require: name => {
            if (name === 'express') return { Router: () => ({ get: (url, fn) => { routes[url] = fn; } }) };
            if (name === '../guildData') return api;
            if (name === '../../models/GuildConfig') return { findOne: async () => ({}) };
            if (name === '../discordOAuth') return {};
            throw new Error('Unexpected dependency: ' + name);
        }, module: { exports: {} }, console, process: { env: {} }, URLSearchParams,
    });
    const guild = { roles: { cache: new Collection([['g', { id: 'g', name: '@everyone' }], ['r', { id: 'r', name: 'Admin', color: 123 }]]) } };
    const client = { isReady: () => true, guilds: { cache: new Map([['g', guild]]) } };
    const req = { params: { guildId: 'g' }, query: {}, session: { user: {}, guilds: [{ id: 'g' }] }, app: { locals: { discordClient: client } } };
    let renders = 0;
    const res = { render: (view, data) => { renders++; assert.equal(view, 'manage'); assert.equal(data.discordRoles.length, 1); assert.equal(data.discordRoles[0].name, 'Admin'); }, status: n => { res.code = n; return res; }, send: () => {} };
    await routes['/manage/:guildId'](req, res);
    await routes['/manage/:guildId'](req, res);
    assert.equal(renders, 2);
    client.isReady = () => false;
    await routes['/manage/:guildId'](req, res);
    assert.equal(res.code, 503);
});
