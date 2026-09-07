-- Migration 0040: close lifecycle and lineage gaps discovered during final production review.
--
-- 0039 introduced the Creator Asset Platform foundation. This additive hardening migration keeps
-- 0039 immutable while ensuring terminal artifact evidence, entitlement facts and work bindings
-- cannot be weakened after publication.

BEGIN;

ALTER TABLE public."creator_asset_artifact"
  DROP CONSTRAINT "creator_asset_artifact_dimensions_check";
ALTER TABLE public."creator_asset_artifact"
  ADD CONSTRAINT "creator_asset_artifact_dimensions_check"
  CHECK (
    ("width" IS NULL AND "height" IS NULL)
    OR (
      "width" IS NOT NULL
      AND "height" IS NOT NULL
      AND "width" BETWEEN 1 AND 65536
      AND "height" BETWEEN 1 AND 65536
    )
  );

ALTER TABLE public."creator_marketplace_entitlement_grant"
  DROP CONSTRAINT "creator_marketplace_entitlement_policy_check";
ALTER TABLE public."creator_marketplace_entitlement_grant"
  ADD CONSTRAINT "creator_marketplace_entitlement_policy_check"
  CHECK (
    "releasePolicy" IN ('exact', 'range', 'package-head')
    AND (
      (
        "releasePolicy" = 'exact'
        AND "releaseId" IS NOT NULL
        AND "minimumOrdinal" IS NULL
        AND "maximumOrdinal" IS NULL
      )
      OR (
        "releasePolicy" = 'range'
        AND "releaseId" IS NULL
        AND "minimumOrdinal" IS NOT NULL
        AND "maximumOrdinal" IS NOT NULL
        AND "minimumOrdinal" BETWEEN 1 AND 2147483647
        AND "maximumOrdinal" BETWEEN "minimumOrdinal" AND 2147483647
      )
      OR (
        "releasePolicy" = 'package-head'
        AND "releaseId" IS NULL
        AND "minimumOrdinal" IS NULL
        AND "maximumOrdinal" IS NULL
      )
    )
  );

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
    RAISE EXCEPTION 'artifact cannot move between artifact sets'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_set_identity_immutable';
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

CREATE OR REPLACE FUNCTION public.enforce_creator_asset_qa_report_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $qa_report_mutation$
DECLARE
  parent_state text;
  target_set text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."artifactSetId" IS DISTINCT FROM OLD."artifactSetId" THEN
    RAISE EXCEPTION 'QA report cannot move between artifact sets'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_qa_report_set_identity_immutable';
  END IF;

  target_set := CASE WHEN TG_OP = 'DELETE' THEN OLD."artifactSetId" ELSE NEW."artifactSetId" END;
  SELECT "state" INTO parent_state
  FROM public."creator_asset_artifact_set"
  WHERE "id" = target_set
  FOR UPDATE;

  IF parent_state IS DISTINCT FROM 'building' THEN
    RAISE EXCEPTION 'QA evidence for a terminal artifact set is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_qa_report_terminal_immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$qa_report_mutation$;

CREATE TRIGGER creator_asset_qa_report_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public."creator_asset_qa_report"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_asset_qa_report_mutation();

CREATE OR REPLACE FUNCTION public.enforce_creator_asset_processing_run_terminal_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $processing_run_terminal_evidence$
DECLARE
  terminal_set_id text;
BEGIN
  SELECT "id" INTO terminal_set_id
  FROM public."creator_asset_artifact_set"
  WHERE "processingRunId" = OLD."id"
    AND "state" IN ('sealed', 'rejected')
  ORDER BY "id"
  LIMIT 1
  FOR UPDATE;

  IF terminal_set_id IS NOT NULL THEN
    RAISE EXCEPTION 'processing evidence referenced by a terminal artifact set is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_processing_run_terminal_immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$processing_run_terminal_evidence$;

CREATE TRIGGER creator_asset_processing_run_terminal_evidence
BEFORE UPDATE OR DELETE ON public."creator_asset_processing_run"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_asset_processing_run_terminal_evidence();

CREATE OR REPLACE FUNCTION public.enforce_creator_work_catalog_asset_binding_lineage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $work_catalog_asset_binding_lineage$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public."creator_marketplace_release_artifact_binding" AS release_binding
    WHERE release_binding."releaseId" = NEW."releaseId"
      AND release_binding."entryId" = NEW."entryId"
      AND release_binding."artifactSetId" = NEW."artifactSetId"
      AND release_binding."licenseSnapshotId" = NEW."licenseSnapshotId"
  ) THEN
    RAISE EXCEPTION 'work attachment must use the selected release entry artifact and license'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_work_catalog_asset_binding_release_lineage';
  END IF;
  RETURN NEW;
END
$work_catalog_asset_binding_lineage$;

CREATE TRIGGER creator_work_catalog_asset_binding_lineage
BEFORE INSERT OR UPDATE OF "releaseId", "entryId", "artifactSetId", "licenseSnapshotId"
ON public."creator_work_catalog_asset_binding"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_work_catalog_asset_binding_lineage();

CREATE OR REPLACE FUNCTION public.reject_creator_marketplace_entitlement_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $entitlement_delete$
BEGIN
  RAISE EXCEPTION 'entitlement grants are immutable; use the modeled revocation transition'
    USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_entitlement_delete_forbidden';
END
$entitlement_delete$;

CREATE TRIGGER creator_marketplace_entitlement_delete
BEFORE DELETE ON public."creator_marketplace_entitlement_grant"
FOR EACH ROW EXECUTE FUNCTION public.reject_creator_marketplace_entitlement_delete();

COMMIT;
