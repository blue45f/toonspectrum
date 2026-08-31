-- Private Creator Marketplace cloud library and account-ever Studio install evidence.
--
-- This table intentionally contains no device id, IP address, user agent, or public counters.
-- A confirmation means only that the account successfully committed this exact immutable release
-- in Studio at least once. Current-device installation remains local Studio authority.

BEGIN;

-- Package kind is a package-level invariant. Fail the migration before installing the trigger if
-- historical corruption already violates that invariant.
DO $kind_preflight$
DECLARE
  conflicting_publisher text;
  conflicting_package text;
BEGIN
  SELECT release."publisherId", release."packageId"
  INTO conflicting_publisher, conflicting_package
  FROM public."creator_marketplace_resource" AS release
  GROUP BY release."publisherId", release."packageId"
  HAVING count(DISTINCT release."kind") > 1
  LIMIT 1;

  IF conflicting_publisher IS NOT NULL THEN
    RAISE EXCEPTION 'creator marketplace package history contains multiple kinds'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_package_kind_continuity';
  END IF;
END
$kind_preflight$;

CREATE OR REPLACE FUNCTION public.enforce_creator_marketplace_package_kind_continuity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $package_kind_continuity$
DECLARE
  existing_kind text;
BEGIN
  -- This trigger must own the exact release-admission lock. Relying on trigger order or the
  -- application publisher gate would let two direct concurrent first inserts both observe empty
  -- history. The immutable-release trigger uses the same re-entrant transaction lock.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'toonspectrum:creator-marketplace-release:v1:'
      || char_length(NEW."publisherId")::text || ':' || NEW."publisherId"
      || char_length(NEW."packageId")::text || ':' || NEW."packageId",
      0
    )
  );

  SELECT release."kind"
  INTO existing_kind
  FROM public."creator_marketplace_resource" AS release
  WHERE release."publisherId" = NEW."publisherId"
    AND release."packageId" = NEW."packageId"
  ORDER BY release."releaseOrdinal" ASC
  LIMIT 1;

  IF existing_kind IS NOT NULL AND NEW."kind" IS DISTINCT FROM existing_kind THEN
    RAISE EXCEPTION 'creator marketplace package kind cannot change between releases'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_package_kind_continuity';
  END IF;
  RETURN NEW;
END
$package_kind_continuity$;

DROP TRIGGER IF EXISTS creator_marketplace_resource_package_kind_continuity
  ON public."creator_marketplace_resource";
CREATE TRIGGER creator_marketplace_resource_package_kind_continuity
BEFORE INSERT ON public."creator_marketplace_resource"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_creator_marketplace_package_kind_continuity();

