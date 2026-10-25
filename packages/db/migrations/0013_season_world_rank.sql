-- World rank by best NP OPR, stored instead of counted on every team page view. The page used to run
-- two COUNT(*) subqueries per season (~100k index rows read per uncached view, mostly from crawlers).
-- The sync Worker refreshes the current season hourly (refreshSeasonRanks); older seasons never change.
ALTER TABLE team_season_stats ADD COLUMN world_rank INTEGER;
ALTER TABLE team_official_stats ADD COLUMN world_rank INTEGER;
-- Teams with a row in each table for the season (the "/ N" next to the rank).
ALTER TABLE seasons ADD COLUMN ranked_all INTEGER;
ALTER TABLE seasons ADD COLUMN ranked_official INTEGER;

UPDATE team_season_stats AS t SET world_rank = r.rk
FROM (
  SELECT season, team,
         CASE WHEN best_opr_np IS NULL THEN NULL
              ELSE RANK() OVER (PARTITION BY season ORDER BY best_opr_np DESC) END AS rk
  FROM team_season_stats
) AS r
WHERE t.season = r.season AND t.team = r.team;

UPDATE team_official_stats AS t SET world_rank = r.rk
FROM (
  SELECT season, team,
         CASE WHEN best_opr_np IS NULL THEN NULL
              ELSE RANK() OVER (PARTITION BY season ORDER BY best_opr_np DESC) END AS rk
  FROM team_official_stats
) AS r
WHERE t.season = r.season AND t.team = r.team;

UPDATE seasons SET
  ranked_all = (SELECT COUNT(*) FROM team_season_stats x WHERE x.season = seasons.year),
  ranked_official = (SELECT COUNT(*) FROM team_official_stats x WHERE x.season = seasons.year);
