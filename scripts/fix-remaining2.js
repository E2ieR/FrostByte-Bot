const fs = require('fs');
const path = require('path');
const full = path.join(__dirname, '..', 'views/manage.ejs');
let src = fs.readFileSync(full, 'utf8');

function sub(from, to) {
  if (!src.includes(from)) {
    console.log('MISS', JSON.stringify(from).slice(0, 120));
    return;
  }
  src = src.split(from).join(to);
  console.log('OK', JSON.stringify(from).slice(0, 80));
}

// storeItems badge
sub(
  ") รายการ</span>",
  ") <%= tr('รายการ') %></span>"
);

// JS with unique surrounding context (avoid SELF by including non-quote prefix)
sub(
  "listEl.innerHTML = '<div style=\"text-align:center;padding:20px;color:var(--muted)\">ไม่พบแมตช์ที่จะมาถึง<br><small>ตรวจสอบว่าเลือกลีกในหน้า Sports แล้ว หรืออาจอยู่ใน off-season</small></div>';",
  "listEl.innerHTML = tr('<div style=\"text-align:center;padding:20px;color:var(--muted)\">ไม่พบแมตช์ที่จะมาถึง<br><small>ตรวจสอบว่าเลือกลีกในหน้า Sports แล้ว หรืออาจอยู่ใน off-season</small></div>');"
);

sub(
  "listEl.innerHTML = '<div style=\"text-align:center;padding:20px;color:var(--muted)\">ไม่พบแมตช์ Esports ในขณะนี้<br><small>ตรวจสอบว่าเปิดเกมในหน้า Sports แล้ว หรือลองใหม่ภายหลัง</small></div>';",
  "listEl.innerHTML = tr('<div style=\"text-align:center;padding:20px;color:var(--muted)\">ไม่พบแมตช์ Esports ในขณะนี้<br><small>ตรวจสอบว่าเปิดเกมในหน้า Sports แล้ว หรือลองใหม่ภายหลัง</small></div>');"
);

// HTML buttons inside JS template literals
sub(
  'style="white-space:nowrap">⚽ สร้างเดิมพัน</button>',
  'style="white-space:nowrap">\' + tr(\'⚽ สร้างเดิมพัน\') + \'</button>'
);
sub(
  'style="white-space:nowrap">🎮 สร้างเดิมพัน</button>',
  'style="white-space:nowrap">\' + tr(\'🎮 สร้างเดิมพัน\') + \'</button>'
);
sub(
  'onclick="removeRcRoleStyle(${i})">ลบ</button>',
  'onclick="removeRcRoleStyle(${i})">\' + tr(\'ลบ\') + \'</button>'
);

sub(
  "if (loadEl) loadEl.textContent = '❌ เกิดข้อผิดพลาดในการโหลดแมตช์ Esports';",
  "if (loadEl) loadEl.textContent = tr('❌ เกิดข้อผิดพลาดในการโหลดแมตช์ Esports');"
);

sub(
  "fillSelect(selMsg,   curMsg,   '— ทุกช่องข้อความ —');",
  "fillSelect(selMsg,   curMsg,   tr('— ทุกช่องข้อความ —'));"
);
sub(
  "fillSelect(selVoice, curVoice, '— ช่อง voice ที่ออก —');",
  "fillSelect(selVoice, curVoice, tr('— ช่อง voice ที่ออก —'));"
);

sub(
  ": '<span style=\"color:var(--muted);font-size:11px\">ไม่มียศ</span>';",
  ": tr('<span style=\"color:var(--muted);font-size:11px\">ไม่มียศ</span>');"
);
sub(
  ": '<div style=\"font-size:11px;color:var(--muted);margin-top:6px\">🎒 ไม่มีไอเทม</div>';",
  ": tr('<div style=\"font-size:11px;color:var(--muted);margin-top:6px\">🎒 ไม่มีไอเทม</div>');"
);

sub(
  "return alert('กรุณากรอกตัวเลขที่ถูกต้อง (≥ 0)');",
  "return alert(tr('กรุณากรอกตัวเลขที่ถูกต้อง (≥ 0)'));"
);
sub(
  "showToastMsg('✅ บันทึกข้อมูลสมาชิกสำเร็จ');",
  "showToastMsg(tr('✅ บันทึกข้อมูลสมาชิกสำเร็จ'));"
);
sub(
  "if (!itemName) return alert('กรุณากรอกชื่อสินค้า');",
  "if (!itemName) return alert(tr('กรุณากรอกชื่อสินค้า'));"
);

// price current label — ensure wrapped
if (!src.includes("tr('ราคาปัจจุบัน:')")) {
  sub(
    "curPriceEl.textContent = `ราคาปัจจุบัน:",
    "curPriceEl.textContent = tr('ราคาปัจจุบัน:') + ` "
  );
}

fs.writeFileSync(full, src, 'utf8');

// betting-tab
const bfull = path.join(__dirname, '..', 'views/betting-tab.ejs');
let b = fs.readFileSync(bfull, 'utf8');
b = b.split("el.textContent = '⏰ หมดเวลาแล้ว';").join("el.textContent = tr('⏰ หมดเวลาแล้ว');");
fs.writeFileSync(bfull, b, 'utf8');

// final check
console.log('\n--- final remaining ---');
for (const f of ['views/login.ejs', 'views/selector.ejs', 'views/betting-tab.ejs', 'views/manage.ejs']) {
  const c = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const lines = c.split(/\r?\n/);
  let n = 0;
  lines.forEach((l, i) => {
    if (!/[ก-๙]/.test(l)) return;
    if (l.includes('tr(')) return;
    if (l.includes('<%#')) return;
    if (/^\s*\/\//.test(l)) return;
    if (l.includes('<!--')) return;
    if (l.includes('TAB:') || l.includes('MODAL:')) return;
    n++;
    console.log(f + ':' + (i + 1) + ': ' + l.trim().slice(0, 150));
  });
  console.log(f, n);
}
