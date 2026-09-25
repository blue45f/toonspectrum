PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS analytics_event_buffer (
  shard_key TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_timestamp TEXT NOT NULL,
  event_name TEXT NOT NULL,
  actor_hash TEXT,
  session_hash TEXT,
  route_id TEXT,
  provider_id TEXT,
  properties_json TEXT CHECK (
    properties_json IS NULL OR json_valid(properties_json)
  ),
  batch_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (batch_state IN ('pending', 'leased', 'exported')),
  lease_token TEXT,
  lease_expires_at TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (shard_key, event_id)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS analytics_event_batch_idx
  ON analytics_event_buffer (
    batch_state,
    event_timestamp,
    shard_key,
    event_id
  );
