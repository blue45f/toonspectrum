-- 기존 식별자와 해시를 보존하며 브랜드 전환을 허용하는 전진 전용 마이그레이션.
-- 기존 원장·사용자 데이터는 수정하지 않으며 실패하면 전체 변경을 롤백한다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
SET LOCAL search_path = pg_catalog, public;

ALTER TABLE public.creator_asset DROP CONSTRAINT IF EXISTS creator_asset_license_check;
ALTER TABLE public.creator_asset ADD CONSTRAINT creator_asset_license_check CHECK (license IN ('toonspectrum-standard', 'toonstudio-standard', 'cc0-1.0', 'cc-by-4.0', 'cc-by-nc-4.0')) NOT VALID;
ALTER TABLE public.creator_asset VALIDATE CONSTRAINT creator_asset_license_check;

ALTER TABLE public.creator_marketplace_resource DROP CONSTRAINT IF EXISTS creator_marketplace_resource_license_check;
ALTER TABLE public.creator_marketplace_resource ADD CONSTRAINT creator_marketplace_resource_license_check CHECK (license IN ('toonspectrum-standard', 'toonstudio-standard', 'cc0-1.0', 'cc-by-4.0', 'cc-by-nc-4.0')) NOT VALID;
ALTER TABLE public.creator_marketplace_resource VALIDATE CONSTRAINT creator_marketplace_resource_license_check;

ALTER TABLE public.creator_asset ALTER COLUMN license SET DEFAULT 'toonstudio-standard';

