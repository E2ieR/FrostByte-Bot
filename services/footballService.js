const axios = require('axios');

const FD_BASE = 'https://api.football-data.org/v4';

const cache = new Map();
const TTL   = 3 * 60 * 1000; // 3 นาที

function getCached(key) {
    const e = cache.get(key);
    return e && Date.now() - e.ts < TTL ? e.data : null;
}
function setCache(key, data) { cache.set(key, { data, ts: Date.now() }); }

const LEAGUE_NAMES = {
    PL:  '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League',
    BL1: '🇩🇪 Bundesliga',
    SA:  '🇮🇹 Serie A',
    PD:  '🇪🇸 La Liga',
    FL1: '🇫🇷 Ligue 1',
    CL:  '⭐ UEFA Champions League',
    EL:  '🟠 UEFA Europa League',
    WC:  '🌍 FIFA World Cup',
    EC:  '🌍 UEFA Euro',
    PPL: '🇵🇹 Primeira Liga',
    DED: '🇳🇱 Eredivisie',
};

const AVAILABLE_LEAGUES = Object.entries(LEAGUE_NAMES).map(([code, name]) => ({ code, name }));

// ─── เรียก football-data.org ──────────────────────────────────────────────────
async function fdGet(path) {
    const key = process.env.FOOTBALL_API_KEY;
    if (!key) return null;

    const ckey = `fd_${path}`;
    const c = getCached(ckey);
    if (c) return c;

    const { data } = await axios.get(`${FD_BASE}${path}`, {
        headers: { 'X-Auth-Token': key },
        timeout: 12000,
    });
    setCache(ckey, data);
    return data;
}

// ─── แมตช์ที่กำลังจะมาถึงของลีก ──────────────────────────────────────────────
async function getMatches(leagueCode = 'PL', limit = 10) {
    try {
        const data = await fdGet(`/competitions/${leagueCode}/matches?status=SCHEDULED&limit=20`);
        if (!data) return [];

        return data.matches.slice(0, limit).map(m => ({
            id:        m.id,
            league:    LEAGUE_NAMES[leagueCode] || leagueCode,
            leagueCode,
            homeTeam:  m.homeTeam.name,
            awayTeam:  m.awayTeam.name,
            homeShort: m.homeTeam.shortName || m.homeTeam.tla || '',
            awayShort: m.awayTeam.shortName || m.awayTeam.tla || '',
            homeBadge: m.homeTeam.crest || '',
            awayBadge: m.awayTeam.crest || '',
            dateTime:  new Date(m.utcDate),
            status:    m.status,
            matchday:  m.matchday,
            venue:     m.venue || '',
        }));
    } catch (err) {
        console.error(`[Football] getMatches ${leagueCode}:`, err.message);
        return [];
    }
}

// ─── แมตช์สด ──────────────────────────────────────────────────────────────────
async function getLiveMatches() {
    try {
        const data = await fdGet('/matches?status=IN_PLAY,PAUSED');
        if (!data) return [];

        return data.matches.map(m => ({
            id:          m.id,
            competition: m.competition.name,
            homeTeam:    m.homeTeam.name,
            awayTeam:    m.awayTeam.name,
            homeScore:   m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? 0,
            awayScore:   m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? 0,
            minute:      m.minute,
            status:      m.status,
        }));
    } catch (err) {
        console.error('[Football] getLiveMatches:', err.message);
        return [];
    }
}

// ─── lineup ของแมตช์ ──────────────────────────────────────────────────────────
async function getMatchLineup(matchId) {
    try {
        const data = await fdGet(`/matches/${matchId}`);
        if (!data) return null;

        const home = data.homeTeam || {};
        const away = data.awayTeam || {};

        return {
            homeTeam:      home.name,
            awayTeam:      away.name,
            homeFormation: home.formation || '—',
            awayFormation: away.formation || '—',
            homeLineup:    (home.lineup  || []).map(p => p.name),
            homeBench:     (home.bench   || []).map(p => p.name),
            awayLineup:    (away.lineup  || []).map(p => p.name),
            awayBench:     (away.bench   || []).map(p => p.name),
            dateTime:      new Date(data.utcDate),
        };
    } catch (err) {
        console.error('[Football] getMatchLineup:', err.message);
        return null;
    }
}

// ─── ตารางคะแนน ───────────────────────────────────────────────────────────────
async function getStandings(leagueCode = 'PL') {
    try {
        const data = await fdGet(`/competitions/${leagueCode}/standings`);
        if (!data) return [];

        const table = data.standings?.find(s => s.type === 'TOTAL');
        if (!table) return [];

        return table.table.slice(0, 20).map(t => ({
            pos:    t.position,
            team:   t.team.shortName || t.team.name,
            played: t.playedGames,
            won:    t.won,
            draw:   t.draw,
            lost:   t.lost,
            gd:     t.goalDifference,
            pts:    t.points,
        }));
    } catch (err) {
        console.error(`[Football] getStandings ${leagueCode}:`, err.message);
        return [];
    }
}

// ─── ดึงแมตช์หลายลีกพร้อมกัน ──────────────────────────────────────────────────
async function getMultiLeagueMatches(leagues = ['PL']) {
    const results = {};
    for (const code of leagues) {
        results[code] = await getMatches(code);
    }
    return results;
}

module.exports = {
    LEAGUE_NAMES,
    AVAILABLE_LEAGUES,
    getMatches,
    getLiveMatches,
    getMatchLineup,
    getStandings,
    getMultiLeagueMatches,
};
