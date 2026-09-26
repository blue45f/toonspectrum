-- Preserve 0039-0041 and validate existing pins/lineage before adopting new guards.
-- Historical review transitions cannot be reconstructed; no approval or evidence is rewritten.
BEGIN;
SELECT pg_advisory_xact_lock(82361743);

CREATE FUNCTION public.creator_marketplace_release_binding_has_lineage(binding public."creator_marketplace_release_artifact_binding")
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $release_lineage$
  SELECT EXISTS (
    SELECT 1 FROM public."creator_asset_artifact_set" AS artifact_set
    JOIN public."creator_asset_processing_run" AS processing_run ON processing_run."id" = artifact_set."processingRunId"
    JOIN public."creator_marketplace_draft" AS draft ON draft."id" = processing_run."draftId"
    JOIN public."creator_marketplace_resource" AS release ON release."id" = binding."releaseId"
    WHERE artifact_set."id" = binding."artifactSetId" AND processing_run."entryId" = binding."entryId"
      AND draft."publisherId" = release."publisherId" AND draft."packageId" = release."packageId"
      AND draft."kind" = release."kind"
  );
$release_lineage$;
CREATE FUNCTION public.enforce_creator_marketplace_release_binding_lineage()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $release_binding_lineage$
BEGIN
  -- Existing triggers freeze the successful run, draft identity and immutable release content.
  IF NOT public.creator_marketplace_release_binding_has_lineage(NEW) THEN
    RAISE EXCEPTION 'release binding must belong to its publisher, package and processed entry'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_release_binding_lineage';
  END IF;
  RETURN NEW;
END
$release_binding_lineage$;
CREATE TRIGGER creator_marketplace_release_binding_lineage
BEFORE INSERT ON public."creator_marketplace_release_artifact_binding"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_marketplace_release_binding_lineage();

CREATE FUNCTION public.enforce_creator_asset_license_snapshot_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $license_insert$
BEGIN
  IF NEW."reviewState" IS DISTINCT FROM 'pending' OR NEW."reviewedBy" IS NOT NULL THEN
    RAISE EXCEPTION 'license snapshots must enter pending review without a reviewer decision'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_license_snapshot_initial_state';
  END IF;
  RETURN NEW;
END
$license_insert$;
CREATE TRIGGER creator_asset_license_snapshot_insert
BEFORE INSERT ON public."creator_asset_license_snapshot"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_asset_license_snapshot_insert();

CREATE FUNCTION public.enforce_creator_asset_rights_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $rights_evidence_mutation$
DECLARE
  snapshot_ids text[];
  snapshot record;
BEGIN
  snapshot_ids := CASE TG_OP
    WHEN 'INSERT' THEN ARRAY[NEW."licenseSnapshotId"]
    WHEN 'DELETE' THEN ARRAY[OLD."licenseSnapshotId"]
    ELSE ARRAY[OLD."licenseSnapshotId", NEW."licenseSnapshotId"] END;
  -- Lock both parents in a stable order. A concurrent review cannot approve evidence while
  -- it is being changed, nor can a waiting change cross a completed review decision.
  FOR snapshot IN
    SELECT "id", "reviewState" FROM public."creator_asset_license_snapshot"
    WHERE "id" = ANY(snapshot_ids) ORDER BY "id" FOR UPDATE
  LOOP
    IF snapshot."reviewState" IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'terminal license review evidence is immutable'
        USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_rights_evidence_terminal_immutable';
    END IF;
  END LOOP;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$rights_evidence_mutation$;
CREATE TRIGGER creator_asset_rights_evidence_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public."creator_asset_rights_evidence"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_asset_rights_evidence_mutation();

CREATE FUNCTION public.enforce_creator_work_catalog_asset_digest()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $work_digest$
BEGIN
  -- The existing release-entry FK restricts selection to a sealed, immutable artifact set.
  IF NOT EXISTS (
    SELECT 1 FROM public."creator_asset_artifact" AS artifact
    WHERE artifact."artifactSetId" = NEW."artifactSetId" AND artifact."artifactId" = NEW."selectedArtifactId"
      AND artifact."objectDigest" = NEW."expectedContentDigest"
  ) THEN
    RAISE EXCEPTION 'work content pin must equal the selected immutable artifact digest'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_work_catalog_asset_binding_content_digest';
  END IF;
  RETURN NEW;
END
$work_digest$;
CREATE TRIGGER creator_work_catalog_asset_digest
AFTER INSERT OR UPDATE ON public."creator_work_catalog_asset_binding"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_work_catalog_asset_digest();

