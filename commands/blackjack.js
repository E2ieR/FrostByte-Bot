const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');
const GuildConfig = require('../models/GuildConfig');

const SUITS  = ['♠️','♥️','♦️','♣️'];
const VALUES = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function newDeck() {
    return SUITS.flatMap(s => VALUES.map(v => ({ s, v })));
}
function shuffle(d) { for (let i = d.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [d[i],d[j]]=[d[j],d[i]]; } return d; }
function cardValue(v) { return ['J','Q','K'].includes(v) ? 10 : v === 'A' ? 11 : parseInt(v); }
function handScore(hand) {
    let score = hand.reduce((s,c) => s + cardValue(c.v), 0);
    let aces  = hand.filter(c => c.v === 'A').length;
    while (score > 21 && aces-- > 0) score -= 10;
    return score;
}
function handStr(hand) { return hand.map(c => `${c.v}${c.s}`).join(' '); }

// เก็บ game state ชั่วคราวใน memory
const games = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('เล่น Blackjack กับบอท 🃏')
        .addIntegerOption(o => o.setName('bet').setDescription('จำนวนเงินเดิมพัน').setRequired(true).setMinValue(1)),

    async execute(interaction) {
        const { id: userId } = interaction.user;
        const { id: guildId } = interaction.guild;
        const bet = interaction.options.getInteger('bet');
        try {
            const config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
            let user = await User.findOne({ userId, guildId }) || new User({ userId, guildId });
            if (user.coins < bet) return interaction.reply({ content: `❌ เงินไม่พอ (มี ${user.coins.toLocaleString()} ${config.currencyEmoji})`, ephemeral: true });

            const deck   = shuffle(newDeck());
            const player = [deck.pop(), deck.pop()];
            const dealer = [deck.pop(), deck.pop()];
            games.set(`${userId}-${guildId}`, { deck, player, dealer, bet, userId, guildId });

            const ps = handScore(player);
            const buildEmbed = (ended = false, result = '') => new EmbedBuilder()
                .setColor(ended ? (result === 'win' ? 0x57F287 : result === 'lose' ? 0xED4245 : 0xFEE75C) : 0x5865F2)
                .setTitle('🃏 Blackjack')
                .addFields(
                    { name: `🤖 ดีลเลอร์ (${ended ? handScore(dealer) : '?'})`, value: ended ? handStr(dealer) : `${dealer[0].v}${dealer[0].s} 🂠`, inline: false },
                    { name: `👤 คุณ (${ps})`, value: handStr(player), inline: false },
                    ended ? { name: 'ผลลัพธ์', value: result === 'win' ? '🎉 คุณชนะ!' : result === 'bust' ? '💥 Bust! เกิน 21' : result === 'dealer_bust' ? '🎉 ดีลเลอร์ Bust! คุณชนะ!' : result === 'push' ? '🤝 เสมอ ได้เงินคืน' : '😞 คุณแพ้', inline: false }
                    : { name: 'เดิมพัน', value: `${bet.toLocaleString()} ${config.currencyEmoji}`, inline: false }
                );

            if (ps === 21) {
                // Blackjack ทันที
                const payout = Math.floor(bet * 1.5);
                user.coins += payout;
                await user.save();
                games.delete(`${userId}-${guildId}`);
                return interaction.reply({ embeds: [buildEmbed(true, 'win').setDescription(`🎰 **BLACKJACK!** ได้รับ **${payout.toLocaleString()}** ${config.currencyEmoji}`)] });
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`bj_hit_${userId}`).setLabel('🃏 Hit').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`bj_stand_${userId}`).setLabel('✋ Stand').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`bj_double_${userId}`).setLabel('✖️ Double').setStyle(ButtonStyle.Success).setDisabled(user.coins < bet * 2)
            );
            return interaction.reply({ embeds: [buildEmbed()], components: [row] });
        } catch (err) { console.error(err); return interaction.reply({ content: 'เกิดข้อผิดพลาด', ephemeral: true }); }
    }
};

// Export game state map for interaction handler
module.exports.games    = games;
module.exports.handScore = handScore;
module.exports.handStr   = handStr;
