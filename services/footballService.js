const axios = require('axios');

const ESPN_BASE   = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const ESPN_SEARCH = 'https://site.api.espn.com/apis/common/v3/search';

// Hardcoded ESPN CDN league logo URLs (fallbacks so logos work even during off-season)
const LEAGUE_LOGOS = {
    WC:  'https://a.espncdn.com/i/leaguelogos/soccer/500/4.png',
    PL:  'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png',
    BL1: 'https://a.espncdn.com/i/leaguelogos/soccer/500/10.png',
    SA:  'https://a.espncdn.com/i/leaguelogos/soccer/500/12.png',
    PD:  'https://a.espncdn.com/i/leaguelogos/soccer/500/15.png',
    FL1: 'https://a.espncdn.com/i/leaguelogos/soccer/500/9.png',
    CL:  'https://a.espncdn.com/i/leaguelogos/soccer/500/2.png',
    EL:  'https://a.espncdn.com/i/leaguelogos/soccer/500/5.png',
};

// ESPN league slugs mapped to internal codes
const LEAGUE_SLUGS = {
    WC:  'fifa.world',
    PL:  'eng.1',
    BL1: 'ger.1',
    SA:  'ita.1',
    PD:  'esp.1',
    FL1: 'fra.1',
    CL:  'uefa.champions',
    EL:  'uefa.europa',
};

const LEAGUE_NAMES = {
    WC:  '🌍 FIFA World Cup 2026',
    PL:  '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League',
    BL1: '🇩🇪 Bundesliga',
    SA:  '🇮🇹 Serie A',
    PD:  '🇪🇸 La Liga',
    FL1: '🇫🇷 Ligue 1',
    CL:  '⭐ UEFA Champions League',
    EL:  '🟠 UEFA Europa League',
};

// ESPN league slug → short name (for team search display)
const SLUG_SHORT = {
    'fifa.world': 'WC', 'eng.1': 'PL', 'ger.1': 'BL1', 'ita.1': 'SA',
    'esp.1': 'PD', 'fra.1': 'FL1', 'uefa.champions': 'UCL', 'uefa.europa': 'UEL',
};

const AVAILABLE_LEAGUES = Object.entries(LEAGUE_NAMES).map(([code, name]) => ({ code, name }));

const SEASON_START = {
    PL:  '2026-08-08',
    BL1: '2026-08-14',
    SA:  '2026-08-22',
    PD:  '2026-08-15',
    FL1: '2026-08-08',
    CL:  '2026-09-15',
    EL:  '2026-09-17',
};

// ─── Simple in-memory cache ──────────────────────────────────────────────────
const cache = new Map();
const TTL           = 3 * 60 * 1000;   // default (lineup summary)
const TTL_LIVE      = 60 * 1000;        // live scores — 1 min
const TTL_SCHEDULE  = 5 * 60 * 1000;   // upcoming matches — 5 min
const TTL_STANDINGS = 20 * 60 * 1000;  // standings — 20 min

// matchId → leagueSlug — populated by getMatches/getLiveMatches so lineup only needs 1 request
const matchLeagueMap = new Map();

// leagueCode → logo URL — pre-seeded with hardcoded fallbacks, overwritten by live API data
const leagueLogoCache = { ...LEAGUE_LOGOS };

function setCache(key, data) { cache.set(key, { data, ts: Date.now() }); }

// ─── ESPN GET helper ─────────────────────────────────────────────────────────
async function espnGet(url, ttl = TTL) {
    const e = cache.get(url);
    if (e && Date.now() - e.ts < ttl) return e.data;

    const { data } = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        timeout: 12000,
    });
    setCache(url, data);
    return data;
}

