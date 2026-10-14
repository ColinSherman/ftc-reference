-- Multi-season: one set of score/stat tables keyed by season, replacing the BIOBUZZ-only s2026_* tables.
-- Every season maps its API scores into the same generic columns (auto/teleop/endgame/np/total/fouls and
-- four season-specific components c1..c4, defined in packages/seasons). The raw API JSON is kept in
-- `detail` so each season's full breakdown can be rendered.

INSERT INTO seasons (year, game_name, program_season, kickoff, is_current) VALUES
  (2019, 'SKYSTONE', 'FIRST RISE', '2019-09-07', 0),
  (2020, 'ULTIMATE GOAL', 'FIRST GAME CHANGERS', '2020-09-12', 0),
  (2021, 'FREIGHT FRENZY', 'FIRST FORWARD', '2021-09-18', 0),
  (2022, 'POWERPLAY', 'FIRST ENERGIZE', '2022-09-10', 0),
  (2023, 'CENTERSTAGE', 'FIRST IN SHOW', '2023-09-09', 0),
  (2024, 'INTO THE DEEP', 'FIRST DIVE', '2024-09-07', 0),
  (2025, 'DECODE', 'FIRST AGE', '2025-09-06', 0)
ON CONFLICT (year) DO NOTHING;

-- Backfill state machine (driven by the sync Worker's per-minute cron):
--   NULL → 'events' (events/teams/leagues queued) → 'matches' (every event queued) → done (backfilled_at set)
ALTER TABLE seasons ADD COLUMN backfill_stage TEXT;
ALTER TABLE seasons ADD COLUMN backfill_stage_at TEXT;
ALTER TABLE seasons ADD COLUMN backfilled_at TEXT;

-- Normalised event type (FTCScout-style: "League Meet" → LeagueMeet) for the events filter.
ALTER TABLE events ADD COLUMN kind TEXT;
UPDATE events SET kind = replace(replace(replace(type_name, ' ', ''), '-', ''), '/', '');
CREATE INDEX events_by_kind ON events (season, kind);

-- Historical per-season team name (teams.* holds the current one).
ALTER TABLE team_seasons ADD COLUMN name_short TEXT;

CREATE TABLE match_scores (
  match_id    INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  alliance    TEXT NOT NULL,          -- R | B (remote events: R, one team)
  season      INTEGER NOT NULL,
  auto        INTEGER NOT NULL,
  teleop      INTEGER NOT NULL,       -- driver-controlled incl. endgame (= np - auto)
  endgame     INTEGER NOT NULL,
  np          INTEGER NOT NULL,       -- no-penalty total
  total       INTEGER NOT NULL,
  fouls       INTEGER,                -- penalty points committed
  c1 REAL NOT NULL, c2 REAL NOT NULL, c3 REAL NOT NULL, c4 REAL NOT NULL,
  detail      TEXT NOT NULL,          -- raw API JSON for this alliance
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (match_id, alliance)
) STRICT;
CREATE INDEX match_scores_by_np ON match_scores (season, np DESC);

CREATE TABLE team_event_stats (
  season       INTEGER NOT NULL,
  event_code   TEXT NOT NULL,
  team         INTEGER NOT NULL,
  played       INTEGER NOT NULL,
  wins         INTEGER NOT NULL,
  losses       INTEGER NOT NULL,
  ties         INTEGER NOT NULL,
  rank         INTEGER,
  opr_np       REAL, opr_total REAL, opr_auto REAL, opr_teleop REAL, opr_endgame REAL,
  opr_c1       REAL, opr_c2 REAL, opr_c3 REAL, opr_c4 REAL,
  opr_fouls    REAL,
  dpr          REAL,
  ccwm         REAL,
  avg_np       REAL, avg_auto REAL, avg_teleop REAL,
  max_np       INTEGER, min_np INTEGER, std_np REAL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (season, event_code, team)
) STRICT, WITHOUT ROWID;
CREATE INDEX tes_by_team ON team_event_stats (team, season);
CREATE INDEX tes_by_opr  ON team_event_stats (season, opr_np DESC);

CREATE TABLE team_season_stats (
  season            INTEGER NOT NULL,
  team              INTEGER NOT NULL,
  events_played     INTEGER NOT NULL,
  played            INTEGER NOT NULL,
  wins              INTEGER NOT NULL,
  losses            INTEGER NOT NULL,
  ties              INTEGER NOT NULL,
  best_event        TEXT,
  best_opr_np       REAL,
  best_opr_auto     REAL,
  best_opr_teleop   REAL,
  best_opr_endgame  REAL,
  best_opr_c1       REAL, best_opr_c2 REAL, best_opr_c3 REAL, best_opr_c4 REAL,
  latest_event      TEXT,
  latest_opr_np     REAL,
  best_np_match_id  INTEGER,
  best_np           INTEGER,
  updated_at        TEXT NOT NULL,
  PRIMARY KEY (season, team)
) STRICT, WITHOUT ROWID;
CREATE INDEX tss_by_np     ON team_season_stats (season, best_opr_np DESC);
CREATE INDEX tss_by_team   ON team_season_stats (team);

-- BIOBUZZ data is re-synced into the new tables (raw API JSON is needed for `detail`).
DROP TABLE s2026_team_season_stats;
DROP TABLE s2026_team_event_stats;
DROP TABLE s2026_match_scores;
UPDATE seasons SET backfill_stage = NULL, backfilled_at = NULL;
