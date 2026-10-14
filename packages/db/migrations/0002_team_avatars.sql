-- Team avatars mirrored from FIRST's public composed stylesheet
-- (https://ftc-api.firstinspires.org/avatars/composed/{cmpYear}.css). Each image URL carries a
-- unique id, so `key` changes whenever a team changes its avatar and images can be cached forever.

CREATE TABLE team_avatars (
  team        INTEGER PRIMARY KEY,
  cmp_year    INTEGER NOT NULL,
  key         TEXT NOT NULL,      -- FIRST's per-image id (uuid); also our URL/cache key
  updated_at  TEXT NOT NULL
) STRICT;

-- Kept apart from team_avatars so joins that only need `key` never touch image bytes.
CREATE TABLE avatar_images (
  key         TEXT PRIMARY KEY,
  png         BLOB NOT NULL,
  bytes       INTEGER NOT NULL,
  fetched_at  TEXT NOT NULL
) STRICT; -- rowid table: WITHOUT ROWID suits small rows, not ~2 KB blobs
