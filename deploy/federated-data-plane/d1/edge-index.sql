PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS edge_catalog_index (
  partition_key TEXT NOT NULL,
  document_key TEXT NOT NULL,
  source_version INTEGER NOT NULL CHECK (source_version >= 0),
  sort_key TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  source_updated_at TEXT NOT NULL,
  indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (partition_key, document_key)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS edge_catalog_sort_idx
  ON edge_catalog_index (partition_key, sort_key, document_key);

CREATE TABLE IF NOT EXISTS route_manifest (
  route_key TEXT PRIMARY KEY,
  target_shard TEXT NOT NULL,
  source_version INTEGER NOT NULL CHECK (source_version >= 0),
  expires_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS route_manifest_expiry_idx
  ON route_manifest (expires_at);
