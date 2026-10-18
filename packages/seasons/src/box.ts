import type { ApiScore, BoxColumn, BoxGroup, BoxScore } from "./types";

/** One click, in order. `where` is a flower id when the action has locations. */
export interface LogEntry {
  period: "auto" | "tele";
  action: string;
  where?: string;
}

export interface BoxTeamIn {
  alliance: "R" | "B";
  station: string;
  team: number;
  name: string | null;
  av: string | null;
  surrogate: boolean;
  dq: boolean;
  noShow: boolean;
}

/** A stored scout card. Missing line keys were not tracked. */
export interface BoxReport {
  id: number;
  team: number;
  by: string | null;
  mode: "line" | "log";
  line: Record<string, number>;
  qual: Record<string, string | number>;
  log: LogEntry[];
  createdAt: string;
}

export interface BoxCell {
  text: string;
  title?: string;
  cls: string;
  num: number | null;
}

export interface BoxRobotRow {
  team: number;
  name: string | null;
  av: string | null;
  alliance: "R" | "B";
  surrogate: boolean;
  dq: boolean;
  noShow: boolean;
  cells: BoxCell[];
  sub: string;
  credit: string;
  creditTitle: string;
}

export interface BoxSide {
  alliance: "R" | "B";
  label: string;
  robots: BoxRobotRow[];
  totals: BoxCell[];
  credit: string;
  creditTitle: string;
}

export interface BoxCardRow {
  id: number;
  team: number;
  by: string | null;
  mode: "line" | "log";
  when: string;
  summary: string;
}

export interface BoxTable {
  groups: { label: string; span: number }[];
  headers: { label: string; tip: string }[];
  sides: BoxSide[];
  cards: BoxCardRow[];
}

export interface ScoutInput {
  team: number;
  by: string | null;
  mode: "line" | "log";
  line: Record<string, number>;
  qual: Record<string, string | number>;
  log: LogEntry[];
}

interface Stat {
  tracked: boolean;
  v: number | null;
  split: boolean;
  values: number[];
  source: "scout" | "official" | "none";
  clash: boolean;
}

const GROUP_LABEL: Record<BoxGroup, string> = {
  auto: "Auto",
  tele: "Teleop",
  end: "End",
  foul: "Fouls",
};

const FLOWERS: { key: string; label: string }[] = [
  { key: "red", label: "Red" },
  { key: "blue", label: "Blue" },
  { key: "scoring", label: "Scoring" },
  { key: "audience", label: "Audience" },
];

const robotBool =
  (k1: string, k2: string) =>
  (a: ApiScore, robot: 1 | 2): boolean | null => {
    const v = a[robot === 1 ? k1 : k2];
    return typeof v === "boolean" ? v : null;
  };

