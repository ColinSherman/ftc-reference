-- Match videos (TBA-style: YouTube id + optional start offset per match), plus where they came from.
ALTER TABLE videos ADD COLUMN title TEXT;
ALTER TABLE videos ADD COLUMN channel_id TEXT;
ALTER TABLE videos ADD COLUMN channel_title TEXT;
ALTER TABLE videos ADD COLUMN published_at TEXT;
ALTER TABLE videos ADD COLUMN confidence TEXT;   -- high | low (auto-matcher's opinion)
ALTER TABLE videos ADD COLUMN reason TEXT;       -- why it was matched to this match
ALTER TABLE videos ADD COLUMN reviewed_at TEXT;

-- One row per (match, video, offset): re-imports are idempotent.
CREATE UNIQUE INDEX videos_unique ON videos (match_id, video_id, IFNULL(start_s, 0));
CREATE INDEX videos_by_status ON videos (status, created_at);

-- YouTube channels we know about. Trusted channels' confident matches are auto-approved;
-- auto_scan channels are re-scanned for new uploads on a schedule.
CREATE TABLE video_channels (
  channel_id       TEXT PRIMARY KEY,
  title            TEXT,
  trusted          INTEGER NOT NULL DEFAULT 0,
  auto_scan        INTEGER NOT NULL DEFAULT 0,
  note             TEXT,
  added_at         TEXT NOT NULL,
  last_scanned_at  TEXT
) STRICT;

-- Team 4201's channel: the League H case study (playlists "SoCal FTC Group H … Scrimmage N").
INSERT INTO video_channels (channel_id, title, trusted, auto_scan, note, added_at)
VALUES ('UCH0bRF8xOOJxtD6JOYX7TSQ', 'Team 4201: The Vitruvian Bots', 1, 1, 'SoCal League H match videos', '2026-10-14T00:00:00Z');
