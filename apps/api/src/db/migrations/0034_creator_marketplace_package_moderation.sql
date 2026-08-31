-- Creator Marketplace package-scoped moderation authority.
--
-- 0031 stored immutable release-level report evidence and a release-row `hidden` marker. That
-- marker cannot safely protect a package when a newer release races an administrator decision.
-- This migration backfills one locked state row per publisher/package, records every subsequent
-- hide/restore decision append-only, and retains `resource.hidden` only as immutable legacy input.

BEGIN;

CREATE TABLE public."creator_marketplace_package_moderation_decision" (
  "id" text PRIMARY KEY NOT NULL,
  "publisherIdSnapshot" text NOT NULL,
  "packageIdSnapshot" text NOT NULL,
  "revision" integer NOT NULL,
  "action" text NOT NULL,
  "actorKind" text NOT NULL DEFAULT 'admin',
  "reviewerId" text REFERENCES public."user"("id") ON DELETE SET NULL,
  "note" text NOT NULL,
  "sourceResourceSnapshotId" text,
  "sourceReportId" text REFERENCES public."creator_marketplace_resource_report"("id")
    ON DELETE SET NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_marketplace_package_moderation_decision_revision_unique"
    UNIQUE ("publisherIdSnapshot", "packageIdSnapshot", "revision"),
  CONSTRAINT "creator_marketplace_package_moderation_decision_pkg_id_check"
    CHECK ("packageIdSnapshot" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'),
  CONSTRAINT "creator_marketplace_package_moderation_decision_revision_check"
    CHECK ("revision" >= 1),
  CONSTRAINT "creator_marketplace_package_moderation_decision_action_check"
    CHECK ("action" IN ('hide', 'restore')),
  CONSTRAINT "creator_marketplace_package_moderation_decision_actor_check"
    CHECK (
      "actorKind" = 'admin'
      OR ("actorKind" = 'system' AND "reviewerId" IS NULL)
    ),
  CONSTRAINT "creator_marketplace_package_moderation_decision_note_check"
    CHECK (char_length("note") BETWEEN 1 AND 500),
  CONSTRAINT "creator_marketplace_package_moderation_decision_source_id_check"
    CHECK (
      "sourceResourceSnapshotId" IS NULL
      OR "sourceResourceSnapshotId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
);

CREATE INDEX "idx_creator_marketplace_package_moderation_decision_package"
  ON public."creator_marketplace_package_moderation_decision" (
    "publisherIdSnapshot",
    "packageIdSnapshot",
    "revision" DESC
  );

CREATE TABLE public."creator_marketplace_package_moderation" (
  "publisherId" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "packageId" text NOT NULL,
  "state" text NOT NULL DEFAULT 'active',
  "revision" integer NOT NULL DEFAULT 0,
  "currentDecisionId" text REFERENCES public."creator_marketplace_package_moderation_decision"("id"),
  "hiddenAt" timestamptz(3),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_marketplace_package_moderation_pkey"
    PRIMARY KEY ("publisherId", "packageId"),
  CONSTRAINT "creator_marketplace_package_moderation_package_id_check"
    CHECK ("packageId" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'),
  CONSTRAINT "creator_marketplace_package_moderation_state_check"
    CHECK ("state" IN ('active', 'hidden')),
  CONSTRAINT "creator_marketplace_package_moderation_revision_check"
    CHECK ("revision" >= 0),
  CONSTRAINT "creator_marketplace_package_moderation_state_shape_check"
    CHECK (
      (
        "revision" = 0
        AND "state" = 'active'
        AND "currentDecisionId" IS NULL
        AND "hiddenAt" IS NULL
      )
      OR (
        "revision" >= 1
        AND "currentDecisionId" IS NOT NULL
        AND (
          ("state" = 'active' AND "hiddenAt" IS NULL)
          OR ("state" = 'hidden' AND "hiddenAt" IS NOT NULL)
        )
      )
    )
);

CREATE INDEX "idx_creator_marketplace_package_moderation_state"
  ON public."creator_marketplace_package_moderation" (
    "state",
    "updatedAt" DESC,
    "publisherId",
    "packageId"
  );

-- Restoring package state must make even a legacy hidden-marker row searchable again. Visibility
-- is applied by the package-state join; resource partial indexes retain owner delisting only.
DROP INDEX public."idx_creator_marketplace_resource_search";
CREATE INDEX "idx_creator_marketplace_resource_search"
  ON public."creator_marketplace_resource"
  USING gin ("searchText" gin_trgm_ops)
  WHERE "delistedAt" IS NULL;

DROP INDEX public."idx_creator_marketplace_resource_tags";
CREATE INDEX "idx_creator_marketplace_resource_tags"
  ON public."creator_marketplace_resource"
  USING gin ("tags" jsonb_path_ops)
  WHERE "delistedAt" IS NULL;

-- A single hidden release marker conservatively holds the whole package during cutover. Use the
-- newest hidden row UUID as the deterministic backfill decision id; no evidence bytes are changed.
WITH "hiddenPackage" AS (
  SELECT DISTINCT ON (release."publisherId", release."packageId")
    release."id" AS "decisionId",
    release."publisherId",
    release."packageId",
    release."updatedAt" AS "hiddenAt"
  FROM public."creator_marketplace_resource" AS release
  WHERE release."hidden" = true
  ORDER BY release."publisherId", release."packageId", release."releaseOrdinal" DESC
)
INSERT INTO public."creator_marketplace_package_moderation_decision" (
  "id",
  "publisherIdSnapshot",
  "packageIdSnapshot",
  "revision",
  "action",
  "actorKind",
  "reviewerId",
  "note",
  "sourceResourceSnapshotId",
  "sourceReportId",
  "createdAt"
)
SELECT
  "hiddenPackage"."decisionId",
  "hiddenPackage"."publisherId",
  "hiddenPackage"."packageId",
  1,
  'hide',
  'system',
  NULL,
  'Legacy release moderation marker backfill.',
  "hiddenPackage"."decisionId",
  NULL,
  "hiddenPackage"."hiddenAt"
FROM "hiddenPackage";

WITH "packageHead" AS (
  SELECT DISTINCT ON (release."publisherId", release."packageId")
    release."publisherId",
    release."packageId",
    release."updatedAt"
  FROM public."creator_marketplace_resource" AS release
  ORDER BY release."publisherId", release."packageId", release."releaseOrdinal" DESC
),
"hiddenPackage" AS (
  SELECT DISTINCT ON (release."publisherId", release."packageId")
    release."id" AS "decisionId",
    release."publisherId",
    release."packageId",
    release."updatedAt" AS "hiddenAt"
  FROM public."creator_marketplace_resource" AS release
  WHERE release."hidden" = true
  ORDER BY release."publisherId", release."packageId", release."releaseOrdinal" DESC
)
INSERT INTO public."creator_marketplace_package_moderation" (
  "publisherId",
  "packageId",
  "state",
  "revision",
  "currentDecisionId",
  "hiddenAt",
  "updatedAt"
)
SELECT
  "packageHead"."publisherId",
  "packageHead"."packageId",
  CASE WHEN "hiddenPackage"."decisionId" IS NULL THEN 'active' ELSE 'hidden' END,
  CASE WHEN "hiddenPackage"."decisionId" IS NULL THEN 0 ELSE 1 END,
  "hiddenPackage"."decisionId",
  "hiddenPackage"."hiddenAt",
  greatest("packageHead"."updatedAt", "hiddenPackage"."hiddenAt")
FROM "packageHead"
LEFT JOIN "hiddenPackage"
  ON "hiddenPackage"."publisherId" = "packageHead"."publisherId"
 AND "hiddenPackage"."packageId" = "packageHead"."packageId";

ALTER TABLE public."creator_marketplace_resource_report"
  ADD COLUMN "packagePublisherIdSnapshot" text,
  ADD COLUMN "packageIdSnapshot" text,
  ADD COLUMN "packageModerationRevision" integer,
  ADD COLUMN "packageReportEpoch" integer;

-- Preserve evidence JSON byte-for-byte. Only relational snapshot columns are populated for rows
-- whose release still exists; legacy orphan reports remain intelligible v1 evidence.
UPDATE public."creator_marketplace_resource_report" AS report
SET
  "packagePublisherIdSnapshot" = release."publisherId",
  "packageIdSnapshot" = release."packageId",
  "packageModerationRevision" = moderation."revision"
FROM public."creator_marketplace_resource" AS release
JOIN public."creator_marketplace_package_moderation" AS moderation
  ON moderation."publisherId" = release."publisherId"
 AND moderation."packageId" = release."packageId"
WHERE report."resourceId" = release."id";

ALTER TABLE public."creator_marketplace_resource_report"
  ADD CONSTRAINT "creator_marketplace_resource_report_package_snapshot_check"
  CHECK (
    (
      "packagePublisherIdSnapshot" IS NULL
      AND "packageIdSnapshot" IS NULL
      AND "packageModerationRevision" IS NULL
      AND "packageReportEpoch" IS NULL
    )
    OR (
      char_length("packagePublisherIdSnapshot") BETWEEN 1 AND 160
      AND "packageIdSnapshot" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'
      AND "packageModerationRevision" >= 0
      AND ("packageReportEpoch" IS NULL OR "packageReportEpoch" >= 1)
    )
  );

CREATE INDEX "idx_creator_marketplace_resource_report_package_queue"
  ON public."creator_marketplace_resource_report" (
    "packagePublisherIdSnapshot",
    "packageIdSnapshot",
    "status",
    "createdAt" DESC,
    "id" DESC
  );

-- Legacy v2 uniqueness remains package-revision scoped and read-only. New v3 reports additionally
-- include the absolute-head release ordinal, while v1 rows remain release-scoped; no existing
-- evidence bytes are rewritten by this forward migration.
ALTER TABLE public."creator_marketplace_resource_report"
  DROP CONSTRAINT "creator_marketplace_resource_report_release_reporter_unique";

CREATE UNIQUE INDEX "creator_marketplace_resource_report_release_reporter_v1_unique"
  ON public."creator_marketplace_resource_report" (
    "resourceSnapshotId",
    "reporterKeyHash"
  )
  WHERE "evidence"->>'schemaVersion' = '1';

CREATE UNIQUE INDEX "creator_marketplace_resource_report_package_reporter_v2_unique"
  ON public."creator_marketplace_resource_report" (
    "packagePublisherIdSnapshot",
    "packageIdSnapshot",
    "packageModerationRevision",
    "reporterKeyHash"
  )
  WHERE "evidence"->>'schemaVersion' = '2';

CREATE UNIQUE INDEX "creator_marketplace_resource_report_package_epoch_reporter_v3_unique"
  ON public."creator_marketplace_resource_report" (
    "packagePublisherIdSnapshot",
    "packageIdSnapshot",
    "packageModerationRevision",
    "packageReportEpoch",
    "reporterKeyHash"
  )
  WHERE "evidence"->>'schemaVersion' = '3';

ALTER TABLE public."creator_marketplace_resource_report"
  DROP CONSTRAINT "creator_marketplace_resource_report_evidence_check";

ALTER TABLE public."creator_marketplace_resource_report"
  ADD CONSTRAINT "creator_marketplace_resource_report_evidence_check"
  CHECK ((
    jsonb_typeof("evidence") = 'object'
    AND "evidence"->>'resourceId' = "resourceSnapshotId"
    AND ("resourceId" IS NULL OR "evidence"->>'resourceId' = "resourceId")
    AND "evidence"->>'manifestHash' ~ '^[0-9a-f]{64}$'
    AND ("evidence"->>'manifestByteSize')::integer BETWEEN 1 AND 65536
    AND "evidence"->>'kind' IN ('asset', 'brush', 'filter', 'palette', 'template', '3d-preset')
    AND "evidence"->>'license' IN (
      'toonspectrum-standard',
      'cc0-1.0',
      'cc-by-4.0',
      'cc-by-nc-4.0'
    )
    AND (
      (
        "evidence"->>'schemaVersion' = '1'
        AND "packageReportEpoch" IS NULL
      )
      OR (
        "evidence"->>'schemaVersion' = '2'
        AND "packagePublisherIdSnapshot" IS NOT NULL
        AND "packageIdSnapshot" IS NOT NULL
        AND "packageModerationRevision" IS NOT NULL
        AND "packageReportEpoch" IS NULL
        AND "evidence"->>'publisherId' = "packagePublisherIdSnapshot"
        AND "evidence"->>'packageId' = "packageIdSnapshot"
        AND ("evidence"->>'packageModerationRevision')::integer = "packageModerationRevision"
      )
      OR (
        "evidence"->>'schemaVersion' = '3'
        AND "packagePublisherIdSnapshot" IS NOT NULL
        AND "packageIdSnapshot" IS NOT NULL
        AND "packageModerationRevision" IS NOT NULL
        AND "packageReportEpoch" IS NOT NULL
        AND "evidence"->>'publisherId' = "packagePublisherIdSnapshot"
        AND "evidence"->>'packageId' = "packageIdSnapshot"
        AND ("evidence"->>'packageModerationRevision')::integer = "packageModerationRevision"
        AND ("evidence"->>'packageReportEpoch')::integer = "packageReportEpoch"
      )
    )
  ) IS TRUE);

CREATE OR REPLACE FUNCTION public.enforce_creator_marketplace_report_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $report_immutability$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."resourceSnapshotId" IS DISTINCT FROM OLD."resourceSnapshotId"
    OR NEW."packagePublisherIdSnapshot" IS DISTINCT FROM OLD."packagePublisherIdSnapshot"
    OR NEW."packageIdSnapshot" IS DISTINCT FROM OLD."packageIdSnapshot"
    OR NEW."packageModerationRevision" IS DISTINCT FROM OLD."packageModerationRevision"
    OR NEW."packageReportEpoch" IS DISTINCT FROM OLD."packageReportEpoch"
    OR (
      NEW."reporterId" IS DISTINCT FROM OLD."reporterId"
      AND NOT (OLD."reporterId" IS NOT NULL AND NEW."reporterId" IS NULL)
    )
    OR NEW."reporterKeyHash" IS DISTINCT FROM OLD."reporterKeyHash"
    OR NEW."reason" IS DISTINCT FROM OLD."reason"
    OR NEW."details" IS DISTINCT FROM OLD."details"
    OR NEW."evidence" IS DISTINCT FROM OLD."evidence"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'creator marketplace report evidence is immutable'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_report_immutable_evidence';
  END IF;

  IF NEW."resourceId" IS DISTINCT FROM OLD."resourceId"
    AND NOT (OLD."resourceId" IS NOT NULL AND NEW."resourceId" IS NULL)
  THEN
    RAISE EXCEPTION 'creator marketplace report target reference is immutable'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_report_immutable_evidence';
  END IF;

  IF OLD."status" = 'open'
    AND NEW."status" IN ('resolved', 'dismissed')
    AND NEW."reviewedBy" IS NULL
  THEN
    RAISE EXCEPTION 'creator marketplace moderation reviewer is required'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_report_reviewer_required';
  END IF;

  IF OLD."status" <> 'open' AND (
    NEW."status" IS DISTINCT FROM OLD."status"
    OR NEW."resolutionNote" IS DISTINCT FROM OLD."resolutionNote"
    OR (
      NEW."reviewedBy" IS DISTINCT FROM OLD."reviewedBy"
      AND NOT (OLD."reviewedBy" IS NOT NULL AND NEW."reviewedBy" IS NULL)
    )
    OR NEW."reviewedAt" IS DISTINCT FROM OLD."reviewedAt"
  ) THEN
    RAISE EXCEPTION 'creator marketplace moderation decision is immutable'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_report_immutable_decision';
  END IF;
  RETURN NEW;
END
$report_immutability$;

CREATE OR REPLACE FUNCTION public.enforce_creator_marketplace_package_decision_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $package_decision_insert$
DECLARE
  current_state text;
  current_revision integer;
BEGIN
  -- System decisions are emitted only by the migration backfill above. Post-cutover decisions must
  -- name an authenticated administrator and advance the currently locked package state exactly.
  IF NEW."actorKind" <> 'admin' THEN
    RAISE EXCEPTION 'system package moderation decisions are migration-only'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_package_moderation_decision_actor_check';
  END IF;
  IF NEW."reviewerId" IS NULL THEN
    RAISE EXCEPTION 'package moderation decision requires an administrator'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_package_moderation_decision_reviewer_required';
  END IF;
  IF NEW."sourceResourceSnapshotId" IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public."creator_marketplace_resource" AS release
    WHERE release."id" = NEW."sourceResourceSnapshotId"
      AND release."publisherId" = NEW."publisherIdSnapshot"
      AND release."packageId" = NEW."packageIdSnapshot"
  ) THEN
    RAISE EXCEPTION 'package moderation source release does not match package'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_package_moderation_decision_source';
  END IF;
  IF NEW."sourceReportId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public."creator_marketplace_resource_report" AS report
    WHERE report."id" = NEW."sourceReportId"
      AND report."status" = 'open'
      AND report."packagePublisherIdSnapshot" = NEW."publisherIdSnapshot"
      AND report."packageIdSnapshot" = NEW."packageIdSnapshot"
  ) THEN
    RAISE EXCEPTION 'package moderation source report does not match package'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_package_moderation_decision_source';
  END IF;

  SELECT moderation."state", moderation."revision"
  INTO current_state, current_revision
  FROM public."creator_marketplace_package_moderation" AS moderation
  WHERE moderation."publisherId" = NEW."publisherIdSnapshot"
    AND moderation."packageId" = NEW."packageIdSnapshot"
  FOR UPDATE;

  IF current_revision IS NULL
    OR NEW."revision" <> current_revision + 1
    OR (NEW."action" = 'hide' AND current_state <> 'active')
    OR (NEW."action" = 'restore' AND current_state <> 'hidden')
  THEN
    RAISE EXCEPTION 'package moderation decision does not advance current state'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_package_moderation_decision_sequence';
  END IF;
  RETURN NEW;
END
$package_decision_insert$;

CREATE TRIGGER creator_marketplace_package_moderation_decision_insert_guard
BEFORE INSERT ON public."creator_marketplace_package_moderation_decision"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_creator_marketplace_package_decision_insert();

CREATE OR REPLACE FUNCTION public.enforce_creator_marketplace_package_decision_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $package_decision_immutability$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'package moderation decisions are append-only'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_package_moderation_decision_immutable';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."publisherIdSnapshot" IS DISTINCT FROM OLD."publisherIdSnapshot"
    OR NEW."packageIdSnapshot" IS DISTINCT FROM OLD."packageIdSnapshot"
    OR NEW."revision" IS DISTINCT FROM OLD."revision"
    OR NEW."action" IS DISTINCT FROM OLD."action"
    OR NEW."actorKind" IS DISTINCT FROM OLD."actorKind"
    OR NEW."note" IS DISTINCT FROM OLD."note"
    OR NEW."sourceResourceSnapshotId" IS DISTINCT FROM OLD."sourceResourceSnapshotId"
    OR (
      NEW."sourceReportId" IS DISTINCT FROM OLD."sourceReportId"
      AND NOT (OLD."sourceReportId" IS NOT NULL AND NEW."sourceReportId" IS NULL)
    )
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR (
      NEW."reviewerId" IS DISTINCT FROM OLD."reviewerId"
      AND NOT (OLD."reviewerId" IS NOT NULL AND NEW."reviewerId" IS NULL)
    )
  THEN
    RAISE EXCEPTION 'package moderation decisions are append-only'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_package_moderation_decision_immutable';
  END IF;
  RETURN NEW;
END
$package_decision_immutability$;

CREATE TRIGGER creator_marketplace_package_moderation_decision_update_guard
BEFORE UPDATE OR DELETE ON public."creator_marketplace_package_moderation_decision"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_creator_marketplace_package_decision_immutability();

CREATE OR REPLACE FUNCTION public.enforce_creator_marketplace_package_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $package_state$
DECLARE
  decision_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."state" <> 'active'
      OR NEW."revision" <> 0
      OR NEW."currentDecisionId" IS NOT NULL
      OR NEW."hiddenAt" IS NOT NULL
    THEN
      RAISE EXCEPTION 'new package moderation state must start active'
        USING ERRCODE = '23514',
          CONSTRAINT = 'creator_marketplace_package_moderation_initial_state';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."publisherId" IS DISTINCT FROM OLD."publisherId"
    OR NEW."packageId" IS DISTINCT FROM OLD."packageId"
  THEN
    RAISE EXCEPTION 'package moderation identity is immutable'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_package_moderation_identity_immutable';
  END IF;

  IF NEW."state" IS NOT DISTINCT FROM OLD."state"
    OR NEW."revision" <> OLD."revision" + 1
    OR NEW."currentDecisionId" IS NOT DISTINCT FROM OLD."currentDecisionId"
    OR NEW."updatedAt" <= OLD."updatedAt"
  THEN
    RAISE EXCEPTION 'package moderation transition must be atomic and monotonic'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_package_moderation_transition';
  END IF;

  SELECT decision."action"
  INTO decision_action
  FROM public."creator_marketplace_package_moderation_decision" AS decision
  WHERE decision."id" = NEW."currentDecisionId"
    AND decision."publisherIdSnapshot" = NEW."publisherId"
    AND decision."packageIdSnapshot" = NEW."packageId"
    AND decision."revision" = NEW."revision";

  IF decision_action IS NULL
    OR (NEW."state" = 'hidden' AND decision_action <> 'hide')
    OR (NEW."state" = 'active' AND decision_action <> 'restore')
    OR (NEW."state" = 'hidden' AND NEW."hiddenAt" IS NULL)
    OR (NEW."state" = 'active' AND NEW."hiddenAt" IS NOT NULL)
  THEN
    RAISE EXCEPTION 'package moderation transition lacks its immutable decision'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_package_moderation_transition';
  END IF;
  RETURN NEW;
END
$package_state$;

CREATE TRIGGER creator_marketplace_package_moderation_state_guard
BEFORE INSERT OR UPDATE ON public."creator_marketplace_package_moderation"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_creator_marketplace_package_state();

-- Bidirectional, commit-time coupling prevents a caller from reserving an append-only decision
-- revision without completing the matching state transition (or pointing state at an unrelated
-- decision). Both rows can be written naturally inside one transaction; neither can commit alone.
CREATE OR REPLACE FUNCTION public.verify_creator_marketplace_package_decision_coupling()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $package_decision_coupling$
DECLARE
  coupled_state text;
  coupled_revision integer;
  coupled_decision_id text;
  coupled_action text;
BEGIN
  IF TG_TABLE_NAME = 'creator_marketplace_package_moderation_decision' THEN
    SELECT moderation."state", moderation."revision", moderation."currentDecisionId"
    INTO coupled_state, coupled_revision, coupled_decision_id
    FROM public."creator_marketplace_package_moderation" AS moderation
    WHERE moderation."publisherId" = NEW."publisherIdSnapshot"
      AND moderation."packageId" = NEW."packageIdSnapshot";

    IF coupled_decision_id IS DISTINCT FROM NEW."id"
      OR coupled_revision IS DISTINCT FROM NEW."revision"
      OR (NEW."action" = 'hide' AND coupled_state IS DISTINCT FROM 'hidden')
      OR (NEW."action" = 'restore' AND coupled_state IS DISTINCT FROM 'active')
    THEN
      RAISE EXCEPTION 'package moderation decision is not coupled to committed state'
        USING ERRCODE = '23514',
          CONSTRAINT = 'creator_marketplace_package_moderation_decision_coupling';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."revision" = 0 THEN
    RETURN NEW;
  END IF;
  SELECT decision."action"
  INTO coupled_action
  FROM public."creator_marketplace_package_moderation_decision" AS decision
  WHERE decision."id" = NEW."currentDecisionId"
    AND decision."publisherIdSnapshot" = NEW."publisherId"
    AND decision."packageIdSnapshot" = NEW."packageId"
    AND decision."revision" = NEW."revision";

  IF coupled_action IS NULL
    OR (NEW."state" = 'hidden' AND coupled_action <> 'hide')
    OR (NEW."state" = 'active' AND coupled_action <> 'restore')
  THEN
    RAISE EXCEPTION 'package moderation state is not coupled to committed decision'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_package_moderation_decision_coupling';
  END IF;
  RETURN NEW;
END
$package_decision_coupling$;

CREATE CONSTRAINT TRIGGER creator_marketplace_package_decision_coupling_from_decision
AFTER INSERT ON public."creator_marketplace_package_moderation_decision"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.verify_creator_marketplace_package_decision_coupling();

CREATE CONSTRAINT TRIGGER creator_marketplace_package_decision_coupling_from_state
AFTER INSERT OR UPDATE ON public."creator_marketplace_package_moderation"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.verify_creator_marketplace_package_decision_coupling();

-- Replace the 0033 acquisition guard rather than stacking a second visibility predicate: after
-- cutover, a restored package may retain true legacy row markers and must still be available.
CREATE OR REPLACE FUNCTION public.enforce_creator_marketplace_library_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $library_insert$
DECLARE
  actor_status text;
  publisher_status text;
  package_state text;
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

  NEW."addedAt" := statement_timestamp();
  NEW."updatedAt" := NEW."addedAt";
  IF NEW."lastConfirmedReleaseOrdinal" IS NOT NULL THEN
    NEW."firstConfirmedAt" := NEW."addedAt";
    NEW."lastConfirmedAt" := NEW."addedAt";
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'toonspectrum:creator-marketplace-release:v1:'
      || char_length(NEW."publisherId")::text || ':' || NEW."publisherId"
      || char_length(NEW."packageId")::text || ':' || NEW."packageId",
      0
    )
  );

  SELECT moderation."state"
  INTO package_state
  FROM public."creator_marketplace_package_moderation" AS moderation
  WHERE moderation."publisherId" = NEW."publisherId"
    AND moderation."packageId" = NEW."packageId"
  FOR UPDATE;
  IF package_state IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'hidden creator marketplace package cannot enter a library'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_library_package_moderated';
  END IF;

  PERFORM account."id"
  FROM public."user" AS account
  WHERE account."id" = NEW."userId" OR account."id" = NEW."publisherId"
  ORDER BY account."id"
  FOR UPDATE;

  SELECT account."status" INTO actor_status
  FROM public."user" AS account
  WHERE account."id" = NEW."userId";
  IF actor_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'creator marketplace library requires an active account'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_library_active_user_required';
  END IF;
  SELECT account."status" INTO publisher_status
  FROM public."user" AS account
  WHERE account."id" = NEW."publisherId";
  IF publisher_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'creator marketplace library membership requires an active publisher'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_library_package_available';
  END IF;

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

  IF NOT EXISTS (
    SELECT 1
    FROM public."creator_marketplace_resource" AS package_head
    WHERE package_head."publisherId" = NEW."publisherId"
      AND package_head."packageId" = NEW."packageId"
      AND package_head."delistedAt" IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public."creator_marketplace_resource" AS newer_package_head
        WHERE newer_package_head."publisherId" = package_head."publisherId"
          AND newer_package_head."packageId" = package_head."packageId"
          AND newer_package_head."releaseOrdinal" > package_head."releaseOrdinal"
      )
  ) THEN
    RAISE EXCEPTION 'creator marketplace library membership requires a listed package head'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_library_package_available';
  END IF;

  IF NEW."lastConfirmedReleaseOrdinal" IS NULL AND NOT EXISTS (
    SELECT 1
    FROM public."creator_marketplace_resource" AS release
    JOIN public."user" AS publisher ON publisher."id" = release."publisherId"
    WHERE release."id" = NEW."addedFromReleaseId"
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
        AND release."delistedAt" IS NULL
    ) THEN
      RAISE EXCEPTION 'creator marketplace install confirmation does not match release'
        USING ERRCODE = '23514',
          CONSTRAINT = 'creator_marketplace_library_confirmation_integrity';
    END IF;
  END IF;
  RETURN NEW;
