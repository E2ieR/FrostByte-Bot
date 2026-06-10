const { SlashCommandBuilder } = require('discord.js');
const { claimDailyRewards }  = require('../dashboard/handlers/incomeHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('ดูรายงานประจำวัน รับ Seniority Bonus และตรวจสอบ Daily Quests'),
    async execute(interaction) {
        await claimDailyRewards(interaction);
    }
};
