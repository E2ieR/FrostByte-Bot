const fs = require('fs');
const path = require('path');

function fixFile(rel, pairs) {
  const full = path.join(__dirname, '..', rel);
  let src = fs.readFileSync(full, 'utf8');
  let ok = 0;
  for (const [from, to] of pairs) {
    if (!src.includes(from)) {
      console.log('MISS', rel, '::', from.slice(0, 100).replace(/\n/g, '\\n'));
      continue;
    }
    if (typeof to === 'string' && to.includes(from)) {
      console.log('SELF', rel, '::', from.slice(0, 80));
      continue;
    }
    src = src.split(from).join(to);
    ok++;
  }
  fs.writeFileSync(full, src, 'utf8');
  console.log('fixed', rel, ok + '/' + pairs.length);
}

fixFile('views/betting-tab.ejs', [
  [".catch(() => { sel.innerHTML = '<option value=\"\">⚠️ โหลดไม่สำเร็จ</option>tr('; });",
   ".catch(() => { sel.innerHTML = '<option value=\"\">' + tr('⚠️ โหลดไม่สำเร็จ') + '</option>'; });"],
  ["if (url) { img.src = url; img.style.display = ')block'; }",
   "if (url) { img.src = url; img.style.display = 'block'; }"],
]);

fixFile('views/manage.ejs', [
  ["if (formBody) formBody.style.display = 'tr(';",
   "if (formBody) formBody.style.display = 'block';"],
  ["form.querySelector('[name=\"imageB\"]').value      = m.awayLogo || 'tr(';",
   "form.querySelector('[name=\"imageB\"]').value      = m.awayLogo || '';"],
  ["if (loadEl) loadEl.textContent = '❌ เกิดข้อผิดพลาดในการโหลดแมตช์tr(';",
   "if (loadEl) loadEl.textContent = tr('❌ เกิดข้อผิดพลาดในการโหลดแมตช์ Esports');"],
  ["} catch (e) { console.error('[Sports channels]tr(', e); }",
   "} catch (e) { console.error('[Sports channels]', e); }"],
  ["<div>${leagueLogo}${m.league||'tr('}</div>",
   "<div>${leagueLogo}${m.league||''}</div>"],
  ["<div style=\"font-size:10px;margin-top:2px\">${m.tournament||'tr('}</div>",
   "<div style=\"font-size:10px;margin-top:2px\">${m.tournament||''}</div>"],
  ["style.display = ')block'", "style.display = 'block'"],
  ["style.display = ')none'", "style.display = 'none'"],
  ["style.display = ')flex'", "style.display = 'flex'"],
  ["style.display = ')grid'", "style.display = 'grid'"],
  ["style.display = ')inline", "style.display = 'inline"],
  ["src=\")", "src=\""],
  ["class=\")", "class=\""],
  ["|| 'tr('", "|| ''"],
  ["||'tr('", "||''"],
]);

console.log('\n--- rescan ---');
for (const f of ['views/login.ejs', 'views/selector.ejs', 'views/betting-tab.ejs', 'views/manage.ejs']) {
  const c = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const lines = c.split(/\n/);
  lines.forEach((l, i) => {
    if (l.includes("= 'tr('") || l.includes("|| 'tr('") || l.includes("||'tr('") ||
        l.includes("</option>tr('") || l.includes("tr(';") ||
        /[^({'"\w.]tr\(/.test(l) && !/\btr\(['"]/.test(l) ||
        /class="\)/.test(l) || /id="\)/.test(l) || /src="\)/.test(l) ||
        /display = '\)/.test(l) || /\)\s*block'/.test(l) && l.includes("style.display")) {
      console.log(f + ':' + (i + 1) + ' ' + l.trim().slice(0, 180));
    }
  });
}
console.log('done');

// compile check
const ejs = require('ejs');
for (const f of ['views/login.ejs', 'views/selector.ejs', 'views/betting-tab.ejs', 'views/manage.ejs']) {
  try {
    ejs.compile(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), { filename: f });
    console.log('COMPILE OK', f);
  } catch (e) {
    console.log('COMPILE FAIL', f, e.message.split('\n')[0]);
  }
}