END
$library_insert$;

-- The existing 0033 update guard keeps immutable confirmation evidence. This earlier-named guard
-- adds package authority: only a strictly advancing confirmation is blocked while hidden; exact
-- equal idempotent replay performs no UPDATE and historical confirmed facts remain readable.
CREATE OR REPLACE FUNCTION public.enforce_creator_marketplace_library_package_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $library_package_update$
DECLARE
  package_state text;
  publisher_status text;
  head_listed boolean;
  exact_release_listed boolean;
BEGIN
  IF NEW."lastConfirmedReleaseOrdinal" IS NOT DISTINCT FROM OLD."lastConfirmedReleaseOrdinal" THEN
    IF NEW."lastConfirmedAt" IS DISTINCT FROM OLD."lastConfirmedAt" THEN
      RAISE EXCEPTION 'equal confirmation replay cannot rewrite its timestamp'
        USING ERRCODE = '23514',
          CONSTRAINT = 'creator_marketplace_library_confirmation_idempotent';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."publisherId" IS NULL
    OR NEW."lastConfirmedReleaseOrdinal" IS NULL
    OR (
      OLD."lastConfirmedReleaseOrdinal" IS NOT NULL
      AND NEW."lastConfirmedReleaseOrdinal" <= OLD."lastConfirmedReleaseOrdinal"
    )
  THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'toonspectrum:creator-marketplace-release:v1:'
      || char_length(NEW."publisherId")::text || ':' || NEW."publisherId"
      || char_length(NEW."packageId")::text || ':' || NEW."packageId",
      0
    )
  );
  SELECT moderation."state"
  INTO package_state
  FROM public."creator_marketplace_package_moderation" AS moderation
  WHERE moderation."publisherId" = NEW."publisherId"
    AND moderation."packageId" = NEW."packageId"
  FOR UPDATE;
  IF package_state IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'hidden creator marketplace package cannot advance confirmation'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_library_package_moderated';
  END IF;

  PERFORM account."id"
  FROM public."user" AS account
  WHERE account."id" = NEW."userId" OR account."id" = NEW."publisherId"
  ORDER BY account."id"
  FOR UPDATE;
  SELECT account."status" INTO publisher_status
  FROM public."user" AS account
  WHERE account."id" = NEW."publisherId";
  SELECT release."delistedAt" IS NULL INTO head_listed
  FROM public."creator_marketplace_resource" AS release
  WHERE release."publisherId" = NEW."publisherId"
    AND release."packageId" = NEW."packageId"
  ORDER BY release."releaseOrdinal" DESC
  LIMIT 1
  FOR UPDATE;
  SELECT EXISTS (
    SELECT 1
    FROM public."creator_marketplace_resource" AS release
    WHERE release."id" = NEW."lastConfirmedReleaseId"
      AND release."publisherId" = NEW."publisherId"
      AND release."packageId" = NEW."packageId"
      AND release."delistedAt" IS NULL
  ) INTO exact_release_listed;
  IF publisher_status IS DISTINCT FROM 'active'
    OR head_listed IS DISTINCT FROM true
    OR exact_release_listed IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'unavailable creator marketplace package cannot advance confirmation'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_library_package_available';
  END IF;
  RETURN NEW;
