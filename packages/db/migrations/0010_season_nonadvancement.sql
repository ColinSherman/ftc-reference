-- Rebuild the default season rollup so non-advancement (scrimmages) count.
-- 0009 was applied with the stricter official-only kind list.

DELETE FROM team_official_stats;

INSERT INTO team_official_stats (
  season, team, events_played, played, wins, losses, ties,
  best_event, best_opr_np, best_opr_auto, best_opr_teleop, best_opr_endgame,
  best_opr_c1, best_opr_c2, best_opr_c3, best_opr_c4,
  latest_event, latest_opr_np, best_np_match_id, best_np, updated_at
)
WITH scoped AS (
  SELECT t.season, t.team, t.event_code, t.played, t.wins, t.losses, t.ties,
         t.opr_np, t.opr_auto, t.opr_teleop, t.opr_endgame,
         t.opr_c1, t.opr_c2, t.opr_c3, t.opr_c4, e.date_end
  FROM team_event_stats t
  JOIN events e ON e.season = t.season AND e.code = t.event_code
  WHERE t.season = 2019 AND e.kind IN ('LeagueMeet','Qualifier','LeagueTournament','Championship','FIRSTChampionship','SuperQualifier','Premier','Pilot','NonAdvancement','Scrimmage')
),
agg AS (
  SELECT season, team,
    COUNT(*) AS events_played,
    CAST(SUM(played) AS INTEGER) AS played,
    CAST(SUM(wins) AS INTEGER) AS wins,
    CAST(SUM(losses) AS INTEGER) AS losses,
    CAST(SUM(ties) AS INTEGER) AS ties,
    MAX(opr_np) AS best_opr_np,
    MAX(opr_auto) AS best_opr_auto,
    MAX(opr_teleop) AS best_opr_teleop,
    MAX(opr_endgame) AS best_opr_endgame,
    MAX(opr_c1) AS best_opr_c1,
    MAX(opr_c2) AS best_opr_c2,
    MAX(opr_c3) AS best_opr_c3,
    MAX(opr_c4) AS best_opr_c4
  FROM scoped GROUP BY season, team
),
best AS (
  SELECT season, team, event_code AS best_event FROM (
    SELECT season, team, event_code,
      ROW_NUMBER() OVER (PARTITION BY season, team ORDER BY opr_np DESC NULLS LAST, date_end DESC) AS rn
    FROM scoped
  ) WHERE rn = 1
),
latest AS (
  SELECT season, team, event_code AS latest_event, opr_np AS latest_opr_np FROM (
    SELECT season, team, event_code, opr_np,
      ROW_NUMBER() OVER (PARTITION BY season, team ORDER BY date_end DESC, event_code DESC) AS rn
    FROM scoped
  ) WHERE rn = 1
),
np AS (
  SELECT season, team, match_id AS best_np_match_id, np AS best_np FROM (
    SELECT m.season AS season, mt.team AS team, s.match_id AS match_id, s.np AS np,
      ROW_NUMBER() OVER (PARTITION BY m.season, mt.team ORDER BY s.np DESC, s.match_id) AS rn
    FROM match_teams mt
    JOIN matches m ON m.id = mt.match_id AND m.season = 2019
    JOIN events e ON e.season = m.season AND e.code = m.event_code
    JOIN match_scores s ON s.match_id = mt.match_id AND s.alliance = mt.alliance
    WHERE mt.surrogate = 0 AND e.kind IN ('LeagueMeet','Qualifier','LeagueTournament','Championship','FIRSTChampionship','SuperQualifier','Premier','Pilot','NonAdvancement','Scrimmage')
  ) WHERE rn = 1
)
SELECT a.season, a.team, a.events_played, a.played, a.wins, a.losses, a.ties,
  b.best_event, a.best_opr_np, a.best_opr_auto, a.best_opr_teleop, a.best_opr_endgame,
  a.best_opr_c1, a.best_opr_c2, a.best_opr_c3, a.best_opr_c4,
  l.latest_event, l.latest_opr_np, n.best_np_match_id, n.best_np,
  strftime('%Y-%m-%dT%H:%M:%SZ','now')
