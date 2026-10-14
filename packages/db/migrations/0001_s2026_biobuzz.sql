-- BIOBUZZ presented by RTX (2026-27). Point fields are stored exactly as the FTC API computes them.
-- Flowers are encoded bottom-to-top as strings: R = RED_NECTAR, B = BLUE_NECTAR, P = POLLEN.

CREATE TABLE s2026_match_scores (
  match_id               INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  alliance               TEXT NOT NULL,      -- R | B
  -- auto
  auto_r1_leave          INTEGER NOT NULL,
  auto_r2_leave          INTEGER NOT NULL,
  auto_r1_park           INTEGER NOT NULL,
  auto_r2_park           INTEGER NOT NULL,
  auto_hive_tips         INTEGER NOT NULL,
  auto_leave_pts         INTEGER NOT NULL,
  auto_park_pts          INTEGER NOT NULL,
  auto_hive_pts          INTEGER NOT NULL,
  auto_pts               INTEGER NOT NULL,
  -- teleop
  teleop_hive_tips       INTEGER NOT NULL,
  teleop_hive_pieces     INTEGER NOT NULL,   -- POLLEN/NECTAR in up-facing CELLs
  teleop_garden_pieces   INTEGER NOT NULL,
  teleop_r1_park         INTEGER NOT NULL,
  teleop_r2_park         INTEGER NOT NULL,
  flower_red             TEXT NOT NULL DEFAULT '',
  flower_blue            TEXT NOT NULL DEFAULT '',
  flower_scoring         TEXT NOT NULL DEFAULT '',
  flower_audience        TEXT NOT NULL DEFAULT '',
  teleop_hive_pts        INTEGER NOT NULL,
  teleop_flower_pts      INTEGER NOT NULL,
  teleop_garden_pts      INTEGER NOT NULL,
  teleop_park_pts        INTEGER NOT NULL,
  teleop_pts             INTEGER NOT NULL,
  -- fouls / totals
  major_fouls            INTEGER NOT NULL,
  minor_fouls            INTEGER NOT NULL,
  foul_pts_committed     INTEGER NOT NULL,
  pre_foul_total         INTEGER NOT NULL,
  total_pts              INTEGER NOT NULL,
  -- ranking points
  swarm_rp               INTEGER NOT NULL,
  pollinator1_rp         INTEGER NOT NULL,
  pollinator2_rp         INTEGER NOT NULL,
  -- derived at ingest (cheap leaderboard scans)
  total_tips             INTEGER NOT NULL,
  flower_pieces          INTEGER NOT NULL,   -- pieces in flowers this alliance owns
  flowers_owned          INTEGER NOT NULL,
  bottom_nectar_bonuses  INTEGER NOT NULL,
  updated_at             TEXT NOT NULL,
  PRIMARY KEY (match_id, alliance)
) STRICT, WITHOUT ROWID;

CREATE TABLE s2026_team_event_stats (
  event_code   TEXT NOT NULL,
  team         INTEGER NOT NULL,
  played       INTEGER NOT NULL,
  wins         INTEGER NOT NULL,
  losses       INTEGER NOT NULL,
  ties         INTEGER NOT NULL,
  rank         INTEGER,
  rp_avg       REAL,
  -- OPR components (least squares over qual matches)
  opr_total    REAL,
  opr_np       REAL,
  opr_auto     REAL,
  opr_teleop   REAL,
  opr_tips     REAL,
  opr_hive     REAL,
  opr_flower   REAL,
  opr_garden   REAL,
  opr_park     REAL,
  opr_fouls    REAL,  -- foul points this team's alliances gave away
  dpr          REAL,
  ccwm         REAL,
  -- raw alliance averages (partner-inclusive)
  avg_np       REAL,
  avg_auto     REAL,
  avg_teleop   REAL,
  avg_tips     REAL,
  max_np       INTEGER,
  min_np       INTEGER,
  std_np       REAL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (event_code, team)
) STRICT, WITHOUT ROWID;
CREATE INDEX s2026_tes_by_team   ON s2026_team_event_stats (team);
CREATE INDEX s2026_tes_by_opr_np ON s2026_team_event_stats (opr_np DESC);

CREATE TABLE s2026_team_season_stats (
  team             INTEGER PRIMARY KEY,
  events_played    INTEGER NOT NULL,
  played           INTEGER NOT NULL,
  wins             INTEGER NOT NULL,
  losses           INTEGER NOT NULL,
  ties             INTEGER NOT NULL,
  best_event       TEXT,
  best_opr_np      REAL,
  best_opr_auto    REAL,
  best_opr_teleop  REAL,
  best_opr_tips    REAL,
  best_opr_flower  REAL,
  latest_event     TEXT,
  latest_opr_np    REAL,
  best_np_match_id INTEGER,
  best_np          INTEGER,
  updated_at       TEXT NOT NULL
) STRICT;
CREATE INDEX s2026_tss_by_best_np  ON s2026_team_season_stats (best_opr_np DESC);
CREATE INDEX s2026_tss_by_latest   ON s2026_team_season_stats (latest_opr_np DESC);
