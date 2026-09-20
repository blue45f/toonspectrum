-- Optional public fortune enrichment only. Apply through the approved migration workflow.
-- Application startup never performs this DDL. No birth data, user ids, or personal readings.
CREATE TABLE IF NOT EXISTS fortune_public_snapshot (
  snapshot_key text PRIMARY KEY CHECK (length(snapshot_key) BETWEEN 1 AND 256),
  payload jsonb NOT NULL,
  checked_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CONSTRAINT fortune_snapshot_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT fortune_snapshot_payload_size CHECK (octet_length(payload::text) <= 32768),
  CONSTRAINT fortune_snapshot_external_only CHECK (
    payload ?& ARRAY['kind', 'source', 'status', 'policyRevision', 'checkedAt', 'expiresAt']
    AND payload->>'status' = 'external'
    AND ((payload->>'kind' IN ('calendar', 'special-days') AND payload->>'source' = 'kasi')
      OR (payload->>'kind' = 'horoscope' AND payload->>'source' = 'free-horoscope'))
  ),
  CONSTRAINT fortune_snapshot_expiry CHECK (expires_at > checked_at AND expires_at <= checked_at + INTERVAL '1 day')
);
CREATE INDEX IF NOT EXISTS fortune_public_snapshot_expiry_idx ON fortune_public_snapshot (expires_at);
COMMENT ON TABLE fortune_public_snapshot IS 'Bounded, validated public enrichment snapshots; never private fortune inputs or readings';