FROM agg a
LEFT JOIN best b ON b.season = a.season AND b.team = a.team
LEFT JOIN latest l ON l.season = a.season AND l.team = a.team
LEFT JOIN np n ON n.season = a.season AND n.team = a.team;


INSERT INTO team_official_stats (
  season, team, events_played, played, wins, losses, ties,
  best_event, best_opr_np, best_opr_auto, best_opr_teleop, best_opr_endgame,
  best_opr_c1, best_opr_c2, best_opr_c3, best_opr_c4,
  latest_event, latest_opr_np, best_np_match_id, best_np, updated_at
)
WITH scoped AS (
  SELECT t.season, t.team, t.event_code, t.played, t.wins, t.losses, t.ties,
         t.opr_np, t.opr_auto, t.opr_teleop, t.opr_endgame,
         t.opr_c1, t.opr_c2, t.opr_c3, t.opr_c4, e.date_end
  FROM team_event_stats t
  JOIN events e ON e.season = t.season AND e.code = t.event_code
  WHERE t.season = 2020 AND e.kind IN ('LeagueMeet','Qualifier','LeagueTournament','Championship','FIRSTChampionship','SuperQualifier','Premier','Pilot','NonAdvancement','Scrimmage')
),
agg AS (
  SELECT season, team,
    COUNT(*) AS events_played,
    CAST(SUM(played) AS INTEGER) AS played,
    CAST(SUM(wins) AS INTEGER) AS wins,
    CAST(SUM(losses) AS INTEGER) AS losses,
    CAST(SUM(ties) AS INTEGER) AS ties,
    MAX(opr_np) AS best_opr_np,
    MAX(opr_auto) AS best_opr_auto,
    MAX(opr_teleop) AS best_opr_teleop,
    MAX(opr_endgame) AS best_opr_endgame,
    MAX(opr_c1) AS best_opr_c1,
    MAX(opr_c2) AS best_opr_c2,
    MAX(opr_c3) AS best_opr_c3,
    MAX(opr_c4) AS best_opr_c4
  FROM scoped GROUP BY season, team
),
best AS (
  SELECT season, team, event_code AS best_event FROM (
    SELECT season, team, event_code,
      ROW_NUMBER() OVER (PARTITION BY season, team ORDER BY opr_np DESC NULLS LAST, date_end DESC) AS rn
    FROM scoped
  ) WHERE rn = 1
),
latest AS (
  SELECT season, team, event_code AS latest_event, opr_np AS latest_opr_np FROM (
    SELECT season, team, event_code, opr_np,
      ROW_NUMBER() OVER (PARTITION BY season, team ORDER BY date_end DESC, event_code DESC) AS rn
    FROM scoped
  ) WHERE rn = 1
),
np AS (
  SELECT season, team, match_id AS best_np_match_id, np AS best_np FROM (
    SELECT m.season AS season, mt.team AS team, s.match_id AS match_id, s.np AS np,
      ROW_NUMBER() OVER (PARTITION BY m.season, mt.team ORDER BY s.np DESC, s.match_id) AS rn
    FROM match_teams mt
    JOIN matches m ON m.id = mt.match_id AND m.season = 2020
    JOIN events e ON e.season = m.season AND e.code = m.event_code
    JOIN match_scores s ON s.match_id = mt.match_id AND s.alliance = mt.alliance
    WHERE mt.surrogate = 0 AND e.kind IN ('LeagueMeet','Qualifier','LeagueTournament','Championship','FIRSTChampionship','SuperQualifier','Premier','Pilot','NonAdvancement','Scrimmage')
  ) WHERE rn = 1
)
SELECT a.season, a.team, a.events_played, a.played, a.wins, a.losses, a.ties,
  b.best_event, a.best_opr_np, a.best_opr_auto, a.best_opr_teleop, a.best_opr_endgame,
  a.best_opr_c1, a.best_opr_c2, a.best_opr_c3, a.best_opr_c4,
  l.latest_event, l.latest_opr_np, n.best_np_match_id, n.best_np,
  strftime('%Y-%m-%dT%H:%M:%SZ','now')
