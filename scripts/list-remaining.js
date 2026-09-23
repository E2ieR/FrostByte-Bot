const fs = require('fs');
const files = ['views/login.ejs', 'views/selector.ejs', 'views/betting-tab.ejs', 'views/manage.ejs'];
for (const f of files) {
  const c = fs.readFileSync(f, 'utf8');
  const lines = c.split(/\r?\n/);
  console.log('====', f);
  lines.forEach((l, i) => {
    if (!/[ก-๙]/.test(l)) return;
    if (l.includes('tr(')) return;
    if (l.includes('<%#')) return;
    if (/^\s*\/\//.test(l)) return;
    if (l.includes('<!--')) return;
    console.log(`${i + 1}|${l}`);
  });
}
