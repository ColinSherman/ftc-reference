-- Community per-robot box-score cards. One row is one scout's card for one robot in one match.
-- line_json holds only the columns that scout tracked; a missing key is "not recorded", not zero.
-- log_json is the play-by-play when the card was built that way. The line is what the box score reads.
-- token is the scout's cookie, so submitting again for the same robot updates their card.

CREATE TABLE scout_reports (
  id          INTEGER PRIMARY KEY,
  match_id    INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  season      INTEGER NOT NULL,
  team        INTEGER NOT NULL,
  token       TEXT NOT NULL,
  by_name     TEXT,
  mode        TEXT NOT NULL,             -- line | log
  line_json   TEXT NOT NULL,
  qual_json   TEXT NOT NULL,
  log_json    TEXT,
  status      TEXT NOT NULL DEFAULT 'live',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX scout_reports_card ON scout_reports (match_id, team, token);
