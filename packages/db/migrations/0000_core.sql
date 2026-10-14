-- FTC-Reference core schema (season-agnostic).
-- Conventions: times are ISO-8601 UTC text; booleans are INTEGER 0/1; every synced row has updated_at.

CREATE TABLE seasons (
  year            INTEGER PRIMARY KEY,
  game_name       TEXT NOT NULL,
  program_season  TEXT,
  kickoff         TEXT,
  is_current      INTEGER NOT NULL DEFAULT 0
) STRICT;

INSERT INTO seasons (year, game_name, program_season, kickoff, is_current)
VALUES (2026, 'BIOBUZZ', 'FIRST CANOPY', '2026-09-12', 1);

CREATE TABLE teams (
  number        INTEGER PRIMARY KEY,
  name_short    TEXT,
  name_full     TEXT,
  school        TEXT,
  city          TEXT,
  state_prov    TEXT,
  country       TEXT,
  rookie_year   INTEGER,
  website       TEXT,
  home_region   TEXT,
  updated_at    TEXT NOT NULL
) STRICT;

CREATE TABLE team_seasons (
  season            INTEGER NOT NULL,
  number            INTEGER NOT NULL,
  robot_name        TEXT,
  region_code       TEXT,
  league_code       TEXT,
  display_location  TEXT,
  updated_at        TEXT NOT NULL,
  PRIMARY KEY (season, number)
) STRICT, WITHOUT ROWID;

CREATE TABLE events (
  season          INTEGER NOT NULL,
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  type            TEXT,
  type_name       TEXT,
  division_code   TEXT,
  parent_code     TEXT,
  region_code     TEXT,
  league_code     TEXT,
  district_code   TEXT,
  venue           TEXT,
  city            TEXT,
  state_prov      TEXT,
  country         TEXT,
  timezone        TEXT,
  date_start      TEXT NOT NULL,
  date_end        TEXT NOT NULL,
  remote          INTEGER NOT NULL DEFAULT 0,
  hybrid          INTEGER NOT NULL DEFAULT 0,
  field_count     INTEGER,
  published       INTEGER NOT NULL DEFAULT 1,
  live_stream_url TEXT,
  webcasts_json   TEXT,
  updated_at      TEXT NOT NULL,
  PRIMARY KEY (season, code)
) STRICT, WITHOUT ROWID;
CREATE INDEX events_by_date   ON events (season, date_start);
CREATE INDEX events_by_region ON events (season, region_code);

CREATE TABLE event_teams (
  season      INTEGER NOT NULL,
  event_code  TEXT NOT NULL,
  team        INTEGER NOT NULL,
  PRIMARY KEY (season, event_code, team)
) STRICT, WITHOUT ROWID;
CREATE INDEX event_teams_by_team ON event_teams (team, season);

-- level: Q (qual), P (playoff, double-elim series), SF, F, O (other) — mirrors API tournamentLevel.
CREATE TABLE matches (
  id               INTEGER PRIMARY KEY,
  season           INTEGER NOT NULL,
  event_code       TEXT NOT NULL,
  level            TEXT NOT NULL,
  series           INTEGER NOT NULL DEFAULT 0,
  match_number     INTEGER NOT NULL,
  description      TEXT,
  field            INTEGER,
  scheduled_at     TEXT,
  actual_start_at  TEXT,
  post_result_at   TEXT,
  red_score        INTEGER,
  blue_score       INTEGER,
  red_auto         INTEGER,
  blue_auto        INTEGER,
  red_foul         INTEGER,
  blue_foul        INTEGER,
  red_np           INTEGER,
  blue_np          INTEGER,
  winner           TEXT,
  played           INTEGER NOT NULL DEFAULT 0,
  updated_at       TEXT NOT NULL,
  UNIQUE (season, event_code, level, series, match_number)
) STRICT;

CREATE TABLE match_teams (
  match_id   INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  station    TEXT NOT NULL,              -- Red1, Red2, Blue1, Blue2
  alliance   TEXT NOT NULL,              -- R | B
  team       INTEGER NOT NULL,
  surrogate  INTEGER NOT NULL DEFAULT 0,
  no_show    INTEGER NOT NULL DEFAULT 0,
  dq         INTEGER NOT NULL DEFAULT 0,
  on_field   INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (match_id, station)
) STRICT, WITHOUT ROWID;
CREATE INDEX match_teams_by_team ON match_teams (team, match_id);

