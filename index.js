require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const mongoose = require('mongoose');

const { startServer } = require('./dashboard/server.js');
const { handleBettingInteraction } = require('./dashboard/handlers/bettingInteraction');
const sportsScheduler = require('./services/sportsScheduler');
const {
    handleActiveBonus, handleXpGain, handleCommandXp,
    handleReactionXp, handleVoiceXp,
    handleMemberLeave, handleMemberBan
} = require('./dashboard/handlers/incomeHandler');
const { handleBlackjack } = require('./dashboard/handlers/blackjackHandler');
const { handleShopButton, handleInvButton } = require('./commands/items');
const GuildConfig = require('./models/GuildConfig');
const User        = require('./models/User');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('🍃 MongoDB เชื่อมต่อสำเร็จ'))
    .catch(err => console.error('MongoDB error:', err));

// ─── โหลด commands ──────────────────────────────────────────────────────────
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
    const command = require(path.join(commandsPath, file));
    if (Array.isArray(command)) {
        for (const c of command) {
            if ('data' in c && 'execute' in c) client.commands.set(c.data.name, c);
        }
    } else if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
}

// ─── Ready ───────────────────────────────────────────────────────────────────
client.once('ready', () => {
    console.log(`🤖 บอทออนไลน์: ${client.user.tag}`);
    try { startServer(client); } catch (err) { console.error('Dashboard error:', err); }
    try { sportsScheduler.init(client); } catch (err) { console.error('SportsScheduler error:', err); }
});

// ─── messageCreate ─────────────────────────────────────────────────────────
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    await handleActiveBonus(message);
    await handleXpGain(message);
});

// ─── voiceStateUpdate — Voice XP ──────────────────────────────────────────
client.on('voiceStateUpdate', async (oldState, newState) => {
    await handleVoiceXp(oldState, newState);
});

// ─── messageReactionAdd — Reaction XP ─────────────────────────────────────
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    // fetch partial
    if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
    await handleReactionXp(reaction, user);
});

// ─── guildMemberAdd — Join Roles + Sticky Roles ───────────────────────────
client.on('guildMemberAdd', async member => {
    try {
        const config = await GuildConfig.findOne({ guildId: member.guild.id });
        if (!config) return;

        const isBot = member.user.bot;

        // Bot join roles
        if (isBot && config.botJoinRoles?.length) {
            for (const { roleId } of config.botJoinRoles) {
                await member.roles.add(roleId).catch(() => {});
            }
            return;
        }

        // Sticky roles restore
        if (config.stickyRolesEnabled) {
            const userData = await User.findOne({ guildId: member.guild.id, userId: member.id });
            if (userData?.savedRoles?.length) {
                for (const roleId of userData.savedRoles) {
                    await member.roles.add(roleId).catch(() => {});
                }
                // Clear after restoring
                userData.savedRoles = [];
                await userData.save();
                return; // skip join roles if restoring sticky
            }
        }

        // Join roles (with optional delay)
        for (const { roleId, delaySeconds } of (config.joinRoles || [])) {
            const delay = (delaySeconds || 0) * 1000;
            if (delay > 0) {
                setTimeout(async () => {
                    const m = await member.guild.members.fetch(member.id).catch(() => null);
                    if (m) await m.roles.add(roleId).catch(() => {});
                }, delay);
            } else {
                await member.roles.add(roleId).catch(() => {});
            }
        }
    } catch (err) {
        console.error('[AutoRole guildMemberAdd]', err);
    }
});

// ─── guildMemberRemove / guildBanAdd — XP Reset + Sticky Roles save ───────
client.on('guildMemberRemove', async member => {
    try {
        const config = await GuildConfig.findOne({ guildId: member.guild.id });
        // Save sticky roles
        if (config?.stickyRolesEnabled) {
            const roleIds = member.roles.cache
                .filter(r => r.id !== member.guild.id)
                .map(r => r.id);
            if (roleIds.length) {
                await User.findOneAndUpdate(
                    { guildId: member.guild.id, userId: member.id },
                    { $set: { savedRoles: roleIds } },
                    { upsert: true }
                );
            }
        }
    } catch (err) {
        console.error('[Sticky Save]', err);
    }
    await handleMemberLeave(member);
});
client.on('guildBanAdd', async (guild, user) => {
    await handleMemberBan(guild, user);
});

