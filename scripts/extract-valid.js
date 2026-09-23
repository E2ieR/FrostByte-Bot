const fs = require('fs');
const path = require('path');

const files = ['views/login.ejs', 'views/selector.ejs', 'views/betting-tab.ejs', 'views/manage.ejs'];
const keys = new Set();

function extract(src) {
  let i = 0;
  while ((i = src.indexOf('tr(', i)) !== -1) {
    // word boundary before tr
    if (i > 0 && /[A-Za-z0-9_$]/.test(src[i - 1])) { i += 3; continue; }
    let j = i + 3;
    while (src[j] === ' ') j++;
    if (src[j] !== "'") { i += 3; continue; }
    j++;
    let buf = '';
    let closed = false;
    while (j < src.length) {
      if (src[j] === '\\') { buf += src[j] + (src[j + 1] || ''); j += 2; continue; }
      if (src[j] === "'") { closed = true; break; }
      buf += src[j];
      j++;
    }
    if (closed && /[ก-๙]/.test(buf) && buf.length <= 400) {
      const bad =
        buf.includes('\n') ||
        /icons:|cmds:|replace\(|%>|\$\{|; *\$/.test(buf) ||
        (buf.match(/'/g) || []).length > 0 && !buf.includes("\\'");
      // allow apostrophes only if escaped (already in buf as \')
      if (!bad) keys.add(buf.replace(/\\'/g, "'"));
    }
    i += 3;
  }
}

for (const f of files) {
  const c = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  extract(c);
}

const arr = [...keys].sort((a, b) => a.localeCompare(b, 'th'));
fs.writeFileSync(path.join(__dirname, 'tr-keys-valid.json'), JSON.stringify(arr, null, 2), 'utf8');
console.log('valid keys:', arr.length);
arr.forEach((k, n) => console.log(String(n).padStart(3, '0') + '\t' + k));
