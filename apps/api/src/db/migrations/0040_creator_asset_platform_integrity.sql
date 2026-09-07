-- Preserve the ledgered 0039 foundation and close evidence/entitlement integrity gaps.
-- Validation intentionally aborts on existing invalid rows; never rewrite purchased rights or
-- immutable release evidence to make a constraint pass.
BEGIN;
SELECT pg_advisory_xact_lock(82361743);

ALTER TABLE public."creator_asset_artifact"
  DROP CONSTRAINT "creator_asset_artifact_dimensions_check",
  ADD CONSTRAINT "creator_asset_artifact_dimensions_check"
    CHECK (("width" IS NULL AND "height" IS NULL)
      OR ("width" IS NOT NULL AND "height" IS NOT NULL
        AND "width" BETWEEN 1 AND 65536 AND "height" BETWEEN 1 AND 65536));

ALTER TABLE public."creator_marketplace_entitlement_grant"
  DROP CONSTRAINT "creator_marketplace_entitlement_policy_check",
  ADD CONSTRAINT "creator_marketplace_entitlement_policy_check"
    CHECK ("releasePolicy" IN ('exact', 'range', 'package-head') AND (
      ("releasePolicy" = 'exact' AND "releaseId" IS NOT NULL
        AND "minimumOrdinal" IS NULL AND "maximumOrdinal" IS NULL)
      OR ("releasePolicy" = 'range' AND "releaseId" IS NULL
        AND "minimumOrdinal" IS NOT NULL AND "maximumOrdinal" IS NOT NULL
        AND "minimumOrdinal" BETWEEN 1 AND 2147483647
        AND "maximumOrdinal" BETWEEN "minimumOrdinal" AND 2147483647)
      OR ("releasePolicy" = 'package-head' AND "releaseId" IS NULL
        AND "minimumOrdinal" IS NULL AND "maximumOrdinal" IS NULL)
    ));

ALTER TABLE public."creator_marketplace_release_artifact_binding"
  ADD CONSTRAINT "creator_marketplace_release_artifact_binding_entry_unique"
    UNIQUE ("releaseId", "entryId", "artifactSetId", "licenseSnapshotId");
ALTER TABLE public."creator_work_catalog_asset_binding"
  ADD CONSTRAINT "creator_work_catalog_asset_binding_release_entry_fkey"
    FOREIGN KEY ("releaseId", "entryId", "artifactSetId", "licenseSnapshotId")
    REFERENCES public."creator_marketplace_release_artifact_binding"
      ("releaseId", "entryId", "artifactSetId", "licenseSnapshotId") ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.enforce_creator_asset_artifact_set_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $artifact_set_insert$
BEGIN
  IF NEW."state" IS DISTINCT FROM 'building' THEN
    RAISE EXCEPTION 'artifact sets must start building and pass the sealing lifecycle'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_set_initial_state';
  END IF;
  RETURN NEW;
END
$artifact_set_insert$;
CREATE TRIGGER creator_asset_artifact_set_insert
BEFORE INSERT ON public."creator_asset_artifact_set"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_asset_artifact_set_insert();

CREATE OR REPLACE FUNCTION public.enforce_creator_asset_artifact_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $artifact_mutation$
DECLARE
  parent_state text;
  target_set text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."artifactSetId" IS DISTINCT FROM OLD."artifactSetId" THEN
    RAISE EXCEPTION 'artifact parent is immutable; copy into a new building set instead'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_parent_immutable';
  END IF;
  target_set := CASE WHEN TG_OP = 'DELETE' THEN OLD."artifactSetId" ELSE NEW."artifactSetId" END;
  SELECT "state" INTO parent_state
  FROM public."creator_asset_artifact_set"
  WHERE "id" = target_set
  FOR UPDATE;
  IF parent_state IS DISTINCT FROM 'building' THEN
    RAISE EXCEPTION 'sealed or rejected artifact set content is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_sealed_immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$artifact_mutation$;
CREATE OR REPLACE FUNCTION public.enforce_creator_asset_qa_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $qa_mutation$
DECLARE
  parent_state text;
  target_set text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."artifactSetId" IS DISTINCT FROM OLD."artifactSetId" THEN
    RAISE EXCEPTION 'QA evidence parent is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_qa_parent_immutable';
  END IF;
  target_set := CASE WHEN TG_OP = 'DELETE' THEN OLD."artifactSetId" ELSE NEW."artifactSetId" END;
  SELECT "state" INTO parent_state
  FROM public."creator_asset_artifact_set"
  WHERE "id" = target_set
  FOR UPDATE;
  IF parent_state IS DISTINCT FROM 'building' THEN
    RAISE EXCEPTION 'sealed or rejected artifact set QA evidence is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_qa_terminal_immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$qa_mutation$;
