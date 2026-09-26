-- Creator Marketplace immutable release ordering.
--
-- Each release remains a distinct row. `releaseOrdinal` is allocated once and never updated;
-- catalog queries can therefore expose only the semantic head without hiding historical detail
-- URLs. Existing rows are ordered by SemVer precedence during this forward migration. If an old
-- database already contains two build variants with equal precedence, fail closed instead of
-- silently choosing one of the equivocating releases.

BEGIN;

ALTER TABLE public."creator_marketplace_resource"
  ADD COLUMN IF NOT EXISTS "releaseOrdinal" integer;
ALTER TABLE public."creator_marketplace_resource"
  ADD COLUMN IF NOT EXISTS "delistedAt" timestamptz;
ALTER TABLE public."creator_marketplace_resource"
  ADD COLUMN IF NOT EXISTS "semverContractVersion" smallint NOT NULL DEFAULT 2;

-- 0021 accepted numeric prerelease identifiers with leading zeroes (for example 1.0.0-01).
-- Preserve those immutable historical manifests under their original contract while every new
-- row defaults to the strict SemVer 2.0 contract. Rewriting the manifest/version would invalidate
-- its recorded hash, so an explicit provenance marker is safer than silent normalization.
UPDATE public."creator_marketplace_resource"
SET "semverContractVersion" = 1
WHERE NOT (
  char_length("resourceVersion") BETWEEN 1 AND 40
  AND "resourceVersion" ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-((0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(\.(0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
  AND char_length("minimumStudioVersion") BETWEEN 1 AND 40
  AND "minimumStudioVersion" ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-((0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(\.(0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
);

ALTER TABLE public."creator_marketplace_resource"
  DROP CONSTRAINT IF EXISTS "creator_marketplace_resource_version_check";
ALTER TABLE public."creator_marketplace_resource"
  ADD CONSTRAINT "creator_marketplace_resource_version_check"
  CHECK (
    (
      "semverContractVersion" = 2
      AND char_length("resourceVersion") BETWEEN 1 AND 40
      AND "resourceVersion" ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-((0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(\.(0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
      AND char_length("minimumStudioVersion") BETWEEN 1 AND 40
      AND "minimumStudioVersion" ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-((0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(\.(0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
    )
    OR (
      "semverContractVersion" = 1
      AND "resourceVersion" ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$'
      AND "minimumStudioVersion" ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$'
    )
  ) NOT VALID;
ALTER TABLE public."creator_marketplace_resource"
  VALIDATE CONSTRAINT "creator_marketplace_resource_version_check";

CREATE OR REPLACE FUNCTION public.creator_marketplace_semver_compare(
  left_version text,
  right_version text
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $semver_compare$
DECLARE
  left_precedence text;
  right_precedence text;
  left_dash integer;
  right_dash integer;
  left_core text[];
  right_core text[];
  left_prerelease text[];
  right_prerelease text[];
  component_index integer;
  left_identifier text;
  right_identifier text;
  left_is_numeric boolean;
  right_is_numeric boolean;
BEGIN
  left_precedence := split_part(left_version, '+', 1);
  right_precedence := split_part(right_version, '+', 1);
  left_dash := strpos(left_precedence, '-');
  right_dash := strpos(right_precedence, '-');
  left_core := string_to_array(
    CASE WHEN left_dash > 0 THEN left(left_precedence, left_dash - 1)
      ELSE left_precedence END,
    '.'
  );
  right_core := string_to_array(
    CASE WHEN right_dash > 0 THEN left(right_precedence, right_dash - 1)
      ELSE right_precedence END,
    '.'
  );

  FOR component_index IN 1..3 LOOP
    IF length(left_core[component_index]) <> length(right_core[component_index]) THEN
      RETURN CASE
        WHEN length(left_core[component_index]) > length(right_core[component_index]) THEN 1
        ELSE -1
      END;
    END IF;
    IF left_core[component_index] COLLATE "C" <> right_core[component_index] COLLATE "C" THEN
      RETURN CASE
        WHEN left_core[component_index] COLLATE "C" > right_core[component_index] COLLATE "C" THEN 1
        ELSE -1
      END;
    END IF;
  END LOOP;

  IF left_dash = 0 AND right_dash = 0 THEN
    RETURN 0;
  END IF;
  IF left_dash = 0 THEN
    RETURN 1;
  END IF;
  IF right_dash = 0 THEN
    RETURN -1;
  END IF;

  left_prerelease := string_to_array(substr(left_precedence, left_dash + 1), '.');
  right_prerelease := string_to_array(substr(right_precedence, right_dash + 1), '.');
  FOR component_index IN 1..least(
    cardinality(left_prerelease),
    cardinality(right_prerelease)
  ) LOOP
    left_identifier := left_prerelease[component_index];
    right_identifier := right_prerelease[component_index];
    IF left_identifier = right_identifier THEN
      CONTINUE;
    END IF;

    left_is_numeric := left_identifier ~ '^[0-9]+$';
    right_is_numeric := right_identifier ~ '^[0-9]+$';
    IF left_is_numeric AND NOT right_is_numeric THEN
      RETURN -1;
    END IF;
    IF right_is_numeric AND NOT left_is_numeric THEN
      RETURN 1;
    END IF;
    IF left_is_numeric THEN
      IF left_identifier::numeric = right_identifier::numeric THEN
        CONTINUE;
      END IF;
      RETURN CASE
        WHEN left_identifier::numeric > right_identifier::numeric THEN 1
        ELSE -1
      END;
    END IF;
    RETURN CASE
      WHEN left_identifier COLLATE "C" > right_identifier COLLATE "C" THEN 1
      ELSE -1
    END;
  END LOOP;

  IF cardinality(left_prerelease) = cardinality(right_prerelease) THEN
    RETURN 0;
  END IF;
  RETURN CASE
    WHEN cardinality(left_prerelease) > cardinality(right_prerelease) THEN 1
    ELSE -1
  END;
END
$semver_compare$;

DO $release_backfill$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."creator_marketplace_resource" AS left_release
    JOIN public."creator_marketplace_resource" AS right_release
      ON right_release."publisherId" = left_release."publisherId"
      AND right_release."packageId" = left_release."packageId"
      AND right_release."id" > left_release."id"
    WHERE public.creator_marketplace_semver_compare(
      left_release."resourceVersion",
      right_release."resourceVersion"
    ) = 0
  ) THEN
    RAISE EXCEPTION
      'creator marketplace history contains equal-precedence release equivocation; audit before migration';
  END IF;
END
$release_backfill$;

UPDATE public."creator_marketplace_resource" AS release
SET "releaseOrdinal" = (
  SELECT count(*)::integer + 1
  FROM public."creator_marketplace_resource" AS earlier_release
  WHERE earlier_release."publisherId" = release."publisherId"
    AND earlier_release."packageId" = release."packageId"
    AND public.creator_marketplace_semver_compare(
      earlier_release."resourceVersion",
      release."resourceVersion"
    ) < 0
);

ALTER TABLE public."creator_marketplace_resource"
  ALTER COLUMN "releaseOrdinal" SET DEFAULT 1,
  ALTER COLUMN "releaseOrdinal" SET NOT NULL;

ALTER TABLE public."creator_marketplace_resource"
  DROP CONSTRAINT IF EXISTS "creator_marketplace_resource_release_ordinal_check";
ALTER TABLE public."creator_marketplace_resource"
  ADD CONSTRAINT "creator_marketplace_resource_release_ordinal_check"
  CHECK ("releaseOrdinal" >= 1) NOT VALID;
ALTER TABLE public."creator_marketplace_resource"
  VALIDATE CONSTRAINT "creator_marketplace_resource_release_ordinal_check";

DROP INDEX IF EXISTS public."creator_marketplace_resource_publisher_package_ordinal_unique";
CREATE UNIQUE INDEX "creator_marketplace_resource_publisher_package_ordinal_unique"
  ON public."creator_marketplace_resource" (
    "publisherId",
    "packageId",
    "releaseOrdinal"
  );

DROP INDEX IF EXISTS public."creator_marketplace_resource_publisher_package_precedence_uniq";
CREATE UNIQUE INDEX "creator_marketplace_resource_publisher_package_precedence_uniq"
  ON public."creator_marketplace_resource" (
    "publisherId",
    "packageId",
    split_part("resourceVersion", '+', 1)
  );

DROP INDEX IF EXISTS public."idx_creator_marketplace_resource_catalog";
CREATE INDEX "idx_creator_marketplace_resource_catalog"
  ON public."creator_marketplace_resource" (
    "hidden",
    "delistedAt",
    "kind",
    "createdAt" DESC,
    "id" DESC
  );

DROP INDEX IF EXISTS public."idx_creator_marketplace_resource_search";
CREATE INDEX "idx_creator_marketplace_resource_search"
  ON public."creator_marketplace_resource"
  USING gin ("searchText" gin_trgm_ops)
  WHERE "hidden" = false AND "delistedAt" IS NULL;

DROP INDEX IF EXISTS public."idx_creator_marketplace_resource_tags";
CREATE INDEX "idx_creator_marketplace_resource_tags"
  ON public."creator_marketplace_resource"
  USING gin ("tags" jsonb_path_ops)
  WHERE "hidden" = false AND "delistedAt" IS NULL;

CREATE OR REPLACE FUNCTION public.enforce_creator_marketplace_immutable_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $immutable_release$
DECLARE
  latest_version text;
  latest_ordinal integer;
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

  SELECT release."resourceVersion", release."releaseOrdinal"
  INTO latest_version, latest_ordinal
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

DROP TRIGGER IF EXISTS creator_marketplace_resource_immutable_release
  ON public."creator_marketplace_resource";
CREATE TRIGGER creator_marketplace_resource_immutable_release
BEFORE INSERT ON public."creator_marketplace_resource"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_creator_marketplace_immutable_release();

INSERT INTO public."toonspectrum_schema_migration" ("id", "appliedAt")
VALUES ('0030_creator_marketplace_immutable_releases', statement_timestamp())
ON CONFLICT ("id") DO NOTHING;

COMMIT;
