/** Titles and meta descriptions for the pages search engines index. Pure functions so they can be tested. */

/** Search snippets cut off around 155-160 characters; trim at a word boundary and add an ellipsis. */
export function clip(s: string, max = 158): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > max * 0.6 ? cut.lastIndexOf(" ") : cut.length).replace(/[\s,;:–-]+$/, "")}…`;
}

const place = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(", ");

const range = (a: string, b: string) => {
  const s = a.slice(0, 10);
  const e = b.slice(0, 10);
  return s === e ? s : `${s} to ${e}`;
};

interface EventMetaIn {
  name: string;
  type_name: string | null;
  city: string | null;
  state_prov: string | null;
  country: string | null;
  date_start: string;
  date_end: string;
  remote: number;
}

/** `played`/`scheduled` come from synced match rows, so the text changes exactly when the page's data does. */
export function eventMeta(
  ev: EventMetaIn,
  game: string,
  seasonName: string,
  played: number,
  scheduled: number,
) {
  const kind = ev.remote ? `${ev.type_name ?? "Event"}, remote` : (ev.type_name ?? "Event");
  const where = ev.remote ? "" : place(ev.city, ev.state_prov, ev.country);
  const status =
    scheduled === 0
      ? "Schedule not posted yet"
      : played === 0
        ? `${scheduled} matches scheduled`
        : `${played} of ${scheduled} matches played`;
  return {
    title: `${ev.name} ${seasonName} ${game} Results`,
    description: clip(
      `${ev.name} (${kind})${where ? ` in ${where}` : ""}, ${range(ev.date_start, ev.date_end)}. ${status}: rankings, match results, OPR and awards for the ${seasonName} ${game} season.`,
    ),
  };
}

interface TeamMetaIn {
  number: number;
  name: string | null;
  city: string | null;
  state_prov: string | null;
  country: string | null;
  rookie_year: number | null;
}

export function teamMeta(
  t: TeamMetaIn,
  seasons: number,
  latest: {
    seasonName: string;
    game: string;
    events: number;
    wins: number;
    losses: number;
    ties: number;
    bestOpr: number | null;
  } | null,
) {
  const where = place(t.city, t.state_prov, t.country);
  const name = t.name ? ` ${t.name}` : "";
  const rec = latest?.events
    ? ` ${latest.seasonName} ${latest.game}: ${latest.wins}-${latest.losses}-${latest.ties} at ${latest.events} event${latest.events === 1 ? "" : "s"}${latest.bestOpr != null ? `, best OPR ${latest.bestOpr.toFixed(1)}` : ""}.`
    : "";
  return {
    title: `FTC Team ${t.number}${name}${where ? ` – ${where}` : ""}`,
    description: clip(
      `FTC Team ${t.number}${name}${where ? ` from ${where}` : ""}${t.rookie_year ? `, rookie year ${t.rookie_year}` : ""}.${rec} OPR, records, match results and awards across ${seasons} season${seasons === 1 ? "" : "s"}.`,
    ),
  };
}

export function matchMeta(
  label: string,
  eventName: string,
  game: string,
  seasonName: string,
  m: { played: boolean; remote: boolean; red: number | null; blue: number | null; winner: string | null },
  redTeams: number[],
  blueTeams: number[],
) {
  const title = `${label} – ${eventName} (${seasonName} ${game})`;
  const teams = m.remote
    ? `Team ${redTeams.join(", ")}`
    : `Red ${redTeams.join(" & ")} vs Blue ${blueTeams.join(" & ")}`;
  let result = "";
  if (m.played && m.red != null) {
    if (m.remote) result = `Score ${m.red}. `;
    else if (m.blue != null) {
      const w = m.winner === "R" ? "Red wins" : m.winner === "B" ? "Blue wins" : "Tie";
      result = `${w} ${Math.max(m.red, m.blue)}–${Math.min(m.red, m.blue)}. `;
    }
  }
  return {
    title,
    description: clip(
      `${label} at ${eventName} (${seasonName} ${game}): ${result}${teams}. Full score breakdown and match video.`,
    ),
  };
}
