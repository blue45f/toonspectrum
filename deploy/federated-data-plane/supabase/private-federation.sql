CREATE SCHEMA IF NOT EXISTS toonspectrum_federation;

REVOKE ALL ON SCHEMA toonspectrum_federation FROM PUBLIC;
REVOKE ALL ON SCHEMA toonspectrum_federation FROM anon;
REVOKE ALL ON SCHEMA toonspectrum_federation FROM authenticated;

CREATE TABLE IF NOT EXISTS toonspectrum_federation.provider_quota_snapshot (
  shard_id text PRIMARY KEY,
  provider_id text NOT NULL,
  health text NOT NULL
    CHECK (health IN ('healthy', 'degraded', 'unavailable')),
  usage_ratio double precision NOT NULL
    CHECK (usage_ratio >= 0 AND usage_ratio <= 1),
  forecast_ratio double precision
    CHECK (forecast_ratio >= 0 AND forecast_ratio <= 1),
  quota_dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL,
  stale_after_seconds integer NOT NULL
    CHECK (stale_after_seconds > 0 AND stale_after_seconds <= 3600),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS toonspectrum_federation.social_projection (
  projection_key text PRIMARY KEY,
  source_version bigint NOT NULL CHECK (source_version >= 0),
  payload jsonb NOT NULL,
  source_updated_at timestamptz NOT NULL,
  projected_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS toonspectrum_federation.migration_checkpoint (
  workload_id text PRIMARY KEY,
  source_cursor text NOT NULL,
  source_checksum text NOT NULL,
  applied_count bigint NOT NULL DEFAULT 0 CHECK (applied_count >= 0),
  status text NOT NULL CHECK (
    status IN (
      'planned',
      'backfilling',
      'shadow-read',
      'cutover-ready',
      'paused'
    )
  ),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE toonspectrum_federation.provider_quota_snapshot
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE toonspectrum_federation.social_projection
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE toonspectrum_federation.migration_checkpoint
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA toonspectrum_federation FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA toonspectrum_federation FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA toonspectrum_federation FROM authenticated;

DROP POLICY IF EXISTS "deny client access to provider quota snapshots"
  ON toonspectrum_federation.provider_quota_snapshot;
DROP POLICY IF EXISTS "deny client access to social projections"
  ON toonspectrum_federation.social_projection;
DROP POLICY IF EXISTS "deny client access to migration checkpoints"
  ON toonspectrum_federation.migration_checkpoint;

CREATE POLICY "deny client access to provider quota snapshots"
ON toonspectrum_federation.provider_quota_snapshot
FOR ALL TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "deny client access to social projections"
ON toonspectrum_federation.social_projection
FOR ALL TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "deny client access to migration checkpoints"
ON toonspectrum_federation.migration_checkpoint
FOR ALL TO anon, authenticated
USING (false)
WITH CHECK (false);

COMMENT ON SCHEMA toonspectrum_federation IS
  'Private compatibility and migration-control schema for the federated free data plane; not exposed through the Data API.';
