const {
    SlashCommandBuilder, EmbedBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');
const User = require('../models/User');
const GuildConfig = require('../models/GuildConfig');

// ─── shop page sessions (memory) ──────────────────────────────────────────
const shopSessions = new Map();

// ─── inventory page sessions (memory) ─────────────────────────────────────
const invSessions = new Map();

const PAGE_SIZE = 5;

function typeEmoji(itemType) {
    if (itemType === 'role') return '🎭';
    if (itemType === 'consumable') return '⚡';
    return '🎁';
}

function buildShopEmbed(items, page, guild, config) {
    const start      = page * PAGE_SIZE;
    const pageItems  = items.slice(start, start + PAGE_SIZE);
    const totalPages = Math.ceil(items.length / PAGE_SIZE);

    const lines = pageItems.map((item, i) => {
        const stock = item.unlimitedStock ? '♾️' : `📦${item.stock}`;
        const desc  = (item.description || '').substring(0, 50);
        const cat   = item.category ? `[${item.category}] ` : '';
        return `**${start + i + 1}. ${typeEmoji(item.itemType)} ${item.itemName}** — ${item.price.toLocaleString()} ${config.currencyEmoji || '💰'}\n　${cat}${stock}${desc ? ` · ${desc}` : ''}`;
    });

    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🛒 ร้านค้า — หน้า ${page + 1}/${totalPages}`)
        .setDescription(lines.join('\n\n') || 'ไม่มีสินค้า')
        .setFooter({ text: `สินค้าทั้งหมด ${items.length} ชิ้น · ใช้ /buy <ชื่อ> เพื่อซื้อ` });
}

function buildShopRow(items, page, userId) {
    const totalPages = Math.ceil(items.length / PAGE_SIZE);
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`shop_prev_${userId}`)
            .setLabel('◀ หน้าก่อน')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`shop_next_${userId}`)
            .setLabel('หน้าถัดไป ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1)
    );
}

// ─── /shop ─────────────────────────────────────────────────────────────────
const shop = {
    data: new SlashCommandBuilder().setName('shop').setDescription('ดูร้านค้าของเซิร์ฟ 🛒'),
    async execute(interaction) {
        const { id: guildId } = interaction.guild;
        const { id: userId }  = interaction.user;
        const config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
        const items  = (config.storeItems || []).filter(i => i.listedInStore);
        if (!items.length) return interaction.reply({ content: '🛒 ร้านค้ายังว่างเปล่า', ephemeral: true });

        const page = 0;
        shopSessions.set(`${userId}-${guildId}`, { page, items: items.map(i => ({ ...i._doc || i })), guildId });

        return interaction.reply({
            embeds:     [buildShopEmbed(items, page, interaction.guild, config)],
            components: [buildShopRow(items, page, userId)]
        });
    }
};

// ─── shop button handler — export แยกให้ index.js เรียก ───────────────────
async function handleShopButton(interaction) {
    const parts   = interaction.customId.split('_'); // shop_prev/next_userId
    const action  = parts[1];
    const ownerId = parts[2];

    if (interaction.user.id !== ownerId)
        return interaction.reply({ content: '❌ นี่ไม่ใช่ร้านค้าของคุณ', ephemeral: true });

    const { id: userId }  = interaction.user;
    const { id: guildId } = interaction.guild;
    const key     = `${userId}-${guildId}`;
    const session = shopSessions.get(key);
    if (!session) return interaction.reply({ content: '❌ Session หมดอายุ ใช้ /shop ใหม่ครับ', ephemeral: true });

    const config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
    let { page, items } = session;

    const totalPages = Math.ceil(items.length / PAGE_SIZE);
    if (action === 'prev') page = Math.max(0, page - 1);
    if (action === 'next') page = Math.min(totalPages - 1, page + 1);

    session.page = page;
    shopSessions.set(key, session);

    return interaction.update({
        embeds:     [buildShopEmbed(items, page, interaction.guild, config)],
        components: [buildShopRow(items, page, userId)]
    });
}

// ─── inventory helpers ─────────────────────────────────────────────────────
function buildInvEmbed(invItems, page, targetUsername, targetAvatar, config, storeItems) {
    const item      = invItems[page];
    const storeItem = storeItems.find(s => s.itemName === item.itemName && s.sellable);
    const sellRate  = storeItem ? (storeItem.sellPercent || 50) : null;
    const sellPrice = storeItem ? Math.floor(storeItem.price * (sellRate / 100)) : null;

    const e = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🎒 กระเป๋าของ ${targetUsername}`)
        .setFooter({ text: `ไอเทม ${page + 1} / ${invItems.length}` })
        .addFields(
            { name: '🏷️ ไอเทม',   value: item.itemName,      inline: true },
            { name: '📦 จำนวน',   value: `x${item.quantity}`, inline: true },
            { name: '💵 ราคาขาย', value: sellPrice !== null
                ? `${sellPrice.toLocaleString()} ${config.currencyEmoji} (${sellRate}%)`
                : '❌ ขายไม่ได้', inline: true }
        )
        .setTimestamp();
    if (targetAvatar) e.setThumbnail(targetAvatar);
    return e;
}

