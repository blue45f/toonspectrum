-- Persist the primary physical provider for every immutable object and keep
-- verified secondary copies in a non-authoritative replica inventory.
-- Historical v1 rows predate purpose routing and were written to Supabase.

BEGIN;

ALTER TABLE public.creator_asset_storage_object
  ADD COLUMN IF NOT EXISTS "providerId" text;

ALTER TABLE public.creator_asset_storage_object
  DROP CONSTRAINT IF EXISTS creator_asset_storage_object_contract_check;

UPDATE public.creator_asset_storage_object
SET
  "providerId" = coalesce("providerId", 'supabase'),
  "contractVersion" = 'toonspectrum.private-object-storage.v2'
WHERE
  "providerId" IS NULL
  OR "contractVersion" = 'toonspectrum.supabase-object-storage.v1';

ALTER TABLE public.creator_asset_storage_object
  ALTER COLUMN "providerId" SET NOT NULL;

ALTER TABLE public.creator_asset_storage_object
  DROP CONSTRAINT IF EXISTS creator_asset_storage_object_provider_check;
ALTER TABLE public.creator_asset_storage_object
  ADD CONSTRAINT creator_asset_storage_object_contract_check
  CHECK ("contractVersion" = 'toonspectrum.private-object-storage.v2')
  NOT VALID;

ALTER TABLE public.creator_asset_storage_object
  ADD CONSTRAINT creator_asset_storage_object_provider_check
  CHECK ("providerId" IN ('supabase', 'cloudflare-r2', 'backblaze-b2'))
  NOT VALID;

ALTER TABLE public.creator_asset_storage_object
  VALIDATE CONSTRAINT creator_asset_storage_object_contract_check;
ALTER TABLE public.creator_asset_storage_object
  VALIDATE CONSTRAINT creator_asset_storage_object_provider_check;

CREATE TABLE IF NOT EXISTS public.creator_asset_storage_replica (
  "purpose" text NOT NULL,
  "objectDigest" text NOT NULL,
  "providerId" text NOT NULL,
  "objectPath" text NOT NULL,
  "byteLength" bigint NOT NULL,
  "contentType" text NOT NULL,
  "state" text NOT NULL DEFAULT 'active',
  "verifiedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" timestamptz,
  CONSTRAINT creator_asset_storage_replica_pkey
    PRIMARY KEY ("purpose", "objectDigest", "providerId"),
  CONSTRAINT creator_asset_storage_replica_object_fkey
    FOREIGN KEY ("purpose", "objectDigest")
    REFERENCES public.creator_asset_storage_object("purpose", "digest")
    ON DELETE CASCADE,
  CONSTRAINT creator_asset_storage_replica_purpose_check
    CHECK ("purpose" IN ('source', 'derived', 'export')),
  CONSTRAINT creator_asset_storage_replica_provider_check
    CHECK ("providerId" IN ('supabase', 'cloudflare-r2', 'backblaze-b2')),
  CONSTRAINT creator_asset_storage_replica_digest_path_check
    CHECK (
      "objectDigest" ~ '^sha256:[a-f0-9]{64}$'
      AND "objectPath" =
        'sha256/' || substring("objectDigest" FROM 8 FOR 2) || '/' ||
        substring("objectDigest" FROM 8)
    ),
  CONSTRAINT creator_asset_storage_replica_byte_length_check
    CHECK ("byteLength" BETWEEN 1 AND 5368709120),
  CONSTRAINT creator_asset_storage_replica_content_type_check
    CHECK (
      length("contentType") BETWEEN 3 AND 160
      AND "contentType" ~
        '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$'
    ),
  CONSTRAINT creator_asset_storage_replica_state_check
    CHECK ("state" IN ('active', 'deleting', 'deleted')),
  CONSTRAINT creator_asset_storage_replica_lifecycle_check
    CHECK (
      (
        "state" IN ('active', 'deleting')
        AND "deletedAt" IS NULL
      ) OR (
        "state" = 'deleted'
        AND "deletedAt" IS NOT NULL
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS creator_asset_storage_replica_path_unique
  ON public.creator_asset_storage_replica
  ("providerId", "purpose", "objectPath");

CREATE INDEX IF NOT EXISTS idx_creator_asset_storage_replica_state
  ON public.creator_asset_storage_replica
  ("providerId", "state", "updatedAt");

REVOKE ALL ON TABLE public.creator_asset_storage_replica FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.creator_asset_storage_replica_validate()
RETURNS trigger
LANGUAGE plpgsql
AS $creator_asset_storage_replica_validate$
DECLARE
  primary_provider text;
  primary_path text;
  primary_byte_length bigint;
  primary_content_type text;
BEGIN
  SELECT
    object."providerId",
    object."objectPath",
    object."byteLength",
    object."contentType"
  INTO STRICT
    primary_provider,
    primary_path,
    primary_byte_length,
    primary_content_type
  FROM public.creator_asset_storage_object AS object
  WHERE object."purpose" = NEW."purpose"
    AND object."digest" = NEW."objectDigest";

  IF NEW."providerId" = primary_provider THEN
    RAISE EXCEPTION 'storage replica cannot duplicate the primary provider';
  END IF;

  IF
    NEW."objectPath" IS DISTINCT FROM primary_path
    OR NEW."byteLength" IS DISTINCT FROM primary_byte_length
    OR NEW."contentType" IS DISTINCT FROM primary_content_type
  THEN
    RAISE EXCEPTION 'storage replica metadata differs from the primary object';
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    RAISE EXCEPTION 'storage replica primary object does not exist';
END
$creator_asset_storage_replica_validate$;

REVOKE ALL ON FUNCTION
  public.creator_asset_storage_replica_validate()
FROM PUBLIC;

DROP TRIGGER IF EXISTS creator_asset_storage_replica_validate_trigger
ON public.creator_asset_storage_replica;

CREATE TRIGGER creator_asset_storage_replica_validate_trigger
BEFORE INSERT OR UPDATE OF
  "purpose",
  "objectDigest",
  "providerId",
  "objectPath",
  "byteLength",
  "contentType"
ON public.creator_asset_storage_replica
FOR EACH ROW
EXECUTE FUNCTION public.creator_asset_storage_replica_validate();

DO $creator_asset_storage_location_contract$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.creator_asset_storage_object
    WHERE "providerId" IS NULL
      OR "contractVersion" <> 'toonspectrum.private-object-storage.v2'
  ) THEN
    RAISE EXCEPTION 'creator asset primary storage locations are incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid =
      'public.creator_asset_storage_replica'::regclass
      AND tgname = 'creator_asset_storage_replica_validate_trigger'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'creator asset storage replica trigger is missing';
  END IF;
END
$creator_asset_storage_location_contract$;

COMMIT;
