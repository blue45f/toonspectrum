CREATE TABLE IF NOT EXISTS authority_record (
  record_type VARCHAR(80) NOT NULL,
  record_id VARCHAR(191) NOT NULL,
  owner_id VARCHAR(191),
  version BIGINT UNSIGNED NOT NULL,
  payload JSON NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (record_type, record_id),
  KEY authority_record_owner_idx (owner_id, record_type),
  CONSTRAINT authority_record_version_ck CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS outbox_event (
  event_id CHAR(36) NOT NULL,
  aggregate_type VARCHAR(80) NOT NULL,
  aggregate_id VARCHAR(191) NOT NULL,
  aggregate_version BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  payload JSON NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  published_at TIMESTAMP(6),
  PRIMARY KEY (event_id),
  UNIQUE KEY outbox_aggregate_version_uq (
    aggregate_type, aggregate_id, aggregate_version
  ),
  KEY outbox_unpublished_idx (published_at, created_at)
);
