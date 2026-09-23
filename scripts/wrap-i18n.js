const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = [
  'views/login.ejs',
  'views/selector.ejs',
  'views/manage.ejs',
  'views/betting-tab.ejs',
];

const hasThai = (s) => /[ก-๙]/.test(s);
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function wrapThaiEjs(str) {
  return str.replace(
    /[ก-๙][ก-๙0-9A-Za-z ,./%\-:!?()'"+]*|[ก-๙]+/g,
    (m) => "<%= tr('" + esc(m) + "') %>"
  );
}

function wrapJsStrings(src) {
  src = src.replace(/'((?:[^'\\]|\\.)*)'/g, (m, p1) => {
    if (!hasThai(p1) || p1.includes('<%')) return m;
    return "tr('" + p1.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "')";
  });
  src = src.replace(/"((?:[^"\\]|\\.)*)"/g, (m, p1) => {
    if (!hasThai(p1) || p1.includes('<%')) return m;
    return 'tr("' + p1.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '")';
  });
  return src;
}

function wrapEjsCode(code) {
  if (code.startsWith('<%#')) return code;
  return wrapJsStrings(code);
}

const EVENT_ATTR = /\son(?:click|input|change|mouseover|mouseout|load|submit|keyup|keydown|focus|blur)\s*=\s*"([^"]*)"/gi;
const PLAIN_ATTR = /\s(?:placeholder|title|alt|aria-label)\s*=\s*"([^"]*)"/gi;
const VALUE_ATTR = /\svalue\s*=\s*"([^"]*)"/gi;

function wrapHtml(text) {
  text = text.replace(EVENT_ATTR, (m, js) => {
    if (!hasThai(js)) return m;
    if (js.includes('<%')) {
      const fixed = js.replace(/'((?:[^'\\]|\\.)*)'/g, (mm, p1) => {
        if (!hasThai(p1) || p1.includes('<%')) return mm;
        return "tr('" + p1.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "')";
      });
      return m.replace(js, fixed);
    }
    return m.replace(js, wrapJsStrings(js));
  });

  text = text.replace(PLAIN_ATTR, (m, val) => {
    if (!hasThai(val)) return m;
    return m.replace(val, wrapThaiEjs(val));
  });

  text = text.replace(VALUE_ATTR, (m, val) => {
    if (!hasThai(val) || val.includes('<%')) return m;
    return m.replace(val, wrapThaiEjs(val));
  });

  text = text.replace(/>([^<>]*)</g, (m, inner) => {
    if (!hasThai(inner)) return m;
    return '>' + wrapThaiEjs(inner) + '<';
  });

  return text;
}

function protect(src) {
  const store = [];
  src = src.replace(/<!--[\s\S]*?-->/g, (m) => {
    store.push(m);
    return '\u0000CMT' + (store.length - 1) + '\u0000';
  });
  return { src, store };
}
function restore(src, store) {
  return src.replace(/\u0000CMT(\d+)\u0000/g, (_, i) => store[+i]);
}

function processFile(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return;
  const original = fs.readFileSync(full, 'utf8');
  const { src, store } = protect(original);

  const parts = [];
  const re = /(<%[-_=#]?[\s\S]*?%>)/g;
  let last = 0, m;
  while ((m = re.exec(src))) {
    if (m.index > last) parts.push({ type: 'html', text: src.slice(last, m.index) });
    parts.push({ type: 'ejs', text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < src.length) parts.push({ type: 'html', text: src.slice(last) });

  let inScript = false;
  let inStyle = false;

  const out = parts.map((p) => {
    if (p.type === 'ejs') return wrapEjsCode(p.text);
    const html = p.text;

    if (inStyle) {
      if (/<\/style\s*>/i.test(html)) inStyle = false;
      return html;
    }
    if (inScript) {
      if (/<\/script\s*>/i.test(html)) {
        const idx = html.search(/<\/script\s*>/i);
        inScript = false;
        return wrapJsStrings(html.slice(0, idx)) + html.slice(idx);
      }
      return wrapJsStrings(html);
    }

    if (/<style\b/i.test(html)) {
      const sIdx = html.search(/<style\b/i);
      const eIdx = html.search(/<\/style\s*>/i);
      if (eIdx < 0) {
        inStyle = true;
        return html.slice(0, sIdx);
      }
      const head = html.slice(0, sIdx);
      const tail = html.slice(eIdx);
      return wrapHtml(head) + html.slice(sIdx, eIdx) + wrapHtml(tail);
    }

    if (/<script\b/i.test(html)) {
      const sIdx = html.search(/<script\b/i);
      const head = html.slice(0, sIdx);
      const rest = html.slice(sIdx);
      const eIdx = rest.search(/<\/script\s*>/i);
      if (eIdx < 0) {
        inScript = true;
        return wrapHtml(head) + rest;
      }
      return wrapHtml(head) + rest;
    }

    return wrapHtml(html);
  });

  const result = restore(out.join(''), store);
  if (result !== original) {
    fs.writeFileSync(full, result, 'utf8');
    console.log('wrapped:', rel);
  } else {
    console.log('unchanged:', rel);
  }
}

for (const f of files) processFile(f);
console.log('i18n wrap done');