CREATE TABLE public."creator_marketplace_library_item" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "packageKeyHash" bytea NOT NULL,
  "publisherId" text REFERENCES public."user"("id") ON DELETE SET NULL,
  "packageId" text NOT NULL,
  "kind" text NOT NULL,
  "nameSnapshot" text NOT NULL,
  "addedFromReleaseId" text
    REFERENCES public."creator_marketplace_resource"("id") ON DELETE SET NULL,
  "addedFromResourceVersion" text NOT NULL,
  "addedFromReleaseOrdinal" integer NOT NULL,
  "addedFromManifestHash" text NOT NULL,
  "addedAt" timestamptz(3) NOT NULL DEFAULT statement_timestamp(),
  "archivedAt" timestamptz(3),
  "lastConfirmedReleaseId" text
    REFERENCES public."creator_marketplace_resource"("id") ON DELETE SET NULL,
  "lastConfirmedResourceVersion" text,
  "lastConfirmedReleaseOrdinal" integer,
  "lastConfirmedManifestHash" text,
  "firstConfirmedAt" timestamptz(3),
  "lastConfirmedAt" timestamptz(3),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT "creator_marketplace_library_user_package_hash_unique"
    UNIQUE ("userId", "packageKeyHash"),
  CONSTRAINT "creator_marketplace_library_package_hash_check"
    CHECK (octet_length("packageKeyHash") = 32),
  CONSTRAINT "creator_marketplace_library_package_id_check"
    CHECK ("packageId" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'),
  CONSTRAINT "creator_marketplace_library_kind_check"
    CHECK ("kind" IN ('asset', 'brush', 'filter', 'palette', 'template', '3d-preset')),
  CONSTRAINT "creator_marketplace_library_name_check"
    CHECK (char_length("nameSnapshot") BETWEEN 1 AND 80 AND "nameSnapshot" = btrim("nameSnapshot")),
  CONSTRAINT "creator_marketplace_library_added_version_check"
    CHECK (
      char_length("addedFromResourceVersion") BETWEEN 1 AND 40
      AND (
        "addedFromResourceVersion" ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-((0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(\.(0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
        OR "addedFromResourceVersion" ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$'
      )
    ),
  CONSTRAINT "creator_marketplace_library_added_ordinal_check"
    CHECK ("addedFromReleaseOrdinal" BETWEEN 1 AND 2147483647),
  CONSTRAINT "creator_marketplace_library_added_hash_check"
    CHECK ("addedFromManifestHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "creator_marketplace_library_confirmation_state_check"
    CHECK (
      (
        "lastConfirmedReleaseId" IS NULL
        AND "lastConfirmedResourceVersion" IS NULL
        AND "lastConfirmedReleaseOrdinal" IS NULL
        AND "lastConfirmedManifestHash" IS NULL
        AND "firstConfirmedAt" IS NULL
        AND "lastConfirmedAt" IS NULL
      ) OR (
        "lastConfirmedResourceVersion" IS NOT NULL
        AND char_length("lastConfirmedResourceVersion") BETWEEN 1 AND 40
        AND (
          "lastConfirmedResourceVersion" ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-((0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(\.(0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
          OR "lastConfirmedResourceVersion" ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$'
        )
        AND "lastConfirmedReleaseOrdinal" BETWEEN 1 AND 2147483647
        AND "lastConfirmedManifestHash" ~ '^[0-9a-f]{64}$'
        AND "firstConfirmedAt" IS NOT NULL
        AND "lastConfirmedAt" IS NOT NULL
      )
    ),
  CONSTRAINT "creator_marketplace_library_timestamp_check"
    CHECK (
      "updatedAt" >= "addedAt"
      AND ("archivedAt" IS NULL OR (
        "archivedAt" >= "addedAt" AND "updatedAt" >= "archivedAt"
      ))
      AND (
        "firstConfirmedAt" IS NULL
        OR (
          "firstConfirmedAt" >= "addedAt"
          AND "lastConfirmedAt" >= "firstConfirmedAt"
          AND "updatedAt" >= "lastConfirmedAt"
        )
      )
    )
);

CREATE UNIQUE INDEX "creator_marketplace_library_user_raw_package_unique"
  ON public."creator_marketplace_library_item" ("userId", "publisherId", "packageId")
  WHERE "publisherId" IS NOT NULL;
CREATE INDEX "idx_creator_marketplace_library_active"
  ON public."creator_marketplace_library_item" ("userId", "addedAt" DESC, "id" DESC)
  WHERE "archivedAt" IS NULL;
CREATE INDEX "idx_creator_marketplace_library_archived"
  ON public."creator_marketplace_library_item" ("userId", "addedAt" DESC, "id" DESC)
  WHERE "archivedAt" IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_creator_marketplace_library_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $library_insert$
DECLARE
  actor_status text;
  publisher_status text;
  existing_publisher text;
  existing_package text;
  existing_kind text;
BEGIN
  IF NEW."publisherId" IS NULL OR NEW."addedFromReleaseId" IS NULL THEN
    RAISE EXCEPTION 'creator marketplace library insert requires live source pointers'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_library_source_integrity';
  END IF;
  IF NEW."archivedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'new creator marketplace library membership must be active'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_library_insert_active_membership';
  END IF;

  -- Ignore caller clocks. Acquisition and first confirmation times are server facts.
  NEW."addedAt" := statement_timestamp();
  NEW."updatedAt" := NEW."addedAt";
  IF NEW."lastConfirmedReleaseOrdinal" IS NOT NULL THEN
    NEW."firstConfirmedAt" := NEW."addedAt";
    NEW."lastConfirmedAt" := NEW."addedAt";
  END IF;

  -- Global lock order is package -> account -> library identity. This is the exact advisory key
  -- used by publish/lifecycle triggers, so a concurrent successor cannot pass the head check.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'toonspectrum:creator-marketplace-release:v1:'
      || char_length(NEW."publisherId")::text || ':' || NEW."publisherId"
      || char_length(NEW."packageId")::text || ':' || NEW."packageId",
      0
    )
  );

  IF NEW."lastConfirmedReleaseOrdinal" IS NULL THEN
    -- Crossed A->B / B->A acquisitions lock the same two accounts in the same order.
    PERFORM account."id"
    FROM public."user" AS account
    WHERE account."id" = NEW."userId" OR account."id" = NEW."publisherId"
    ORDER BY account."id"
    FOR UPDATE;
  ELSE
    PERFORM account."id"
    FROM public."user" AS account
    WHERE account."id" = NEW."userId"
    FOR UPDATE;
  END IF;

  SELECT account."status" INTO actor_status
  FROM public."user" AS account
  WHERE account."id" = NEW."userId";
  IF actor_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'creator marketplace library requires an active account'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_library_active_user_required';
  END IF;
  IF NEW."lastConfirmedReleaseOrdinal" IS NULL THEN
    SELECT account."status" INTO publisher_status
    FROM public."user" AS account
    WHERE account."id" = NEW."publisherId";
    IF publisher_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'creator marketplace acquisition requires an active publisher'
        USING ERRCODE = '23514',
          CONSTRAINT = 'creator_marketplace_library_acquisition_current_head';
    END IF;
  END IF;

  -- Serialize even an absent unique-key row. ON CONFLICT remains idempotent only after the raw
  -- identity fields have been proven equal, so a digest collision can never merge two packages.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'toonspectrum:creator-marketplace-library:v1:'
      || char_length(NEW."userId")::text || ':' || NEW."userId"
      || ':' || encode(NEW."packageKeyHash", 'hex'),
      0
    )
  );

  SELECT item."publisherId", item."packageId", item."kind"
  INTO existing_publisher, existing_package, existing_kind
  FROM public."creator_marketplace_library_item" AS item
  WHERE item."userId" = NEW."userId"
    AND item."packageKeyHash" = NEW."packageKeyHash"
  LIMIT 1;
  IF FOUND AND (
    existing_publisher IS DISTINCT FROM NEW."publisherId"
    OR existing_package IS DISTINCT FROM NEW."packageId"
    OR existing_kind IS DISTINCT FROM NEW."kind"
  ) THEN
    RAISE EXCEPTION 'creator marketplace package digest maps to a different raw identity'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_library_package_identity_integrity';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public."creator_marketplace_resource" AS release
    WHERE release."id" = NEW."addedFromReleaseId"
      AND release."publisherId" = NEW."publisherId"
      AND release."packageId" = NEW."packageId"
      AND release."kind" = NEW."kind"
      AND release."resourceVersion" = NEW."addedFromResourceVersion"
      AND release."releaseOrdinal" = NEW."addedFromReleaseOrdinal"
      AND release."manifestHash" = NEW."addedFromManifestHash"
  ) THEN
    RAISE EXCEPTION 'creator marketplace library source snapshot does not match release'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_library_source_integrity';
  END IF;

  -- An acquisition is a current catalog membership action. Unlike a Studio confirmation below,
  -- it must never use a visible historical release or fall back behind a hidden/delisted head.
  IF NEW."lastConfirmedReleaseOrdinal" IS NULL AND NOT EXISTS (
    SELECT 1
    FROM public."creator_marketplace_resource" AS release
    JOIN public."user" AS publisher ON publisher."id" = release."publisherId"
    WHERE release."id" = NEW."addedFromReleaseId"
      AND release."hidden" = false
      AND release."delistedAt" IS NULL
      AND publisher."status" = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM public."creator_marketplace_resource" AS newer_release
        WHERE newer_release."publisherId" = release."publisherId"
          AND newer_release."packageId" = release."packageId"
          AND newer_release."releaseOrdinal" > release."releaseOrdinal"
      )
  ) THEN
    RAISE EXCEPTION 'creator marketplace acquisition requires the current public package head'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_library_acquisition_current_head';
  END IF;

  IF NEW."lastConfirmedReleaseOrdinal" IS NOT NULL THEN
    IF NEW."kind" NOT IN ('brush', 'filter', 'palette') THEN
      RAISE EXCEPTION 'creator marketplace kind cannot be confirmed by Studio P0'
        USING ERRCODE = '23514',
          CONSTRAINT = 'creator_marketplace_library_confirmable_kind';
    END IF;
    IF NEW."lastConfirmedReleaseId" IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public."creator_marketplace_resource" AS release
      WHERE release."id" = NEW."lastConfirmedReleaseId"
        AND release."publisherId" = NEW."publisherId"
        AND release."packageId" = NEW."packageId"
        AND release."kind" = NEW."kind"
        AND release."resourceVersion" = NEW."lastConfirmedResourceVersion"
        AND release."releaseOrdinal" = NEW."lastConfirmedReleaseOrdinal"
        AND release."manifestHash" = NEW."lastConfirmedManifestHash"
    ) THEN
      RAISE EXCEPTION 'creator marketplace install confirmation does not match release'
        USING ERRCODE = '23514',
          CONSTRAINT = 'creator_marketplace_library_confirmation_integrity';
    END IF;
  END IF;
  RETURN NEW;
END
$library_insert$;

CREATE TRIGGER creator_marketplace_library_insert_guard
BEFORE INSERT ON public."creator_marketplace_library_item"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_creator_marketplace_library_insert();

CREATE OR REPLACE FUNCTION public.enforce_creator_marketplace_library_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $library_update$
DECLARE
  actor_status text;
BEGIN
  IF NEW."lastConfirmedReleaseOrdinal" IS DISTINCT FROM OLD."lastConfirmedReleaseOrdinal"
    AND NEW."publisherId" IS NOT NULL
  THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'toonspectrum:creator-marketplace-release:v1:'
        || char_length(NEW."publisherId")::text || ':' || NEW."publisherId"
        || char_length(NEW."packageId")::text || ':' || NEW."packageId",
        0
      )
    );
  END IF;

  -- FK SET NULL pointer cleanup must remain possible for inactive buyers so publisher/resource
  -- deletion can preserve snapshots. User-initiated mutations always advance updatedAt.
  IF NEW."updatedAt" IS DISTINCT FROM OLD."updatedAt" THEN
    SELECT account."status"
    INTO actor_status
    FROM public."user" AS account
    WHERE account."id" = NEW."userId"
    FOR UPDATE;
    IF actor_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'creator marketplace library requires an active account'
        USING ERRCODE = '23514',
          CONSTRAINT = 'creator_marketplace_library_active_user_required';
    END IF;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."userId" IS DISTINCT FROM OLD."userId"
    OR NEW."packageKeyHash" IS DISTINCT FROM OLD."packageKeyHash"
    OR NEW."packageId" IS DISTINCT FROM OLD."packageId"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."nameSnapshot" IS DISTINCT FROM OLD."nameSnapshot"
    OR NEW."addedFromResourceVersion" IS DISTINCT FROM OLD."addedFromResourceVersion"
    OR NEW."addedFromReleaseOrdinal" IS DISTINCT FROM OLD."addedFromReleaseOrdinal"
    OR NEW."addedFromManifestHash" IS DISTINCT FROM OLD."addedFromManifestHash"
    OR NEW."addedAt" IS DISTINCT FROM OLD."addedAt"
  THEN
    RAISE EXCEPTION 'creator marketplace library identity and acquisition snapshot are immutable'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_library_immutable_snapshot';
  END IF;

  IF NEW."publisherId" IS DISTINCT FROM OLD."publisherId"
    AND NOT (OLD."publisherId" IS NOT NULL AND NEW."publisherId" IS NULL)
  THEN
    RAISE EXCEPTION 'creator marketplace library publisher pointer is immutable'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_library_immutable_snapshot';
  END IF;
  IF NEW."addedFromReleaseId" IS DISTINCT FROM OLD."addedFromReleaseId"
    AND NOT (OLD."addedFromReleaseId" IS NOT NULL AND NEW."addedFromReleaseId" IS NULL)
  THEN
    RAISE EXCEPTION 'creator marketplace library source pointer is immutable'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_library_immutable_snapshot';
  END IF;

  IF OLD."lastConfirmedReleaseOrdinal" IS NOT NULL
    AND NEW."lastConfirmedReleaseOrdinal" IS NULL
  THEN
    RAISE EXCEPTION 'creator marketplace install confirmation cannot be removed'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_library_confirmation_monotonic';
  END IF;
  IF OLD."lastConfirmedReleaseOrdinal" IS NOT NULL
    AND NEW."lastConfirmedReleaseOrdinal" < OLD."lastConfirmedReleaseOrdinal"
  THEN
    RAISE EXCEPTION 'creator marketplace install confirmation cannot move backwards'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_library_confirmation_monotonic';
  END IF;

  IF OLD."lastConfirmedReleaseOrdinal" IS NOT NULL
    AND NEW."lastConfirmedReleaseOrdinal" = OLD."lastConfirmedReleaseOrdinal"
  THEN
    IF NEW."lastConfirmedResourceVersion" IS DISTINCT FROM OLD."lastConfirmedResourceVersion"
      OR NEW."lastConfirmedManifestHash" IS DISTINCT FROM OLD."lastConfirmedManifestHash"
      OR (
        NEW."lastConfirmedReleaseId" IS DISTINCT FROM OLD."lastConfirmedReleaseId"
        AND NOT (
          OLD."lastConfirmedReleaseId" IS NOT NULL
          AND NEW."lastConfirmedReleaseId" IS NULL
        )
      )
    THEN
      RAISE EXCEPTION 'equal confirmation ordinal has different immutable evidence'
        USING ERRCODE = '23514',
          CONSTRAINT = 'creator_marketplace_library_confirmation_equivocation';
    END IF;
  END IF;

  IF NEW."lastConfirmedReleaseOrdinal" IS NOT NULL
    AND (
      OLD."lastConfirmedReleaseOrdinal" IS NULL
      OR NEW."lastConfirmedReleaseOrdinal" > OLD."lastConfirmedReleaseOrdinal"
    )
  THEN
    IF NEW."kind" NOT IN ('brush', 'filter', 'palette')
      OR NEW."publisherId" IS NULL
      OR NEW."lastConfirmedReleaseId" IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public."creator_marketplace_resource" AS release
        WHERE release."id" = NEW."lastConfirmedReleaseId"
          AND release."publisherId" = NEW."publisherId"
          AND release."packageId" = NEW."packageId"
          AND release."kind" = NEW."kind"
          AND release."resourceVersion" = NEW."lastConfirmedResourceVersion"
          AND release."releaseOrdinal" = NEW."lastConfirmedReleaseOrdinal"
          AND release."manifestHash" = NEW."lastConfirmedManifestHash"
      )
    THEN
      RAISE EXCEPTION 'creator marketplace install confirmation does not match release'
        USING ERRCODE = '23514',
          CONSTRAINT = 'creator_marketplace_library_confirmation_integrity';
    END IF;
  END IF;

  IF OLD."firstConfirmedAt" IS NOT NULL
    AND NEW."firstConfirmedAt" IS DISTINCT FROM OLD."firstConfirmedAt"
  THEN
    RAISE EXCEPTION 'first creator marketplace confirmation timestamp is immutable'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_library_confirmation_monotonic';
  END IF;
  IF OLD."lastConfirmedAt" IS NOT NULL
    AND NEW."lastConfirmedAt" < OLD."lastConfirmedAt"
  THEN
    RAISE EXCEPTION 'creator marketplace confirmation timestamp cannot move backwards'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_library_confirmation_monotonic';
  END IF;
  IF NEW."lastConfirmedReleaseOrdinal" IS DISTINCT FROM OLD."lastConfirmedReleaseOrdinal"
    AND NEW."lastConfirmedAt" <= COALESCE(OLD."lastConfirmedAt", OLD."addedAt")
  THEN
    RAISE EXCEPTION 'creator marketplace confirmation advancement needs a fresh server timestamp'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_library_confirmation_monotonic';
  END IF;
  IF NEW."updatedAt" < OLD."updatedAt"
    OR (
      (
        NEW."archivedAt" IS DISTINCT FROM OLD."archivedAt"
        OR NEW."lastConfirmedReleaseOrdinal" IS DISTINCT FROM OLD."lastConfirmedReleaseOrdinal"
      )
      AND NEW."updatedAt" <= OLD."updatedAt"
    )
  THEN
    RAISE EXCEPTION 'creator marketplace library mutation needs a monotonic server timestamp'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_library_update_timestamp';
  END IF;
  RETURN NEW;
