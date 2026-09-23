const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function fix(rel, pairs) {
  const full = path.join(root, rel);
  let src = fs.readFileSync(full, 'utf8');
  let ok = 0;
  for (const [from, to] of pairs) {
    if (src.includes(from)) {
      if (to.includes(from)) {
        console.warn('SELF', rel, from.slice(0, 80));
      } else {
        src = src.split(from).join(to);
      }
      ok++;
    } else {
      console.warn('MISS', rel, '::', from.slice(0, 100).replace(/\n/g, '\\n'));
    }
  }
  fs.writeFileSync(full, src, 'utf8');
  console.log('fixed', rel, ok + '/' + pairs.length);
}

fix('views/selector.ejs', [
  ['>ทั้งหมด (<%', '><%= tr(\'ทั้งหมด\') %> (<%'],
  ['>บอทอยู่แล้ว (<%', '><%= tr(\'บอทอยู่แล้ว\') %> (<%'],
  ['>ยังไม่มีบอท (<%', '><%= tr(\'ยังไม่มีบอท\') %> (<%'],
]);

fix('views/betting-tab.ejs', [
  [' รายการ</span>', ' <%= tr(\'รายการ\') %></span>'],
  ["'<option value=\"\">— เลือกช่องข้อความ —</option>'",
   "'<option value=\"\">' + tr('— เลือกช่องข้อความ —') + '</option>'"],
  ["'⏰ หมดเวลาแล้ว'", "tr('⏰ หมดเวลาแล้ว')"],
]);