FROM agg a
LEFT JOIN best b ON b.season = a.season AND b.team = a.team
LEFT JOIN latest l ON l.season = a.season AND l.team = a.team
LEFT JOIN np n ON n.season = a.season AND n.team = a.team;


INSERT INTO team_official_stats (
  season, team, events_played, played, wins, losses, ties,
  best_event, best_opr_np, best_opr_auto, best_opr_teleop, best_opr_endgame,
  best_opr_c1, best_opr_c2, best_opr_c3, best_opr_c4,
  latest_event, latest_opr_np, best_np_match_id, best_np, updated_at
)
WITH scoped AS (
  SELECT t.season, t.team, t.event_code, t.played, t.wins, t.losses, t.ties,
         t.opr_np, t.opr_auto, t.opr_teleop, t.opr_endgame,
         t.opr_c1, t.opr_c2, t.opr_c3, t.opr_c4, e.date_end
  FROM team_event_stats t
  JOIN events e ON e.season = t.season AND e.code = t.event_code
  WHERE t.season = 2021 AND e.kind IN ('LeagueMeet','Qualifier','LeagueTournament','Championship','FIRSTChampionship','SuperQualifier','Premier','Pilot','NonAdvancement','Scrimmage')
),
agg AS (
  SELECT season, team,
    COUNT(*) AS events_played,
    CAST(SUM(played) AS INTEGER) AS played,
    CAST(SUM(wins) AS INTEGER) AS wins,
    CAST(SUM(losses) AS INTEGER) AS losses,
    CAST(SUM(ties) AS INTEGER) AS ties,
    MAX(opr_np) AS best_opr_np,
    MAX(opr_auto) AS best_opr_auto,
    MAX(opr_teleop) AS best_opr_teleop,
    MAX(opr_endgame) AS best_opr_endgame,
    MAX(opr_c1) AS best_opr_c1,
    MAX(opr_c2) AS best_opr_c2,
    MAX(opr_c3) AS best_opr_c3,
    MAX(opr_c4) AS best_opr_c4
  FROM scoped GROUP BY season, team
),
best AS (
  SELECT season, team, event_code AS best_event FROM (
    SELECT season, team, event_code,
      ROW_NUMBER() OVER (PARTITION BY season, team ORDER BY opr_np DESC NULLS LAST, date_end DESC) AS rn
    FROM scoped
  ) WHERE rn = 1
),
latest AS (
  SELECT season, team, event_code AS latest_event, opr_np AS latest_opr_np FROM (
    SELECT season, team, event_code, opr_np,
      ROW_NUMBER() OVER (PARTITION BY season, team ORDER BY date_end DESC, event_code DESC) AS rn
    FROM scoped
  ) WHERE rn = 1
),
np AS (
  SELECT season, team, match_id AS best_np_match_id, np AS best_np FROM (
    SELECT m.season AS season, mt.team AS team, s.match_id AS match_id, s.np AS np,
      ROW_NUMBER() OVER (PARTITION BY m.season, mt.team ORDER BY s.np DESC, s.match_id) AS rn
    FROM match_teams mt
    JOIN matches m ON m.id = mt.match_id AND m.season = 2021
    JOIN events e ON e.season = m.season AND e.code = m.event_code
    JOIN match_scores s ON s.match_id = mt.match_id AND s.alliance = mt.alliance
    WHERE mt.surrogate = 0 AND e.kind IN ('LeagueMeet','Qualifier','LeagueTournament','Championship','FIRSTChampionship','SuperQualifier','Premier','Pilot','NonAdvancement','Scrimmage')
  ) WHERE rn = 1
)
SELECT a.season, a.team, a.events_played, a.played, a.wins, a.losses, a.ties,
  b.best_event, a.best_opr_np, a.best_opr_auto, a.best_opr_teleop, a.best_opr_endgame,
  a.best_opr_c1, a.best_opr_c2, a.best_opr_c3, a.best_opr_c4,
  l.latest_event, l.latest_opr_np, n.best_np_match_id, n.best_np,
  strftime('%Y-%m-%dT%H:%M:%SZ','now')
