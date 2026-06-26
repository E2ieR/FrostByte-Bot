// services/liquipediaService.js
// ดึงข้อมูล esports จาก Liquipedia HTML (ไม่ต้องใช้ API key)
// Rate limit: รอ 2 วินาทีระหว่าง request
const axios   = require('axios');
const cheerio = require('cheerio');

const BASE = 'https://liquipedia.net';

// wiki name สำหรับแต่ละเกม
const WIKIS = {
    cs2:      'counterstrike',
    valorant: 'valorant',
    lol:      'leagueoflegends',
    mlbb:     'mobilelegends',
};

// ชื่อแสดงผล
const GAME_NAMES = {
    cs2:      'Counter-Strike 2',
    valorant: 'VALORANT',
    lol:      'League of Legends',
    mlbb:     'Mobile Legends: Bang Bang',
};

const GAME_COLORS = {
    cs2:      0xF9A825,
    valorant: 0xFF4655,
    lol:      0x0BC4E3,
    mlbb:     0x0080FF,
};

const GAME_THUMBS = {
    cs2:      'https://liquipedia.net/commons/images/9/92/CS2_allmode.png',
    valorant: 'https://liquipedia.net/commons/images/f/fc/Valorant_allmode.png',
    lol:      'https://liquipedia.net/commons/images/d/d9/LoL_allmode.png',
    mlbb:     'https://liquipedia.net/commons/images/1/12/Mobile_Legends_logo.png',
};

const delay = ms => new Promise(r => setTimeout(r, ms));

// ─── In-memory cache ─────────────────────────────────────────────────────────
const _cache = new Map();
const _CACHE_TTL       = 5  * 60 * 1000; // 5 min (matches / tournaments)
const _TEAMS_CACHE_TTL = 30 * 60 * 1000; // 30 min (team lists rarely change)
function _getCached(key, ttl = _CACHE_TTL) {
    const e = _cache.get(key);
    return e && Date.now() - e.ts < ttl ? e.data : null;
}
function _setCached(key, data) { _cache.set(key, { data, ts: Date.now() }); }

