const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

// 1) compile check
for (const f of ['views/login.ejs', 'views/selector.ejs', 'views/betting-tab.ejs', 'views/manage.ejs']) {
  try {
    ejs.compile(fs.readFileSync(f, 'utf8'), { filename: f });
    console.log('COMPILE OK', f);
  } catch (e) {
    console.log('COMPILE FAIL', f, e.message.split('\n')[0]);
  }
}

// 2) extract all tr('...') and tr("...") keys from views
const keys = new Set();
const files = ['views/login.ejs', 'views/selector.ejs', 'views/betting-tab.ejs', 'views/manage.ejs'];
const re = /\btr\(\s*'((?:[^'\\]|\\.)*)'/g;
const re2 = /\btr\(\s*"((?:[^"\\]|\\.)*)"/g;
for (const f of files) {
  const c = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = re.exec(c))) keys.add(m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
  while ((m = re2.exec(c))) keys.add(m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
}
const arr = [...keys].sort();
fs.writeFileSync(path.join(__dirname, 'tr-keys.json'), JSON.stringify(arr, null, 2), 'utf8');
console.log('tr keys:', arr.length);
