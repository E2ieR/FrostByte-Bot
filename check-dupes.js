const fs   = require('fs');
const path = require('path');

const dir   = './commands';
const names = [];

fs.readdirSync(dir).filter(f => f.endsWith('.js')).forEach(file => {
    try {
        const cmd  = require(path.join(process.cwd(), dir, file));
        const cmds = Array.isArray(cmd) ? cmd : [cmd];
        cmds.forEach(c => {
            if (c && c.data) {
                names.push({ name: c.data.name, file });
            }
        });
    } catch (e) {
        console.log(`❌ โหลด ${file} ไม่ได้:`, e.message);
    }
});

console.log(`\nรวมทั้งหมด: ${names.length} คำสั่ง\n`);

const dupes = names.filter((a, i) => names.findIndex(b => b.name === a.name) !== i);

if (dupes.length === 0) {
    console.log('✅ ไม่มีชื่อซ้ำ');
} else {
    console.log('❌ พบชื่อซ้ำ:');
    dupes.forEach(d => console.log(`  "${d.name}" ซ้ำใน ${d.file}`));
}

console.log('\nรายการทั้งหมด:');
names.forEach((n, i) => console.log(`  ${i}. ${n.name}  (${n.file})`));