const fs = require('fs');
const path = require('path');
const files = ['views/login.ejs', 'views/selector.ejs', 'views/betting-tab.ejs', 'views/manage.ejs'];
const keys = new Set();

// only tr('...') with single quotes; skip if contains unescaped quote mess
const re = /\btr\(\s*'((?:[^'\\]|\\.)*)'/g;
for (const f of files) {
  const c = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  let m;
  while ((m = re.exec(c))) {
    let k = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    if (k && k.length <= 300) keys.add(k);
  }
}

// also load from thai-extracted if present
try {
  const t = JSON.parse(fs.readFileSync(path.join(__dirname, 'thai-extracted.json'), 'utf8'));
  for (const e of t) if (e.key) keys.add(e.key);
} catch (_) {}

const arr = [...keys].sort((a, b) => a.localeCompare(b, 'th'));
fs.writeFileSync(path.join(__dirname, 'tr-keys-clean.json'), JSON.stringify(arr, null, 2), 'utf8');
console.log('clean keys:', arr.length);

// split Thai vs non-Thai
const thai = arr.filter(k => /[ก-๙]/.test(k));
const other = arr.filter(k => !/[ก-๙]/.test(k));
console.log('thai keys:', thai.length, 'other:', other.length);
fs.writeFileSync(path.join(__dirname, 'tr-keys-thai.json'), JSON.stringify(thai, null, 2), 'utf8');
if (other.length) console.log('other sample:', other.slice(0, 20));