ALTER TABLE public.creator_marketplace_resource_report DROP CONSTRAINT IF EXISTS creator_marketplace_resource_report_evidence_check;
ALTER TABLE public.creator_marketplace_resource_report ADD CONSTRAINT creator_marketplace_resource_report_evidence_check
CHECK ((
    jsonb_typeof("evidence") = 'object'
    AND "evidence"->>'resourceId' = "resourceSnapshotId"
    AND ("resourceId" IS NULL OR "evidence"->>'resourceId' = "resourceId")
    AND "evidence"->>'manifestHash' ~ '^[0-9a-f]{64}$'
    AND ("evidence"->>'manifestByteSize')::integer BETWEEN 1 AND 65536
    AND "evidence"->>'kind' IN (
      'asset',
      'brush',
      'filter',
      'palette',
      'template',
      '3d-preset',
      '3d-asset'
    )
    AND "evidence"->>'license' IN (
      'toonspectrum-standard',
      'toonstudio-standard',
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
  ) IS TRUE) NOT VALID;
ALTER TABLE public.creator_marketplace_resource_report VALIDATE CONSTRAINT creator_marketplace_resource_report_evidence_check;

ALTER TABLE public.creator_asset_storage_object DROP CONSTRAINT IF EXISTS creator_asset_storage_object_contract_check;
ALTER TABLE public.creator_asset_storage_object ADD CONSTRAINT creator_asset_storage_object_contract_check
  CHECK ("contractVersion" IN ('toonspectrum.private-object-storage.v2', 'toonstudio.private-object-storage.v2')) NOT VALID;
ALTER TABLE public.creator_asset_storage_object VALIDATE CONSTRAINT creator_asset_storage_object_contract_check;
ALTER TABLE public.creator_asset_artifact_set DROP CONSTRAINT IF EXISTS creator_asset_artifact_set_descriptor_check;
ALTER TABLE public.creator_asset_artifact_set ADD CONSTRAINT creator_asset_artifact_set_descriptor_check
  CHECK (jsonb_typeof(descriptor) = 'object'
    AND descriptor->>'schema' IN ('toonspectrum.creator-asset-artifact-set', 'toonstudio.creator-asset-artifact-set')
    AND descriptor->>'version' = '1' AND descriptor->>'id' = id) NOT VALID;
ALTER TABLE public.creator_asset_artifact_set VALIDATE CONSTRAINT creator_asset_artifact_set_descriptor_check;

CREATE OR REPLACE FUNCTION public.creator_asset_artifact_lineage_matches(
  artifact_set public."creator_asset_artifact_set", processing_run public."creator_asset_processing_run"
) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $lineage_matches$
  SELECT artifact_set."processingRunId" = processing_run."id"
    AND artifact_set."sourceDigest" = processing_run."sourceDigest"
    AND artifact_set."toolchainDigest" = processing_run."toolchainDigest"
    AND artifact_set."descriptor"->>'schema' IN ('toonspectrum.creator-asset-artifact-set', 'toonstudio.creator-asset-artifact-set')
    AND artifact_set."descriptor" @> jsonb_build_object(
      'schema', artifact_set."descriptor"->>'schema', 'version', 1,
      'id', artifact_set."id", 'entryKind', artifact_set."entryKind",
      'sourceDigest', processing_run."sourceDigest", 'toolchainDigest', processing_run."toolchainDigest",
      'profileId', processing_run."pipelineProfile", 'profileVersion', processing_run."pipelineVersion"
    );
$lineage_matches$;

ALTER TABLE public.studio_review_voice_note DROP CONSTRAINT IF EXISTS studio_review_voice_note_retention;
ALTER TABLE public.studio_review_voice_note ADD CONSTRAINT studio_review_voice_note_retention CHECK (
    "expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + interval '30 days'
  ) NOT VALID;
ALTER TABLE public.studio_review_voice_note VALIDATE CONSTRAINT studio_review_voice_note_retention;

ALTER TABLE public.studio_review_voice_note DROP CONSTRAINT IF EXISTS studio_review_voice_note_delete_state;
ALTER TABLE public.studio_review_voice_note ADD CONSTRAINT studio_review_voice_note_delete_state CHECK (
    ("deletedAt" IS NULL AND "deleteOperationId" IS NULL)
    OR ("deletedAt" IS NOT NULL AND "deleteOperationId" IS NOT NULL AND "deletedAt" >= "createdAt")
  ) NOT VALID;
ALTER TABLE public.studio_review_voice_note VALIDATE CONSTRAINT studio_review_voice_note_delete_state;

ALTER TABLE public.studio_review_voice_note DROP CONSTRAINT IF EXISTS studio_review_voice_note_subject;
ALTER TABLE public.studio_review_voice_note ADD CONSTRAINT studio_review_voice_note_subject CHECK (
    jsonb_typeof(subject) = 'object'
    AND subject->>'schemaVersion' = '1'
    AND subject->>'workId' = "workId"
    AND subject->>'reviewId' = "reviewId"
    AND subject->>'revisionId' = "revisionId"
    AND subject->>'rootGraphHash' = "rootGraphHash"
    AND nullif(subject->>'projectId','') IS NOT NULL
    AND nullif(subject->>'artifactId','') IS NOT NULL
  ) NOT VALID;
ALTER TABLE public.studio_review_voice_note VALIDATE CONSTRAINT studio_review_voice_note_subject;

ALTER TABLE public.studio_review_voice_note DROP CONSTRAINT IF EXISTS studio_review_voice_note_object;
ALTER TABLE public.studio_review_voice_note ADD CONSTRAINT studio_review_voice_note_object CHECK (
    jsonb_typeof("objectReference") = 'object'
    AND "objectReference"->>'contractVersion' IN ('toonspectrum.private-object-storage.v2', 'toonstudio.private-object-storage.v2')
    AND "objectReference"->>'purpose' = 'derived'
    AND "objectReference"->>'contentType' = "contentType"
    AND ("objectReference"->>'byteLength')::integer = "byteLength"
    AND "objectReference"->>'digest' = 'sha256:' || sha256
    AND nullif("objectReference"->>'providerId','') IS NOT NULL
    AND nullif("objectReference"->>'objectPath','') IS NOT NULL
  ) NOT VALID;
ALTER TABLE public.studio_review_voice_note VALIDATE CONSTRAINT studio_review_voice_note_object;

ALTER TABLE public.studio_review_voice_note DROP CONSTRAINT IF EXISTS studio_review_voice_note_release_bounds;
ALTER TABLE public.studio_review_voice_note ADD CONSTRAINT studio_review_voice_note_release_bounds CHECK (
  char_length(title) BETWEEN 1 AND 160 AND char_length(transcript) BETWEEN 1 AND 4000
  AND "durationMs" BETWEEN 1 AND 120000 AND "byteLength" BETWEEN 1 AND 5242880
  AND "contentType" IN ('audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav')
  AND "rootGraphHash" ~ '^[a-f0-9]{64}$' AND sha256 ~ '^[a-f0-9]{64}$'
  AND "requestHash" ~ '^[a-f0-9]{64}$') NOT VALID;
ALTER TABLE public.studio_review_voice_note VALIDATE CONSTRAINT studio_review_voice_note_release_bounds;

CREATE OR REPLACE FUNCTION studio_review_voice_note_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."deletedAt" IS NOT NULL OR NEW."deleteOperationId" IS NOT NULL THEN
      RAISE EXCEPTION 'new review voice note cannot start deleted';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM creator_work WHERE id = OLD."workId") THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'review voice note is retained until parent deletion';
  END IF;
  IF to_jsonb(NEW) = to_jsonb(OLD) THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW)-'deletedAt'-'deleteOperationId') IS DISTINCT FROM
     (to_jsonb(OLD)-'deletedAt'-'deleteOperationId') THEN
    RAISE EXCEPTION 'review voice note immutable fields changed';
  END IF;
  IF OLD."deletedAt" IS NOT NULL OR NEW."deletedAt" IS NULL OR NEW."deleteOperationId" IS NULL
     OR NEW."deletedAt" < OLD."createdAt" THEN
    RAISE EXCEPTION 'invalid review voice note deletion transition';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS studio_review_voice_note_guard_update ON studio_review_voice_note;
CREATE TRIGGER studio_review_voice_note_guard_update BEFORE INSERT OR UPDATE OR DELETE ON studio_review_voice_note
  FOR EACH ROW EXECUTE FUNCTION studio_review_voice_note_guard();

REVOKE ALL ON TABLE studio_review_voice_note FROM PUBLIC;
REVOKE ALL ON FUNCTION studio_review_voice_note_guard() FROM PUBLIC;


COMMIT;
