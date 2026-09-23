/**
 * Minimal i18n for FrostByte Dashboard.
 * Keys are the original Thai strings (Thai-key mode):
 *   - locale 'th' → returns the key itself
 *   - locale 'en' → returns EN dictionary entry, fallback to key
 * English keys pass through unless present in TH dictionary (optional).
 */

const en = require('./locales/en.json');
const th = require('./locales/th.json');

const SUPPORTED = ['en', 'th'];
const DEFAULT = 'en';

function normalize(lang) {
  const l = String(lang || '').toLowerCase();
  if (SUPPORTED.includes(l)) return l;
  return DEFAULT;
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : `{${k}}`
  );
}

function translate(locale, key, vars) {
  if (key == null) return '';
  const k = String(key);
  let s;
  if (locale === 'th') {
    s = Object.prototype.hasOwnProperty.call(th, k) ? th[k] : k;
  } else {
    s = Object.prototype.hasOwnProperty.call(en, k) ? en[k] : k;
  }
  return interpolate(s, vars);
}

function createT(locale) {
  return (key, vars) => translate(locale, key, vars);
}

/** Express middleware: reads ?lang / cookie, exposes res.locals.tr + lang */
function middleware(req, res, next) {
  let lang = DEFAULT;
  if (req.query && req.query.lang) lang = normalize(req.query.lang);
  else if (req.cookies && req.cookies.lang) lang = normalize(req.cookies.lang);
  else if (req.session && req.session.lang) lang = normalize(req.session.lang);

  res.locals.lang = lang;
  res.locals.locale = lang;
  res.locals.tr = createT(lang);
  // aliases so templates can use t() if preferred
  res.locals.t = res.locals.tr;

  // client-side bootstrap: embed locale + EN dict (Thai keys → EN). TH mode returns key.
  res.locals.i18nBootstrap = function i18nBootstrap() {
    const payload = JSON.stringify({ locale: lang, en }).replace(/</g, '\\u003c');
    return (
      'window.__I18N=' + payload + ';' +
      'window.tr=function(k,v){' +
      'var d=window.__I18N,s=(d.locale==="th")?k:(Object.prototype.hasOwnProperty.call(d.en,k)?d.en[k]:k);' +
      'if(v)for(var p in v)s=String(s).split("{"+p+"}").join(v[p]);' +
      'return s;};'
    );
  };

  next();
}

/** Persist language: GET /lang/en?back=/selector */
function setLang(req, res) {
  const lang = normalize(req.params.lang || req.query.lang);
  if (req.session) req.session.lang = lang;
  try {
    res.cookie('lang', lang, { maxAge: 365 * 24 * 3600 * 1000, httpOnly: false, sameSite: 'lax' });
  } catch (_) { /* ignore */ }
  const back = (req.query.back && String(req.query.back).startsWith('/')) ? req.query.back : (req.get('referer') || '/');
  res.redirect(back);
}

module.exports = { middleware, createT, translate, normalize, SUPPORTED, DEFAULT, setLang, en, th };