fix('views/manage.ejs', [
  [' ข้อความ</span>', ' <%= tr(\'ข้อความ\') %></span>'],
  [' ยศ</span>', ' <%= tr(\'ยศ\') %></span>'],
  [' ประเภท</span>', ' <%= tr(\'ประเภท\') %></span>'],
  [' หมวด</span>', ' <%= tr(\'หมวด\') %></span>'],
  // storeItems badge already partially handled — also plain:
  [')<%= \'\' %> รายการ</span>', ')<%= tr(\'รายการ\') %></span>'],

  [' · เริ่ม <%= new Date(role.startDate).toLocaleString(\'th-TH\') %>',
   ' · <%= tr(\'เริ่ม\') %> <%= new Date(role.startDate).toLocaleString(\'th-TH\') %>'],

  // confirms with EJS interpolation — use JSON.stringify(tr(...))
  ["onclick=\"return confirm('ลบประเภท <%= t.name %>?')\"",
   "onclick=\"return confirm(<%= JSON.stringify(tr('ลบประเภท {name}?', { name: t.name })) %>)\""],
  ["onclick=\"return confirm('ลบหมวด <%= cat.name %>?')\"",
   "onclick=\"return confirm(<%= JSON.stringify(tr('ลบหมวด {name}?', { name: cat.name })) %>)\""],
  ["onclick=\"return confirm('ลบการเดิมพัน <%= (bet.title||'นี้').replace(/'/g,'') %>?')\"",
   "onclick=\"return confirm(<%= JSON.stringify(tr('ลบการเดิมพัน {name}?', { name: bet.title || tr('นี้') })) %>)\""],

  // market / stock meta after EJS
  ['% ตลาด</span>', '% <%= tr(\'ตลาด\') %></span>'],
  ['&nbsp;· จำกัด <%= item.maxPerUser %>/คน<% } %>',
   '&nbsp;· <%= tr(\'จำกัด\') %> <%= item.maxPerUser %>/<%= tr(\'คน\') %><% } %>'],
  ['&nbsp;· ขายคืน <%= item.sellPercent || 50 %>%',
   '&nbsp;· <%= tr(\'ขายคืน\') %> <%= item.sellPercent || 50 %>%'],

  // bet stats
  [' %> คน</span>', ' %> <%= tr(\'คน\') %></span>'],
  ['💰 ขั้นต่ำ <%= (bet.minBet||1).toLocaleString() %>',
   '💰 <%= tr(\'ขั้นต่ำ\') %> <%= (bet.minBet||1).toLocaleString() %>'],
  ['· สูงสุด <%= bet.maxBet.toLocaleString() %>',
   '· <%= tr(\'สูงสุด\') %> <%= bet.maxBet.toLocaleString() %>'],
  ['👥 รายการผู้เดิมพัน (<%= bet.bets.length %> คน)',
   '👥 <%= tr(\'รายการผู้เดิมพัน\') %> (<%= bet.bets.length %> <%= tr(\'คน\') %>)'],

  ['อยู่มา <%= tier.minDays %> วันขึ้นไป',
   '<%= tr(\'อยู่มา\') %> <%= tier.minDays %> <%= tr(\'วันขึ้นไป\') %>'],
  ['<%= config.currencyEmoji||\'💰\' %> /วัน</span>',
   '<%= config.currencyEmoji||\'💰\' %> /<%= tr(\'วัน\') %></span>'],

  ['Pool มีทั้งหมด <%= config.questPool.length %> ภารกิจ',
   'Pool <%= tr(\'มีทั้งหมด\') %> <%= config.questPool.length %> <%= tr(\'ภารกิจ\') %>'],
  ['&nbsp;เป้า <%= q.target %>',
   '&nbsp;<%= tr(\'เป้า\') %> <%= q.target %>'],

  // JS leftovers
  ["'<option value=\"\">⚠️ โหลด channels ไม่สำเร็จ</option>'",
   "'<option value=\"\">' + tr('⚠️ โหลด channels ไม่สำเร็จ') + '</option>'"],
  ["'<option value=\"\">— เลือกช่องข้อความ —</option>'",
   "'<option value=\"\">' + tr('— เลือกช่องข้อความ —') + '</option>'"],
  ["opening ? 'คลิกเพื่อซ่อน ▴' : 'คลิกเพื่อโหลดแมตช์ ▾'",
   "opening ? tr('คลิกเพื่อซ่อน ▴') : tr('คลิกเพื่อโหลดแมตช์ ▾')"],
  ["'ไม่พบแมตช์ที่จะมาถึง<br><small>ตรวจสอบว่าเลือกลีกในหน้า Sports แล้ว หรืออาจอยู่ใน off-season</small></div>'",
   "tr('ไม่พบแมตช์ที่จะมาถึง<br><small>ตรวจสอบว่าเลือกลีกในหน้า Sports แล้ว หรืออาจอยู่ใน off-season</small></div>')"],
  ["'⚽ สร้างเดิมพัน'", "tr('⚽ สร้างเดิมพัน')"],
  ["`${ESP_LABEL[game]} — เลือกทีม`", "ESP_LABEL[game] + ' — ' + tr('เลือกทีม')"],
  ['${teams.length} ทีม</div>', "${teams.length} ' + tr('ทีม') + '</div>"],
  ["'ไม่พบแมตช์ Esports ในขณะนี้<br><small>ตรวจสอบว่าเปิดเกมในหน้า Sports แล้ว หรือลองใหม่ภายหลัง</small></div>'",
   "tr('ไม่พบแมตช์ Esports ในขณะนี้<br><small>ตรวจสอบว่าเปิดเกมในหน้า Sports แล้ว หรือลองใหม่ภายหลัง</small></div>')"],
  ["'🎮 สร้างเดิมพัน'", "tr('🎮 สร้างเดิมพัน')"],
  ["'❌ เกิดข้อผิดพลาดในการโหลดแมตช์ Esports'", "tr('❌ เกิดข้อผิดพลาดในการโหลดแมตช์ Esports')"],
  ["'— ทุกช่องข้อความ —'", "tr('— ทุกช่องข้อความ —')"],
  ["'— ช่อง voice ที่ออก —'", "tr('— ช่อง voice ที่ออก —')"],
  ["'<option value=\"\">— แจ้งในช่องที่พิมพ์ข้อความ —</option>'",
   "'<option value=\"\">' + tr('— แจ้งในช่องที่พิมพ์ข้อความ —') + '</option>'"],
  ["'<option value=\"\">— เลือก channel —</option>'",
   "'<option value=\"\">' + tr('— เลือก channel —') + '</option>'"],
  ['<option value="">— เลือก Role —</option>${opts}',
   '<option value="">\' + tr(\'— เลือก Role —\') + \'</option>${opts}'],
  ["'<span style=\"color:var(--muted);font-size:11px\">ไม่มียศ</span>'",
   "tr('<span style=\"color:var(--muted);font-size:11px\">ไม่มียศ</span>')"],
  ["'<div style=\"font-size:11px;color:var(--muted);margin-top:6px\">🎒 ไม่มีไอเทม</div>'",
   "tr('<div style=\"font-size:11px;color:var(--muted);margin-top:6px\">🎒 ไม่มีไอเทม</div>')"],
  ['💰 กระเป๋า</div>', '💰 <%= tr(\'กระเป๋า\') %></div>'],
  ['🏦 ธนาคาร</div>', '🏦 <%= tr(\'ธนาคาร\') %></div>'],
  ['💎 รวม</div>', '💎 <%= tr(\'รวม\') %></div>'],
  ["'กรุณากรอกตัวเลขที่ถูกต้อง (≥ 0)'", "tr('กรุณากรอกตัวเลขที่ถูกต้อง (≥ 0)')"],
  ["'✅ บันทึกข้อมูลสมาชิกสำเร็จ'", "tr('✅ บันทึกข้อมูลสมาชิกสำเร็จ')"],
  ["'กรุณากรอกชื่อสินค้า'", "tr('กรุณากรอกชื่อสินค้า')"],
  ['<option value="">— เลือก Role —</option>',
   '<option value=""><%= tr(\'— เลือก Role —\') %></option>'],
  ['>หน่วงเวลา</span>', '><%= tr(\'หน่วงเวลา\') %></span>'],
  ['>วิ</span>', '><%= tr(\'วิ\') %></span>'],
  ["`<div style=\"color:var(--red)\">❌ โหลดไม่สำเร็จ: ${e.message}</div>`",
   "tr('❌ โหลดไม่สำเร็จ:') + ' ' + e.message"],
  ["'<option value=\"\">— เลือกช่องข้อความ —</option>'",
   "'<option value=\"\">' + tr('— เลือกช่องข้อความ —') + '</option>'"],
]);

// fix price template if corrupted
{
  const full = path.join(root, 'views/manage.ejs');
  let src = fs.readFileSync(full, 'utf8');
  // repair possible corruption from earlier wrap on + inside template
  src = src.replace(
    "${pct >= 0 ? ')+' : ''}",
    "${pct >= 0 ? '+' : ''}"
  );
  src = src.replace(
    "curPriceEl.textContent = `ราคาปัจจุบัน: ${",
    "curPriceEl.textContent = tr('ราคาปัจจุบัน:') + ` ${"
  );
  fs.writeFileSync(full, src, 'utf8');
}

// check remaining
console.log('\n--- remaining ---');
for (const f of ['views/login.ejs', 'views/selector.ejs', 'views/betting-tab.ejs', 'views/manage.ejs']) {
  const c = fs.readFileSync(path.join(root, f), 'utf8');
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
    console.log(f + ':' + (i + 1) + ': ' + l.trim().slice(0, 140));
  });
  console.log(f, 'remaining:', n);
}
