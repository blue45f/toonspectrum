-- Forward-only repair: keep 0039/0040 checksums and reject invalid existing evidence.
-- No purchased rights, descriptors or publication records are rewritten during validation.
BEGIN;
SELECT pg_advisory_xact_lock(82361743);

ALTER TABLE public."creator_marketplace_draft"
  ADD CONSTRAINT "creator_marketplace_draft_artifact_set_fkey"
    FOREIGN KEY ("artifactSetId") REFERENCES public."creator_asset_artifact_set" ("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "creator_marketplace_draft_license_snapshot_fkey"
    FOREIGN KEY ("licenseSnapshotId") REFERENCES public."creator_asset_license_snapshot" ("id") ON DELETE RESTRICT;

CREATE FUNCTION public.creator_asset_artifact_lineage_matches(
  artifact_set public."creator_asset_artifact_set", processing_run public."creator_asset_processing_run"
) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $lineage_matches$
  SELECT artifact_set."processingRunId" = processing_run."id"
    AND artifact_set."sourceDigest" = processing_run."sourceDigest"
    AND artifact_set."toolchainDigest" = processing_run."toolchainDigest"
    AND artifact_set."descriptor" @> jsonb_build_object(
      'schema', 'toonspectrum.creator-asset-artifact-set', 'version', 1,
      'id', artifact_set."id", 'entryKind', artifact_set."entryKind",
      'sourceDigest', processing_run."sourceDigest", 'toolchainDigest', processing_run."toolchainDigest",
      'profileId', processing_run."pipelineProfile", 'profileVersion', processing_run."pipelineVersion"
    );
$lineage_matches$;

CREATE FUNCTION public.enforce_creator_asset_artifact_seal_lineage()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $seal_lineage$
BEGIN
  -- The existing BEFORE trigger checks contents, QA and successful processing under FOR SHARE.
  -- Validate the final descriptor after those checks; any rejection rolls back the entire seal.
  IF NOT EXISTS (
    SELECT 1 FROM public."creator_asset_processing_run" AS processing_run
    WHERE processing_run."id" = NEW."processingRunId" AND processing_run."state" = 'succeeded'
      AND public.creator_asset_artifact_lineage_matches(NEW, processing_run)
  ) THEN
    RAISE EXCEPTION 'sealed artifact descriptor must match its successful processing lineage'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_set_seal_lineage';
  END IF;
  RETURN NEW;
END
$seal_lineage$;
CREATE TRIGGER creator_asset_artifact_seal_lineage
AFTER INSERT OR UPDATE ON public."creator_asset_artifact_set"
FOR EACH ROW WHEN (NEW."state" = 'sealed')
EXECUTE FUNCTION public.enforce_creator_asset_artifact_seal_lineage();

CREATE FUNCTION public.creator_marketplace_entitlement_matches_release(
  entitlement public."creator_marketplace_entitlement_grant", release public."creator_marketplace_resource"
) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $entitlement_matches$
  SELECT entitlement."publisherId" = release."publisherId"
    AND entitlement."packageId" = release."packageId"
    AND CASE entitlement."releasePolicy"
      WHEN 'exact' THEN entitlement."releaseId" = release."id"
      WHEN 'range' THEN release."releaseOrdinal" BETWEEN entitlement."minimumOrdinal" AND entitlement."maximumOrdinal"
      -- As in resolveCreatorMarketplaceEntitlement, package-head covers the package's releases.
      WHEN 'package-head' THEN true
      ELSE false
    END;
$entitlement_matches$;

CREATE FUNCTION public.enforce_creator_work_catalog_asset_entitlement()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $binding_entitlement$
BEGIN
  IF NEW."entitlementGrantId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."creator_marketplace_entitlement_grant" AS entitlement
    JOIN public."creator_marketplace_resource" AS release ON release."id" = NEW."releaseId"
    WHERE entitlement."id" = NEW."entitlementGrantId"
      AND public.creator_marketplace_entitlement_matches_release(entitlement, release)
  ) THEN
    RAISE EXCEPTION 'work binding entitlement must authorize the referenced release'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_work_catalog_asset_binding_entitlement_release';
  END IF;
  RETURN NEW;
END
$binding_entitlement$;
CREATE TRIGGER creator_work_catalog_asset_entitlement
AFTER INSERT OR UPDATE ON public."creator_work_catalog_asset_binding"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_work_catalog_asset_entitlement();

