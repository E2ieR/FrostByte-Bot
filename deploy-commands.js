require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    // ตรวจสอบเช็คว่าส่งข้อมูลมาเป็นกลุ่มชุดอาร์เรย์คำสั่งคู่หรือไม่
    if (Array.isArray(command)) {
        for (const subCommand of command) {
            if ('data' in subCommand && 'execute' in subCommand) {
                commands.push(subCommand.data.toJSON());
            }
        }
    } else {
        // สำหรับคำสั่งรูปแบบเดี่ยวทั่วไป
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        }
    }
}

const rest = new REST().setToken(process.env.TOKEN);

(async () => {
    try {
        console.log(`กำลังลงทะเบียนคำสั่ง Slash Commands ทั้งหมด ${commands.length} คำสั่ง...`);

        // อัปเดตลงทะเบียนผ่านไอดีบอทหลักทั่วโลก (Global)
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log('ลงทะเบียน Slash Commands สำเร็จเรียบร้อยแล้ว! 🎉');
    } catch (error) {
        console.error(error);
    }
})();