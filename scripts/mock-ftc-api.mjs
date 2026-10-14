// Local stand-in for the FTC Events API: one synthetic BIOBUZZ event happening today.
// Usage: node scripts/mock-ftc-api.mjs   (listens on :8790, base http://localhost:8790/v2.0)
// Supports If-Modified-Since → 304 so the sync Worker's conditional path can be exercised.
import { createServer } from "node:http";

const CODE = "TESTEVT";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
const LAST_MODIFIED = new Date(Date.now() - 60_000).toUTCString();

// Hidden "true" per-team strengths so OPR output can be eyeballed against them.
const strength = { 1001: 60, 1002: 45, 1003: 30, 1004: 20, 1005: 55, 1006: 25, 1007: 40, 1008: 35 };
const teams = Object.keys(strength).map(Number);

let seed = 42;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

function alliance(color, [a, b], number) {
  const s = (strength[a] + strength[b]) / 100;
  const autoTips = Math.round(s * 0.8 * rnd());
  const teleTips = Math.round(s * 4 + rnd() * 2);
  const hivePieces = Math.round(s * 8 * rnd());
  const garden = Math.round(rnd() * 4);
  const flower = ["POLLEN", color === "Red" ? "RED_NECTAR" : "BLUE_NECTAR"].slice(0, 1 + Math.round(rnd()));
  const minor = rnd() < 0.3 ? 1 : 0;
  const autoLeave = 6,
    autoPark = rnd() < 0.5 ? 5 : 0;
  const autoPoints = autoLeave + autoPark + autoTips * 20;
  const teleopHivePoints = teleTips * 20 + hivePieces * 2;
  const teleopFlowerPoints = flower.length * 2;
  const teleopParkPoints = 10;
  const teleopPoints = teleopHivePoints + teleopFlowerPoints + garden + teleopParkPoints;
  const preFoulTotal = autoPoints + teleopPoints;
  return {
    alliance: color,
    team: 0,
    autoRobot1Leave: true,
    autoRobot2Leave: true,
    autoRobot1Park: autoPark > 0,
    autoRobot2Park: false,
    autoHiveTips: autoTips,
    autoLeavePoints: autoLeave,
    autoParkPoints: autoPark,
    autoHivePoints: autoTips * 20,
    autoPoints,
    teleopHiveTips: teleTips,
    teleopHivePollenNectar: hivePieces,
    teleopGardenPollenNectar: garden,
    redAllianceFlower: color === "Red" ? flower : [],
    blueAllianceFlower: color === "Blue" ? flower : [],
    scoringFlower: [],
    audienceFlower: null,
    teleopRobot1Park: true,
    teleopRobot2Park: true,
    teleopHivePoints,
    teleopFlowerPoints,
    teleopGardenPoints: garden,
    teleopParkPoints,
    teleopPoints,
    majorFouls: 0,
    minorFouls: minor,
    foulPointsCommitted: minor * 5,
    preFoulTotal,
    totalPoints: preFoulTotal, // foul points are added to the *opponent* below
    swarmRP: autoLeave + autoPark + teleopParkPoints >= 16,
    pollinator1RP: autoTips + teleTips >= 4,
    pollinator2RP: autoTips + teleTips >= 7,
    _number: number,
  };
}

// 12 qual matches: rotate pairings.
const schedule = [];
const scores = [];
for (let m = 1; m <= 12; m++) {
  const shuffled = [...teams].sort(() => rnd() - 0.5);
  const red = shuffled.slice(0, 2),
    blue = shuffled.slice(2, 4);
  const r = alliance("Red", red, m),
    b = alliance("Blue", blue, m);
  r.totalPoints += b.foulPointsCommitted;
  b.totalPoints += r.foulPointsCommitted;
  for (const x of [r, b]) delete x._number;
  const start = new Date(Date.now() - (13 - m) * 8 * 60_000).toISOString();
  schedule.push({
    description: `Qualification ${m}`,
    tournamentLevel: "QUALIFICATION",
    series: 0,
    matchNumber: m,
    field: "1",
    startTime: start,
    actualStartTime: start,
    postResultTime: start,
    scoreRedFinal: r.totalPoints,
    scoreRedFoul: b.foulPointsCommitted,
    scoreRedAuto: r.autoPoints,
    scoreBlueFinal: b.totalPoints,
    scoreBlueFoul: r.foulPointsCommitted,
    scoreBlueAuto: b.autoPoints,
    redWins: r.totalPoints > b.totalPoints,
    blueWins: b.totalPoints > r.totalPoints,
    teams: [
      { teamNumber: red[0], station: "Red1", surrogate: false, noShow: false, dq: false, onField: true },
      { teamNumber: red[1], station: "Red2", surrogate: false, noShow: false, dq: false, onField: true },
      { teamNumber: blue[0], station: "Blue1", surrogate: false, noShow: false, dq: false, onField: true },
      { teamNumber: blue[1], station: "Blue2", surrogate: false, noShow: false, dq: false, onField: true },
    ],
  });
  scores.push({ matchLevel: "QUALIFICATION", matchSeries: 0, matchNumber: m, alliances: [r, b] });
}