CREATE TABLE rankings (
  season         INTEGER NOT NULL,
  event_code     TEXT NOT NULL,
  team           INTEGER NOT NULL,
  rank           INTEGER,
  ranking_score  REAL,
  sort1 REAL, sort2 REAL, sort3 REAL, sort4 REAL, sort5 REAL, sort6 REAL,
  wins           INTEGER,
  losses         INTEGER,
  ties           INTEGER,
  played         INTEGER,
  dq_count       INTEGER,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (season, event_code, team)
) STRICT, WITHOUT ROWID;
CREATE INDEX rankings_by_team ON rankings (season, team);

CREATE TABLE alliances (
  season      INTEGER NOT NULL,
  event_code  TEXT NOT NULL,
  number      INTEGER NOT NULL,
  name        TEXT,
  captain     INTEGER,
  pick1       INTEGER,
  pick2       INTEGER,
  backup      INTEGER,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (season, event_code, number)
) STRICT, WITHOUT ROWID;

CREATE TABLE awards (
  season       INTEGER NOT NULL,
  event_code   TEXT NOT NULL,
  award_id     INTEGER NOT NULL,
  series       INTEGER NOT NULL DEFAULT 0,
  team         INTEGER NOT NULL DEFAULT 0, -- 0 for person-only awards
  name         TEXT NOT NULL,
  person_name  TEXT,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (season, event_code, award_id, series, team)
) STRICT, WITHOUT ROWID;
CREATE INDEX awards_by_team ON awards (team, season);

CREATE TABLE advancement (
  season      INTEGER NOT NULL,
  event_code  TEXT NOT NULL,
  team        INTEGER NOT NULL,
  status      TEXT,
  slot        INTEGER,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (season, event_code, team)
) STRICT, WITHOUT ROWID;

CREATE TABLE leagues (
  season         INTEGER NOT NULL,
  region         TEXT NOT NULL,
  code           TEXT NOT NULL,
  name           TEXT,
  parent_league  TEXT,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (season, region, code)
) STRICT, WITHOUT ROWID;

CREATE TABLE league_members (
  season  INTEGER NOT NULL,
  region  TEXT NOT NULL,
  league  TEXT NOT NULL,
  team    INTEGER NOT NULL,
  PRIMARY KEY (season, region, league, team)
) STRICT, WITHOUT ROWID;

-- ---------- media (UI comes later) ----------
CREATE TABLE videos (
  id            INTEGER PRIMARY KEY,
  match_id      INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL DEFAULT 'youtube',
  video_id      TEXT NOT NULL,
  start_s       INTEGER,
  end_s         INTEGER,
  source        TEXT NOT NULL,          -- user | auto_align | official
  submitted_by  TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  votes         INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
) STRICT;
CREATE INDEX videos_by_match ON videos (match_id, status);

CREATE TABLE event_streams (
  season           INTEGER NOT NULL,
  event_code       TEXT NOT NULL,
  day              TEXT NOT NULL,       -- YYYY-MM-DD local
  provider         TEXT NOT NULL DEFAULT 'youtube',
  video_id         TEXT NOT NULL,
  stream_start_at  TEXT,
  offset_s         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (season, event_code, day, video_id)
) STRICT, WITHOUT ROWID;

-- ---------- sync bookkeeping ----------
CREATE TABLE sync_state (
  key              TEXT PRIMARY KEY,    -- endpoint path + query
  last_modified    TEXT,                -- upstream Last-Modified header, echoed as If-Modified-Since
  last_checked_at  TEXT,
  last_changed_at  TEXT,
  fail_count       INTEGER NOT NULL DEFAULT 0
) STRICT, WITHOUT ROWID;

CREATE TABLE sync_runs (
  id            INTEGER PRIMARY KEY,
  started_at    TEXT NOT NULL,
  job           TEXT NOT NULL,
  target        TEXT,
  requests      INTEGER NOT NULL DEFAULT 0,
  not_modified  INTEGER NOT NULL DEFAULT 0,
  rows_written  INTEGER NOT NULL DEFAULT 0,
  ms            INTEGER,
  error         TEXT
) STRICT;
CREATE INDEX sync_runs_by_time ON sync_runs (started_at);
