// Guild roles and channels are maintained by Discord Gateway events.
function getGuild(req, guildId = req.params.guildId) {
    const client = req.app.locals.discordClient;
    const guild = client?.guilds.cache.get(guildId);
    if (!client?.isReady() || !guild || guild.available === false) {
        const error = new Error('Discord bot is not ready for this server. Please try again shortly.');
        error.status = 503;
        throw error;
    }
    return guild;
}

// Member lists are not fully populated by Gateway on startup. Share a single
// REST request per guild, using the bot's existing rate-limit-aware REST client.
const memberLists = new WeakMap();
async function getMembers(guild) {
    let entry = memberLists.get(guild);
    if (entry?.pending) return entry.pending;
    if (entry && Date.now() < entry.expires) {
        if (entry.error) throw entry.error;
        return entry.data;
    }
    entry = { expires: 0 };
    memberLists.set(guild, entry);
    entry.pending = (async () => {
        try {
            const members = await guild.members.list({ limit: 1000 });
            entry.data = members.map(m => ({
                user: { id: m.id, username: m.user.username, global_name: m.user.globalName, avatar: m.user.avatar },
                nick: m.nickname,
                roles: [...m.roles.cache.keys()],
            }));
            entry.expires = Date.now() + 60000;
            return entry.data;
        } catch (error) {
            entry.error = error;
            entry.expires = Date.now() + 60000;
            throw error;
        } finally {
            entry.pending = null;
        }
    })();
    return entry.pending;
}
module.exports = { getGuild, getMembers };
