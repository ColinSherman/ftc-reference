/**
 * Event kinds that count toward season records and leaderboards.
 * Same set FTC Scout calls Official: advancement events run under the season's rules.
 * Scrimmages are stored as NonAdvancement (FIRST relabeled them), and OffSeason is separate.
 * Neither counts unless the viewer asks to include them.
 */
export const OFFICIAL_KINDS = [
  "LeagueMeet",
  "Qualifier",
  "LeagueTournament",
  "Championship",
  "FIRSTChampionship",
  "SuperQualifier",
  "Premier",
  "Pilot",
] as const;

/** `alias.kind IN ('LeagueMeet',…)` — kinds are a fixed list, safe to inline. */
export const officialKindIn = (alias = "e") =>
  `${alias}.kind IN (${OFFICIAL_KINDS.map((k) => `'${k}'`).join(",")})`;
