const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// ─── /8ball ────────────────────────────────────────────────────────────────
const eightball = {
    data: new SlashCommandBuilder()
        .setName('8ball').setDescription('ถามลูกบอลวิเศษ 🎱')
        .addStringOption(o => o.setName('question').setDescription('คำถามของคุณ').setRequired(true)),
    async execute(interaction) {
        const q = interaction.options.getString('question');
        const answers = [
            '✅ ใช่แน่นอน!', '✅ แน่นอนมาก!', '✅ ไม่ต้องสงสัยเลย',
            '✅ คิดว่าใช่', '✅ มีโอกาสสูง', '🤔 ยังไม่แน่ใจ',
            '🤔 ถามใหม่อีกครั้ง', '🤔 คาดเดายากมาก', '❌ ไม่คิดว่าใช่',
            '❌ ไม่แน่นอน', '❌ ไม่น่าเป็นไปได้', '❌ แน่นอนว่าไม่'
        ];
        const answer = answers[Math.floor(Math.random() * answers.length)];
        const e = new EmbedBuilder().setColor(0x5865F2).setTitle('🎱 Magic 8-Ball')
            .addFields({ name: '❓ คำถาม', value: q }, { name: '🔮 คำตอบ', value: `**${answer}**` });
        return interaction.reply({ embeds: [e] });
    }
};

// ─── /poll ─────────────────────────────────────────────────────────────────
const poll = {
    data: new SlashCommandBuilder()
        .setName('poll').setDescription('สร้างโพล')
        .addStringOption(o => o.setName('question').setDescription('คำถาม').setRequired(true))
        .addStringOption(o => o.setName('option1').setDescription('ตัวเลือก 1').setRequired(true))
        .addStringOption(o => o.setName('option2').setDescription('ตัวเลือก 2').setRequired(true))
        .addStringOption(o => o.setName('option3').setDescription('ตัวเลือก 3'))
        .addStringOption(o => o.setName('option4').setDescription('ตัวเลือก 4')),
    async execute(interaction) {
        const q    = interaction.options.getString('question');
        const opts = [
            interaction.options.getString('option1'),
            interaction.options.getString('option2'),
            interaction.options.getString('option3'),
            interaction.options.getString('option4'),
        ].filter(Boolean);
        const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣'];
        const e = new EmbedBuilder().setColor(0xFEE75C).setTitle(`📊 โพล: ${q}`)
            .setDescription(opts.map((o,i) => `${emojis[i]} ${o}`).join('\n'))
            .setFooter({ text: `โพลโดย ${interaction.user.username}` }).setTimestamp();
        const msg = await interaction.reply({ embeds: [e], fetchReply: true });
        for (let i = 0; i < opts.length; i++) await msg.react(emojis[i]);
    }
};

// ─── /coinflip (no bet version) ────────────────────────────────────────────
const flip = {
    data: new SlashCommandBuilder()
        .setName('flip').setDescription('โยนเหรียญ (ไม่เสียเงิน) 🪙'),
    async execute(interaction) {
        const result = Math.random() > 0.5 ? '🪙 หัว (Heads)' : '🪙 ก้อย (Tails)';
        return interaction.reply({ content: `**ผลการดีด:** ${result}` });
    }
};

// ─── /dice ─────────────────────────────────────────────────────────────────
const dice = {
    data: new SlashCommandBuilder()
        .setName('dice').setDescription('ทอยลูกเต๋า 🎲')
        .addIntegerOption(o => o.setName('sides').setDescription('จำนวนหน้า (default: 6)').setMinValue(2).setMaxValue(100)),
    async execute(interaction) {
        const sides = interaction.options.getInteger('sides') || 6;
        const roll  = Math.floor(Math.random() * sides) + 1;
        return interaction.reply({ content: `🎲 ลูกเต๋า ${sides} หน้า ออกมาเป็น: **${roll}**` });
    }
};

module.exports = [eightball, poll, flip, dice];
