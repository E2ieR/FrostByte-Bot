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

// ─── In-memory cache (TTL 5 นาที) ────────────────────────────────────────────
const _cache = new Map();
const _CACHE_TTL = 5 * 60 * 1000;
function _getCached(key) {
    const e = _cache.get(key);
    return e && Date.now() - e.ts < _CACHE_TTL ? e.data : null;
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

// ─── ดึงทีมแบ่งตามภูมิภาค ────────────────────────────────────────────────────
async function getTeamsByRegion(game) {
    const cachedR = _getCached(`teams:${game}`);
    if (cachedR) return cachedR;
    const wiki = WIKIS[game];
    if (!wiki) return {};
    try {
        const $ = await fetchPage(wiki, '/Portal:Teams');
        const regions = {};
        let currentRegion = 'ทั่วไป';

        $('#mw-content-text').children().each((_, el) => {
            const tag = (el.tagName || el.name || '').toLowerCase();
            if (tag === 'h2' || tag === 'h3') {
                const title = $(el).find('.mw-headline').text().trim();
                if (title && title.length > 1 && !title.toLowerCase().includes('content') && !title.toLowerCase().includes('navigation')) {
                    currentRegion = title;
                }
            }
            $(el).find('.team-template-text a, .team-template-team-bracket a').each((_, a) => {
                const name = $(a).text().trim();
                const href = $(a).attr('href');
                if (!name || name.length < 2 || !href || href.startsWith('//') || href.startsWith('http')) return;
                if (!regions[currentRegion]) regions[currentRegion] = [];
                if (!regions[currentRegion].find(t => t.name === name)) {
                    regions[currentRegion].push({ name, url: `${BASE}${href}`, region: currentRegion });
                }
            });
        });

        // Clean empty regions, limit 20 per region
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
