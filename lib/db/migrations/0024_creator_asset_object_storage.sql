-- Private Supabase object references for work-scoped source and generated assets.
-- Object lifecycle and logical work references are separate so the last generated reference can
-- enter a durable deleting state before remote deletion, without holding a database transaction
-- open across the network call. Source objects are immutable and cannot enter a deletion state.

BEGIN;

CREATE TABLE IF NOT EXISTS "creator_asset_storage_object" (
  "purpose" text NOT NULL,
  "digest" text NOT NULL,
  "contractVersion" text NOT NULL,
  "objectPath" text NOT NULL,
  "byteLength" bigint NOT NULL,
  "contentType" text NOT NULL,
  "state" text NOT NULL DEFAULT 'active',
  "deleteToken" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" timestamptz,
  CONSTRAINT "creator_asset_storage_object_pkey"
    PRIMARY KEY ("purpose", "digest"),
  CONSTRAINT "creator_asset_storage_object_contract_check"
    CHECK ("contractVersion" = 'toonspectrum.supabase-object-storage.v1'),
  CONSTRAINT "creator_asset_storage_object_purpose_check"
    CHECK ("purpose" IN ('source', 'derived', 'export')),
  CONSTRAINT "creator_asset_storage_object_digest_path_check"
    CHECK (
      "digest" ~ '^sha256:[a-f0-9]{64}$'
      AND "objectPath" =
        'sha256/' || substring("digest" FROM 8 FOR 2) || '/' || substring("digest" FROM 8)
    ),
  CONSTRAINT "creator_asset_storage_object_byte_length_check"
    CHECK ("byteLength" BETWEEN 1 AND 5368709120),
  CONSTRAINT "creator_asset_storage_object_content_type_check"
    CHECK (
      length("contentType") BETWEEN 3 AND 160
      AND "contentType" ~ '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$'
    ),
  CONSTRAINT "creator_asset_storage_object_state_check"
    CHECK ("state" IN ('active', 'deleting', 'deleted')),
  CONSTRAINT "creator_asset_storage_object_source_retention_check"
    CHECK ("purpose" <> 'source' OR "state" = 'active'),
  CONSTRAINT "creator_asset_storage_object_lifecycle_check"
    CHECK (
      (
        "state" = 'active'
        AND "deleteToken" IS NULL
        AND "deletedAt" IS NULL
      ) OR (
        "state" = 'deleting'
        AND "purpose" IN ('derived', 'export')
        AND "deleteToken" ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND "deletedAt" IS NULL
      ) OR (
        "state" = 'deleted'
        AND "purpose" IN ('derived', 'export')
        AND "deleteToken" IS NULL
        AND "deletedAt" IS NOT NULL
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "creator_asset_storage_object_path_unique"
  ON "creator_asset_storage_object" ("purpose", "objectPath");

CREATE TABLE IF NOT EXISTS "creator_work_asset_storage_reference" (
  "workId" text NOT NULL,
  "purpose" text NOT NULL,
  "referenceId" text NOT NULL,
  "objectDigest" text NOT NULL,
  "sourceAssetId" text NOT NULL,
  "state" text NOT NULL DEFAULT 'active',
  "deleteToken" text,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_work_asset_storage_reference_pkey"
    PRIMARY KEY ("workId", "purpose", "referenceId"),
  CONSTRAINT "creator_work_asset_storage_reference_asset_fkey"
    FOREIGN KEY ("workId", "sourceAssetId")
    REFERENCES "creator_work_asset"("workId", "assetId") ON DELETE CASCADE,
  CONSTRAINT "creator_work_asset_storage_reference_object_fkey"
    FOREIGN KEY ("purpose", "objectDigest")
    REFERENCES "creator_asset_storage_object"("purpose", "digest") ON DELETE RESTRICT,
  CONSTRAINT "creator_work_asset_storage_reference_created_by_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "creator_work_asset_storage_reference_purpose_check"
    CHECK ("purpose" IN ('source', 'derived', 'export')),
  CONSTRAINT "creator_work_asset_storage_reference_id_check"
    CHECK (
      length("referenceId") BETWEEN 1 AND 160
      AND "referenceId" !~ '[[:cntrl:]]'
    ),
  CONSTRAINT "creator_work_asset_storage_reference_digest_check"
    CHECK ("objectDigest" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "creator_work_asset_storage_reference_source_binding_check"
    CHECK ("purpose" <> 'source' OR "referenceId" = "sourceAssetId"),
  CONSTRAINT "creator_work_asset_storage_reference_lifecycle_check"
    CHECK (
      (
        "state" = 'active'
        AND "deleteToken" IS NULL
      ) OR (
        "state" = 'deleting'
        AND "purpose" IN ('derived', 'export')
        AND "deleteToken" ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
    )
);

CREATE INDEX IF NOT EXISTS "idx_creator_work_asset_storage_reference_object"
  ON "creator_work_asset_storage_reference" ("purpose", "objectDigest", "state");

CREATE INDEX IF NOT EXISTS "idx_creator_work_asset_storage_reference_source"
  ON "creator_work_asset_storage_reference" ("workId", "sourceAssetId");

REVOKE ALL ON TABLE
  "creator_asset_storage_object",
  "creator_work_asset_storage_reference"
FROM PUBLIC;

DO $creator_object_storage_contract$
BEGIN
  IF (
    SELECT count(*)
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.creator_asset_storage_object'::regclass
      AND conname = ANY(ARRAY[
        'creator_asset_storage_object_pkey',
        'creator_asset_storage_object_contract_check',
        'creator_asset_storage_object_purpose_check',
        'creator_asset_storage_object_digest_path_check',
        'creator_asset_storage_object_byte_length_check',
        'creator_asset_storage_object_content_type_check',
        'creator_asset_storage_object_state_check',
        'creator_asset_storage_object_source_retention_check',
        'creator_asset_storage_object_lifecycle_check'
      ]::text[])
  ) <> 9 THEN
    RAISE EXCEPTION 'creator asset storage object constraints are incomplete';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.creator_work_asset_storage_reference'::regclass
      AND conname = ANY(ARRAY[
        'creator_work_asset_storage_reference_pkey',
        'creator_work_asset_storage_reference_asset_fkey',
        'creator_work_asset_storage_reference_object_fkey',
        'creator_work_asset_storage_reference_created_by_fkey',
        'creator_work_asset_storage_reference_purpose_check',
        'creator_work_asset_storage_reference_id_check',
        'creator_work_asset_storage_reference_digest_check',
        'creator_work_asset_storage_reference_source_binding_check',
        'creator_work_asset_storage_reference_lifecycle_check'
      ]::text[])
  ) <> 9 THEN
    RAISE EXCEPTION 'creator work asset storage reference constraints are incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      (
        'creator_asset_storage_object_path_unique',
        'creator_asset_storage_object',
        true
      ),
      (
        'idx_creator_work_asset_storage_reference_object',
        'creator_work_asset_storage_reference',
        false
      ),
      (
        'idx_creator_work_asset_storage_reference_source',
        'creator_work_asset_storage_reference',
        false
      )
    ) AS required_index("indexName", "tableName", "unique")
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS index_record
      JOIN pg_catalog.pg_namespace AS index_namespace
        ON index_namespace.oid = index_record.relnamespace
      JOIN pg_catalog.pg_index AS index_state
        ON index_state.indexrelid = index_record.oid
      JOIN pg_catalog.pg_class AS indexed_table
        ON indexed_table.oid = index_state.indrelid
      JOIN pg_catalog.pg_namespace AS table_namespace
        ON table_namespace.oid = indexed_table.relnamespace
      WHERE index_record.relname = required_index."indexName"
        AND index_record.relkind = 'i'
        AND index_namespace.nspname = 'public'
        AND indexed_table.relname = required_index."tableName"
        AND table_namespace.nspname = 'public'
        AND index_state.indisunique = required_index."unique"
        AND index_state.indisvalid
        AND index_state.indisready
        AND index_state.indislive
    )
  ) THEN
    RAISE EXCEPTION 'creator object storage indexes are incomplete';
  END IF;
END
$creator_object_storage_contract$;

COMMIT;