async function fetchPage(wiki, path) {
    await delay(2000); // Liquipedia rate limit
    const url = `${BASE}/${wiki}${path}`;
    const { data } = await axios.get(url, {
        headers: {
            'User-Agent': 'ICKEzBot/1.0 (Discord Economy Bot; contact via Discord)',
            'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 10000,
    });
    return cheerio.load(data);
}

// path ของหน้า upcoming matches แต่ละ wiki (บาง wiki ใช้ path ต่างกัน)
const MATCH_PAGES = {
    cs2:      ['/Liquipedia:Upcoming_and_ongoing_matches'],
    valorant: ['/Portal:Matches', '/Liquipedia:Upcoming_and_ongoing_matches'],
    lol:      ['/Liquipedia:Upcoming_and_ongoing_matches', '/Portal:Matches'],
    mlbb:     ['/Portal:Matches', '/Portal:Tournaments'],
};

// ─── ดึง upcoming matches ─────────────────────────────────────────────────────
async function getUpcomingMatches(game) {
    const cached = _getCached(`matches:${game}`);
    if (cached) return cached;
    const wiki = WIKIS[game];
    if (!wiki) return [];

    const pages = MATCH_PAGES[game] || ['/Liquipedia:Upcoming_and_ongoing_matches'];
    let $;
    for (const pagePath of pages) {
        try {
            $ = await fetchPage(wiki, pagePath);
            break; // สำเร็จ หยุดลอง
        } catch (err) {
            const status = err.response?.status;
            if (status === 404 || status === 410) {
                // ลอง path ถัดไป
                continue;
            }
            console.error(`[Liquipedia ${game}] getUpcomingMatches error:`, err.message);
            return [];
        }
    }
    if (!$) return [];

    try {
        const matches = [];

        // Match cards บน Portal:Matches
        $('.infobox_matches_content').each((_, el) => {
            const $el = $(el);

            const team1 = $el.find('.team-left .team-template-text a').first().text().trim()
                       || $el.find('.team-left').text().trim();
            const team2 = $el.find('.team-right .team-template-text a').first().text().trim()
                       || $el.find('.team-right').text().trim();

            // timestamp
            const timeEl  = $el.find('.timer-object');
            const tsAttr   = timeEl.attr('data-timestamp') || timeEl.attr('data-time');
            const matchTime = tsAttr ? new Date(parseInt(tsAttr) * 1000) : null;

            // tournament
            const tournament = $el.find('.match-filler').text().trim()
                             || $el.find('.tournament-text a').first().text().trim();

            // score (ถ้ากำลังแข่ง)
            const score1 = $el.find('.team-left .score').text().trim();
            const score2 = $el.find('.team-right .score').text().trim();

            // stream
            const streamLink = $el.find('a[data-stream-twitch]').first().attr('href') || '';

            if (team1 && team2) {
                matches.push({
                    game,
                    team1: team1 || 'TBD',
                    team2: team2 || 'TBD',
                    tournament,
                    matchTime,
                    score1,
                    score2,
                    streamLink,
                    isLive: !!score1 || !!score2,
                });
            }
        });

        const result = matches.slice(0, 10);
        _setCached(`matches:${game}`, result);
        return result;
    } catch (err) {
        console.error(`[Liquipedia ${game}] getUpcomingMatches error:`, err.message);
        return [];
    }
}

// ─── แมตช์สด (filter จาก upcoming) ──────────────────────────────────────────
async function getLiveMatches(games = ['cs2', 'valorant', 'lol', 'mlbb']) {
    const all = [];
    for (const game of games) {
        const matches = await getUpcomingMatches(game);
        for (const m of matches) {
            if (m.isLive) all.push(m);
        }
    }
    return all;
}

// ─── ดึง ongoing tournaments ──────────────────────────────────────────────────
async function getOngoingTournaments(game) {
    const wiki = WIKIS[game];
    if (!wiki) return [];

    const cachedT = _getCached(`tournaments:${game}`);
    if (cachedT) return cachedT;
    try {
        const $ = await fetchPage(wiki, '/Portal:Tournaments');
        const tournaments = [];

        // Ongoing section
        $('#mw-content-text').find('h3').each((_, hEl) => {
            const text = $(hEl).text().toLowerCase();
            if (!text.includes('ongoing')) return;

            $(hEl).nextUntil('h3').find('.divTable .divRow').each((_, row) => {
                const $row = $(row);
                const name  = $row.find('.Tournament').text().trim();
                const tier  = $row.find('.Tier').text().trim();
                const dates = $row.find('.Date').text().trim();
                const prize = $row.find('.Prize').text().trim();
                const link  = $row.find('a').first().attr('href');
                if (name) {
                    tournaments.push({
                        game,
                        name,
                        tier,
                        dates,
                        prize,
                        url: link ? `${BASE}${link}` : '',
                    });
                }
            });
        });

        const result = tournaments.slice(0, 5);
        _setCached(`tournaments:${game}`, result);
        return result;
    } catch (err) {
        console.error(`[Liquipedia ${game}] getOngoingTournaments error:`, err.message);
        return [];
    }
}

// ─── ดึง top teams ────────────────────────────────────────────────────────────
async function getTopTeams(game) {
    const wiki = WIKIS[game];
    if (!wiki) return [];

    try {
        const $ = await fetchPage(wiki, '/Portal:Teams');
        const teams = [];

        $('#mw-content-text .team-template-text a').each((_, el) => {
            const name = $(el).text().trim();
            const href = $(el).attr('href');
            if (name && href && !teams.find(t => t.name === name)) {
                teams.push({ game, name, url: `${BASE}${href}` });
            }
        });

        return teams.slice(0, 20);
    } catch (err) {
        console.error(`[Liquipedia ${game}] getTopTeams error:`, err.message);
        return [];
    }
}

// heading ที่ไม่ใช่ชื่อโซน (ข้าม)
const _SKIP_HEADING = /see also|references|navigation|contents|active teams|disbanded teams|notable disbanded|notable active|^active$|^disbanded$|earnings/i;

// team selector รองรับทุก Liquipedia template
const _TEAM_SEL = '.team-template-text a, .team-template-team-bracket a, .team-template-team-standard a';

function _addTeams($ctx, el, regions, curRegion, wiki) {
    $ctx(el).find(_TEAM_SEL).each((_, a) => {
        const name = $ctx(a).text().trim();
        const href = $ctx(a).attr('href') || '';
        if (!name || name.length < 2 || href.startsWith('http') || href.startsWith('//') || !href) return;
        if (!regions[curRegion]) regions[curRegion] = [];
        if (!regions[curRegion].find(t => t.name === name))
            regions[curRegion].push({ name, url: `${BASE}${href}`, region: curRegion });
    });
    // fallback: generic wiki links (for wikis that don't use template classes)
    if (!$ctx(el).find(_TEAM_SEL).length) {
        $ctx(el).find(`a[href^="/${wiki}/"]`).each((_, a) => {
            const name = $ctx(a).text().trim();
            const href = $ctx(a).attr('href') || '';
            const pagePart = href.slice(`/${wiki}/`.length);
            if (!name || name.length < 2 || !pagePart || pagePart.includes(':')) return;
            if (/^(Portal|Special|Template|Category|User|File|Talk)/.test(pagePart)) return;
            if (!regions[curRegion]) regions[curRegion] = [];
            if (!regions[curRegion].find(t => t.name === name))
                regions[curRegion].push({ name, url: `${BASE}${href}`, region: curRegion });
        });
    }
}

// Mediawiki wrap content ใน .mw-parser-output → ต้องใช้ children ของ div นั้น
function _contentRoot($ctx) {
    const inner = $ctx('#mw-content-text .mw-parser-output');
    return inner.length ? inner : $ctx('#mw-content-text');
}

// ─── ดึงทีมแบ่งตามภูมิภาค ────────────────────────────────────────────────────
// รองรับ sub-pages (VALORANT/CS2/MLBB/LoL) และ main-page h2/h3 fallback
async function getTeamsByRegion(game) {
    const cachedR = _getCached(`teams:${game}`, _TEAMS_CACHE_TTL);
    if (cachedR) return cachedR;
    const wiki = WIKIS[game];
    if (!wiki) return {};
    try {
        const $ = await fetchPage(wiki, '/Portal:Teams');

        // ── auto-discover sub-pages ────────────────────────────────────────────
        const wikiPrefix   = `/${wiki}/Portal:Teams/`;
        const subPagePaths = new Set();
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href') || '';
            if (href.startsWith(wikiPrefix) && !href.includes('action=') && !href.includes('?')) {
                const cleanPath = href.slice(`/${wiki}`.length).split('#')[0];
                if (cleanPath && cleanPath !== '/Portal:Teams') subPagePaths.add(cleanPath);
            }
        });
        console.log(`[Teams ${game}] sub-pages found: ${[...subPagePaths].join(', ') || 'none'}`);

        const regions = {};

        function _scanPage($ctx, defaultRegion) {
            let curRegion   = defaultRegion;
            let inDisbanded = false;
            const root = _contentRoot($ctx);
            console.log(`[Teams ${game}] scanning "${defaultRegion}" — root children: ${root.children().length}`);
            root.children().each((_, el) => {
                const tag = (el.tagName || el.name || '').toLowerCase();
                if (['h2', 'h3', 'h4'].includes(tag)) {
                    const title = $ctx(el).find('.mw-headline').text().trim();
                    if (/disbanded/i.test(title)) {
                        inDisbanded = true;
                    } else if (title.length > 1 && !_SKIP_HEADING.test(title)) {
                        inDisbanded = false;
                        curRegion   = title;
                    } else {
                        inDisbanded = false;
                        curRegion   = defaultRegion;
                    }
                    return;
                }
                if (inDisbanded) return;
                _addTeams($ctx, el, regions, curRegion, wiki);
            });
        }

        // ── fetch sub-pages ────────────────────────────────────────────────────
        if (subPagePaths.size > 0) {
            for (const subPath of [...subPagePaths].slice(0, 8)) {
                try {
                    const $s     = await fetchPage(wiki, subPath);
                    const subName = subPath.split('/').pop().replace(/_/g, ' ');
                    _scanPage($s, subName);
                    console.log(`[Teams ${game}] after "${subName}": regions=${Object.keys(regions).join(', ')}`);
                } catch (subErr) {
                    console.error(`[Liquipedia ${game}] sub-page ${subPath}:`, subErr.message);
                }
            }
        }

        // ── fallback: main page ────────────────────────────────────────────────
        if (!Object.keys(regions).length) {
            console.log(`[Teams ${game}] no sub-pages yielded teams, falling back to main page`);
            _scanPage($, 'ทั่วไป');
        }

        // ── clean: ลบ region ว่าง, จำกัด 20 ทีมต่อโซน ────────────────────────
        const cleaned = {};
        for (const [r, teams] of Object.entries(regions)) {
            const t = teams.filter(t => t.name && t.name.length > 1).slice(0, 20);
            if (t.length > 0) cleaned[r] = t;
        }

        _setCached(`teams:${game}`, cleaned);
        return cleaned;
    } catch (err) {
        console.error(`[Liquipedia ${game}] getTeamsByRegion:`, err.message);
        return {};
    }
}

// ─── ดึง matches หลายเกมพร้อมกัน ────────────────────────────────────────────
async function getAllGamesMatches(enabledGames = ['cs2', 'valorant', 'lol', 'mlbb']) {
    const results = {};
    for (const game of enabledGames) {
        results[game] = await getUpcomingMatches(game);
        await delay(2100); // rate limit ระหว่างเกม
    }
    return results;
}

module.exports = {
    WIKIS,
    GAME_NAMES,
    GAME_COLORS,
    GAME_THUMBS,
    getUpcomingMatches,
    getLiveMatches,
    getOngoingTournaments,
    getTopTeams,
    getTeamsByRegion,
    getAllGamesMatches,
};