CREATE FUNCTION public.creator_marketplace_draft_has_review_evidence(draft public."creator_marketplace_draft")
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $review_evidence$
  SELECT EXISTS (
    SELECT 1 FROM public."creator_asset_artifact_set" AS artifact_set
    JOIN public."creator_asset_processing_run" AS processing_run ON processing_run."id" = artifact_set."processingRunId"
    JOIN public."creator_asset_license_snapshot" AS license ON license."id" = draft."licenseSnapshotId"
    WHERE artifact_set."id" = draft."artifactSetId" AND artifact_set."state" = 'sealed'
      AND processing_run."draftId" = draft."id"
      AND license."reviewState" IN ('pending', 'approved')
      AND (draft."state" IN ('ready-to-submit', 'in-review') OR license."reviewState" = 'approved')
  );
$review_evidence$;

CREATE FUNCTION public.creator_marketplace_draft_has_publication_evidence(draft public."creator_marketplace_draft")
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $publication_evidence$
  SELECT EXISTS (
    SELECT 1 FROM public."creator_marketplace_resource" AS release
    JOIN public."creator_marketplace_release_artifact_binding" AS binding ON binding."releaseId" = release."id"
    WHERE release."id" = draft."publishedReleaseId" AND release."publisherId" = draft."publisherId"
      AND release."packageId" = draft."packageId" AND release."kind" = draft."kind"
      AND binding."artifactSetId" = draft."artifactSetId" AND binding."licenseSnapshotId" = draft."licenseSnapshotId"
  );
$publication_evidence$;

CREATE FUNCTION public.enforce_creator_marketplace_draft_evidence()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $draft_evidence$
BEGIN
  IF NEW."state" IN ('ready-to-submit', 'in-review', 'approved', 'publishing', 'published')
    AND NOT public.creator_marketplace_draft_has_review_evidence(NEW)
  THEN
    RAISE EXCEPTION 'draft review requires sealed processing evidence and valid license review'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_draft_review_evidence';
  END IF;
  IF NEW."state" = 'published' AND NOT public.creator_marketplace_draft_has_publication_evidence(NEW) THEN
    RAISE EXCEPTION 'published draft must reference its own release and reviewed evidence'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_draft_publication_evidence';
  END IF;
  RETURN NEW;
END
$draft_evidence$;
CREATE TRIGGER creator_marketplace_draft_evidence
AFTER INSERT OR UPDATE ON public."creator_marketplace_draft"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_marketplace_draft_evidence();

-- Trigger installation alone does not validate historical rows. Abort the transaction on any
-- incompatible evidence instead of silently adopting it or changing the immutable audit trail.
DO $validate_existing$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public."creator_asset_artifact_set" AS artifact_set
    LEFT JOIN public."creator_asset_processing_run" AS processing_run ON processing_run."id" = artifact_set."processingRunId"
    WHERE artifact_set."state" = 'sealed' AND (processing_run."state" IS DISTINCT FROM 'succeeded'
      OR public.creator_asset_artifact_lineage_matches(artifact_set, processing_run) IS NOT TRUE)
  ) THEN
    RAISE EXCEPTION 'existing sealed artifact lineage requires investigation'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_set_seal_lineage';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."creator_work_catalog_asset_binding" AS binding
    LEFT JOIN public."creator_marketplace_entitlement_grant" AS entitlement ON entitlement."id" = binding."entitlementGrantId"
    LEFT JOIN public."creator_marketplace_resource" AS release ON release."id" = binding."releaseId"
    WHERE binding."entitlementGrantId" IS NOT NULL
      AND public.creator_marketplace_entitlement_matches_release(entitlement, release) IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'existing work entitlement evidence requires investigation'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_work_catalog_asset_binding_entitlement_release';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."creator_marketplace_draft" AS draft
    WHERE draft."state" IN ('ready-to-submit', 'in-review', 'approved', 'publishing', 'published')
      AND NOT public.creator_marketplace_draft_has_review_evidence(draft)
  ) THEN
    RAISE EXCEPTION 'existing draft review evidence requires investigation'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_draft_review_evidence';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."creator_marketplace_draft" AS draft
    WHERE draft."state" = 'published' AND NOT public.creator_marketplace_draft_has_publication_evidence(draft)
  ) THEN
    RAISE EXCEPTION 'existing publication evidence requires investigation'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_draft_publication_evidence';
  END IF;
END
$validate_existing$;

COMMIT;
