-- Hash of the last 200 body per endpoint. The FTC API sends no Last-Modified for some endpoints
-- (e.g. an event's empty playoff schedule), so every poll came back 200 and counted as a change:
-- the event stayed on the every-minute cadence and all its endpoints were re-fetched and re-written.
-- A 200 whose body hashes the same as last time is now treated like a 304.
ALTER TABLE sync_state ADD COLUMN body_hash TEXT;