END
$library_update$;

CREATE TRIGGER creator_marketplace_library_update_guard
BEFORE UPDATE ON public."creator_marketplace_library_item"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_creator_marketplace_library_update();

CREATE OR REPLACE FUNCTION public.cleanup_creator_marketplace_library_on_user_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $library_user_cleanup$
BEGIN
  IF NEW."status" = 'deleted' AND OLD."status" IS DISTINCT FROM 'deleted' THEN
    DELETE FROM public."creator_marketplace_library_item"
    WHERE "userId" = NEW."id";
  END IF;
  RETURN NEW;
END
$library_user_cleanup$;

DROP TRIGGER IF EXISTS creator_marketplace_library_soft_delete_cleanup
  ON public."user";
CREATE TRIGGER creator_marketplace_library_soft_delete_cleanup
AFTER UPDATE OF "status" ON public."user"
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_creator_marketplace_library_on_user_delete();

-- Migration files do not know the environment-specific runtime role. Remove ambient PUBLIC
-- access here; the production migration runner grants the explicit runtime-role privileges when
-- this migration is integrated into its shared manifest.
REVOKE ALL ON TABLE public."creator_marketplace_library_item" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_creator_marketplace_package_kind_continuity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_creator_marketplace_library_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_creator_marketplace_library_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_creator_marketplace_library_on_user_delete() FROM PUBLIC;

INSERT INTO public."toonspectrum_schema_migration" ("id", "appliedAt")
VALUES ('0033_creator_marketplace_cloud_library', statement_timestamp())
ON CONFLICT ("id") DO NOTHING;

COMMIT;