FROM agg a
LEFT JOIN best b ON b.season = a.season AND b.team = a.team
LEFT JOIN latest l ON l.season = a.season AND l.team = a.team
LEFT JOIN np n ON n.season = a.season AND n.team = a.team;


INSERT INTO team_official_stats (
  season, team, events_played, played, wins, losses, ties,
  best_event, best_opr_np, best_opr_auto, best_opr_teleop, best_opr_endgame,
  best_opr_c1, best_opr_c2, best_opr_c3, best_opr_c4,
  latest_event, latest_opr_np, best_np_match_id, best_np, updated_at
)
WITH scoped AS (
  SELECT t.season, t.team, t.event_code, t.played, t.wins, t.losses, t.ties,
         t.opr_np, t.opr_auto, t.opr_teleop, t.opr_endgame,
         t.opr_c1, t.opr_c2, t.opr_c3, t.opr_c4, e.date_end
  FROM team_event_stats t
  JOIN events e ON e.season = t.season AND e.code = t.event_code
  WHERE t.season = 2022 AND e.kind IN ('LeagueMeet','Qualifier','LeagueTournament','Championship','FIRSTChampionship','SuperQualifier','Premier','Pilot','NonAdvancement','Scrimmage')
),
agg AS (
  SELECT season, team,
    COUNT(*) AS events_played,
    CAST(SUM(played) AS INTEGER) AS played,
    CAST(SUM(wins) AS INTEGER) AS wins,
    CAST(SUM(losses) AS INTEGER) AS losses,
    CAST(SUM(ties) AS INTEGER) AS ties,
    MAX(opr_np) AS best_opr_np,
    MAX(opr_auto) AS best_opr_auto,
    MAX(opr_teleop) AS best_opr_teleop,
    MAX(opr_endgame) AS best_opr_endgame,
    MAX(opr_c1) AS best_opr_c1,
    MAX(opr_c2) AS best_opr_c2,
    MAX(opr_c3) AS best_opr_c3,
    MAX(opr_c4) AS best_opr_c4
  FROM scoped GROUP BY season, team
),
best AS (
  SELECT season, team, event_code AS best_event FROM (
    SELECT season, team, event_code,
      ROW_NUMBER() OVER (PARTITION BY season, team ORDER BY opr_np DESC NULLS LAST, date_end DESC) AS rn
    FROM scoped
  ) WHERE rn = 1
),
latest AS (
  SELECT season, team, event_code AS latest_event, opr_np AS latest_opr_np FROM (
    SELECT season, team, event_code, opr_np,
      ROW_NUMBER() OVER (PARTITION BY season, team ORDER BY date_end DESC, event_code DESC) AS rn
    FROM scoped
  ) WHERE rn = 1
),
np AS (
  SELECT season, team, match_id AS best_np_match_id, np AS best_np FROM (
    SELECT m.season AS season, mt.team AS team, s.match_id AS match_id, s.np AS np,
      ROW_NUMBER() OVER (PARTITION BY m.season, mt.team ORDER BY s.np DESC, s.match_id) AS rn
    FROM match_teams mt
    JOIN matches m ON m.id = mt.match_id AND m.season = 2022
    JOIN events e ON e.season = m.season AND e.code = m.event_code
    JOIN match_scores s ON s.match_id = mt.match_id AND s.alliance = mt.alliance
    WHERE mt.surrogate = 0 AND e.kind IN ('LeagueMeet','Qualifier','LeagueTournament','Championship','FIRSTChampionship','SuperQualifier','Premier','Pilot','NonAdvancement','Scrimmage')
  ) WHERE rn = 1
)
SELECT a.season, a.team, a.events_played, a.played, a.wins, a.losses, a.ties,
  b.best_event, a.best_opr_np, a.best_opr_auto, a.best_opr_teleop, a.best_opr_endgame,
  a.best_opr_c1, a.best_opr_c2, a.best_opr_c3, a.best_opr_c4,
  l.latest_event, l.latest_opr_np, n.best_np_match_id, n.best_np,
  strftime('%Y-%m-%dT%H:%M:%SZ','now')