CREATE FUNCTION public.enforce_creator_asset_artifact_storage_active()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $artifact_storage_active$
BEGIN
  -- FOR SHARE conflicts with the cleanup UPDATE's row lock; the FK's KEY SHARE does not.
  IF NOT EXISTS (
    SELECT 1 FROM public."creator_asset_storage_object"
    WHERE "purpose" = NEW."purpose" AND "digest" = NEW."objectDigest" AND "state" = 'active'
    FOR SHARE
  ) THEN
    RAISE EXCEPTION 'artifact bytes must remain active before being referenced'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_storage_active';
  END IF;
  RETURN NEW;
END
$artifact_storage_active$;
CREATE TRIGGER creator_asset_artifact_storage_active
BEFORE INSERT OR UPDATE ON public."creator_asset_artifact"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_asset_artifact_storage_active();

-- Existing cleanup roles may update storage lifecycle without reading private artifact rows.
-- Only this read-only retention guard runs as its owner; it grants no artifact access to callers.
CREATE FUNCTION public.enforce_creator_asset_storage_artifact_retention()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $artifact_retention$
BEGIN
  IF TG_OP = 'DELETE' OR NEW."state" IS DISTINCT FROM 'active' THEN
    IF EXISTS (
      SELECT 1 FROM public."creator_asset_artifact"
      WHERE "purpose" = OLD."purpose" AND "objectDigest" = OLD."digest"
    ) THEN
      RAISE EXCEPTION 'referenced artifact bytes cannot enter storage cleanup'
        USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_storage_object_artifact_retention';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$artifact_retention$;
REVOKE ALL ON FUNCTION public.enforce_creator_asset_storage_artifact_retention() FROM PUBLIC;
CREATE TRIGGER creator_asset_storage_artifact_retention
BEFORE UPDATE OF "state" OR DELETE ON public."creator_asset_storage_object"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_asset_storage_artifact_retention();

CREATE FUNCTION public.enforce_creator_asset_seal_storage_active()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $seal_storage_active$
BEGIN
  PERFORM 1 FROM public."creator_asset_storage_object" AS object
    JOIN public."creator_asset_artifact" AS artifact
      ON artifact."purpose" = object."purpose" AND artifact."objectDigest" = object."digest"
    WHERE artifact."artifactSetId" = NEW."id" FOR SHARE OF object;
  IF EXISTS (
    SELECT 1 FROM public."creator_asset_artifact" AS artifact
    LEFT JOIN public."creator_asset_storage_object" AS object
      ON object."purpose" = artifact."purpose" AND object."digest" = artifact."objectDigest"
    WHERE artifact."artifactSetId" = NEW."id" AND object."state" IS DISTINCT FROM 'active'
  ) THEN
    RAISE EXCEPTION 'sealed artifacts require active storage objects'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_storage_active';
  END IF;
  RETURN NEW;
END
$seal_storage_active$;
CREATE TRIGGER creator_asset_seal_storage_active
BEFORE UPDATE ON public."creator_asset_artifact_set"
FOR EACH ROW WHEN (NEW."state" = 'sealed')
EXECUTE FUNCTION public.enforce_creator_asset_seal_storage_active();

CREATE FUNCTION public.reject_creator_marketplace_release_availability_delete()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $availability_delete$
BEGIN
  RAISE EXCEPTION 'release availability history must be retained; use its revisioned state transition'
    USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_release_availability_delete_immutable';
END
$availability_delete$;
CREATE TRIGGER creator_marketplace_release_availability_delete
BEFORE DELETE ON public."creator_marketplace_release_availability"
FOR EACH ROW EXECUTE FUNCTION public.reject_creator_marketplace_release_availability_delete();

DO $validate_existing$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public."creator_marketplace_release_artifact_binding" AS binding
    WHERE NOT public.creator_marketplace_release_binding_has_lineage(binding)
  ) THEN
    RAISE EXCEPTION 'existing release ownership evidence requires investigation'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_marketplace_release_binding_lineage';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."creator_work_catalog_asset_binding" AS binding
    LEFT JOIN public."creator_asset_artifact" AS artifact
      ON artifact."artifactSetId" = binding."artifactSetId" AND artifact."artifactId" = binding."selectedArtifactId"
    WHERE artifact."objectDigest" IS DISTINCT FROM binding."expectedContentDigest"
  ) THEN
    RAISE EXCEPTION 'existing work content pins require investigation'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_work_catalog_asset_binding_content_digest';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."creator_asset_artifact" AS artifact
    LEFT JOIN public."creator_asset_storage_object" AS object
      ON object."purpose" = artifact."purpose" AND object."digest" = artifact."objectDigest"
    WHERE object."state" IS DISTINCT FROM 'active'
  ) THEN
    RAISE EXCEPTION 'existing inactive artifact bytes require investigation'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_storage_active';
  END IF;
END
$validate_existing$;
COMMIT;
