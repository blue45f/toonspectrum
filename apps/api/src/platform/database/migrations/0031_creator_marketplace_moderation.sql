-- Creator Marketplace release-scoped reporting and moderation.
--
-- Reports retain a bounded immutable evidence snapshot and a domain-separated reporter digest.
-- Public catalog/detail reads become no-store at the HTTP boundary, while `hidden` is the sole
-- administrator visibility flag. Owner-controlled `delistedAt` remains an independent monotonic
-- lifecycle field, so restoring a moderation decision can never relist an owner-delisted release.

BEGIN;

CREATE TABLE IF NOT EXISTS public."creator_marketplace_resource_report" (
  "id" text PRIMARY KEY NOT NULL,
  "resourceId" text REFERENCES public."creator_marketplace_resource"("id")
    ON DELETE SET NULL,
  "resourceSnapshotId" text NOT NULL,
  "reporterId" text REFERENCES public."user"("id") ON DELETE SET NULL,
  "reporterKeyHash" bytea NOT NULL,
  "reason" text NOT NULL,
  "details" text NOT NULL DEFAULT '',
  "evidence" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "resolutionNote" text NOT NULL DEFAULT '',
  "reviewedBy" text REFERENCES public."user"("id") ON DELETE SET NULL,
  "reviewedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_marketplace_resource_report_release_reporter_unique"
    UNIQUE ("resourceSnapshotId", "reporterKeyHash"),
  CONSTRAINT "creator_marketplace_resource_report_snapshot_id_check"
    CHECK (
      "resourceSnapshotId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),
  CONSTRAINT "creator_marketplace_resource_report_reporter_hash_check"
    CHECK (octet_length("reporterKeyHash") = 32),
  CONSTRAINT "creator_marketplace_resource_report_reason_check"
    CHECK ("reason" IN ('copyright', 'unsafe', 'spam', 'misleading', 'other')),
  CONSTRAINT "creator_marketplace_resource_report_details_check"
    CHECK (char_length("details") <= 500),
  CONSTRAINT "creator_marketplace_resource_report_status_check"
    CHECK ("status" IN ('open', 'resolved', 'dismissed')),
  CONSTRAINT "creator_marketplace_resource_report_resolution_note_check"
    CHECK (char_length("resolutionNote") <= 500),
  CONSTRAINT "creator_marketplace_resource_report_resolution_state_check"
    CHECK (
      (
        "status" = 'open'
        AND "resolutionNote" = ''
        AND "reviewedBy" IS NULL
        AND "reviewedAt" IS NULL
      )
      OR (
        "status" IN ('resolved', 'dismissed')
        AND char_length("resolutionNote") BETWEEN 1 AND 500
        AND "reviewedAt" IS NOT NULL
      )
    ),
  CONSTRAINT "creator_marketplace_resource_report_evidence_check"
    CHECK ((
      jsonb_typeof("evidence") = 'object'
      AND "evidence"->>'schemaVersion' = '1'
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
    ) IS TRUE)
);

DROP INDEX IF EXISTS public."idx_creator_marketplace_resource_report_queue";
CREATE INDEX "idx_creator_marketplace_resource_report_queue"
  ON public."creator_marketplace_resource_report" (
    "status",
    "createdAt" DESC,
    "id" DESC
  );

DROP INDEX IF EXISTS public."idx_creator_marketplace_resource_report_resource";
CREATE INDEX "idx_creator_marketplace_resource_report_resource"
  ON public."creator_marketplace_resource_report" (
    "resourceSnapshotId",
    "createdAt" DESC
  );

DROP INDEX IF EXISTS public."idx_creator_marketplace_resource_report_reporter";
CREATE INDEX "idx_creator_marketplace_resource_report_reporter"
  ON public."creator_marketplace_resource_report" (
    "reporterKeyHash",
    "createdAt" DESC
  );

CREATE TABLE IF NOT EXISTS public."creator_marketplace_resource_report_gate" (
  "keyHash" bytea PRIMARY KEY,
  "windowStartedAt" timestamptz NOT NULL,
  "requestCount" integer NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_marketplace_resource_report_gate_key_hash_check"
    CHECK (octet_length("keyHash") = 32),
  CONSTRAINT "creator_marketplace_resource_report_gate_window_check"
    CHECK (
      "windowStartedAt" = date_bin(
        interval '1 day',
        "windowStartedAt",
        timestamptz '1970-01-01 00:00:00+00'
      )
    ),
  CONSTRAINT "creator_marketplace_resource_report_gate_request_count_check"
    CHECK ("requestCount" BETWEEN 1 AND 20),
  CONSTRAINT "creator_marketplace_resource_report_gate_retention_check"
    CHECK ("expiresAt" = "windowStartedAt" + interval '2 days'),
  CONSTRAINT "creator_marketplace_resource_report_gate_timestamps_check"
    CHECK ("updatedAt" >= "createdAt")
);

DROP INDEX IF EXISTS public."idx_creator_marketplace_resource_report_gate_expires";
CREATE INDEX "idx_creator_marketplace_resource_report_gate_expires"
  ON public."creator_marketplace_resource_report_gate" ("expiresAt");

CREATE OR REPLACE FUNCTION public.enforce_creator_marketplace_report_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $report_immutability$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."resourceSnapshotId" IS DISTINCT FROM OLD."resourceSnapshotId"
    OR NEW."reporterId" IS DISTINCT FROM OLD."reporterId"
      AND NOT (OLD."reporterId" IS NOT NULL AND NEW."reporterId" IS NULL)
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

  -- The row-level CHECK deliberately permits reviewedBy=NULL on a closed decision because the
  -- reviewer account foreign key is ON DELETE SET NULL. Enforce reviewer presence only at the
  -- initial open -> closed transition here, while still allowing that later FK cleanup.
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

DROP TRIGGER IF EXISTS creator_marketplace_resource_report_immutability
  ON public."creator_marketplace_resource_report";
CREATE TRIGGER creator_marketplace_resource_report_immutability
BEFORE UPDATE ON public."creator_marketplace_resource_report"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_creator_marketplace_report_immutability();

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
  IF OLD."delistedAt" IS NOT NULL AND NEW."delistedAt" IS NULL THEN
    RAISE EXCEPTION 'creator marketplace owner delisting is monotonic'
      USING ERRCODE = '23514',
        CONSTRAINT = 'creator_marketplace_resource_monotonic_delisting';
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
VALUES ('0031_creator_marketplace_moderation', statement_timestamp())
ON CONFLICT ("id") DO NOTHING;

COMMIT;
