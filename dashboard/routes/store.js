const express  = require('express');
const router   = express.Router();
const GuildConfig = require('../../models/GuildConfig');

// ── helper: parse item fields from req.body ──────────────────────────────────
function parseItemBody(b) {
    return {
        itemName:      b.itemName,
        price:         parseInt(b.price)       || 0,
        itemImage:     b.itemImage             || '',
        itemEmoji:     b.itemEmoji             || '',
        description:   b.description           || '',
        unlimitedStock:b.unlimitedStock === 'true',
        stock:         b.unlimitedStock === 'true' ? 0 : (parseInt(b.stock) || 0),
        listedInStore: b.listedInStore  === 'true',
        inventoryItem: b.inventoryItem  === 'true',
        usable:        b.usable         === 'true',
        sellable:      b.sellable       === 'true',
        expiryDate:    b.expiryDate ? new Date(b.expiryDate) : null,
        itemType:      b.itemType       || 'item',
        roleReward:    b.roleReward     || '',
        sellPercent:   parseInt(b.sellPercent)  || 50,
        maxPerUser:    parseInt(b.maxPerUser)    || 0,
        category:      b.category       || '',
        useMessage:    b.useMessage     || '',
        // Market
        marketEnabled: b.marketEnabled  === 'true',
        volatility:    parseInt(b.volatility)   || 10
    };
}

// ─── Add item ────────────────────────────────────────────────────────────────
router.post('/:guildId/add-store-item', async (req, res) => {
    const { guildId } = req.params;
    let config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
    const data = parseItemBody(req.body);
    if (data.marketEnabled) {
        data.basePrice    = data.price;
        data.currentPrice = data.price;
        data.priceHistory = [{ price: data.price, date: new Date() }];
    }
    config.storeItems.push(data);
    await config.save();
    res.redirect(`/manage/${guildId}?tab=store&success=true`);
});

// ─── Delete item ─────────────────────────────────────────────────────────────
router.get('/:guildId/delete-store-item/:itemId', async (req, res) => {
    const { guildId, itemId } = req.params;
    let config = await GuildConfig.findOne({ guildId });
    if (!config) return res.redirect(`/manage/${guildId}?tab=store`);
    config.storeItems = config.storeItems.filter(
        i => (i.itemId || i._id).toString() !== itemId.toString()
    );
    config.markModified('storeItems');
    await config.save();
    res.redirect(`/manage/${guildId}?tab=store&delete_success=true`);
});

// ─── Update item ─────────────────────────────────────────────────────────────
router.post('/:guildId/update-store-item/:itemId', async (req, res) => {
    const { guildId, itemId } = req.params;
    let config = await GuildConfig.findOne({ guildId });
    if (!config) return res.redirect(`/manage/${guildId}?tab=store`);
    const item = config.storeItems.find(
        i => (i.itemId || i._id).toString() === itemId.toString()
    );
    if (!item) return res.redirect(`/manage/${guildId}?tab=store`);

    const data = parseItemBody(req.body);
    Object.assign(item, data);

    // If market just enabled, init prices
    if (data.marketEnabled && !item.basePrice) {
        item.basePrice    = data.price;
        item.currentPrice = data.price;
        if (!item.priceHistory?.length)
            item.priceHistory = [{ price: data.price, date: new Date() }];
    }
    config.markModified('storeItems');
    await config.save();
    res.redirect(`/manage/${guildId}?tab=store&success=true`);
});

// ─── Add category ────────────────────────────────────────────────────────────
router.post('/:guildId/add-store-category', async (req, res) => {
    const { guildId } = req.params;
    let config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
    if (!req.body.name) return res.redirect(`/manage/${guildId}?tab=store`);
    config.storeCategories.push({
        name:  req.body.name.trim(),
        emoji: req.body.emoji?.trim() || '📦'
    });
    config.markModified('storeCategories');
    await config.save();
    res.redirect(`/manage/${guildId}?tab=store&success=true`);
});

// ─── Delete category ─────────────────────────────────────────────────────────
router.get('/:guildId/delete-store-category/:catId', async (req, res) => {
    const { guildId, catId } = req.params;
    let config = await GuildConfig.findOne({ guildId });
    if (!config) return res.redirect(`/manage/${guildId}?tab=store`);
    config.storeCategories = config.storeCategories.filter(
        c => c.catId.toString() !== catId.toString()
    );
    config.markModified('storeCategories');
    await config.save();
    res.redirect(`/manage/${guildId}?tab=store&delete_success=true`);
});

module.exports = router;
