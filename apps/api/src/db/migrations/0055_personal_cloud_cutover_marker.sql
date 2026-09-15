-- Restore the durable runtime-readiness evidence omitted by migration 0051.
--
-- The deployment ledger already records 0051 with its reviewed checksum, so that historical
-- migration must remain immutable. This forward migration proves the complete personal-cloud
-- contract under a write-blocking lock before publishing the marker consumed by health checks.

BEGIN;

DO $personal_cloud_cutover_relations$
BEGIN
  IF to_regclass('public.personal_cloud_connection') IS NULL THEN
    RAISE EXCEPTION 'personal cloud connection relation is missing';
  END IF;

  IF to_regclass('public.toonspectrum_schema_migration') IS NULL THEN
    RAISE EXCEPTION 'runtime cutover evidence ledger is missing';
  END IF;
END
$personal_cloud_cutover_relations$;

LOCK TABLE
  public.personal_cloud_connection,
  public.toonspectrum_schema_migration
  IN SHARE ROW EXCLUSIVE MODE;

DO $personal_cloud_cutover_marker_contract$
DECLARE
  missing_columns text[];
  missing_constraints text[];
  missing_indexes text[];
BEGIN
  SELECT array_agg(expected.column_name ORDER BY expected.column_name)
  INTO missing_columns
  FROM (VALUES
    ('userId', 'text', 'NO'),
    ('provider', 'text', 'NO'),
    ('providerAccountId', 'text', 'NO'),
    ('accountLabel', 'text', 'NO'),
    ('encryptedAccessToken', 'text', 'NO'),
    ('encryptedRefreshToken', 'text', 'NO'),
    ('tokenType', 'text', 'NO'),
    ('scope', 'text', 'NO'),
    ('accessTokenExpiresAt', 'timestamp with time zone', 'NO'),
    ('createdAt', 'timestamp with time zone', 'NO'),
    ('updatedAt', 'timestamp with time zone', 'NO'),
    ('lastUsedAt', 'timestamp with time zone', 'YES')
  ) AS expected(column_name, data_type, is_nullable)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS actual
    WHERE actual.table_schema = 'public'
      AND actual.table_name = 'personal_cloud_connection'
      AND actual.column_name = expected.column_name
      AND actual.data_type = expected.data_type
      AND actual.is_nullable = expected.is_nullable
  );

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'personal cloud connection columns are incomplete: %', missing_columns;
  END IF;

  SELECT array_agg(expected_constraint ORDER BY expected_constraint)
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
  ]::text[]) AS expected_constraint
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS actual_constraint
    WHERE actual_constraint.conrelid = 'public.personal_cloud_connection'::regclass
      AND actual_constraint.conname = expected_constraint
      AND actual_constraint.convalidated
  );

  IF missing_constraints IS NOT NULL THEN
    RAISE EXCEPTION
      'personal cloud connection constraints are incomplete: %',
      missing_constraints;
  END IF;

  SELECT array_agg(expected_index ORDER BY expected_index)
  INTO missing_indexes
  FROM unnest(ARRAY[
    'idx_personal_cloud_connection_provider_account',
    'idx_personal_cloud_connection_updated'
  ]::text[]) AS expected_index
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS index_record
    JOIN pg_catalog.pg_namespace AS index_namespace
      ON index_namespace.oid = index_record.relnamespace
    JOIN pg_catalog.pg_index AS index_state
      ON index_state.indexrelid = index_record.oid
    WHERE index_namespace.nspname = 'public'
      AND index_record.relname = expected_index
      AND index_state.indrelid = 'public.personal_cloud_connection'::regclass
      AND index_state.indisvalid
      AND index_state.indisready
      AND index_state.indislive
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
      OR ("lastUsedAt" IS NOT NULL AND "lastUsedAt" < "createdAt")
  ) THEN
    RAISE EXCEPTION 'personal cloud connection rows violate the reviewed cutover contract';
  END IF;
END
$personal_cloud_cutover_marker_contract$;

REVOKE ALL ON TABLE public.personal_cloud_connection FROM PUBLIC;

INSERT INTO public."toonspectrum_schema_migration" ("id", "appliedAt")
VALUES ('0051_personal_cloud_connections', statement_timestamp())
ON CONFLICT ("id") DO NOTHING;

COMMIT;
