// dashboard/handlers/blackjackHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../../models/User');
const GuildConfig = require('../../models/GuildConfig');

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
function cardValue(v) { return ['J', 'Q', 'K'].includes(v) ? 10 : v === 'A' ? 11 : parseInt(v); }
function handScore(hand) {
    let score = hand.reduce((s, c) => s + cardValue(c.v), 0);
    let aces = hand.filter(c => c.v === 'A').length;
    while (score > 21 && aces-- > 0) score -= 10;
    return score;
}
function handStr(hand) { return hand.map(c => `${c.v}${c.s}`).join(' '); }

// game state (shared with blackjack command via require)
function getGames() {
    return require('../../commands/blackjack').games
}

async function handleBlackjack(interaction) {
    const parts = interaction.customId.split('_'); // bj_hit_userId
    const action = parts[1]; // hit | stand | double
    const ownerId = parts[2];

    if (interaction.user.id !== ownerId)
        return interaction.reply({ content: '❌ นี่ไม่ใช่เกมของคุณ', ephemeral: true });

    const { id: userId } = interaction.user;
    const { id: guildId } = interaction.guild;
    const key = `${userId}-${guildId}`;
    const games = getGames();
    const game = games.get(key);
    if (!game) return interaction.reply({ content: '❌ ไม่พบเกม กรุณาเริ่มใหม่', ephemeral: true });

    const config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
    let user = await User.findOne({ userId, guildId }) || new User({ userId, guildId });

    const { deck, player, dealer, bet } = game;

    const buildEmbed = (ended, result, extra = '', displayBet = bet) => {
        const ds = ended ? handScore(dealer) : '?';
        const ps = handScore(player);
        const colorMap = { win: 0x57F287, lose: 0xED4245, bust: 0xED4245, dealer_bust: 0x57F287, push: 0xFEE75C };
        return new EmbedBuilder()
            .setColor(ended ? (colorMap[result] || 0x4f545c) : 0x5865F2)
            .setTitle('🃏 Blackjack')
            .addFields(
                { name: `🤖 ดีลเลอร์ (${ds})`, value: ended ? handStr(dealer) : `${dealer[0].v}${dealer[0].s} 🂠`, inline: false },
                { name: `👤 คุณ (${ps})`, value: handStr(player), inline: false },
                {
                    name: ended ? 'ผลลัพธ์' : 'เดิมพัน', value: ended
                        ? (result === 'win' || result === 'dealer_bust' ? `🎉 คุณชนะ! +${displayBet.toLocaleString()}` : result === 'push' ? '🤝 เสมอ ได้เงินคืน' : `💥 แพ้ -${displayBet.toLocaleString()}`) + (extra ? `\n${extra}` : '')
                        : `${bet.toLocaleString()} ${config.currencyEmoji}`, inline: false
                }
            );
    };

    const endGame = async (result) => {
        const finalBet = game.bet; // ใช้ game.bet ที่อาจถูก double แล้ว
        games.delete(key);
        let payout = 0;
        if (result === 'win' || result === 'dealer_bust') payout = finalBet;
        else if (result === 'push') payout = 0;
        else payout = -finalBet;
        user.coins += payout;
        await user.save();
        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bj_hit_done').setLabel('🃏 Hit').setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId('bj_stand_done').setLabel('✋ Stand').setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId('bj_double_done').setLabel('✖️ Double').setStyle(ButtonStyle.Success).setDisabled(true)
        );
        return interaction.update({ embeds: [buildEmbed(true, result, `👛 คงเหลือ: ${user.coins.toLocaleString()} ${config.currencyEmoji}`, finalBet)], components: [disabledRow] });
    };

    if (action === 'hit') {
        player.push(deck.pop());
        const ps = handScore(player);
        if (ps > 21) return endGame('bust');
        if (ps === 21) {
            // ดีลเลอร์จั่ว
            while (handScore(dealer) < 17) dealer.push(deck.pop());
            const ds = handScore(dealer);
            const result = ds > 21 ? 'dealer_bust' : ps > ds ? 'win' : ps < ds ? 'lose' : 'push';
            return endGame(result);
        }
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bj_hit_${userId}`).setLabel('🃏 Hit').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`bj_stand_${userId}`).setLabel('✋ Stand').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`bj_double_${userId}`).setLabel('✖️ Double').setStyle(ButtonStyle.Success).setDisabled(true)
        );
        return interaction.update({ embeds: [buildEmbed(false)], components: [row] });
    }

    if (action === 'stand' || action === 'double') {
        if (action === 'double') {
            if (user.coins < bet * 2) return interaction.reply({ content: '❌ เงินไม่พอ double', ephemeral: true });
            game.bet *= 2; // endGame จะจัดการ payout/loss เต็ม 2x
            player.push(deck.pop());
            if (handScore(player) > 21) return endGame('bust');
        }
        // ดีลเลอร์จั่วถึง 17
        while (handScore(dealer) < 17) dealer.push(deck.pop());
        const ps = handScore(player), ds = handScore(dealer);
        const result = ds > 21 ? 'dealer_bust' : ps > ds ? 'win' : ps < ds ? 'lose' : 'push';
        return endGame(result);
    }
}

module.exports = { handleBlackjack };