END
$library_package_update$;

DROP TRIGGER IF EXISTS creator_marketplace_library_000_package_update_guard
  ON public."creator_marketplace_library_item";
CREATE TRIGGER creator_marketplace_library_000_package_update_guard
BEFORE UPDATE ON public."creator_marketplace_library_item"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_creator_marketplace_library_package_update();

-- Direct report DML shares the publisher/package lock with publication and moderation. New rows
-- are v3-only and must snapshot both the exact active moderation revision and the absolute-head
-- release ordinal used as the package report epoch under that lock.
CREATE OR REPLACE FUNCTION public.enforce_creator_marketplace_package_report_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $package_report_insert$
DECLARE
  package_state text;
  package_revision integer;
  package_report_epoch integer;
BEGIN
  IF NEW."evidence"->>'schemaVersion' <> '3'
    OR NEW."resourceId" IS NULL
    OR NEW."packagePublisherIdSnapshot" IS NULL
    OR NEW."packageIdSnapshot" IS NULL
    OR NEW."packageModerationRevision" IS NULL
    OR NEW."packageReportEpoch" IS NULL
  THEN
    RAISE EXCEPTION 'new creator marketplace reports require package epoch evidence v3'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_report_evidence_v3_required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'toonspectrum:creator-marketplace-release:v1:'
      || char_length(NEW."packagePublisherIdSnapshot")::text || ':'
      || NEW."packagePublisherIdSnapshot"
      || char_length(NEW."packageIdSnapshot")::text || ':' || NEW."packageIdSnapshot",
      0
    )
  );

  SELECT moderation."state", moderation."revision"
  INTO package_state, package_revision
  FROM public."creator_marketplace_package_moderation" AS moderation
  WHERE moderation."publisherId" = NEW."packagePublisherIdSnapshot"
    AND moderation."packageId" = NEW."packageIdSnapshot"
  FOR UPDATE;

  SELECT release."releaseOrdinal"
  INTO package_report_epoch
  FROM public."creator_marketplace_resource" AS release
  WHERE release."publisherId" = NEW."packagePublisherIdSnapshot"
    AND release."packageId" = NEW."packageIdSnapshot"
  ORDER BY release."releaseOrdinal" DESC
  LIMIT 1
  FOR UPDATE;

  IF package_state IS DISTINCT FROM 'active'
    OR package_revision IS DISTINCT FROM NEW."packageModerationRevision"
    OR package_report_epoch IS DISTINCT FROM NEW."packageReportEpoch"
    OR NOT EXISTS (
      SELECT 1
      FROM public."creator_marketplace_resource" AS release
      WHERE release."id" = NEW."resourceId"
        AND release."id" = NEW."resourceSnapshotId"
        AND release."publisherId" = NEW."packagePublisherIdSnapshot"
        AND release."packageId" = NEW."packageIdSnapshot"
    )
  THEN
    RAISE EXCEPTION 'creator marketplace report target package is unavailable'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_report_package_unavailable';
  END IF;
  RETURN NEW;
