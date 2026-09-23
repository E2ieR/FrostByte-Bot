const axios = require('axios');

const JOLPICA = 'https://api.jolpi.ca/ergast/f1';
const OPENF1  = 'https://api.openf1.org/v1';

const cache = new Map();
const TTL   = 5 * 60 * 1000; // 5 นาที

function getCached(key) {
    const e = cache.get(key);
    return e && Date.now() - e.ts < TTL ? e.data : null;
}
function setCache(key, data) { cache.set(key, { data, ts: Date.now() }); }

async function jolGet(path) {
    const c = getCached(path);
    if (c) return c;
    const { data } = await axios.get(`${JOLPICA}/${path}`, { timeout: 12000 });
    setCache(path, data);
    return data;
}

async function openf1Get(ep, params = {}) {
    const key = `${ep}_${JSON.stringify(params)}`;
    const c = getCached(key);
    if (c) return c;
    const { data } = await axios.get(`${OPENF1}/${ep}`, { params, timeout: 12000 });
    setCache(key, data);
    return data;
}

// ─── ตารางแข่งทั้งซีซัน ───────────────────────────────────────────────────────
async function getSchedule() {
    try {
        const d = await jolGet('current.json');
        const races = d.MRData?.RaceTable?.Races || [];
        return races.map(r => ({
            round:      parseInt(r.round),
            name:       r.raceName,
            circuit:    r.Circuit?.circuitName,
            location:   `${r.Circuit?.Location?.locality}, ${r.Circuit?.Location?.country}`,
            date:       r.date,
            time:       r.time,
            dateTime:   r.date && r.time ? new Date(`${r.date}T${r.time}`) : null,
            qualifying: r.Qualifying ? new Date(`${r.Qualifying.date}T${r.Qualifying.time}`) : null,
            sprint:     r.Sprint     ? new Date(`${r.Sprint.date}T${r.Sprint.time}`)         : null,
            fp1:        r.FirstPractice   ? new Date(`${r.FirstPractice.date}T${r.FirstPractice.time}`)   : null,
            fp2:        r.SecondPractice  ? new Date(`${r.SecondPractice.date}T${r.SecondPractice.time}`)  : null,
            fp3:        r.ThirdPractice   ? new Date(`${r.ThirdPractice.date}T${r.ThirdPractice.time}`)   : null,
        }));
    } catch (err) {
        console.error('[F1] getSchedule:', err.message);
        return [];
    }
}

// ─── สนามถัดไป ────────────────────────────────────────────────────────────────
async function getNextRace() {
    try {
        const d = await jolGet('current/next.json');
        const r = d.MRData?.RaceTable?.Races?.[0];
        if (!r) return null;
        return {
            round:      parseInt(r.round),
            name:       r.raceName,
            circuit:    r.Circuit?.circuitName,
            location:   `${r.Circuit?.Location?.locality}, ${r.Circuit?.Location?.country}`,
            dateTime:   r.date && r.time ? new Date(`${r.date}T${r.time}`) : null,
            qualifying: r.Qualifying ? new Date(`${r.Qualifying.date}T${r.Qualifying.time}`) : null,
            sprint:     r.Sprint     ? new Date(`${r.Sprint.date}T${r.Sprint.time}`)         : null,
            fp1:        r.FirstPractice  ? new Date(`${r.FirstPractice.date}T${r.FirstPractice.time}`)  : null,
            fp2:        r.SecondPractice ? new Date(`${r.SecondPractice.date}T${r.SecondPractice.time}`) : null,
            fp3:        r.ThirdPractice  ? new Date(`${r.ThirdPractice.date}T${r.ThirdPractice.time}`)  : null,
        };
    } catch (err) {
        console.error('[F1] getNextRace:', err.message);
        return null;
    }
}

// ─── อันดับนักขับ ─────────────────────────────────────────────────────────────
async function getDriverStandings() {
    try {
        const d = await jolGet('current/driverStandings.json');
        const list = d.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || [];
        return list.map(s => ({
            pos:         parseInt(s.position),
            points:      parseFloat(s.points),
            wins:        parseInt(s.wins),
            driver:      `${s.Driver.givenName} ${s.Driver.familyName}`,
            code:        s.Driver.code,
            constructor: s.Constructors[0]?.name,
        }));
    } catch (err) {
        console.error('[F1] getDriverStandings:', err.message);
        return [];
    }
}

// ─── อันดับทีม ────────────────────────────────────────────────────────────────
async function getConstructorStandings() {
    try {
        const d = await jolGet('current/constructorStandings.json');
        const list = d.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings || [];
        return list.map(s => ({
            pos:    parseInt(s.position),
            points: parseFloat(s.points),
            wins:   parseInt(s.wins),
            name:   s.Constructor.name,
        }));
    } catch (err) {
        console.error('[F1] getConstructorStandings:', err.message);
        return [];
    }
}

// ─── session ปัจจุบัน (OpenF1) ───────────────────────────────────────────────
async function getCurrentSession() {
    try {
        const sessions = await openf1Get('sessions', { session_key: 'latest' });
        return sessions[0] || null;
    } catch (err) {
        console.error('[F1] getCurrentSession:', err.message);
        return null;
    }
}

// ─── ตำแหน่งแข่งสด (OpenF1) ──────────────────────────────────────────────────
async function getLivePositions(sessionKey = 'latest') {
    try {
        const [positions, drivers] = await Promise.all([
            openf1Get('position', { session_key: sessionKey }),
            openf1Get('drivers',  { session_key: sessionKey }),
        ]);

        // หา position ล่าสุดของแต่ละคนขับ
        const latest = new Map();
        for (const p of positions) {
            const ex = latest.get(p.driver_number);
            if (!ex || new Date(p.date) > new Date(ex.date)) latest.set(p.driver_number, p);
        }

        const drvMap = new Map(drivers.map(d => [d.driver_number, d]));

        return [...latest.values()]
            .sort((a, b) => a.position - b.position)
            .map(p => {
                const d = drvMap.get(p.driver_number);
                return {
                    pos:         p.position,
                    number:      p.driver_number,
                    name:        d ? `${d.first_name} ${d.last_name}` : `#${p.driver_number}`,
                    code:        d?.name_acronym || '',
                    team:        d?.team_name || '',
                    teamColor:   d?.team_colour || 'FFFFFF',
                };
            });
    } catch (err) {
        console.error('[F1] getLivePositions:', err.message);
        return [];
    }
}

// ─── ผลการแข่งสนามล่าสุด ──────────────────────────────────────────────────────
async function getLastRaceResult() {
    try {
        const d = await jolGet('current/last/results.json');
        const race = d.MRData?.RaceTable?.Races?.[0];
        if (!race) return null;
        return {
            name:    race.raceName,
            circuit: race.Circuit?.circuitName,
            date:    race.date,
            results: (race.Results || []).slice(0, 10).map(r => ({
                pos:    r.position,
                driver: `${r.Driver.givenName} ${r.Driver.familyName}`,
                code:   r.Driver.code,
                team:   r.Constructor.name,
                time:   r.Time?.time || r.status,
                points: r.points,
            })),
        };
    } catch (err) {
        console.error('[F1] getLastRaceResult:', err.message);
        return null;
    }
}

module.exports = {
    getSchedule, getNextRace, getDriverStandings,
    getConstructorStandings, getCurrentSession,
    getLivePositions, getLastRaceResult,
};
