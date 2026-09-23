const fs = require('fs');
const ejs = require('ejs');

const files = ['views/login.ejs', 'views/selector.ejs', 'views/betting-tab.ejs', 'views/manage.ejs'];
for (const f of files) {
  try {
    ejs.compile(fs.readFileSync(f, 'utf8'), { filename: f });
    console.log('COMPILE OK', f);
  } catch (e) {
    console.log('COMPILE FAIL', f, '=>', e.message.split('\n')[0]);
  }
}

console.log('\n--- unwrapped Thai (no tr() on line) ---');
for (const f of files) {
  const c = fs.readFileSync(f, 'utf8');
  const lines = c.split(/\r?\n/);
  let n = 0;
  lines.forEach((l, i) => {
    if (!/[ก-๙]/.test(l)) return;
    if (l.includes('tr(')) return;
    if (l.includes('<%#')) return;
    if (/^\s*\/\//.test(l)) return;
    if (l.includes('<!--')) return;
    if (l.includes('\u0000CMT')) return;
    n++;
    if (n <= 30) console.log(`${f}:${i + 1}: ${l.trim().slice(0, 160)}`);
  });
  console.log(`${f}: ${n} unwrapped lines\n`);
}

// count tr( occurrences
for (const f of files) {
  const c = fs.readFileSync(f, 'utf8');
  const m = c.match(/\btr\(/g) || [];
  console.log(f, 'tr() count:', m.length);
}
