const express = require('express');
const router = express.Router();
const GuildConfig = require('../../models/GuildConfig');

router.post('/:guildId/add-store-item', async (req, res) => {
    let config = await GuildConfig.findOne({ guildId: req.params.guildId }) || new GuildConfig({ guildId: req.params.guildId });
    const itemData = {
        itemName:       req.body.itemName,
        price:          parseInt(req.body.price) || 0,
        itemImage:      req.body.itemImage,
        description:    req.body.description,
        unlimitedStock: req.body.unlimitedStock === 'true',
        stock:          req.body.unlimitedStock === 'true' ? 0 : parseInt(req.body.stock),
        listedInStore:  req.body.listedInStore === 'true',
        inventoryItem:  req.body.inventoryItem === 'true',
        usable:         req.body.usable === 'true',
        sellable:       req.body.sellable === 'true',
        expiryDate:     req.body.expiryDate ? new Date(req.body.expiryDate) : null,
        itemType:       req.body.itemType || 'item',
        roleReward:     req.body.roleReward || '',
        sellPercent:    parseInt(req.body.sellPercent) || 50,
        maxPerUser:     parseInt(req.body.maxPerUser) || 0,
        category:       req.body.category || '',
        useMessage:     req.body.useMessage || ''
    };
    config.storeItems.push(itemData);
    await config.save();
    res.redirect(`/manage/${req.params.guildId}?tab=store&success=true`);
});

router.get('/:guildId/delete-store-item/:itemId', async (req, res) => {
    let config = await GuildConfig.findOne({ guildId: req.params.guildId });
    config.storeItems = config.storeItems.filter(item => (item.itemId || item._id).toString() !== req.params.itemId.toString());
    config.markModified('storeItems');
    await config.save();
    res.redirect(`/manage/${req.params.guildId}?tab=store&delete_success=true`);
});

router.post('/:guildId/update-store-item/:itemId', async (req, res) => {
    let config = await GuildConfig.findOne({ guildId: req.params.guildId });
    if (!config) return res.redirect(`/manage/${req.params.guildId}?tab=store`);
    const item = config.storeItems.find(i => (i.itemId || i._id).toString() === req.params.itemId.toString());
    if (!item) return res.redirect(`/manage/${req.params.guildId}?tab=store`);

    item.itemName       = req.body.itemName || item.itemName;
    item.price          = parseInt(req.body.price) || 0;
    item.itemImage      = req.body.itemImage || '';
    item.description    = req.body.description || '';
    item.unlimitedStock = req.body.unlimitedStock === 'true';
    item.stock          = req.body.unlimitedStock === 'true' ? 0 : parseInt(req.body.stock) || 0;
    item.listedInStore  = req.body.listedInStore === 'true';
    item.inventoryItem  = req.body.inventoryItem === 'true';
    item.usable         = req.body.usable === 'true';
    item.sellable       = req.body.sellable === 'true';
    item.expiryDate     = req.body.expiryDate ? new Date(req.body.expiryDate) : null;
    item.itemType       = req.body.itemType || 'item';
    item.roleReward     = req.body.roleReward || '';
    item.sellPercent    = parseInt(req.body.sellPercent) || 50;
    item.maxPerUser     = parseInt(req.body.maxPerUser) || 0;
    item.category       = req.body.category || '';
    item.useMessage     = req.body.useMessage || '';

    config.markModified('storeItems');
    await config.save();
    res.redirect(`/manage/${req.params.guildId}?tab=store&success=true`);
});

module.exports = router;
