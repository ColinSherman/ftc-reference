-- Broadcaster channels stream whole events (e.g. a region's official channel). Their streams are
-- matched to events by TIME (which events had matches inside the stream window) + title, then every
-- match is auto-timed — no livestream link on the FIRST event page needed.
ALTER TABLE video_channels ADD COLUMN broadcaster INTEGER NOT NULL DEFAULT 0;
-- Restricts candidate events (FIRST region code, e.g. USCANO); NULL = any region.
ALTER TABLE video_channels ADD COLUMN region_code TEXT;

INSERT INTO video_channels (channel_id, title, trusted, auto_scan, broadcaster, region_code, note, added_at)
VALUES ('UCsWixqR83vr2poZHfU_FgcQ', 'NorCal FIRST Tech Challenge', 1, 0, 1, 'USCANO',
        'Official NorCal stream channel (qualifiers, league meets, regional championship)', '2026-10-14T00:00:00Z')
ON CONFLICT (channel_id) DO UPDATE SET broadcaster = 1, region_code = 'USCANO', trusted = 1;
