const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const i18n = require('../dashboard/i18n');

function mockLocals(lang) {
  const t = i18n.createT(lang);
  return {
    lang, locale: lang, tr: t, t,
    i18nBootstrap() {
      const payload = JSON.stringify({ locale: lang, en: i18n.en }).replace(/</g, '\\u003c');
      return 'window.__I18N=' + payload + ';';
    },
    query: {}
  };
}

const root = path.join(__dirname, '..');

// login
for (const lang of ['en', 'th']) {
  const html = ejs.render(fs.readFileSync(path.join(root, 'views/login.ejs'), 'utf8'), {
    ...mockLocals(lang),
    authorizeUrl: 'https://example.com/auth'
  }, { filename: 'views/login.ejs' });
  console.log('login', lang,
    'boot', html.includes('window.__I18N'),
    'en', html.includes('Manage your Discord servers'),
    'th', html.includes('จัดการเซิร์ฟเวอร์ Discord ของคุณ'),
    'switch', html.includes('/lang/en') && html.includes('/lang/th'),
    'langattr', html.includes('lang="' + lang + '"'));
}

// selector
for (const lang of ['en', 'th']) {
  const html = ejs.render(fs.readFileSync(path.join(root, 'views/selector.ejs'), 'utf8'), {
    ...mockLocals(lang),
    user: { id: '1', username: 'test', avatar: null },
    guilds: [{ id: '1', name: 'Server', icon: null, hasBot: true }],
    clientId: 'abc'
  }, { filename: 'views/selector.ejs' });
  console.log('selector', lang,
    'en', html.includes('Sign out'),
    'th', html.includes('ออกจากระบบ'),
    'switch', html.includes('/lang/en'),
    'boot', html.includes('window.__I18N'));
}

// betting-tab
for (const lang of ['en', 'th']) {
  try {
    const html = ejs.render(fs.readFileSync(path.join(root, 'views/betting-tab.ejs'), 'utf8'), {
      ...mockLocals(lang),
      config: { currencyEmoji: 'M' },
      guildId: '1',
      bet: { title: 't', isOpen: true, poolA: 0, poolB: 0, bets: [], optionA: 'A', optionB: 'B', channelId: '' }
    }, { filename: 'views/betting-tab.ejs' });
    console.log('betting', lang, 'ok', html.includes('Status') || html.includes('สถานะ'));
  } catch (e) {
    console.log('betting FAIL', lang, e.message.split('\n')[0]);
  }
}

// manage smoke
try {
  const html = ejs.render(fs.readFileSync(path.join(root, 'views/manage.ejs'), 'utf8'), {
    ...mockLocals('en'),
    guild: { id: '1', name: 'G', icon: null },
    user: { id: '1', username: 'u', avatar: null },
    guildId: '1',
    config: {},
    query: {},
    discordRoles: [],
    tr: i18n.createT('en')
  }, { filename: 'views/manage.ejs' });
  console.log('manage EN ok len', html.length, 'switch', html.includes('/lang/en'));
} catch (e) {
  console.log('manage FAIL', e.message.split('\n').slice(0, 3).join(' | '));
}

console.log('smoke done');
