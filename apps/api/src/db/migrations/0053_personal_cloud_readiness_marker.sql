-- Forward repair for the runtime-readiness marker omitted by migration 0051.
-- The deployment ledger already records 0051 with its reviewed checksum, so
-- changing that historical migration would create checksum drift. Validate the
-- existing schema under a write-blocking lock, then publish the missing marker.

BEGIN;

DO $personal_cloud_readiness_relations$
BEGIN
  IF to_regclass('public.personal_cloud_connection') IS NULL THEN
    RAISE EXCEPTION 'personal cloud connection relation is missing';
  END IF;

  IF to_regclass('public.toonspectrum_schema_migration') IS NULL THEN
    RAISE EXCEPTION 'runtime readiness migration ledger is missing';
  END IF;
END
$personal_cloud_readiness_relations$;

LOCK TABLE
  public.personal_cloud_connection,
  public.toonspectrum_schema_migration
  IN SHARE ROW EXCLUSIVE MODE;

DO $personal_cloud_readiness_contract$
DECLARE
  connection_relation regclass := to_regclass('public.personal_cloud_connection');
  missing_columns text[];
  missing_constraints text[];
  missing_indexes text[];BEGIN
  SELECT array_agg(required_column ORDER BY required_column)
  INTO missing_columns
  FROM unnest(ARRAY[
    'userId',
    'provider',
    'providerAccountId',
    'accountLabel',
    'encryptedAccessToken',
    'encryptedRefreshToken',
    'tokenType',
    'scope',
    'accessTokenExpiresAt',
    'createdAt',
    'updatedAt',
    'lastUsedAt'
  ]::text[]) AS required_column
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS connection_column
    WHERE connection_column.attrelid = connection_relation
      AND connection_column.attname = required_column
      AND connection_column.attnum > 0
      AND NOT connection_column.attisdropped
  );

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION
      'personal cloud connection columns are incomplete: %',
      missing_columns;
  END IF;
  SELECT array_agg(required_constraint ORDER BY required_constraint)
  INTO missing_constraints
  FROM unnest(ARRAY[
    'personal_cloud_connection_pkey',
    'personal_cloud_connection_user_fkey',
    'personal_cloud_connection_provider_check',
    'personal_cloud_connection_provider_account_check',
    'personal_cloud_connection_account_label_check',
    'personal_cloud_connection_token_ciphertext_check',
    'personal_cloud_connection_token_type_check',
    'personal_cloud_connection_scope_check',
    'personal_cloud_connection_timestamp_check'
  ]::text[]) AS required_constraint
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS connection_constraint
    WHERE connection_constraint.conrelid = connection_relation
      AND connection_constraint.conname = required_constraint
      AND connection_constraint.convalidated
  );

  IF missing_constraints IS NOT NULL THEN
    RAISE EXCEPTION
      'personal cloud connection constraints are incomplete: %',
      missing_constraints;
  END IF;
  SELECT array_agg(required_index ORDER BY required_index)
  INTO missing_indexes
  FROM unnest(ARRAY[
    'idx_personal_cloud_connection_provider_account',
    'idx_personal_cloud_connection_updated'
  ]::text[]) AS required_index
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS index_relation
    JOIN pg_catalog.pg_index AS index_contract
      ON index_contract.indexrelid = index_relation.oid
    WHERE index_relation.oid = to_regclass(format('public.%I', required_index))
      AND index_contract.indrelid = connection_relation
      AND index_contract.indisvalid
      AND index_contract.indisready
      AND index_contract.indislive
  );

  IF missing_indexes IS NOT NULL THEN
    RAISE EXCEPTION
      'personal cloud connection indexes are incomplete: %',
      missing_indexes;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.personal_cloud_connection
    WHERE "provider" NOT IN ('google-drive', 'dropbox', 'onedrive')
      OR length("providerAccountId") NOT BETWEEN 1 AND 512
      OR length("accountLabel") NOT BETWEEN 1 AND 512
      OR length("encryptedAccessToken") NOT BETWEEN 32 AND 32768
      OR length("encryptedRefreshToken") NOT BETWEEN 32 AND 32768
      OR length("tokenType") NOT BETWEEN 1 AND 64
      OR length("scope") NOT BETWEEN 1 AND 4096
      OR "updatedAt" < "createdAt"
      OR (
        "lastUsedAt" IS NOT NULL
        AND "lastUsedAt" < "createdAt"
      )
  ) THEN
    RAISE EXCEPTION
      'personal cloud connection data violates the readiness contract';
  END IF;
END
$personal_cloud_readiness_contract$;
REVOKE ALL ON TABLE public.personal_cloud_connection FROM PUBLIC;

INSERT INTO public.toonspectrum_schema_migration ("id", "appliedAt")
VALUES ('0051_personal_cloud_connections', statement_timestamp())
ON CONFLICT ("id") DO NOTHING;

COMMIT;