CREATE OR REPLACE FUNCTION public.enforce_creator_asset_artifact_set_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $artifact_set_update$
DECLARE
  source_count integer;
  runtime_count integer;
  thumbnail_count integer;
BEGIN
  IF OLD."state" IN ('sealed', 'rejected') THEN
    RAISE EXCEPTION 'terminal artifact set is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_set_terminal_immutable';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."processingRunId" IS DISTINCT FROM OLD."processingRunId"
    OR NEW."entryKind" IS DISTINCT FROM OLD."entryKind"
    OR NEW."sourceDigest" IS DISTINCT FROM OLD."sourceDigest"
    OR NEW."profileSchemaVersion" IS DISTINCT FROM OLD."profileSchemaVersion"
    OR NEW."toolchainDigest" IS DISTINCT FROM OLD."toolchainDigest"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'artifact set identity and lineage are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_set_lineage_immutable';
  END IF;
  IF NEW."state" NOT IN ('building', 'sealed', 'rejected') THEN
    RAISE EXCEPTION 'invalid artifact set state transition'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_set_state_transition';
  END IF;
  IF NEW."state" = 'sealed' THEN
    SELECT
      count(*) FILTER (WHERE "role" = 'source-original' AND "objectDigest" = NEW."sourceDigest"),
      count(*) FILTER (WHERE "role" IN ('master', 'runtime-proxy', 'runtime-default', 'runtime-high', 'runtime-mobile')),
      count(*) FILTER (WHERE "role" = 'thumbnail')
    INTO source_count, runtime_count, thumbnail_count
    FROM public."creator_asset_artifact"
    WHERE "artifactSetId" = NEW."id";
    IF source_count <> 1 OR runtime_count < 1 OR thumbnail_count < 1 THEN
      RAISE EXCEPTION 'artifact set cannot be sealed without source, runtime and thumbnail artifacts'
        USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_set_seal_contents';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public."creator_asset_qa_report"
      WHERE "artifactSetId" = NEW."id" AND "blockerCount" = 0
        AND "state" IN ('passed', 'warning')
    ) THEN
      RAISE EXCEPTION 'artifact set cannot be sealed without blocker-free QA evidence'
        USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_set_seal_qa';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public."creator_asset_processing_run"
      WHERE "id" = NEW."processingRunId" AND "state" = 'succeeded'
      FOR SHARE
    ) THEN
      RAISE EXCEPTION 'artifact set cannot be sealed before processing succeeds'
        USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_set_seal_processing';
    END IF;
  END IF;
  RETURN NEW;
END
$artifact_set_update$;
CREATE TRIGGER creator_asset_qa_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public."creator_asset_qa_report"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_asset_qa_mutation();

CREATE OR REPLACE FUNCTION public.enforce_creator_asset_processing_run_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $processing_run_mutation$
BEGIN
  -- Once an output descriptor references a completed run, its success and provenance become
  -- evidence. Checking every referenced set also avoids a run/set lock inversion while sealing.
  IF OLD."state" = 'succeeded' AND EXISTS (
    SELECT 1 FROM public."creator_asset_artifact_set" WHERE "processingRunId" = OLD."id"
  ) THEN
    RAISE EXCEPTION 'referenced successful processing evidence is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_processing_run_terminal_immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$processing_run_mutation$;
CREATE TRIGGER creator_asset_processing_run_mutation
BEFORE UPDATE OR DELETE ON public."creator_asset_processing_run"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_asset_processing_run_mutation();

CREATE OR REPLACE FUNCTION public.reject_creator_marketplace_entitlement_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $entitlement_delete$
BEGIN
  RAISE EXCEPTION 'entitlement evidence is immutable; record revocation instead'
    USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_entitlement_delete_immutable';
END
$entitlement_delete$;
CREATE TRIGGER creator_marketplace_entitlement_delete
BEFORE DELETE ON public."creator_marketplace_entitlement_grant"
FOR EACH ROW EXECUTE FUNCTION public.reject_creator_marketplace_entitlement_delete();

COMMIT;
