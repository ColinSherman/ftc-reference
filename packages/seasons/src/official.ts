/**
 * Event kinds FTC Scout calls Official. Used by the events-list filter.
 * Advancement events run under the season's rules.
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

/**
 * Kinds that count toward season records and leaderboards by default.
 * Non-advancement (what FIRST now calls scrimmages, including the old Scrimmage label)
 * is included because FTC Scout's leaderboards count those results. Off-season is not;
 * a header switch adds it back.
 */
export const SEASON_KINDS = [...OFFICIAL_KINDS, "NonAdvancement", "Scrimmage"] as const;

/** `alias.kind IN ('LeagueMeet',…)` — kinds are a fixed list, safe to inline. */
export const kindIn = (kinds: readonly string[], alias = "e") =>
  `${alias}.kind IN (${kinds.map((k) => `'${k}'`).join(",")})`;

export const officialKindIn = (alias = "e") => kindIn(OFFICIAL_KINDS, alias);
export const seasonKindIn = (alias = "e") => kindIn(SEASON_KINDS, alias);