function buildInvRow(invItems, page, userId, storeItems) {
    const item    = invItems[page];
    const canSell = storeItems.some(s => s.itemName === item.itemName && s.sellable) && item.quantity > 0;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`inv_prev_${userId}`)
            .setLabel('◀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`inv_sell_${userId}`)
            .setLabel('💰 ขาย x1')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!canSell),
        new ButtonBuilder()
            .setCustomId(`inv_sellall_${userId}`)
            .setLabel('💸 ขายทั้งหมด')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!canSell),
        new ButtonBuilder()
            .setCustomId(`inv_next_${userId}`)
            .setLabel('▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === invItems.length - 1)
    );
}

// ─── /buy ──────────────────────────────────────────────────────────────────
const buy = {
    data: new SlashCommandBuilder().setName('buy').setDescription('ซื้อไอเทมจากร้านค้าโดยพิมพ์ชื่อ')
        .addStringOption(o => o.setName('item').setDescription('ชื่อไอเทม').setRequired(true))
        .addIntegerOption(o => o.setName('quantity').setDescription('จำนวน (default: 1)').setMinValue(1)),
    async execute(interaction) {
        const { id: userId }  = interaction.user;
        const { id: guildId } = interaction.guild;
        const itemName = interaction.options.getString('item');
        const qty      = interaction.options.getInteger('quantity') || 1;
        try {
            const config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
            const item   = config.storeItems.find(i => i.itemName.toLowerCase() === itemName.toLowerCase() && i.listedInStore);
            if (!item) return interaction.reply({ content: `❌ ไม่พบไอเทม "${itemName}"`, ephemeral: true });
            if (!item.unlimitedStock && item.stock < qty)
                return interaction.reply({ content: `❌ สินค้าเหลือไม่พอ (เหลือ ${item.stock})`, ephemeral: true });

            const total = item.price * qty;
            let user = await User.findOne({ userId, guildId }) || new User({ userId, guildId });

            // maxPerUser check
            if (item.maxPerUser > 0) {
                const existing = user.inventory.find(i => i.itemName === item.itemName)?.quantity || 0;
                if ((existing + qty) > item.maxPerUser)
                    return interaction.reply({ content: `❌ คุณซื้อได้สูงสุด **${item.maxPerUser}** ชิ้น (มีแล้ว ${existing} ชิ้น)`, ephemeral: true });
            }

            if (user.coins < total)
                return interaction.reply({ content: `❌ เงินไม่พอ (ต้องการ ${total.toLocaleString()}, มี ${user.coins.toLocaleString()})`, ephemeral: true });

            user.coins -= total;
            if (item.inventoryItem !== false) {
                const existing = user.inventory.find(i => i.itemName === item.itemName);
                if (existing) existing.quantity += qty;
                else user.inventory.push({ itemName: item.itemName, quantity: qty });
            }
            if (!item.unlimitedStock) item.stock -= qty;
            config.markModified('storeItems');
            await Promise.all([user.save(), config.save()]);

            // Grant role reward if itemType === 'role'
            if (item.itemType === 'role' && item.roleReward) {
                try {
                    const member = await interaction.guild.members.fetch(userId);
                    await member.roles.add(item.roleReward).catch(() => {});
                } catch (e) { /* ignore role errors */ }
            }

            const e = new EmbedBuilder().setColor(0x57F287).setTitle('✅ ซื้อสำเร็จ')
                .addFields(
                    { name: '🛍️ ไอเทม',  value: `${item.itemName} x${qty}`, inline: true },
                    { name: '💸 ราคา',    value: `${total.toLocaleString()} ${config.currencyEmoji}`, inline: true },
                    { name: '👛 คงเหลือ', value: `${user.coins.toLocaleString()} ${config.currencyEmoji}`, inline: true }
                );
            if (item.itemImage) e.setThumbnail(item.itemImage);
            return interaction.reply({ embeds: [e] });
        } catch (err) { console.error(err); return interaction.reply({ content: 'เกิดข้อผิดพลาด', ephemeral: true }); }
    }
};

