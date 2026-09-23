const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = [
  'views/login.ejs',
  'views/selector.ejs',
  'views/manage.ejs',
  'views/betting-tab.ejs',
];

/** Frost / ice palette replacements (order matters: longer / more specific first) */
const COLORS = [
  // Discord blurple → ice blue
  ['rgba(88,101,242', 'rgba(56,189,248'],
  ['#5865F2', '#38bdf8'],
  ['#4752C4', '#0284c7'],
  ['#7b8df8', '#7dd3fc'],
  // backgrounds → deep frozen navy
  ['#0e0f13', '#0a1120'],
  ['#16181f', '#101a30'],
  ['#1c1f28', '#152038'],
  ['#2a2d38', '#1e2d4a'],
  ['#383d50', '#2a3f66'],
  ['#3d4152', '#33486b'],
  // text
  ['#e8eaf0', '#e2f0ff'],
  ['#7b7f8e', '#7c93b8'],
  // success green slightly cooler already ok; login orb green → cyan frost
  ['rgba(87,242,135,0.08)', 'rgba(34,211,238,0.10)'],
  ['rgba(87,242,135,0.12)', 'rgba(34,211,238,0.12)'],
  ['rgba(87,242,135,0.15)', 'rgba(34,211,238,0.15)'],
  ['rgba(87,242,135,0.18)', 'rgba(34,211,238,0.18)'],
  ['rgba(87,242,135,0.25)', 'rgba(34,211,238,0.25)'],
  ['#57F287', '#22d3ee'],
  // keep red/yellow but slightly frost-tuned
  ['#ED4245', '#f87171'],
  ['#ed4245', '#f87171'],
  ['#FEE75C', '#fde68a'],
];

let total = 0;
for (const rel of files) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) continue;
  let src = fs.readFileSync(full, 'utf8');
  const before = src;
  for (const [from, to] of COLORS) {
    src = src.split(from).join(to);
  }
  if (src !== before) {
    fs.writeFileSync(full, src, 'utf8');
    console.log('themed:', rel);
    total++;
  }
}
console.log('done,', total, 'files');