END
$package_report_insert$;

CREATE TRIGGER creator_marketplace_resource_report_package_insert_guard
BEFORE INSERT ON public."creator_marketplace_resource_report"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_creator_marketplace_package_report_insert();

-- Publication creates the active state for a new package and then treats that state as the sole
-- moderation authority. A legacy row marker can never be cleared or set after this cutover.
CREATE OR REPLACE FUNCTION public.enforce_creator_marketplace_immutable_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $immutable_release$
DECLARE
  latest_version text;
  latest_ordinal integer;
  package_state text;
  precedence integer;
BEGIN
  IF NEW."semverContractVersion" <> 2 THEN
    RAISE EXCEPTION 'new creator marketplace releases require strict SemVer contract v2'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_version_check';
  END IF;
  IF NEW."hidden" THEN
    RAISE EXCEPTION 'release hidden is a read-only legacy marker'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_hidden_legacy';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'toonspectrum:creator-marketplace-release:v1:'
      || char_length(NEW."publisherId")::text || ':' || NEW."publisherId"
      || char_length(NEW."packageId")::text || ':' || NEW."packageId",
      0
    )
  );

  INSERT INTO public."creator_marketplace_package_moderation" (
    "publisherId", "packageId", "state", "revision", "updatedAt"
  )
  VALUES (NEW."publisherId", NEW."packageId", 'active', 0, clock_timestamp())
  ON CONFLICT ("publisherId", "packageId") DO NOTHING;

  SELECT moderation."state"
  INTO package_state
  FROM public."creator_marketplace_package_moderation" AS moderation
  WHERE moderation."publisherId" = NEW."publisherId"
    AND moderation."packageId" = NEW."packageId"
  FOR UPDATE;

  IF package_state IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'moderated creator marketplace package blocks publication'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_package_moderated';
  END IF;

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
  IF precedence <= 0 THEN
    RAISE EXCEPTION 'creator marketplace release SemVer must advance'
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
DECLARE
  package_state text;
  absolute_head_id text;
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

  IF NEW."hidden" IS DISTINCT FROM OLD."hidden" THEN
    RAISE EXCEPTION 'release hidden is a read-only legacy marker'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_hidden_legacy';
  END IF;

  IF OLD."delistedAt" IS NOT NULL
    AND NEW."delistedAt" IS NOT NULL
    AND NEW."delistedAt" IS DISTINCT FROM OLD."delistedAt"
  THEN
    RAISE EXCEPTION 'creator marketplace delisting event is immutable'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_delisting_event_immutable';
  END IF;

  IF NEW."delistedAt" IS DISTINCT FROM OLD."delistedAt" THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'toonspectrum:creator-marketplace-release:v1:'
        || char_length(OLD."publisherId")::text || ':' || OLD."publisherId"
        || char_length(OLD."packageId")::text || ':' || OLD."packageId",
        0
      )
    );

    SELECT moderation."state"
    INTO package_state
    FROM public."creator_marketplace_package_moderation" AS moderation
    WHERE moderation."publisherId" = OLD."publisherId"
      AND moderation."packageId" = OLD."packageId"
    FOR UPDATE;

    IF package_state IS NULL THEN
      RAISE EXCEPTION 'creator marketplace package moderation state is missing'
        USING ERRCODE = '23514',
          CONSTRAINT = 'creator_marketplace_package_moderation_missing';
    END IF;

    SELECT release."id"
    INTO absolute_head_id
    FROM public."creator_marketplace_resource" AS release
    WHERE release."publisherId" = OLD."publisherId"
      AND release."packageId" = OLD."packageId"
    ORDER BY release."releaseOrdinal" DESC
    LIMIT 1
    FOR UPDATE;

    IF absolute_head_id IS DISTINCT FROM OLD."id" THEN
      IF OLD."delistedAt" IS NULL AND NEW."delistedAt" IS NOT NULL THEN
        RAISE EXCEPTION 'only creator marketplace package head can be delisted'
          USING ERRCODE = '23514',
            CONSTRAINT = 'creator_marketplace_resource_delist_non_head';
      END IF;
      RAISE EXCEPTION 'only creator marketplace package head can be relisted'
        USING ERRCODE = '23514',
          CONSTRAINT = 'creator_marketplace_resource_relist_non_head';
    END IF;

    IF OLD."delistedAt" IS NOT NULL AND NEW."delistedAt" IS NULL THEN
      IF package_state = 'hidden' THEN
        RAISE EXCEPTION 'hidden creator marketplace package cannot be relisted'
          USING ERRCODE = '23514',
            CONSTRAINT = 'creator_marketplace_resource_relist_moderated';
      END IF;
    END IF;

    IF NEW."updatedAt" <= OLD."updatedAt" THEN
      RAISE EXCEPTION 'creator marketplace lifecycle change requires a fresh timestamp'
        USING ERRCODE = '23514',
          CONSTRAINT = 'creator_marketplace_resource_lifecycle_timestamp_required';
    END IF;
  END IF;

  IF NEW."updatedAt" < OLD."updatedAt" THEN
    RAISE EXCEPTION 'creator marketplace lifecycle timestamp cannot move backwards'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_monotonic_update';
  END IF;
  RETURN NEW;
END
$resource_lifecycle$;

-- Tables/functions are not ambient PUBLIC APIs. Environment-specific runtime grants and readiness
-- assertions are intentionally integrated in the production migration phase, not this core slice.
REVOKE ALL ON TABLE public."creator_marketplace_package_moderation" FROM PUBLIC;
REVOKE ALL ON TABLE public."creator_marketplace_package_moderation_decision" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_creator_marketplace_package_decision_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_creator_marketplace_package_decision_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_creator_marketplace_package_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_creator_marketplace_package_decision_coupling() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_creator_marketplace_package_report_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_creator_marketplace_library_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_creator_marketplace_library_package_update() FROM PUBLIC;

INSERT INTO public."toonspectrum_schema_migration" ("id", "appliedAt")
VALUES ('0034_creator_marketplace_package_moderation', statement_timestamp())
ON CONFLICT ("id") DO NOTHING;

COMMIT;
