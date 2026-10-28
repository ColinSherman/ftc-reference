-- Counts shown on list pages, stored instead of counted on every view. D1 bills rows scanned, and
-- the events list counted every event's teams and played matches (~200k rows per uncached view);
-- /seasons counted every season's matches (~3M rows). The sync Worker keeps them current:
-- events after each roster or match sync, the current season hourly (refreshSeasonRanks).
ALTER TABLE events ADD COLUMN team_count INTEGER;
ALTER TABLE events ADD COLUMN played_count INTEGER;
ALTER TABLE seasons ADD COLUMN event_count INTEGER;
ALTER TABLE seasons ADD COLUMN team_count INTEGER;
ALTER TABLE seasons ADD COLUMN played_count INTEGER;

UPDATE events SET
  team_count = (SELECT COUNT(*) FROM event_teams t WHERE t.season = events.season AND t.event_code = events.code),
  played_count = (SELECT COUNT(*) FROM matches m
                  WHERE m.season = events.season AND m.event_code = events.code AND m.played = 1);

UPDATE seasons SET
  event_count = (SELECT COUNT(*) FROM events e WHERE e.season = seasons.year),
  team_count = (SELECT COUNT(*) FROM team_seasons t WHERE t.season = seasons.year),
  played_count = (SELECT COALESCE(SUM(played_count), 0) FROM events e WHERE e.season = seasons.year);

-- The home page's top-auto list (and the auto leaderboard) sort by this; without an index each
-- view sorted the whole season.
CREATE INDEX tss_by_auto ON team_season_stats (season, best_opr_auto DESC);
CREATE INDEX tos_by_auto ON team_official_stats (season, best_opr_auto DESC);