// ─── /inventory ────────────────────────────────────────────────────────────
const inventory = {
    data: new SlashCommandBuilder().setName('inventory').setDescription('ดูกระเป๋าไอเทมของคุณ 🎒')
        .addUserOption(o => o.setName('target').setDescription('ดูของคนอื่น (ว่าง = ดูของตัวเอง)')),
    async execute(interaction) {
        const target   = interaction.options.getUser('target') || interaction.user;
        const isSelf   = target.id === interaction.user.id;
        const { id: guildId } = interaction.guild;
        const { id: userId }  = interaction.user;

        const config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
        const user   = await User.findOne({ userId: target.id, guildId });
        if (!user || !user.inventory.length)
            return interaction.reply({ content: `🎒 **${target.username}** ไม่มีไอเทมในกระเป๋า`, ephemeral: true });

        // ดูของคนอื่น → แสดงเป็น list ธรรมดา
        if (!isSelf) {
            const lines = user.inventory.map(i => `• **${i.itemName}** x${i.quantity}`);
            const e = new EmbedBuilder().setColor(0x5865F2).setTitle(`🎒 กระเป๋าของ ${target.username}`)
                .setDescription(lines.join('\n')).setThumbnail(target.displayAvatarURL()).setTimestamp();
            return interaction.reply({ embeds: [e] });
        }

        // ดูของตัวเอง → paginated พร้อมปุ่มขาย
        const invItems   = user.inventory.map(i => ({ itemName: i.itemName, quantity: i.quantity }));
        const storeItems = config.storeItems || [];
        const page = 0;

        invSessions.set(`${userId}-${guildId}`, {
            page,
            invItems,
            targetUsername: target.username,
            targetAvatar:   target.displayAvatarURL(),
        });

        return interaction.reply({
            embeds:     [buildInvEmbed(invItems, page, target.username, target.displayAvatarURL(), config, storeItems)],
            components: [buildInvRow(invItems, page, userId, storeItems)],
        });
    }
};

