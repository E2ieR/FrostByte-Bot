const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = ['views/manage.ejs', 'views/login.ejs', 'views/selector.ejs', 'views/betting-tab.ejs'];
const all = new Map(); // key -> [{file, line, context}]

const thaiRe = /[ก-๙][ก-๙0-9A-Za-z ,./%\-:!?()'"+]*|[ก-๙]+/g;

for (const f of files) {
  const full = path.join(root, f);
  const c = fs.readFileSync(full, 'utf8');
  const lines = c.split(/\r?\n/);
  lines.forEach((line, i) => {
    let m;
    const re = new RegExp(thaiRe.source, 'g');
    while ((m = re.exec(line))) {
      const key = m[0].trim();
      if (!key) continue;
      if (!all.has(key)) all.set(key, []);
      all.get(key).push({ file: f, line: i + 1, ctx: line.trim().slice(0, 160) });
    }
  });
}

const sorted = [...all.entries()].sort((a, b) => a[0].localeCompare(b[0], 'th'));
const out = sorted.map(([key, locs]) => ({ key, count: locs.length, sample: locs[0].ctx }));
fs.writeFileSync(path.join(root, 'scripts', 'thai-extracted.json'), JSON.stringify(out, null, 2), 'utf8');
console.log('unique keys:', out.length);

// mixed EJS+Thai lines
const mixed = [];
for (const f of files) {
  const c = fs.readFileSync(path.join(root, f), 'utf8');
  c.split(/\r?\n/).forEach((line, i) => {
    if (/[ก-๙]/.test(line) && /<%=/.test(line)) mixed.push(`${f}:${i + 1}: ${line.trim().slice(0, 200)}`);
  });
}
fs.writeFileSync(path.join(root, 'scripts', 'thai-mixed.txt'), mixed.join('\n'), 'utf8');
console.log('mixed lines:', mixed.length);
