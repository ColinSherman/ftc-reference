-- Manual timing correction per video: added to every auto-timed clip of that video, including clips
-- created later (re-syncs apply it instead of reverting it).
CREATE TABLE stream_shifts (
  video_id    TEXT PRIMARY KEY,
  shift_s     INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL
) STRICT, WITHOUT ROWID;

-- Every stream a broadcaster scan looked at, matched or not (for the admin channel page).
CREATE TABLE channel_streams (
  video_id       TEXT PRIMARY KEY,
  channel_id     TEXT NOT NULL,
  title          TEXT,
  live_start     TEXT,
  live_end       TEXT,
  season         INTEGER,
  event_code     TEXT,      -- NULL when no event matched
  matches        INTEGER NOT NULL DEFAULT 0,
  checked_at     TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX channel_streams_by_channel ON channel_streams (channel_id, live_start DESC);

-- Backfill from streams timed before this table existed.
INSERT OR IGNORE INTO channel_streams (video_id, channel_id, title, season, event_code, matches, checked_at)
SELECT v.video_id, v.channel_id, MIN(v.title), m.season, m.event_code, COUNT(*), MAX(v.created_at)
FROM videos v JOIN matches m ON m.id = v.match_id
WHERE v.source = 'auto_align' AND v.channel_id IS NOT NULL
GROUP BY v.video_id;