// ─── Reaction Role — Add ───────────────────────────────────────────────────
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }

    // Reaction XP
    await handleReactionXp(reaction, user);

    // Reaction Roles
    try {
        const config = await GuildConfig.findOne({ guildId: reaction.message.guildId });
        if (!config?.reactionRoleGroups?.length) return;

        const group = config.reactionRoleGroups.find(
            g => g.messageId === reaction.message.id
        );
        if (!group) return;

        const emojiKey = reaction.emoji.id
            ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
            : reaction.emoji.name;

        const entry = group.roles.find(r => r.emoji === emojiKey || r.emoji === reaction.emoji.name);
        if (!entry) return;

        const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
        if (!member) return;

        if (group.mode === 'unique') {
            // Remove all other roles in this group first
            for (const r of group.roles) {
                if (r.roleId !== entry.roleId) {
                    await member.roles.remove(r.roleId).catch(() => {});
                }
            }
            // Also remove reactions for other emojis
            for (const [, rxn] of reaction.message.reactions.cache) {
                if (rxn.emoji.name !== reaction.emoji.name) {
                    await rxn.users.remove(user.id).catch(() => {});
                }
            }
        }

        await member.roles.add(entry.roleId).catch(() => {});
    } catch (err) {
        console.error('[ReactionRole Add]', err);
    }
});

// ─── Reaction Role — Remove ────────────────────────────────────────────────
client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }

    try {
        const config = await GuildConfig.findOne({ guildId: reaction.message.guildId });
        if (!config?.reactionRoleGroups?.length) return;

        const group = config.reactionRoleGroups.find(
            g => g.messageId === reaction.message.id
        );
        if (!group || group.mode === 'verify') return; // verify mode = ถอนไม่ได้

        const emojiKey = reaction.emoji.id
            ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
            : reaction.emoji.name;

        const entry = group.roles.find(r => r.emoji === emojiKey || r.emoji === reaction.emoji.name);
        if (!entry) return;

        const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
        if (!member) return;

        await member.roles.remove(entry.roleId).catch(() => {});
    } catch (err) {
        console.error('[ReactionRole Remove]', err);
    }
});

// ─── interactions ─────────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {

    // Slash commands
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        // Check if command is disabled for this guild
        if (interaction.guild) {
            try {
                const cfg = await GuildConfig.findOne({ guildId: interaction.guild.id }).lean();
                if (cfg?.disabledCommands?.includes(interaction.commandName)) {
                    const reply = { content: '❌ คำสั่งนี้ถูกปิดใช้งานในเซิร์ฟเวอร์นี้', ephemeral: true };
                    if (interaction.replied || interaction.deferred) return interaction.followUp(reply);
                    return interaction.reply(reply);
                }
            } catch {}
        }
        try {
            await command.execute(interaction);
            await handleCommandXp(interaction); // Command XP (fire-and-forget)
        } catch (error) {
            console.error(error);
            const reply = { content: '❌ เกิดข้อผิดพลาด', ephemeral: true };
            if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
            else await interaction.reply(reply);
        }
        return;
    }

    // Buttons / Modals
    if (interaction.isButton() || interaction.isModalSubmit()) {
        const id = interaction.customId;

        if (id.startsWith('bet_A_') || id.startsWith('bet_B_') || id.startsWith('bet_modal_')) {
            try { await handleBettingInteraction(interaction); } catch (err) { console.error('[Betting]', err); }
            return;
        }
        if (id.startsWith('bj_')) {
            try { await handleBlackjack(interaction); } catch (err) { console.error('[Blackjack]', err); }
            return;
        }
        if (id.startsWith('shop_')) {
            try { await handleShopButton(interaction); } catch (err) { console.error('[Shop]', err); }
            return;
        }
        if (id.startsWith('inv_')) {
            try { await handleInvButton(interaction); } catch (err) { console.error('[Inventory]', err); }
            return;
        }
        if (id.startsWith('crash_cashout_')) {
            const ownerId = id.split('_')[2];
            if (interaction.user.id !== ownerId) return interaction.reply({ content: '❌ ไม่ใช่เกมของคุณ', ephemeral: true });
            const { crashGames } = require('./commands/crash');
            const key = `${ownerId}-${interaction.guild.id}`;
            const game = crashGames.get(key);
            if (!game) return interaction.reply({ content: '❌ เกมจบไปแล้ว', ephemeral: true });
            crashGames.delete(key);
            const GuildConfig = require('./models/GuildConfig');
            const User = require('./models/User');
            const config = await GuildConfig.findOne({ guildId: interaction.guild.id }) || {};
            let user = await User.findOne({ userId: ownerId, guildId: interaction.guild.id });
            const payout = Math.floor(game.bet * game.multiplier);
            user.coins += payout - game.bet;
            await user.save();
            await interaction.update({
                content: `💰 ถอนเงินที่ **${game.multiplier.toFixed(2)}x** ได้รับ **${payout.toLocaleString()}** ${config.currencyEmoji || '💰'}`,
                embeds: [], components: []
            });
            return;
        }
    }
});

client.login(process.env.TOKEN);
