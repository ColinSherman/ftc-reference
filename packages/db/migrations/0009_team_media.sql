-- Robot photos for team pages (TBA-style: we store only a pointer to an Imgur image, never the bytes).
-- kind is imgur (ref = image id) or instagram (ref = post shortcode, shown via Instagram's embed). Visitors submit a link (status 'pending'); an admin approves it. `ref` is the Imgur image id, so
-- the image is hotlinked as https://i.imgur.com/{ref}{size}.jpg.
CREATE TABLE team_media (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  team          INTEGER NOT NULL,
  season        INTEGER NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'imgur',
  ref           TEXT NOT NULL,
  caption       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  preferred     INTEGER NOT NULL DEFAULT 0,        -- shown first / in the team header
  submitted_by  TEXT,
  created_at    TEXT NOT NULL,
  reviewed_at   TEXT,
  UNIQUE (team, kind, ref)
) STRICT;
CREATE INDEX team_media_by_team ON team_media (team, status, season DESC);
CREATE INDEX team_media_by_status ON team_media (status, created_at);