const allianceCount =
  (key: string) =>
  (a: ApiScore): number | null => {
    const v = a[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };

const col = (c: BoxColumn): BoxColumn => c;

/**
 * BIOBUZZ box score.
 *
 * Leave and both parks are per robot on the official scoresheet. Hive tips are an alliance total
 * there too: a tip is the hive finishing because pollen and nectar were scored, so the box score
 * shows the scorekeeper's tip count and scouts record the pollen and nectar instead. Flowers are
 * one count or pollen + nectar, plus garden placements and fouls. Misses stay on the line under
 * the robot. A quick card leaves unwatched columns blank. A play-by-play marks its groups
 * complete, so a zero there is a real zero.
 */
export const biobuzzBox: BoxScore = {
  noteMax: 0,
  trackGroups: [
    { key: "flower", label: "Flowers" },
    { key: "garden", label: "Garden" },
    { key: "foul", label: "Fouls" },
  ],
  qual: [],
  columns: [
    col({
      key: "auto_leave",
      label: "Lv",
      form: "Leave",
      tip: "No longer touching the perimeter wall at the end of auto (3 pts).",
      group: "auto",
      kind: "bool",
      credit: 3,
      officialRobot: robotBool("autoRobot1Leave", "autoRobot2Leave"),
      reconcile: true,
    }),
    col({
      key: "auto_park",
      label: "Pk",
      form: "Auto park",
      tip: "In the loading zone at the end of auto (5 pts).",
      group: "auto",
      kind: "bool",
      credit: 5,
      officialRobot: robotBool("autoRobot1Park", "autoRobot2Park"),
      reconcile: true,
    }),
    col({
      key: "auto_tips",
      label: "Tip",
      form: "Auto tips",
      tip: "Hive tips the scorekeeper recorded for this alliance in auto. A tip finishes when pollen or nectar is scored.",
      group: "auto",
      kind: "count",
      officialAlliance: allianceCount("autoHiveTips"),
      officialOnly: true,
    }),
    col({
      key: "tele_tips",
      label: "Tip",
      form: "Teleop tips",
      tip: "Hive tips the scorekeeper recorded for this alliance in teleop. A tip finishes when pollen or nectar is scored.",
      group: "tele",
      kind: "count",
      officialAlliance: allianceCount("teleopHiveTips"),
      officialOnly: true,
    }),
    col({
      key: "flower",
      label: "Flw",
      form: "Flowers",
      tip: "Elements placed in flowers. One number is a total; 3+1 is pollen + nectar.",
      group: "tele",
      kind: "count",
      max: 30,
      parts: ["flower_pollen", "flower_nectar"],
      partForms: ["Pollen", "Nectar"],
    }),
    col({
      key: "flower_miss",
      label: "Ms",
      form: "Flower miss",
      tip: "Missed flower placements.",
      group: "tele",
      kind: "count",
      max: 30,
      hidden: true,
      note: "flower miss",
    }),
    col({
      key: "garden",
      label: "Gar",
      form: "Garden",
      tip: "Elements this robot placed in its garden. The official count is what remains at the buzzer, so this column is not checked against it.",
      group: "tele",
      kind: "count",
      max: 30,
    }),
    col({
      key: "garden_miss",
      label: "Ms",
      form: "Garden miss",
      tip: "Missed garden placements.",
      group: "tele",
      kind: "count",
      max: 30,
      hidden: true,
      note: "garden miss",
    }),
    col({
      key: "tele_park",
      label: "Pk",
      form: "Park",
      tip: "In the loading zone when the match ends (5 pts).",
      group: "end",
      kind: "bool",
      credit: 5,
      officialRobot: robotBool("teleopRobot1Park", "teleopRobot2Park"),
      reconcile: true,
    }),
    col({
      key: "minor",
      label: "Min",
      form: "Minor fouls",
      tip: "Minor fouls by this robot (5 pts to the opponent).",
      group: "foul",
      kind: "count",
      max: 15,
      officialAlliance: allianceCount("minorFouls"),
      reconcile: true,
    }),
    col({
      key: "major",
      label: "Maj",
      form: "Major fouls",
      tip: "Major fouls by this robot (20 pts to the opponent).",
      group: "foul",
      kind: "count",
      max: 10,
      officialAlliance: allianceCount("majorFouls"),
      reconcile: true,
    }),
  ],
  actions: [
    {
      key: "pollen",
      label: "Pollen",
      period: "auto",
      group: "flower",
      adds: [{ column: "flower_pollen" }],
      where: FLOWERS,
    },
    { key: "fmiss", label: "Fl miss", period: "auto", group: "flower", adds: [{ column: "flower_miss" }] },
    { key: "garden", label: "Garden", period: "auto", group: "garden", adds: [{ column: "garden" }] },
    { key: "gmiss", label: "Gar miss", period: "auto", group: "garden", adds: [{ column: "garden_miss" }] },
    {
      key: "pollen",
      label: "Pollen",
      period: "tele",
      group: "flower",
      adds: [{ column: "flower_pollen" }],
      where: FLOWERS,
    },
    {
      key: "nectar",
      label: "Nectar",
      period: "tele",
      group: "flower",
      adds: [{ column: "flower_nectar" }],
      where: FLOWERS,
    },
    { key: "fmiss", label: "Fl miss", period: "tele", group: "flower", adds: [{ column: "flower_miss" }] },
    { key: "garden", label: "Garden", period: "tele", group: "garden", adds: [{ column: "garden" }] },
    { key: "gmiss", label: "Gar miss", period: "tele", group: "garden", adds: [{ column: "garden_miss" }] },
    { key: "minor", label: "Minor", period: "tele", group: "foul", adds: [{ column: "minor" }] },
    { key: "major", label: "Major", period: "tele", group: "foul", adds: [{ column: "major" }] },
  ],
};

/** Station Red1 / Blue1 → robot 1, the API's robot1 fields. */
export const robotSlot = (station: string): 1 | 2 => (/2$/.test(station) ? 2 : 1);

const visibleColumns = (box: BoxScore) => box.columns.filter((c) => !c.hidden);

const lineKeys = (box: BoxScore): string[] => {
  const keys: string[] = [];
  for (const c of box.columns) {
    keys.push(c.key);
    if (c.parts) keys.push(c.parts[0], c.parts[1]);
  }
  return keys;
};

const knownKeys = (box: BoxScore) => new Set(lineKeys(box));

/** Play-by-play → counting columns. Tracked groups are filled with zeros even when nothing happened. */
export function compileLog(
  box: BoxScore,
  entries: readonly LogEntry[],
  tracked: readonly string[],
): Record<string, number> {
  const groups = new Set(tracked);
  const line: Record<string, number> = {};
  for (const action of box.actions) {
    if (!groups.has(action.group)) continue;
    for (const add of action.adds) line[add.column] = 0;
  }
  for (const entry of entries) {
    const action = box.actions.find((a) => a.key === entry.action && a.period === entry.period);
    if (!action || !groups.has(action.group)) continue;
    for (const add of action.adds) line[add.column] = (line[add.column] ?? 0) + (add.n ?? 1);
  }
  return line;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2) return s[mid] ?? 0;
  return Math.round(((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2);
};

const aggregate = (
  values: number[],
  kind: "bool" | "count",
  official: number | null,
  reconcile: boolean,
): Stat => {
  if (values.length === 0) {
    if (official != null)
      return { tracked: false, v: official, split: false, values: [], source: "official", clash: false };
    return { tracked: false, v: null, split: false, values: [], source: "none", clash: false };
  }
  const split = values.some((n) => n !== values[0]);
  let v: number | null;
  if (kind === "bool") {
    const yes = values.filter((n) => n === 1).length;
    v = yes * 2 === values.length ? null : yes * 2 > values.length ? 1 : 0;
  } else {
    v = median(values);
  }
  const clash = !!(reconcile && v != null && official != null && official !== v);
  return { tracked: true, v, split: split || v == null, values, source: "scout", clash };
};

const blank = (): Stat => ({
  tracked: false,
  v: null,
  split: false,
  values: [],
  source: "none",
  clash: false,
});

const cellCls = (s: Pick<Stat, "v" | "source" | "split" | "clash">): string =>
  [
    s.v == null ? "blank" : "",
    s.source === "official" ? "off" : "",
    s.clash ? "clash" : s.split ? "split" : "",
  ]
    .filter(Boolean)
    .join(" ");

const scoutList = (kind: "bool" | "count", values: number[]) =>
  kind === "bool" ? values.map((v) => (v ? "yes" : "no")).join(", ") : values.join(", ");

const statTitle = (s: Stat, kind: "bool" | "count", official: number | null): string | undefined => {
  const bits: string[] = [];
  if (s.source === "official")
    bits.push(s.v === 0 && kind === "bool" ? "Official scorekeeper: no" : "Official scorekeeper");
  if (s.split && s.values.length) bits.push(`Scouts: ${scoutList(kind, s.values)}`);
  if (s.clash && official != null)
    bits.push(`Official ${kind === "bool" ? (official ? "yes" : "no") : official}`);
  if (!bits.length && kind === "bool" && s.v === 0 && s.source === "scout") return "No";
  return bits.length ? bits.join(" · ") : undefined;
};

const countCell = (s: Stat, kind: "bool" | "count", official: number | null): BoxCell => ({
  text: s.v == null ? "–" : kind === "bool" ? (s.v ? "✓" : "·") : String(s.v),
  title: statTitle(s, kind, official),
  cls: cellCls(s),
  num: s.v,
});

const flowerCell = (column: BoxColumn, stats: Record<string, Stat>): BoxCell => {
  const pk = column.parts?.[0] ?? "";
  const nk = column.parts?.[1] ?? "";
  const pollen = stats[pk] ?? blank();
  const nectar = stats[nk] ?? blank();
  const total = stats[column.key] ?? blank();
  if (pollen.tracked || nectar.tracked) {
    const both = pollen.tracked && nectar.tracked && pollen.v != null && nectar.v != null;
    const split = pollen.split || nectar.split;
    const forms = column.partForms ?? ["pollen", "nectar"];
    const title = [
      pollen.tracked && pollen.v != null
        ? `${pollen.v} ${forms[0].toLowerCase()}`
        : `${forms[0]} not recorded`,
      nectar.tracked && nectar.v != null
        ? `${nectar.v} ${forms[1].toLowerCase()}`
        : `${forms[1]} not recorded`,
      split ? "Scouts differ" : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      text: `${pollen.tracked && pollen.v != null ? pollen.v : "–"}+${nectar.tracked && nectar.v != null ? nectar.v : "–"}`,
      title,
      cls: cellCls({ v: pollen.v ?? nectar.v, source: "scout", split, clash: false }),
      num: both ? (pollen.v ?? 0) + (nectar.v ?? 0) : null,
    };
  }
  if (total.tracked || total.split) return countCell(total, "count", null);
  return { text: "–", cls: "blank", num: null };
};

const accuracy = (label: string, made: Stat | undefined, miss: Stat | undefined): string | null => {
  if (!made?.tracked && !miss?.tracked) return null;
  const star = made?.split || miss?.split ? "*" : "";
  if (made?.tracked && made.v != null && miss?.tracked && miss.v != null) {
    if (made.v === 0 && miss.v === 0 && !star) return null;
    return `${label} ${made.v}/${made.v + miss.v}${star}`;
  }
  if (made?.tracked && made.v != null) return `${label} ${made.v} in${star}`;
  if (miss?.tracked && miss.v != null) return `${label} miss ${miss.v}${star}`;
  return null;
};

interface QualAgg {
  v: string | number | null;
  split: boolean;
}

const majority = (vals: (string | number)[]): QualAgg | null => {
  if (!vals.length) return null;
  const counts = new Map<string | number, number>();
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | number | null = null;
  let n = 0;
  let tied = false;
  for (const [v, c] of counts) {
    if (c > n) {
      best = v;
      n = c;
      tied = false;
    } else if (c === n) tied = true;
  }
  if (tied || best == null) return { v: null, split: true };
  return { v: best, split: counts.size > 1 };
};

const qualBits = (box: BoxScore, agg: Record<string, QualAgg | null>): string[] => {
  const bits: string[] = [];
  for (const q of box.qual) {
    const a = agg[q.key];
    if (!a) continue;
    if (a.v == null) {
      if (a.split) bits.push(`${q.label.toLowerCase()}*`);
      continue;
    }
    if (q.kind === "bool") {
      const text = a.v === 1 ? q.yes : q.no;
      if (text) bits.push(text + (a.split ? "*" : ""));
    } else {
      const opt = q.options?.find((o) => o.value === a.v);
      if (opt?.note) bits.push(opt.note + (a.split ? "*" : ""));
    }
  }
  return bits;
};

const noteBits = (reports: readonly BoxReport[]): string[] => {
  const out: string[] = [];
  for (const r of reports) {
    const note = typeof r.qual.note === "string" ? r.qual.note.trim() : "";
    if (note) out.push(r.by ? `${r.by}: ${note}` : note);
  }
  return out;
};

const subLine = (
  box: BoxScore,
  stats: Record<string, Stat>,
  quals: Record<string, QualAgg | null>,
  notes: string[],
) => {
  const bits: string[] = [];
  for (const c of box.columns) {
    if (c.pair && c.pairLabel) {
      const bit = accuracy(c.pairLabel, stats[c.key], c.pair ? stats[c.pair] : undefined);
      if (bit) bits.push(bit);
    } else if (c.note) {
      const s = stats[c.key];
      if (s?.tracked && s.v != null && (s.v > 0 || s.split))
        bits.push(`${c.note} ${s.v}${s.split ? "*" : ""}`);
    }
  }
  bits.push(...qualBits(box, quals));
  if (box.noteMax > 0) bits.push(...notes);
  return bits.join(" · ");
};

const creditOf = (box: BoxScore, stats: Record<string, Stat>) => {
  let pts = 0;
  let any = false;
  const missing: string[] = [];
  for (const c of box.columns) {
    if (!c.credit) continue;
    const s = stats[c.key];
    if (!s || s.v == null) {
      missing.push(c.form.toLowerCase());
      continue;
    }
    any = true;
    pts += s.v * c.credit;
  }
  if (!any)
    return { text: "–", title: "Nothing attributable recorded", pts: null as number | null, partial: true };
  const partial = missing.length > 0;
  const title = partial
    ? `At least ${pts}. Not recorded: ${missing.join(", ")}. Leave is 3, each park is 5.`
    : "Leave (3) and each park (5).";
  return { text: partial ? `${pts}+` : String(pts), title, pts, partial };
};

const officialForRobot = (
  column: BoxColumn,
  score: ApiScore | undefined,
  station: string,
  played: boolean,
) => {
  if (!played || !score || !column.officialRobot) return null;
  const v = column.officialRobot(score, robotSlot(station));
  return v == null ? null : v ? 1 : 0;
};

const statsFor = (
  box: BoxScore,
  team: BoxTeamIn,
  reports: readonly BoxReport[],
  score: ApiScore | undefined,
  played: boolean,
): Record<string, Stat> => {
  const mine = reports.filter((r) => r.team === team.team);
  const stats: Record<string, Stat> = {};
  for (const key of lineKeys(box)) {
    const column = box.columns.find((c) => c.key === key);
    const values = mine.flatMap((r) => (key in r.line ? [r.line[key] as number] : []));
    const official = column ? officialForRobot(column, score, team.station, played) : null;
    stats[key] = aggregate(
      values,
      column?.kind ?? "count",
      official,
      !!column?.reconcile && !!column.officialRobot,
    );
  }
  return stats;
};

const qualsFor = (box: BoxScore, reports: readonly BoxReport[]): Record<string, QualAgg | null> => {
  const agg: Record<string, QualAgg | null> = {};
  for (const q of box.qual) {
    const vals = reports.flatMap((r) => (q.key in r.qual ? [r.qual[q.key] as string | number] : []));
    agg[q.key] = majority(vals);
  }
  return agg;
};

const emptyCell = (): BoxCell => ({ text: "–", cls: "blank", num: null });

const totalCell = (
  column: BoxColumn,
  robots: { stats: Record<string, Stat>; cells: BoxCell[] }[],
  index: number,
  officialSum: number | null,
): BoxCell => {
  if (column.officialOnly) {
    if (officialSum == null) return emptyCell();
    return { text: String(officialSum), num: officialSum, cls: "off", title: "Official scorekeeper" };
  }
  if (column.parts) {
    const nums = robots.map((r) => r.cells[index]?.num ?? null);
    if (nums.some((n) => n == null)) return emptyCell();
    const sum = nums.reduce<number>((a, b) => a + (b ?? 0), 0);
    return { text: String(sum), num: sum, cls: "" };
  }
  const stats = robots.map((r) => r.stats[column.key] ?? blank());
  if (stats.some((s) => s.v == null)) return emptyCell();
  const sum = stats.reduce((a, s) => a + (s.v ?? 0), 0);
  const allScout = stats.every((s) => s.source === "scout");
  const clash = !!(column.reconcile && allScout && officialSum != null && officialSum !== sum);
  const mixed = stats.some((s) => s.source === "official");
  return {
    text: String(sum),
    num: sum,
    cls: clash ? "clash" : "",
    title: clash
      ? `Scouted ${sum}, official ${officialSum}`
      : mixed
        ? "Includes official scorekeeper figures"
        : undefined,
  };
};

const officialSumFor = (
  column: BoxColumn,
  teams: readonly BoxTeamIn[],
  score: ApiScore | undefined,
  played: boolean,
) => {
  if (!played || !score) return null;
  if (column.officialAlliance) return column.officialAlliance(score);
  if (!column.officialRobot) return null;
  let sum = 0;
  for (const t of teams) {
    const v = officialForRobot(column, score, t.station, true);
    if (v == null) return null;
    sum += v;
  }
  return sum;
};

const sideCredit = (credits: { pts: number | null; partial: boolean }[]) => {
  if (credits.every((c) => c.pts == null)) return { text: "–", title: "Nothing attributable recorded" };
  const pts = credits.reduce((a, c) => a + (c.pts ?? 0), 0);
  const partial = credits.some((c) => c.partial || c.pts == null);
  return {
    text: partial ? `${pts}+` : String(pts),
    title: partial ? `At least ${pts}` : "Leave and parks.",
  };
};

const summarize = (box: BoxScore, report: BoxReport): string => {
  const bits: string[] = [];
  for (const c of visibleColumns(box)) {
    if (c.officialOnly) continue;
    if (c.parts) {
      const a = report.line[c.parts[0]];
      const b = report.line[c.parts[1]];
      const t = report.line[c.key];
      if (a != null || b != null) bits.push(`${a ?? "–"}+${b ?? "–"} ${c.form.toLowerCase()}`);
      else if (t != null) bits.push(`${t} ${c.form.toLowerCase()}`);
      continue;
    }
    const v = report.line[c.key];
    if (v == null) continue;
    bits.push(
      c.kind === "bool" ? (v ? c.form : `no ${c.form.toLowerCase()}`) : `${v} ${c.form.toLowerCase()}`,
    );
  }
  const fake: Record<string, QualAgg | null> = {};
  for (const q of box.qual)
    fake[q.key] = q.key in report.qual ? { v: report.qual[q.key] ?? null, split: false } : null;
  bits.push(...qualBits(box, fake));
  if (box.noteMax > 0) {
    const note = typeof report.qual.note === "string" ? report.qual.note.trim() : "";
    if (note) bits.push(`“${note}”`);
  }
  return bits.join(" · ");
};

/** Consensus line per robot, with official leave/park filling cells nobody scouted. */
export function buildBoxScore(
  box: BoxScore,
  teams: readonly BoxTeamIn[],
  reports: readonly BoxReport[],
  scores: { R?: ApiScore; B?: ApiScore },
  played: boolean,
): BoxTable {
  const columns = visibleColumns(box);
  const ordered = [...teams].sort((a, b) =>
    a.alliance === b.alliance ? a.station.localeCompare(b.station) : a.alliance === "R" ? -1 : 1,
  );
  const sides: BoxSide[] = [];
  for (const alliance of ["R", "B"] as const) {
    const members = ordered.filter((t) => t.alliance === alliance);
    if (!members.length) continue;
    const score = scores[alliance];
    const built = members.map((team) => {
      const mine = reports.filter((r) => r.team === team.team);
      const stats = statsFor(box, team, reports, score, played);
      const credit = creditOf(box, stats);
      const cells = columns.map((c) =>
        c.officialOnly
          ? emptyCell()
          : c.parts
            ? flowerCell(c, stats)
            : countCell(stats[c.key] ?? blank(), c.kind, officialForRobot(c, score, team.station, played)),
      );
      const row: BoxRobotRow = {
        team: team.team,
        name: team.name,
        av: team.av,
        alliance,
        surrogate: team.surrogate,
        dq: team.dq,
        noShow: team.noShow,
        cells,
        sub: subLine(box, stats, qualsFor(box, mine), noteBits(mine)),
        credit: credit.text,
        creditTitle: credit.title,
      };
      return { row, stats, cells, credit };
    });
    sides.push({
      alliance,
      label: alliance === "R" ? "Red" : "Blue",
      robots: built.map((b) => b.row),
      totals: columns.map((c, i) => totalCell(c, built, i, officialSumFor(c, members, score, played))),
      ...(() => {
        const c = sideCredit(built.map((b) => b.credit));
        return { credit: c.text, creditTitle: c.title };
      })(),
    });
  }
  return {
    groups: groupsOf(columns),
    headers: columns.map((c) => ({ label: c.label, tip: c.tip })),
    sides,
    cards: reports.map((r) => ({
      id: r.id,
      team: r.team,
      by: r.by,
      mode: r.mode,
      when: r.createdAt.slice(5, 16).replace("T", " "),
      summary: summarize(box, r) || "(no counting stats)",
    })),
  };
}

const groupsOf = (columns: readonly BoxColumn[]) => {
  const out: { label: string; span: number }[] = [];
  for (const c of columns) {
    const label = GROUP_LABEL[c.group];
    const last = out[out.length - 1];
    if (last && last.label === label) last.span += 1;
    else out.push({ label, span: 1 });
  }
  return out;
};

const withoutControls = (s: string, replacement: string) => {
  let out = "";
  for (const ch of s) out += ch.charCodeAt(0) < 32 ? replacement : ch;
  return out;
};

const cleanName = (s: string): string | null => {
  const t = withoutControls(s, "").trim().slice(0, 40);
  return t || null;
};

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const parseCount = (raw: string, max: number, label: string): Parsed<number> | null => {
  const s = raw.trim();
  if (!s) return null;
  if (!/^\d+$/.test(s)) return { ok: false, error: `${label} has to be a whole number.` };
  const v = Number(s);
  if (v > max) return { ok: false, error: `${label} looks too high.` };
  return { ok: true, value: v };
};

const takeCount = (
  raw: string,
  max: number,
  label: string,
  into: Record<string, number>,
  key: string,
): string | null => {
  const p = parseCount(raw, max, label);
  if (!p) return null;
  if (!p.ok) return p.error;
  into[key] = p.value;
  return null;
};

const boolFields = (
  box: BoxScore,
  fields: Record<string, string>,
  into: Record<string, number>,
): string | null => {
  for (const c of box.columns) {
    if (c.hidden || c.kind !== "bool") continue;
    const raw = (fields[`c_${c.key}`] ?? "").trim();
    if (!raw) continue;
    if (raw !== "0" && raw !== "1") return `${c.form} wasn't a yes or no.`;
    into[c.key] = Number(raw);
  }
  return null;
};

const countFields = (
  box: BoxScore,
  fields: Record<string, string>,
  into: Record<string, number>,
): string | null => {
  for (const c of box.columns) {
    if (c.hidden || c.officialOnly || c.kind !== "count") continue;
    if (c.parts) {
      const aRaw = fields[`c_${c.parts[0]}`] ?? "";
      const bRaw = fields[`c_${c.parts[1]}`] ?? "";
      if (aRaw.trim() || bRaw.trim()) {
        const forms = c.partForms ?? c.parts;
        const ea = takeCount(aRaw, c.max ?? 40, forms[0], into, c.parts[0]);
        if (ea) return ea;
        const eb = takeCount(bRaw, c.max ?? 40, forms[1], into, c.parts[1]);
        if (eb) return eb;
      } else {
        const e = takeCount(fields[`c_${c.key}`] ?? "", c.max ?? 40, c.form, into, c.key);
        if (e) return e;
      }
      continue;
    }
    const e = takeCount(fields[`c_${c.key}`] ?? "", c.max ?? 40, c.form, into, c.key);
    if (e) return e;
  }
  return null;
};

const qualFields = (
  box: BoxScore,
  fields: Record<string, string>,
): Parsed<Record<string, string | number>> => {
  const qual: Record<string, string | number> = {};
  for (const q of box.qual) {
    const raw = (fields[`q_${q.key}`] ?? "").trim();
    if (!raw) continue;
    if (q.kind === "bool") {
      if (raw !== "0" && raw !== "1") return { ok: false, error: `${q.label} wasn't a yes or no.` };
      qual[q.key] = Number(raw);
    } else if (!q.options?.some((o) => o.value === raw)) {
      return { ok: false, error: `${q.label} wasn't one of the choices.` };
    } else qual[q.key] = raw;
  }
  if (box.noteMax > 0) {
    const note = withoutControls(fields.note ?? "", " ").trim();
    if (note.length > box.noteMax)
      return { ok: false, error: `The note has to be ${box.noteMax} characters or fewer.` };
    if (note) qual.note = note;
  }
  return { ok: true, value: qual };
};

/** Validate a submission. Blank counting fields stay off the line; a play-by-play writes zeros for checked groups. */
export function parseScoutForm(
  box: BoxScore,
  teams: readonly number[],
  fields: Record<string, string>,
  tracked: readonly string[],
): Parsed<ScoutInput> {
  const team = Number(fields.team);
  if (!Number.isInteger(team) || !teams.includes(team))
    return { ok: false, error: "Pick a robot from this match." };
  const mode = fields.mode === "log" ? "log" : fields.mode === "line" ? "line" : null;
  if (!mode) return { ok: false, error: "Pick a quick line or a play-by-play." };
  const by = cleanName(fields.by ?? "");
  const qual = qualFields(box, fields);
  if (!qual.ok) return qual;

  const line: Record<string, number> = {};
  const boolErr = boolFields(box, fields, line);
  if (boolErr) return { ok: false, error: boolErr };

  let log: LogEntry[] = [];
  if (mode === "log") {
    const groups = tracked.filter((g) => box.trackGroups.some((t) => t.key === g));
    if (!groups.length) return { ok: false, error: "Check at least one group you actually watched." };
    const parsed = parseLog(box, fields.log ?? "");
    if (!parsed.ok) return parsed;
    const groupsOn = new Set(groups);
    log = parsed.value.filter((entry) => {
      const action = box.actions.find((a) => a.key === entry.action && a.period === entry.period);
      return !!action && groupsOn.has(action.group);
    });
    if (!log.length) return { ok: false, error: "Add at least one action, or switch back to a quick line." };
    Object.assign(line, compileLog(box, log, groups));
  } else {
    const countErr = countFields(box, fields, line);
    if (countErr) return { ok: false, error: countErr };
    if (!Object.keys(line).length && !Object.keys(qual.value).length)
      return { ok: false, error: "Enter at least one fact about this robot." };
  }
  return { ok: true, value: { team, by, mode, line, qual: qual.value, log } };
}

const parseLog = (box: BoxScore, json: string): Parsed<LogEntry[]> => {
  if (!json.trim()) return { ok: true, value: [] };
  if (json.length > 12_000) return { ok: false, error: "That play-by-play is too long." };
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: "The play-by-play didn't come through." };
  }
  if (!Array.isArray(data)) return { ok: false, error: "The play-by-play didn't come through." };
  if (data.length > 80) return { ok: false, error: "A card can hold 80 actions." };
  const entries: LogEntry[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") return { ok: false, error: "The play-by-play didn't come through." };
    const rec = row as Record<string, unknown>;
    const period = rec.period === "auto" || rec.period === "tele" ? rec.period : null;
    const action = typeof rec.action === "string" ? rec.action : "";
    const spec = period ? box.actions.find((a) => a.key === action && a.period === period) : undefined;
    if (!period || !spec) return { ok: false, error: "The play-by-play has an unknown action." };
    let where: string | undefined;
    if (rec.where != null && rec.where !== "") {
      if (typeof rec.where !== "string" || !spec.where?.some((w) => w.key === rec.where))
        return { ok: false, error: "The play-by-play has an unknown flower." };
      where = rec.where;
    }
    entries.push(where ? { period, action, where } : { period, action });
  }
  return { ok: true, value: entries };
};

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 99;

