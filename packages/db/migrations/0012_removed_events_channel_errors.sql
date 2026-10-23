-- Set when FIRST stops listing an event (dropped from the season's /events list, or "Invalid Event
-- Requested" on its endpoints); cleared if it comes back. Planners skip removed events so their jobs
-- don't fail and retry forever.
ALTER TABLE events ADD COLUMN removed_at TEXT;

-- Last failed feed fetch per channel (e.g. a deleted channel's RSS 404). One bad channel no longer
-- aborts a scan; the admin health page names it instead. Cleared on the next successful fetch.
ALTER TABLE video_channels ADD COLUMN last_error TEXT;
ALTER TABLE video_channels ADD COLUMN last_error_at TEXT;