FROM agg a
LEFT JOIN best b ON b.season = a.season AND b.team = a.team
LEFT JOIN latest l ON l.season = a.season AND l.team = a.team
LEFT JOIN np n ON n.season = a.season AND n.team = a.team;


INSERT INTO team_official_stats (
  season, team, events_played, played, wins, losses, ties,
  best_event, best_opr_np, best_opr_auto, best_opr_teleop, best_opr_endgame,
  best_opr_c1, best_opr_c2, best_opr_c3, best_opr_c4,
  latest_event, latest_opr_np, best_np_match_id, best_np, updated_at
)
WITH scoped AS (
  SELECT t.season, t.team, t.event_code, t.played, t.wins, t.losses, t.ties,
         t.opr_np, t.opr_auto, t.opr_teleop, t.opr_endgame,
         t.opr_c1, t.opr_c2, t.opr_c3, t.opr_c4, e.date_end
  FROM team_event_stats t
  JOIN events e ON e.season = t.season AND e.code = t.event_code
  WHERE t.season = 2023 AND e.kind IN ('LeagueMeet','Qualifier','LeagueTournament','Championship','FIRSTChampionship','SuperQualifier','Premier','Pilot','NonAdvancement','Scrimmage')
),
agg AS (
  SELECT season, team,
    COUNT(*) AS events_played,
    CAST(SUM(played) AS INTEGER) AS played,
    CAST(SUM(wins) AS INTEGER) AS wins,
    CAST(SUM(losses) AS INTEGER) AS losses,
    CAST(SUM(ties) AS INTEGER) AS ties,
    MAX(opr_np) AS best_opr_np,
    MAX(opr_auto) AS best_opr_auto,
    MAX(opr_teleop) AS best_opr_teleop,
    MAX(opr_endgame) AS best_opr_endgame,
    MAX(opr_c1) AS best_opr_c1,
    MAX(opr_c2) AS best_opr_c2,
    MAX(opr_c3) AS best_opr_c3,
    MAX(opr_c4) AS best_opr_c4
  FROM scoped GROUP BY season, team
),
best AS (
  SELECT season, team, event_code AS best_event FROM (
    SELECT season, team, event_code,
      ROW_NUMBER() OVER (PARTITION BY season, team ORDER BY opr_np DESC NULLS LAST, date_end DESC) AS rn
    FROM scoped
  ) WHERE rn = 1
),
latest AS (
  SELECT season, team, event_code AS latest_event, opr_np AS latest_opr_np FROM (
    SELECT season, team, event_code, opr_np,
      ROW_NUMBER() OVER (PARTITION BY season, team ORDER BY date_end DESC, event_code DESC) AS rn
    FROM scoped
  ) WHERE rn = 1
),
np AS (
  SELECT season, team, match_id AS best_np_match_id, np AS best_np FROM (
    SELECT m.season AS season, mt.team AS team, s.match_id AS match_id, s.np AS np,
      ROW_NUMBER() OVER (PARTITION BY m.season, mt.team ORDER BY s.np DESC, s.match_id) AS rn
    FROM match_teams mt
    JOIN matches m ON m.id = mt.match_id AND m.season = 2023
    JOIN events e ON e.season = m.season AND e.code = m.event_code
    JOIN match_scores s ON s.match_id = mt.match_id AND s.alliance = mt.alliance
    WHERE mt.surrogate = 0 AND e.kind IN ('LeagueMeet','Qualifier','LeagueTournament','Championship','FIRSTChampionship','SuperQualifier','Premier','Pilot','NonAdvancement','Scrimmage')
  ) WHERE rn = 1
)
SELECT a.season, a.team, a.events_played, a.played, a.wins, a.losses, a.ties,
  b.best_event, a.best_opr_np, a.best_opr_auto, a.best_opr_teleop, a.best_opr_endgame,
  a.best_opr_c1, a.best_opr_c2, a.best_opr_c3, a.best_opr_c4,
  l.latest_event, l.latest_opr_np, n.best_np_match_id, n.best_np,
  strftime('%Y-%m-%dT%H:%M:%SZ','now')
FROM agg a
LEFT JOIN best b ON b.season = a.season AND b.team = a.team
LEFT JOIN latest l ON l.season = a.season AND l.team = a.team
LEFT JOIN np n ON n.season = a.season AND n.team = a.team;