/** Defensive read of a stored line. Unknown or garbage keys are dropped. */
export function readLine(json: string, box?: BoxScore): Record<string, number> {
  const allow = box ? knownKeys(box) : null;
  try {
    const v = JSON.parse(json) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const line: Record<string, number> = {};
    for (const [k, n] of Object.entries(v)) {
      if (allow && !allow.has(k)) continue;
      if (isInt(n)) line[k] = n;
    }
    return line;
  } catch {
    return {};
  }
}

export function readQual(json: string): Record<string, string | number> {
  try {
    const v = JSON.parse(json) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const qual: Record<string, string | number> = {};
    for (const [k, n] of Object.entries(v)) {
      if (k.length > 20) continue;
      if (typeof n === "string" && n.length <= 200) qual[k] = n;
      else if (isInt(n)) qual[k] = n;
    }
    return qual;
  } catch {
    return {};
  }
}

export function readLog(json: string | null): LogEntry[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json) as unknown;
    if (!Array.isArray(v)) return [];
    const out: LogEntry[] = [];
    for (const row of v) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      if (rec.period !== "auto" && rec.period !== "tele") continue;
      if (typeof rec.action !== "string") continue;
      const entry: LogEntry = { period: rec.period, action: rec.action };
      if (typeof rec.where === "string") entry.where = rec.where;
      out.push(entry);
    }
    return out;
  } catch {
    return [];
  }
}

/** What the play-by-play clicker needs. Labels are ours, so the JSON is safe to embed. */
export function scoutClientSpec(box: BoxScore) {
  return {
    actions: box.actions.map((a) => ({
      key: a.key,
      period: a.period,
      label: a.label,
      group: a.group,
      where: a.where ?? null,
    })),
    groups: box.trackGroups,
  };
}
