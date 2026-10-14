-- Per-day external API usage, for the admin dashboard. `day` is the America/Los_Angeles date,
-- because Google resets YouTube Data API quota at midnight Pacific.
CREATE TABLE api_usage (
  day     TEXT NOT NULL,
  api     TEXT NOT NULL,      -- youtube | youtube_rss
  units   INTEGER NOT NULL DEFAULT 0,
  calls   INTEGER NOT NULL DEFAULT 0,
  errors  INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT,
  last_error_at  TEXT,
  last_ok_at     TEXT,
  PRIMARY KEY (day, api)
) STRICT, WITHOUT ROWID;