// ─── helper: parse event into our match shape ─────────────────────────────────
function parseEvent(ev, leagueCode) {
    const comp  = ev.competitions?.[0];
    const home  = comp?.competitors?.find(c => c.homeAway === 'home');
    const away  = comp?.competitors?.find(c => c.homeAway === 'away');
    const sname = comp?.status?.type?.name || '';
    return {
        id:         parseInt(ev.id) || 0,
        league:     LEAGUE_NAMES[leagueCode] || leagueCode,
        leagueCode,
        homeTeam:   home?.team?.displayName || '',
        awayTeam:   away?.team?.displayName || '',
        homeShort:  home?.team?.abbreviation || '',
        awayShort:  away?.team?.abbreviation || '',
        homeTeamId: parseInt(home?.team?.id) || 0,
        awayTeamId: parseInt(away?.team?.id) || 0,
        homeLogo:   home?.team?.logos?.[0]?.href || (home?.team?.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${home.team.id}.png` : ''),
        awayLogo:   away?.team?.logos?.[0]?.href || (away?.team?.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${away.team.id}.png` : ''),
        dateTime:   ev.date ? new Date(ev.date) : null,
        homeScore:  parseInt(home?.score) || 0,
        awayScore:  parseInt(away?.score) || 0,
        status:     sname === 'STATUS_IN_PROGRESS' ? 'IN_PLAY'
                  : sname === 'STATUS_FINAL'       ? 'FINISHED'
                  :                                  'SCHEDULED',
        minute:     comp?.status?.displayClock || '',
        venue:      comp?.venue?.fullName || '',
    };
}

// ─── แมตช์ที่กำลังจะมาถึงของลีก ──────────────────────────────────────────────
async function getMatches(leagueCode = 'PL', limit = 10) {
    try {
        const slug = LEAGUE_SLUGS[leagueCode];
        if (!slug) return [];

        const data = await espnGet(`${ESPN_BASE}/${slug}/scoreboard`, TTL_SCHEDULE);
        const leagueLogo = data.leagues?.[0]?.logos?.[0]?.href;
        if (leagueLogo) leagueLogoCache[leagueCode] = leagueLogo;
        const events = data.events || [];

        return events
            .filter(e => (e.competitions?.[0]?.status?.type?.name || '') === 'STATUS_SCHEDULED')
            .slice(0, limit)
            .map(e => {
                matchLeagueMap.set(parseInt(e.id), slug);
                return parseEvent(e, leagueCode);
            });
    } catch (err) {
        console.error(`[Football] getMatches ${leagueCode}:`, err.message);
        return [];
    }
}

// ─── แมตช์สด (ทุกลีก) ────────────────────────────────────────────────────────
async function getLiveMatches() {
    try {
        const live = [];
        await Promise.all(Object.entries(LEAGUE_SLUGS).map(async ([code, slug]) => {
            try {
                const data   = await espnGet(`${ESPN_BASE}/${slug}/scoreboard`, TTL_LIVE);
                const leagueLogo = data.leagues?.[0]?.logos?.[0]?.href;
                if (leagueLogo) leagueLogoCache[code] = leagueLogo;
                const events = (data.events || [])
                    .filter(e => e.competitions?.[0]?.status?.type?.name === 'STATUS_IN_PROGRESS');
                for (const e of events) {
                    matchLeagueMap.set(parseInt(e.id), slug);
                    live.push(parseEvent(e, code));
                }
            } catch (e) { console.warn('[Football] getLiveMatches', code, e.message); }
        }));
        return live;
    } catch (err) {
        console.error('[Football] getLiveMatches:', err.message);
        return [];
    }
}

