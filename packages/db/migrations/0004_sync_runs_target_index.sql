-- Lets the backfill repair step look up an event's run history without scanning the whole log.
CREATE INDEX IF NOT EXISTS sync_runs_by_target ON sync_runs (target, job, id);