INSERT INTO team_official_stats (
  season, team, events_played, played, wins, losses, ties,
  best_event, best_opr_np, best_opr_auto, best_opr_teleop, best_opr_endgame,
  best_opr_c1, best_opr_c2, best_opr_c3, best_opr_c4,
  latest_event, latest_opr_np, best_np_match_id, best_np, updated_at
)
WITH scoped AS (
  SELECT t.season, t.team, t.event_code, t.played, t.wins, t.losses, t.ties,
         t.opr_np, t.opr_auto, t.opr_teleop, t.opr_endgame,
         t.opr_c1, t.opr_c2, t.opr_c3, t.opr_c4, e.date_end
  FROM team_event_stats t
  JOIN events e ON e.season = t.season AND e.code = t.event_code
  WHERE t.season = 2024 AND e.kind IN ('LeagueMeet','Qualifier','LeagueTournament','Championship','FIRSTChampionship','SuperQualifier','Premier','Pilot','NonAdvancement','Scrimmage')
),
agg AS (
  SELECT season, team,
    COUNT(*) AS events_played,
    CAST(SUM(played) AS INTEGER) AS played,
    CAST(SUM(wins) AS INTEGER) AS wins,
    CAST(SUM(losses) AS INTEGER) AS losses,
    CAST(SUM(ties) AS INTEGER) AS ties,
    MAX(opr_np) AS best_opr_np,
    MAX(opr_auto) AS best_opr_auto,
    MAX(opr_teleop) AS best_opr_teleop,
    MAX(opr_endgame) AS best_opr_endgame,
    MAX(opr_c1) AS best_opr_c1,
    MAX(opr_c2) AS best_opr_c2,
    MAX(opr_c3) AS best_opr_c3,
    MAX(opr_c4) AS best_opr_c4
  FROM scoped GROUP BY season, team
),
best AS (
  SELECT season, team, event_code AS best_event FROM (
    SELECT season, team, event_code,
      ROW_NUMBER() OVER (PARTITION BY season, team ORDER BY opr_np DESC NULLS LAST, date_end DESC) AS rn
    FROM scoped
  ) WHERE rn = 1
),
latest AS (
  SELECT season, team, event_code AS latest_event, opr_np AS latest_opr_np FROM (
    SELECT season, team, event_code, opr_np,
      ROW_NUMBER() OVER (PARTITION BY season, team ORDER BY date_end DESC, event_code DESC) AS rn
    FROM scoped
  ) WHERE rn = 1
),
np AS (
  SELECT season, team, match_id AS best_np_match_id, np AS best_np FROM (
    SELECT m.season AS season, mt.team AS team, s.match_id AS match_id, s.np AS np,
      ROW_NUMBER() OVER (PARTITION BY m.season, mt.team ORDER BY s.np DESC, s.match_id) AS rn
    FROM match_teams mt
    JOIN matches m ON m.id = mt.match_id AND m.season = 2024
    JOIN events e ON e.season = m.season AND e.code = m.event_code
    JOIN match_scores s ON s.match_id = mt.match_id AND s.alliance = mt.alliance
    WHERE mt.surrogate = 0 AND e.kind IN ('LeagueMeet','Qualifier','LeagueTournament','Championship','FIRSTChampionship','SuperQualifier','Premier','Pilot','NonAdvancement','Scrimmage')
  ) WHERE rn = 1
)
SELECT a.season, a.team, a.events_played, a.played, a.wins, a.losses, a.ties,
  b.best_event, a.best_opr_np, a.best_opr_auto, a.best_opr_teleop, a.best_opr_endgame,
  a.best_opr_c1, a.best_opr_c2, a.best_opr_c3, a.best_opr_c4,
  l.latest_event, l.latest_opr_np, n.best_np_match_id, n.best_np,
  strftime('%Y-%m-%dT%H:%M:%SZ','now')
FROM agg a
LEFT JOIN best b ON b.season = a.season AND b.team = a.team
LEFT JOIN latest l ON l.season = a.season AND l.team = a.team
LEFT JOIN np n ON n.season = a.season AND n.team = a.team;