// ─── lineup ของแมตช์ (ESPN summary) ─────────────────────────────────────────
async function getMatchLineup(matchId) {
    function extractPlayers(teamBox) {
        const stats = teamBox?.players?.[0]?.statistics;
        if (!stats?.length) return { starters: [], bench: [] };
        const athletes = stats[0]?.athletes || [];
        const starters = athletes.filter(p => p.starter).map(p => p.athlete?.displayName || '').filter(Boolean);
        const bench    = athletes.filter(p => !p.starter).map(p => p.athlete?.displayName || '').filter(Boolean);
        return { starters, bench };
    }

    try {
        const knownSlug  = matchLeagueMap.get(matchId);
        const slugsToTry = knownSlug ? [knownSlug] : Object.values(LEAGUE_SLUGS);

        for (const slug of slugsToTry) {
            try {
                const data = await espnGet(`${ESPN_BASE}/${slug}/summary?event=${matchId}`);
                if (!data || data.error) continue;

                const boxscore  = data.boxscore || {};
                const homeTeamB = boxscore.teams?.find(t => t.homeAway === 'home');
                const awayTeamB = boxscore.teams?.find(t => t.homeAway === 'away');

                const home = extractPlayers(homeTeamB);
                const away = extractPlayers(awayTeamB);

                if (!home.starters.length && !away.starters.length) {
                    console.warn(`[Football] lineup empty for match ${matchId} via ${slug}`);
                    continue;
                }

                return {
                    homeTeam:      homeTeamB?.team?.displayName || '',
                    awayTeam:      awayTeamB?.team?.displayName || '',
                    homeLogo:      homeTeamB?.team?.logos?.[0]?.href || (homeTeamB?.team?.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${homeTeamB.team.id}.png` : ''),
                    awayLogo:      awayTeamB?.team?.logos?.[0]?.href || (awayTeamB?.team?.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${awayTeamB.team.id}.png` : ''),
                    homeFormation: data.header?.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home')?.formation || '—',
                    awayFormation: data.header?.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away')?.formation || '—',
                    homeLineup:    home.starters,
                    homeBench:     home.bench,
                    awayLineup:    away.starters,
                    awayBench:     away.bench,
                    dateTime:      new Date(data.header?.competitions?.[0]?.date || Date.now()),
                };
            } catch (e) {
                console.warn(`[Football] lineup ${slug} match ${matchId}:`, e.message);
                continue;
            }
        }
        return null;
    } catch (err) {
        console.error('[Football] getMatchLineup:', err.message);
        return null;
    }
}

// ─── ตารางคะแนน ───────────────────────────────────────────────────────────────
async function getStandings(leagueCode = 'PL') {
    try {
        const slug = LEAGUE_SLUGS[leagueCode];
        if (!slug) return [];

        const data = await espnGet(`${ESPN_BASE}/${slug}/standings`, TTL_STANDINGS);
        const groups = data.children || [];
        const entries = [];

        for (const g of groups) {
            for (const e of (g.standings?.entries || [])) {
                const stats = {};
                for (const s of (e.stats || [])) stats[s.name] = s.value;
                entries.push({
                    team:   e.team?.displayName || e.team?.shortDisplayName || '',
                    played: stats.gamesPlayed || 0,
                    won:    stats.wins        || 0,
                    draw:   stats.ties        || 0,
                    lost:   stats.losses      || 0,
                    gd:     stats.pointDifferential || 0,
                    pts:    stats.points      || 0,
                });
            }
        }

        return entries
            .sort((a, b) => (b.pts - a.pts) || (b.gd - a.gd))
            .map((e, i) => ({ ...e, pos: i + 1 }));
    } catch (err) {
        console.error(`[Football] getStandings ${leagueCode}:`, err.message);
        return [];
    }
}

// ─── ดึงแมตช์หลายลีกพร้อมกัน ──────────────────────────────────────────────────
async function getMultiLeagueMatches(leagues = ['PL']) {
    const results = {};
    for (const code of leagues) results[code] = await getMatches(code);
    return results;
}

