const express = require('express');
const router = express.Router();
const GuildConfig = require('../../models/GuildConfig');

router.post('/:guildId/add-store-item', async (req, res) => {
    let config = await GuildConfig.findOne({ guildId: req.params.guildId }) || new GuildConfig({ guildId: req.params.guildId });
    const itemData = {
        itemName: req.body.itemName,
        price: parseInt(req.body.price) || 0,
        itemImage: req.body.itemImage,
        description: req.body.description,
        unlimitedStock: req.body.unlimitedStock === 'true',
        stock: req.body.unlimitedStock === 'true' ? 0 : parseInt(req.body.stock),
        listedInStore: req.body.listedInStore === 'true',
        inventoryItem: req.body.inventoryItem === 'true',
        usable: req.body.usable === 'true',
        sellable: req.body.sellable === 'true',
        expiryDate: req.body.expiryDate ? new Date(req.body.expiryDate) : null
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

module.exports = router;