INSERT INTO team_official_stats (
  season, team, events_played, played, wins, losses, ties,
  best_event, best_opr_np, best_opr_auto, best_opr_teleop, best_opr_endgame,
  best_opr_c1, best_opr_c2, best_opr_c3, best_opr_c4,
  latest_event, latest_opr_np, best_np_match_id, best_np, updated_at
)
WITH scoped AS (
  SELECT t.season, t.team, t.event_code, t.played, t.wins, t.losses, t.ties,
         t.opr_np, t.opr_auto, t.opr_teleop, t.opr_endgame,
         t.opr_c1, t.opr_c2, t.opr_c3, t.opr_c4, e.date_end
  FROM team_event_stats t
  JOIN events e ON e.season = t.season AND e.code = t.event_code
  WHERE t.season = 2025 AND e.kind IN ('LeagueMeet','Qualifier','LeagueTournament','Championship','FIRSTChampionship','SuperQualifier','Premier','Pilot','NonAdvancement','Scrimmage')
),
agg AS (
  SELECT season, team,
    COUNT(*) AS events_played,
    CAST(SUM(played) AS INTEGER) AS played,
    CAST(SUM(wins) AS INTEGER) AS wins,
    CAST(SUM(losses) AS INTEGER) AS losses,
    CAST(SUM(ties) AS INTEGER) AS ties,
    MAX(opr_np) AS best_opr_np,
    MAX(opr_auto) AS best_opr_auto,
    MAX(opr_teleop) AS best_opr_teleop,
    MAX(opr_endgame) AS best_opr_endgame,
    MAX(opr_c1) AS best_opr_c1,
    MAX(opr_c2) AS best_opr_c2,
    MAX(opr_c3) AS best_opr_c3,
    MAX(opr_c4) AS best_opr_c4
  FROM scoped GROUP BY season, team
),
best AS (
  SELECT season, team, event_code AS best_event FROM (
    SELECT season, team, event_code,
      ROW_NUMBER() OVER (PARTITION BY season, team ORDER BY opr_np DESC NULLS LAST, date_end DESC) AS rn
    FROM scoped
  ) WHERE rn = 1
),
latest AS (
  SELECT season, team, event_code AS latest_event, opr_np AS latest_opr_np FROM (
    SELECT season, team, event_code, opr_np,
      ROW_NUMBER() OVER (PARTITION BY season, team ORDER BY date_end DESC, event_code DESC) AS rn
    FROM scoped
  ) WHERE rn = 1
),
np AS (
  SELECT season, team, match_id AS best_np_match_id, np AS best_np FROM (
    SELECT m.season AS season, mt.team AS team, s.match_id AS match_id, s.np AS np,
      ROW_NUMBER() OVER (PARTITION BY m.season, mt.team ORDER BY s.np DESC, s.match_id) AS rn
    FROM match_teams mt
    JOIN matches m ON m.id = mt.match_id AND m.season = 2025
    JOIN events e ON e.season = m.season AND e.code = m.event_code
    JOIN match_scores s ON s.match_id = mt.match_id AND s.alliance = mt.alliance
    WHERE mt.surrogate = 0 AND e.kind IN ('LeagueMeet','Qualifier','LeagueTournament','Championship','FIRSTChampionship','SuperQualifier','Premier','Pilot','NonAdvancement','Scrimmage')
  ) WHERE rn = 1
)
SELECT a.season, a.team, a.events_played, a.played, a.wins, a.losses, a.ties,
  b.best_event, a.best_opr_np, a.best_opr_auto, a.best_opr_teleop, a.best_opr_endgame,
  a.best_opr_c1, a.best_opr_c2, a.best_opr_c3, a.best_opr_c4,
  l.latest_event, l.latest_opr_np, n.best_np_match_id, n.best_np,
  strftime('%Y-%m-%dT%H:%M:%SZ','now')
FROM agg a
LEFT JOIN best b ON b.season = a.season AND b.team = a.team
LEFT JOIN latest l ON l.season = a.season AND l.team = a.team
LEFT JOIN np n ON n.season = a.season AND n.team = a.team;


