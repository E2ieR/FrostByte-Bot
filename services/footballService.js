const axios = require('axios');

const ESPN_BASE   = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const ESPN_SEARCH = 'https://site.api.espn.com/apis/common/v3/search';

// ESPN league slugs mapped to internal codes
const LEAGUE_SLUGS = {
    PL:  'eng.1',
    BL1: 'ger.1',
    SA:  'ita.1',
    PD:  'esp.1',
    FL1: 'fra.1',
    CL:  'uefa.champions',
    EL:  'uefa.europa',
    PPL: 'por.1',
    DED: 'ned.1',
};

const LEAGUE_NAMES = {
    PL:  '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League',
    BL1: '🇩🇪 Bundesliga',
    SA:  '🇮🇹 Serie A',
    PD:  '🇪🇸 La Liga',
    FL1: '🇫🇷 Ligue 1',
    CL:  '⭐ UEFA Champions League',
    EL:  '🟠 UEFA Europa League',
    PPL: '🇵🇹 Primeira Liga',
    DED: '🇳🇱 Eredivisie',
};

// ESPN league slug → short name (for team search display)
const SLUG_SHORT = {
    'eng.1': 'PL',  'ger.1': 'BL1', 'ita.1': 'SA',
    'esp.1': 'PD',  'fra.1': 'FL1', 'uefa.champions': 'UCL',
    'uefa.europa': 'UEL', 'por.1': 'PPL', 'ned.1': 'DED',
};

const AVAILABLE_LEAGUES = Object.entries(LEAGUE_NAMES).map(([code, name]) => ({ code, name }));

// ─── Simple in-memory cache ──────────────────────────────────────────────────
const cache = new Map();
const TTL   = 3 * 60 * 1000;

function getCached(key) {
    const e = cache.get(key);
    return e && Date.now() - e.ts < TTL ? e.data : null;
}
function setCache(key, data) { cache.set(key, { data, ts: Date.now() }); }

// ─── ESPN GET helper ─────────────────────────────────────────────────────────
async function espnGet(url) {
    const cached = getCached(url);
    if (cached) return cached;

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

        const data = await espnGet(`${ESPN_BASE}/${slug}/scoreboard`);
        const events = data.events || [];

        return events
            .filter(e => (e.competitions?.[0]?.status?.type?.name || '') === 'STATUS_SCHEDULED')
            .slice(0, limit)
            .map(e => parseEvent(e, leagueCode));
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
                const data   = await espnGet(`${ESPN_BASE}/${slug}/scoreboard`);
                const events = (data.events || [])
                    .filter(e => e.competitions?.[0]?.status?.type?.name === 'STATUS_IN_PROGRESS');
                for (const e of events) live.push(parseEvent(e, code));
            } catch { /* skip league on error */ }
        }));
        return live;
    } catch (err) {
        console.error('[Football] getLiveMatches:', err.message);
        return [];
    }
}

// ─── lineup ของแมตช์ (ESPN summary) ─────────────────────────────────────────
async function getMatchLineup(matchId) {
    try {
        // ลอง summary จากทุกลีก — ESPN event id unique ข้ามลีก
        const slugs = Object.values(LEAGUE_SLUGS);
        for (const slug of slugs) {
            try {
                const data = await espnGet(`${ESPN_BASE}/${slug}/summary?event=${matchId}`);
                if (!data || data.error) continue;

                const boxscore  = data.boxscore || {};
                const homeTeamB = boxscore.teams?.find(t => t.homeAway === 'home');
                const awayTeamB = boxscore.teams?.find(t => t.homeAway === 'away');

                function extractPlayers(teamBox) {
                    const players = teamBox?.players?.[0]?.statistics?.[0]?.athletes || [];
                    const starters = players.filter(p => p.starter).map(p => p.athlete?.displayName || '');
                    const bench    = players.filter(p => !p.starter).map(p => p.athlete?.displayName || '');
                    return { starters, bench };
                }

                const home = extractPlayers(homeTeamB);
                const away = extractPlayers(awayTeamB);

                // ถ้าไม่มี lineup เลยให้ข้าม slug นี้
                if (!home.starters.length && !away.starters.length) continue;

                const hTeam = homeTeamB?.team?.displayName || '';
                const aTeam = awayTeamB?.team?.displayName || '';
                return {
                    homeTeam:      hTeam,
                    awayTeam:      aTeam,
                    homeFormation: data.header?.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home')?.formation || '—',
                    awayFormation: data.header?.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away')?.formation || '—',
                    homeLineup:    home.starters,
                    homeBench:     home.bench,
                    awayLineup:    away.starters,
                    awayBench:     away.bench,
                    dateTime:      new Date(data.header?.competitions?.[0]?.date || Date.now()),
                };
            } catch { continue; }
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

        const data = await espnGet(`${ESPN_BASE}/${slug}/standings`);
        const groups = data.children || [];
        const entries = [];

        for (const g of groups) {
            for (const e of (g.standings?.entries || [])) {
                const stats = {};
                for (const s of (e.stats || [])) stats[s.name] = s.value;
                entries.push({
                    pos:    entries.length + 1,
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

        return entries.sort((a, b) => (b.pts - a.pts) || (b.gd - a.gd));
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
        const teams = data.sports?.[0]?.leagues?.[0]?.teams || [];
        return teams.map(t => ({
            id:      parseInt(t.team?.id) || 0,
            name:    t.team?.displayName || '',
            country: '',
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
        })).filter(t => t.name);
    } catch (err) {
        console.error('[Football] searchFotMob (ESPN):', err.message);
        return [];
    }
}

module.exports = {
    LEAGUE_NAMES,
    AVAILABLE_LEAGUES,
    getMatches,
    getLiveMatches,
    getMatchLineup,
    getStandings,
    getMultiLeagueMatches,
    getLeagueTeams,
    searchFotMob,
};