const record = Object.fromEntries(teams.map((t) => [t, { w: 0, l: 0, t: 0, rp: 0, n: 0 }]));
for (const s of schedule) {
  for (const tm of s.teams) {
    const red = tm.station.startsWith("Red");
    const won = red ? s.redWins : s.blueWins;
    const lost = red ? s.blueWins : s.redWins;
    const r = record[tm.teamNumber];
    r.n++;
    if (won) {
      r.w++;
      r.rp += 3;
    } else if (lost) r.l++;
    else {
      r.t++;
      r.rp += 1;
    }
  }
}
const rankings = teams
  .map((t) => ({ teamNumber: t, ...record[t] }))
  .sort((a, b) => b.rp - a.rp)
  .map((r, i) => ({
    rank: i + 1,
    teamNumber: r.teamNumber,
    sortOrder1: r.rp / r.n,
    sortOrder2: 0,
    sortOrder3: 0,
    sortOrder4: 0,
    sortOrder5: 0,
    sortOrder6: 0,
    wins: r.w,
    losses: r.l,
    ties: r.t,
    dq: 0,
    matchesPlayed: r.n,
    matchesCounted: r.n,
  }));

const teamObjs = teams.map((t) => ({
  teamNumber: t,
  nameFull: `Sponsor ${t}`,
  nameShort: `Test Bots ${t}`,
  schoolName: null,
  city: "Los Angeles",
  stateProv: "CA",
  country: "USA",
  website: null,
  rookieYear: 2015,
  robotName: `Bee ${t}`,
  districtCode: null,
  homeCMP: null,
  homeRegion: "USCALA",
  displayLocation: "Los Angeles, CA, USA",
}));

const routes = {
  "/v2.0/2026/events": {
    events: [
      {
        code: CODE,
        divisionCode: null,
        name: "Synthetic BIOBUZZ Qualifier",
        remote: false,
        hybrid: false,
        fieldCount: 1,
        published: true,
        type: "2",
        typeName: "Qualifier",
        regionCode: "USCALA",
        leagueCode: null,
        districtCode: null,
        venue: "Mock High School",
        address: null,
        city: "Los Angeles",
        stateprov: "CA",
        country: "USA",
        website: null,
        liveStreamUrl: null,
        webcasts: [],
        timezone: "America/Los_Angeles",
        dateStart: `${today}T00:00:00`,
        dateEnd: `${today}T00:00:00`,
      },
    ],
  },
  "/v2.0/2026/teams?page=1": {
    teams: teamObjs,
    teamCountTotal: 8,
    teamCountPage: 8,
    pageCurrent: 1,
    pageTotal: 1,
  },
  [`/v2.0/2026/teams?eventCode=${CODE}`]: {
    teams: teamObjs,
    teamCountTotal: 8,
    teamCountPage: 8,
    pageCurrent: 1,
    pageTotal: 1,
  },
  [`/v2.0/2026/schedule/${CODE}/qual/hybrid`]: { schedule },
  [`/v2.0/2026/schedule/${CODE}/playoff/hybrid`]: { schedule: [] },
  [`/v2.0/2026/scores/${CODE}/qual`]: { matchScores: scores },
  [`/v2.0/2026/scores/${CODE}/playoff`]: { matchScores: [] },
  [`/v2.0/2026/rankings/${CODE}`]: { rankings },
  [`/v2.0/2026/alliances/${CODE}`]: { alliances: [] },
  [`/v2.0/2026/awards/${CODE}`]: {
    awards: [
      { awardId: 1, eventCode: CODE, name: "Inspire Award", series: 1, teamNumber: 1001, person: null },
    ],
  },
  "/v2.0/2026/leagues": { leagues: [] },
};

let hits = 0,
  notModified = 0;
createServer((req, res) => {
  hits++;
  if (!req.headers.authorization?.startsWith("Basic ")) {
    res.writeHead(401);
    return res.end();
  }
  if (req.url === "/stats") {
    res.writeHead(200);
    return res.end(JSON.stringify({ hits, notModified }));
  }
  const body = routes[req.url];
  if (!body) {
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end("<html>no data</html>");
  }
  if (req.headers["if-modified-since"] === LAST_MODIFIED) {
    notModified++;
    res.writeHead(304);
    return res.end();
  }
  res.writeHead(200, { "Content-Type": "application/json", "Last-Modified": LAST_MODIFIED });
  res.end(JSON.stringify(body));
}).listen(8790, () =>
  console.log("mock FTC API on http://localhost:8790/v2.0  (event", CODE, "on", `${today})`),
);
