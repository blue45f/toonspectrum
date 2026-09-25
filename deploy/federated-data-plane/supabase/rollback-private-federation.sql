DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM toonspectrum_federation.migration_checkpoint
    WHERE status IN ('backfilling', 'shadow-read', 'cutover-ready')
  ) THEN
    RAISE EXCEPTION
      'Refusing rollback while a federated migration is active';
  END IF;
END
$$;

DROP TABLE IF EXISTS toonspectrum_federation.migration_checkpoint;
DROP TABLE IF EXISTS toonspectrum_federation.social_projection;
DROP TABLE IF EXISTS toonspectrum_federation.provider_quota_snapshot;
DROP SCHEMA IF EXISTS toonspectrum_federation;
