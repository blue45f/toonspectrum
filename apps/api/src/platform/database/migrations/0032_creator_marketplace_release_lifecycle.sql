-- Creator Marketplace owner lifecycle and millisecond-safe keyset timestamps.
--
-- Immutable release content remains untouched. This forward migration only narrows timestamp
-- precision to the JavaScript Date contract and replaces the 0031 lifecycle trigger so an owner
-- may relist the exact non-hidden package head under the same advisory lock used by publication.

BEGIN;

ALTER TABLE public."creator_marketplace_resource"
  ALTER COLUMN "createdAt" TYPE timestamptz(3)
    USING "createdAt"::timestamptz(3),
  ALTER COLUMN "updatedAt" TYPE timestamptz(3)
    USING "updatedAt"::timestamptz(3);

-- Replace the immutable-release INSERT guard under the same publisher/package advisory lock.
-- A hidden head represents an administrative package hold; a higher visible successor must not
-- bypass it. Owner delisting is intentionally not part of this guard.
CREATE OR REPLACE FUNCTION public.enforce_creator_marketplace_immutable_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $immutable_release$
DECLARE
  latest_version text;
  latest_ordinal integer;
  latest_hidden boolean;
  precedence integer;
BEGIN
  IF NEW."semverContractVersion" <> 2 THEN
    RAISE EXCEPTION 'new creator marketplace releases require strict SemVer contract v2'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_version_check';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'toonspectrum:creator-marketplace-release:v1:'
      || char_length(NEW."publisherId")::text || ':' || NEW."publisherId"
      || char_length(NEW."packageId")::text || ':' || NEW."packageId",
      0
    )
  );

  SELECT release."resourceVersion", release."releaseOrdinal", release."hidden"
  INTO latest_version, latest_ordinal, latest_hidden
  FROM public."creator_marketplace_resource" AS release
  WHERE release."publisherId" = NEW."publisherId"
    AND release."packageId" = NEW."packageId"
  ORDER BY release."releaseOrdinal" DESC
  LIMIT 1;

  IF latest_version IS NULL THEN
    IF NEW."releaseOrdinal" <> 1 THEN
      RAISE EXCEPTION 'initial creator marketplace release ordinal must be 1'
        USING ERRCODE = '23514',
          CONSTRAINT = 'creator_marketplace_resource_release_monotonic_check';
    END IF;
    RETURN NEW;
  END IF;

  IF latest_hidden THEN
    RAISE EXCEPTION 'hidden creator marketplace package head blocks successor publication'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_publish_moderated';
  END IF;

  precedence := public.creator_marketplace_semver_compare(
    NEW."resourceVersion",
    latest_version
  );
  IF precedence = 0 THEN
    RAISE EXCEPTION 'creator marketplace release has equal SemVer precedence'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_release_monotonic_check';
  END IF;
  IF precedence < 0 THEN
    RAISE EXCEPTION 'creator marketplace release is a SemVer downgrade'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_release_monotonic_check';
  END IF;
  IF NEW."releaseOrdinal" <> latest_ordinal + 1 THEN
    RAISE EXCEPTION 'creator marketplace release ordinal is not contiguous'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_release_monotonic_check';
  END IF;
  RETURN NEW;
END
$immutable_release$;

CREATE OR REPLACE FUNCTION public.enforce_creator_marketplace_resource_lifecycle_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $resource_lifecycle$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."publisherId" IS DISTINCT FROM OLD."publisherId"
    OR NEW."packageId" IS DISTINCT FROM OLD."packageId"
    OR NEW."name" IS DISTINCT FROM OLD."name"
    OR NEW."description" IS DISTINCT FROM OLD."description"
    OR NEW."tags" IS DISTINCT FROM OLD."tags"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."resourceVersion" IS DISTINCT FROM OLD."resourceVersion"
    OR NEW."releaseOrdinal" IS DISTINCT FROM OLD."releaseOrdinal"
    OR NEW."semverContractVersion" IS DISTINCT FROM OLD."semverContractVersion"
    OR NEW."minimumStudioVersion" IS DISTINCT FROM OLD."minimumStudioVersion"
    OR NEW."license" IS DISTINCT FROM OLD."license"
    OR NEW."provenanceOrigin" IS DISTINCT FROM OLD."provenanceOrigin"
    OR NEW."manifest" IS DISTINCT FROM OLD."manifest"
    OR NEW."manifestHash" IS DISTINCT FROM OLD."manifestHash"
    OR NEW."manifestByteSize" IS DISTINCT FROM OLD."manifestByteSize"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'creator marketplace release content is immutable'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_immutable_content';
  END IF;

  IF NEW."hidden" IS DISTINCT FROM OLD."hidden"
    AND NEW."delistedAt" IS DISTINCT FROM OLD."delistedAt"
  THEN
    RAISE EXCEPTION 'creator marketplace moderation and owner lifecycle are separate'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_lifecycle_separation';
  END IF;

  IF OLD."delistedAt" IS NOT NULL
    AND NEW."delistedAt" IS NOT NULL
    AND NEW."delistedAt" IS DISTINCT FROM OLD."delistedAt"
  THEN
    RAISE EXCEPTION 'creator marketplace delisting event is immutable'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_delisting_event_immutable';
  END IF;

  IF OLD."delistedAt" IS NOT NULL AND NEW."delistedAt" IS NULL THEN
    IF OLD."hidden" OR NEW."hidden" THEN
      RAISE EXCEPTION 'hidden creator marketplace release cannot be relisted'
        USING ERRCODE = '23514',
          CONSTRAINT = 'creator_marketplace_resource_relist_moderated';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'toonspectrum:creator-marketplace-release:v1:'
        || char_length(OLD."publisherId")::text || ':' || OLD."publisherId"
        || char_length(OLD."packageId")::text || ':' || OLD."packageId",
        0
      )
    );

    IF EXISTS (
      SELECT 1
      FROM public."creator_marketplace_resource" AS newer_release
      WHERE newer_release."publisherId" = OLD."publisherId"
        AND newer_release."packageId" = OLD."packageId"
        AND newer_release."releaseOrdinal" > OLD."releaseOrdinal"
    ) THEN
      RAISE EXCEPTION 'only creator marketplace package head can be relisted'
        USING ERRCODE = '23514',
          CONSTRAINT = 'creator_marketplace_resource_relist_non_head';
    END IF;
  END IF;

  IF (
    NEW."hidden" IS DISTINCT FROM OLD."hidden"
    OR NEW."delistedAt" IS DISTINCT FROM OLD."delistedAt"
  ) AND NEW."updatedAt" <= OLD."updatedAt" THEN
    RAISE EXCEPTION 'creator marketplace lifecycle change requires a fresh timestamp'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_lifecycle_timestamp_required';
  END IF;

  IF NEW."updatedAt" < OLD."updatedAt" THEN
    RAISE EXCEPTION 'creator marketplace lifecycle timestamp cannot move backwards'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_monotonic_update';
  END IF;
  RETURN NEW;
END
$resource_lifecycle$;

DROP TRIGGER IF EXISTS creator_marketplace_resource_lifecycle_update
  ON public."creator_marketplace_resource";
CREATE TRIGGER creator_marketplace_resource_lifecycle_update
BEFORE UPDATE ON public."creator_marketplace_resource"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_creator_marketplace_resource_lifecycle_update();

INSERT INTO public."toonspectrum_schema_migration" ("id", "appliedAt")
VALUES ('0032_creator_marketplace_release_lifecycle', statement_timestamp())
ON CONFLICT ("id") DO NOTHING;

COMMIT;