// ─── ทีมทั้งหมดในลีก (ESPN) ──────────────────────────────────────────────────
async function getLeagueTeams(leagueCode) {
    try {
        const slug = LEAGUE_SLUGS[leagueCode];
        if (!slug) return [];

        const data  = await espnGet(`${ESPN_BASE}/${slug}/teams`);
        const leagueLogo = data.sports?.[0]?.leagues?.[0]?.logos?.[0]?.href;
        if (leagueLogo) leagueLogoCache[leagueCode] = leagueLogo;
        const teams = data.sports?.[0]?.leagues?.[0]?.teams || [];
        return teams.map(t => ({
            id:      parseInt(t.team?.id) || 0,
            name:    t.team?.displayName || '',
            country: '',
            logo:    t.team?.logos?.[0]?.href || (t.team?.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${t.team.id}.png` : ''),
        })).filter(t => t.name);
    } catch (err) {
        console.error(`[Football] getLeagueTeams ${leagueCode}:`, err.message);
        return [];
    }
}

// ─── ค้นหาทีม / นักเตะ ผ่าน ESPN ────────────────────────────────────────────
async function searchFotMob(query, type = 'team') {
    if (!query || query.length < 2) return [];
    try {
        const espnType = type === 'player' ? 'player' : 'team';
        const url  = `${ESPN_SEARCH}?query=${encodeURIComponent(query)}&limit=12&type=${espnType}&sport=soccer`;
        const data = await espnGet(url);
        const items = data.items || [];

        if (type === 'player') {
            return items.slice(0, 12).map(p => ({
                id:       parseInt(p.id) || 0,
                name:     p.displayName  || '',
                teamName: p.leagueRelationships?.[0]?.displayName || '',
                country:  '',
            })).filter(p => p.name);
        }

        return items.slice(0, 12).map(t => ({
            id:      parseInt(t.id) || 0,
            name:    t.displayName  || '',
            country: SLUG_SHORT[t.defaultLeagueSlug] || t.defaultLeagueSlug || '',
            logo:    t.images?.[0]?.href || '',
        })).filter(t => t.name);
    } catch (err) {
        console.error('[Football] searchFotMob (ESPN):', err.message);
        return [];
    }
}

// ─── บอลโลก: แมตช์ 7 วันข้างหน้า ─────────────────────────────────────────────
async function getWCSchedule(daysAhead = 7) {
    try {
        const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '');
        const today = new Date();
        const end   = new Date(today);
        end.setDate(end.getDate() + daysAhead);

        const url  = `${ESPN_BASE}/fifa.world/scoreboard?dates=${fmt(today)}-${fmt(end)}`;
        const data = await espnGet(url, TTL_SCHEDULE);
        const leagueLogo = data.leagues?.[0]?.logos?.[0]?.href;
        if (leagueLogo) leagueLogoCache['WC'] = leagueLogo;
        return (data.events || [])
            .filter(e => {
                const s = e.competitions?.[0]?.status?.type?.name || '';
                return s === 'STATUS_SCHEDULED' || s === 'STATUS_IN_PROGRESS';
            })
            .map(e => {
                matchLeagueMap.set(parseInt(e.id), 'fifa.world');
                return parseEvent(e, 'WC');
            });
    } catch (err) {
        console.error('[WC] getWCSchedule:', err.message);
        return [];
    }
}

// ─── บอลโลก: ตารางกลุ่มทั้งหมด ───────────────────────────────────────────────
async function getWCGroups() {
    try {
        const data   = await espnGet(`${ESPN_BASE}/fifa.world/standings`, TTL_STANDINGS);
        const groups = data.children || [];
        return groups.map(g => ({
            name: g.name || g.abbreviation || '',
            entries: (g.standings?.entries || []).map((e, i) => {
                const stats = {};
                for (const s of (e.stats || [])) stats[s.name] = s.value;
                return {
                    pos:    i + 1,
                    team:   e.team?.shortDisplayName || e.team?.displayName || '',
                    played: stats.gamesPlayed || 0,
                    won:    stats.wins        || 0,
                    draw:   stats.ties        || 0,
                    lost:   stats.losses      || 0,
                    gd:     stats.pointDifferential || 0,
                    pts:    stats.points      || 0,
                };
            }),
        })).filter(g => g.entries.length);
    } catch (err) {
        console.error('[WC] getWCGroups:', err.message);
        return [];
    }
}

module.exports = {
    LEAGUE_NAMES,
    LEAGUE_LOGOS,
    AVAILABLE_LEAGUES,
    SEASON_START,
    leagueLogoCache,
    getMatches,
    getLiveMatches,
    getMatchLineup,
    getStandings,
    getWCSchedule,
    getWCGroups,
    getMultiLeagueMatches,
    getLeagueTeams,
    searchFotMob,
};