INSERT INTO team_official_stats (
  season, team, events_played, played, wins, losses, ties,
  best_event, best_opr_np, best_opr_auto, best_opr_teleop, best_opr_endgame,
  best_opr_c1, best_opr_c2, best_opr_c3, best_opr_c4,
  latest_event, latest_opr_np, best_np_match_id, best_np, updated_at
)
WITH scoped AS (
  SELECT t.season, t.team, t.event_code, t.played, t.wins, t.losses, t.ties,
         t.opr_np, t.opr_auto, t.opr_teleop, t.opr_endgame,
         t.opr_c1, t.opr_c2, t.opr_c3, t.opr_c4, e.date_end
  FROM team_event_stats t
  JOIN events e ON e.season = t.season AND e.code = t.event_code
  WHERE t.season = 2026 AND e.kind IN ('LeagueMeet','Qualifier','LeagueTournament','Championship','FIRSTChampionship','SuperQualifier','Premier','Pilot','NonAdvancement','Scrimmage')
),
agg AS (
  SELECT season, team,
    COUNT(*) AS events_played,
    CAST(SUM(played) AS INTEGER) AS played,
    CAST(SUM(wins) AS INTEGER) AS wins,
    CAST(SUM(losses) AS INTEGER) AS losses,
    CAST(SUM(ties) AS INTEGER) AS ties,
    MAX(opr_np) AS best_opr_np,
    MAX(opr_auto) AS best_opr_auto,
    MAX(opr_teleop) AS best_opr_teleop,
    MAX(opr_endgame) AS best_opr_endgame,
    MAX(opr_c1) AS best_opr_c1,
    MAX(opr_c2) AS best_opr_c2,
    MAX(opr_c3) AS best_opr_c3,
    MAX(opr_c4) AS best_opr_c4
  FROM scoped GROUP BY season, team
),
best AS (
  SELECT season, team, event_code AS best_event FROM (
    SELECT season, team, event_code,
      ROW_NUMBER() OVER (PARTITION BY season, team ORDER BY opr_np DESC NULLS LAST, date_end DESC) AS rn
    FROM scoped
  ) WHERE rn = 1
),
latest AS (
  SELECT season, team, event_code AS latest_event, opr_np AS latest_opr_np FROM (
    SELECT season, team, event_code, opr_np,
      ROW_NUMBER() OVER (PARTITION BY season, team ORDER BY date_end DESC, event_code DESC) AS rn
    FROM scoped
  ) WHERE rn = 1
),
np AS (
  SELECT season, team, match_id AS best_np_match_id, np AS best_np FROM (
    SELECT m.season AS season, mt.team AS team, s.match_id AS match_id, s.np AS np,
      ROW_NUMBER() OVER (PARTITION BY m.season, mt.team ORDER BY s.np DESC, s.match_id) AS rn
    FROM match_teams mt
    JOIN matches m ON m.id = mt.match_id AND m.season = 2026
    JOIN events e ON e.season = m.season AND e.code = m.event_code
    JOIN match_scores s ON s.match_id = mt.match_id AND s.alliance = mt.alliance
    WHERE mt.surrogate = 0 AND e.kind IN ('LeagueMeet','Qualifier','LeagueTournament','Championship','FIRSTChampionship','SuperQualifier','Premier','Pilot','NonAdvancement','Scrimmage')
  ) WHERE rn = 1
)
SELECT a.season, a.team, a.events_played, a.played, a.wins, a.losses, a.ties,
  b.best_event, a.best_opr_np, a.best_opr_auto, a.best_opr_teleop, a.best_opr_endgame,
  a.best_opr_c1, a.best_opr_c2, a.best_opr_c3, a.best_opr_c4,
  l.latest_event, l.latest_opr_np, n.best_np_match_id, n.best_np,
  strftime('%Y-%m-%dT%H:%M:%SZ','now')
FROM agg a
LEFT JOIN best b ON b.season = a.season AND b.team = a.team
LEFT JOIN latest l ON l.season = a.season AND l.team = a.team
LEFT JOIN np n ON n.season = a.season AND n.team = a.team;