// ─── /sell ─────────────────────────────────────────────────────────────────
const sell = {
    data: new SlashCommandBuilder().setName('sell').setDescription('ขายไอเทมกลับ')
        .addStringOption(o => o.setName('item').setDescription('ชื่อไอเทม').setRequired(true))
        .addIntegerOption(o => o.setName('quantity').setDescription('จำนวน').setMinValue(1)),
    async execute(interaction) {
        const { id: userId }  = interaction.user;
        const { id: guildId } = interaction.guild;
        const itemName = interaction.options.getString('item');
        const qty      = interaction.options.getInteger('quantity') || 1;
        try {
            const config    = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
            const storeItem = config.storeItems.find(i => i.itemName.toLowerCase() === itemName.toLowerCase() && i.sellable);
            if (!storeItem) return interaction.reply({ content: `❌ ไอเทม "${itemName}" ขายไม่ได้หรือไม่มีในระบบ`, ephemeral: true });
            let user = await User.findOne({ userId, guildId });
            if (!user) return interaction.reply({ content: '❌ ไม่พบบัญชี', ephemeral: true });
            const invItem = user.inventory.find(i => i.itemName === storeItem.itemName);
            if (!invItem || invItem.quantity < qty)
                return interaction.reply({ content: '❌ คุณมีไอเทมนี้ไม่พอ', ephemeral: true });
            const refundRate = (storeItem.sellPercent || 50) / 100;
            const refund     = Math.floor(storeItem.price * refundRate) * qty;
            invItem.quantity -= qty;
            if (invItem.quantity <= 0) user.inventory = user.inventory.filter(i => i.itemName !== storeItem.itemName);
            user.coins += refund;
            await user.save();
            const e = new EmbedBuilder().setColor(0xFEE75C).setTitle('💰 ขายสำเร็จ')
                .addFields(
                    { name: '📦 ไอเทม',   value: `${storeItem.itemName} x${qty}`, inline: true },
                    { name: '💵 ได้รับ',  value: `${refund.toLocaleString()} ${config.currencyEmoji} (${storeItem.sellPercent || 50}%)`, inline: true },
                    { name: '👛 คงเหลือ', value: `${user.coins.toLocaleString()} ${config.currencyEmoji}`, inline: true }
                );
            if (storeItem.itemImage) e.setThumbnail(storeItem.itemImage);
            return interaction.reply({ embeds: [e] });
        } catch (err) { console.error(err); return interaction.reply({ content: 'เกิดข้อผิดพลาด', ephemeral: true }); }
    }
};

// ─── /use ──────────────────────────────────────────────────────────────────
const use = {
    data: new SlashCommandBuilder().setName('use').setDescription('ใช้ไอเทมจากกระเป๋า')
        .addStringOption(o => o.setName('item').setDescription('ชื่อไอเทม').setRequired(true)),
    async execute(interaction) {
        const { id: userId }  = interaction.user;
        const { id: guildId } = interaction.guild;
        const itemName = interaction.options.getString('item');
        try {
            const config    = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
            const storeItem = config.storeItems.find(i => i.itemName.toLowerCase() === itemName.toLowerCase());
            if (!storeItem) return interaction.reply({ content: `❌ ไม่พบไอเทม "${itemName}"`, ephemeral: true });
            if (!storeItem.usable) return interaction.reply({ content: '❌ ไอเทมนี้ใช้งานไม่ได้', ephemeral: true });

            let user = await User.findOne({ userId, guildId });
            if (!user) return interaction.reply({ content: '❌ ไม่พบบัญชี', ephemeral: true });

            const invItem = user.inventory.find(i => i.itemName === storeItem.itemName);
            if (!invItem || invItem.quantity <= 0)
                return interaction.reply({ content: `❌ คุณไม่มี "${storeItem.itemName}" ในกระเป๋า`, ephemeral: true });

            // Remove 1 from inventory
            invItem.quantity -= 1;
            if (invItem.quantity <= 0)
                user.inventory = user.inventory.filter(i => i.itemName !== storeItem.itemName);
            await user.save();

            // Grant role reward if itemType === 'role'
            if (storeItem.itemType === 'role' && storeItem.roleReward) {
                try {
                    const member = await interaction.guild.members.fetch(userId);
                    await member.roles.add(storeItem.roleReward).catch(() => {});
                } catch (e) { /* ignore role errors */ }
            }

            const msg = storeItem.useMessage
                ? storeItem.useMessage.replace(/\{user\}/g, `<@${userId}>`)
                : `✅ ใช้ไอเทม **${storeItem.itemName}** สำเร็จ!`;

            return interaction.reply({ content: msg });
        } catch (err) { console.error(err); return interaction.reply({ content: 'เกิดข้อผิดพลาด', ephemeral: true }); }
    }
};

