-- 1 when the stored score was corrected at ingest (see `corrections` in packages/seasons) rather than
-- taken as the FTC API reported it. Leaderboards mark these with an asterisk.
ALTER TABLE match_scores ADD COLUMN adjusted INTEGER NOT NULL DEFAULT 0;
