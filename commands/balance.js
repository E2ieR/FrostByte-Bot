const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const GuildConfig = require('../models/GuildConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('เช็กยอดเงินคงเหลือในกระเป๋าและธนาคารของคุณ')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('เลือกเพื่อนที่อยากแอบดูเงิน (เว้นว่างไว้เพื่อดูของตัวเอง)')
                .setRequired(false)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('target') || interaction.user;
        const guildId = interaction.guild.id;

        if (targetUser.bot) return interaction.reply({ content: '❌ บอทไม่มีบัญชีการเงินนะ!', ephemeral: true });

        try {
            // ดึงข้อมูลคอนฟิกเหรียญของเซิร์ฟเวอร์
            const config = await GuildConfig.findOne({ guildId }) || new GuildConfig({ guildId });
            
            // ดึงข้อมูลเงินของยูสเซอร์
            let userData = await User.findOne({ userId: targetUser.id, guildId });
            if (!userData) {
                userData = new User({ 
                    userId: targetUser.id, 
                    guildId, 
                    coins: config.startCoins, 
                    bank: config.startBank 
                });
                await userData.save();
            }

            // ดีไซน์การ์ด Embed สวยๆ สไตล์ดิสคอร์ดตัวท็อป
            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`💳 บัญชีการเงินของ ${targetUser.username}`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: `👛 เงินในกระเป๋า`, value: `**${userData.coins.toLocaleString()}** ${config.currencyEmoji} ${config.currencyName}`, inline: true },
                    { name: `🏦 เงินในธนาคาร`, value: `**${userData.bank.toLocaleString()}** ${config.currencyEmoji} ${config.currencyName}`, inline: true },
                    { name: `📊 รวมทั้งหมด`, value: `**${(userData.coins + userData.bank).toLocaleString()}** ${config.currencyEmoji}`, inline: false }
                )
                .setFooter({ text: `ระบอบเศรษฐกิจประจำเซิร์ฟเวอร์ ${interaction.guild.name}` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            return interaction.reply({ content: 'เกิดข้อผิดพลาดในระบบการเช็กบัญชี', ephemeral: true });
        }
    }
};