// ─── inventory button handler ──────────────────────────────────────────────
async function handleInvButton(interaction) {
    const parts   = interaction.customId.split('_'); // inv_prev/next/sell/sellall_userId
    const action  = parts[1];
    const ownerId = parts[2];

    if (interaction.user.id !== ownerId)
        return interaction.reply({ content: '❌ นี่ไม่ใช่กระเป๋าของคุณ', ephemeral: true });

    const { id: userId }  = interaction.user;
    const { id: guildId } = interaction.guild;
    const key     = `${userId}-${guildId}`;
    const session = invSessions.get(key);
    if (!session) return interaction.reply({ content: '❌ Session หมดอายุ ใช้ /inventory ใหม่', ephemeral: true });

    const config     = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
    const storeItems = config.storeItems || [];
    let { page, invItems, targetUsername, targetAvatar } = session;

    // ─── เลื่อนหน้า ───────────────────────────────────────────────────────────
    if (action === 'prev') page = Math.max(0, page - 1);
    if (action === 'next') page = Math.min(invItems.length - 1, page + 1);

    if (action === 'prev' || action === 'next') {
        session.page = page;
        invSessions.set(key, session);
        return interaction.update({
            embeds:     [buildInvEmbed(invItems, page, targetUsername, targetAvatar, config, storeItems)],
            components: [buildInvRow(invItems, page, userId, storeItems)],
        });
    }

    // ─── ขาย ──────────────────────────────────────────────────────────────────
    if (action === 'sell' || action === 'sellall') {
        const invItem   = invItems[page];
        const storeItem = storeItems.find(s => s.itemName === invItem.itemName && s.sellable);
        if (!storeItem)
            return interaction.reply({ content: '❌ ไอเทมนี้ขายไม่ได้', ephemeral: true });

        let user = await User.findOne({ userId, guildId });
        if (!user) return interaction.reply({ content: '❌ ไม่พบบัญชี', ephemeral: true });

        const dbItem = user.inventory.find(i => i.itemName === invItem.itemName);
        if (!dbItem || dbItem.quantity <= 0)
            return interaction.reply({ content: '❌ คุณไม่มีไอเทมนี้แล้ว', ephemeral: true });

        const qty        = action === 'sellall' ? dbItem.quantity : 1;
        const refundRate = (storeItem.sellPercent || 50) / 100;
        const refund     = Math.floor(storeItem.price * refundRate) * qty;

        dbItem.quantity -= qty;
        if (dbItem.quantity <= 0)
            user.inventory = user.inventory.filter(i => i.itemName !== invItem.itemName);
        user.coins += refund;
        await user.save();

        // อัพ session
        invItem.quantity -= qty;
        if (invItem.quantity <= 0) {
            invItems.splice(page, 1);
            page = Math.min(page, invItems.length - 1);
        }

        // กระเป๋าว่างเปล่าแล้ว
        if (invItems.length === 0) {
            invSessions.delete(key);
            return interaction.update({
                embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('🎒 กระเป๋าว่างเปล่าแล้ว')
                    .setDescription(`ขาย **${invItem.itemName} x${qty}** ได้รับ **${refund.toLocaleString()}** ${config.currencyEmoji}\n👛 คงเหลือ: **${user.coins.toLocaleString()}** ${config.currencyEmoji}`)],
                components: [],
            });
        }

        session.page     = page;
        session.invItems = invItems;
        invSessions.set(key, session);

        const resultEmbed = buildInvEmbed(invItems, page, targetUsername, targetAvatar, config, storeItems)
            .setDescription(`✅ ขาย **${invItem.itemName} x${qty}** ได้รับ **${refund.toLocaleString()}** ${config.currencyEmoji} | 👛 คงเหลือ **${user.coins.toLocaleString()}** ${config.currencyEmoji}`);

        return interaction.update({
            embeds:     [resultEmbed],
            components: [buildInvRow(invItems, page, userId, storeItems)],
        });
    }
}

module.exports = [shop, buy, inventory, sell, use];
module.exports.handleShopButton = handleShopButton;
module.exports.handleInvButton  = handleInvButton;
