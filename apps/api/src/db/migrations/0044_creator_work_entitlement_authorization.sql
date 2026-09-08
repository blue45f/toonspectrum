-- Forward-only authorization repair; 0041 remains immutable deployment history.
-- Do not rewrite historical receipts. Organization membership and free access are not
-- durable facts at this boundary, so new non-publisher references require a user grant.
BEGIN;

LOCK TABLE public."creator_work_catalog_asset_binding" IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION public.enforce_creator_work_catalog_asset_entitlement()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $binding_entitlement_authorization$
DECLARE
  entitlement public."creator_marketplace_entitlement_grant"%ROWTYPE;
  release public."creator_marketplace_resource"%ROWTYPE;
  work_owner text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."insertedAt" IS DISTINCT FROM OLD."insertedAt"
      OR (OLD."entitlementGrantId" IS NOT NULL AND NEW."entitlementGrantId" IS NULL)
    THEN
      RAISE EXCEPTION 'work entitlement acquisition evidence cannot be erased or backdated'
        USING ERRCODE = '23514', CONSTRAINT = 'creator_work_catalog_asset_binding_entitlement_evidence';
    END IF;

    IF ROW(
      NEW."workId", NEW."attachmentId", NEW."assetType", NEW."releaseId", NEW."entryId",
      NEW."artifactSetId", NEW."selectedArtifactId", NEW."expectedContentDigest",
      NEW."licenseSnapshotId", NEW."entitlementGrantId", NEW."useReceiptId"
    ) IS NOT DISTINCT FROM ROW(
      OLD."workId", OLD."attachmentId", OLD."assetType", OLD."releaseId", OLD."entryId",
      OLD."artifactSetId", OLD."selectedArtifactId", OLD."expectedContentDigest",
      OLD."licenseSnapshotId", OLD."entitlementGrantId", OLD."useReceiptId"
    )
    THEN
      -- Only warning/state, quality profile and resolution time preserve the original use.
      -- Replacing its entry, bytes, license, asset type or receipt requires authorization again.
      -- insertedBy is nullable attribution, not authorization; retain its ON DELETE SET NULL.
      -- This does not authorize delivery or a new insertion: the resolver still checks
      -- revocation and existingWorkSurvives whenever the historical reference is used.
      RETURN NEW;
    END IF;
  ELSE
    -- Client-supplied past acquisition time never makes an expired grant usable again.
    NEW."insertedAt" := statement_timestamp();
  END IF;

  SELECT candidate.* INTO release
  FROM public."creator_marketplace_resource" AS candidate
  WHERE candidate."id" = NEW."releaseId"
  FOR SHARE;

  SELECT work."userId" INTO work_owner
  FROM public."creator_work" AS work
  WHERE work."id" = NEW."workId"
  FOR SHARE;

  IF NEW."entitlementGrantId" IS NULL THEN
    -- A license such as CC0 or a caller's accessModel is not a persisted access policy.
    -- The only grant-free authorization we can prove is the publisher's own work.
    IF work_owner IS NULL OR release."publisherId" IS DISTINCT FROM work_owner THEN
      RAISE EXCEPTION 'non-publisher work references require an entitlement grant'
        USING ERRCODE = '23514', CONSTRAINT = 'creator_work_catalog_asset_binding_entitlement_authorization';
    END IF;
    RETURN NEW;
  END IF;

  -- SHARE, not KEY SHARE: revocation changes a non-key column and must serialize with use.
  SELECT candidate.* INTO entitlement
  FROM public."creator_marketplace_entitlement_grant" AS candidate
  WHERE candidate."id" = NEW."entitlementGrantId"
  FOR SHARE;

  IF public.creator_marketplace_entitlement_matches_release(entitlement, release) IS NOT TRUE THEN
    RAISE EXCEPTION 'work binding entitlement must authorize the referenced release'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_work_catalog_asset_binding_entitlement_release';
  END IF;

  IF work_owner IS NULL
    OR entitlement."subjectType" <> 'user'
    OR entitlement."subjectId" IS DISTINCT FROM work_owner
    OR entitlement."revokedAt" IS NOT NULL
    OR entitlement."validFrom" > statement_timestamp()
    OR (entitlement."validUntil" IS NOT NULL AND entitlement."validUntil" < statement_timestamp())
  THEN
    RAISE EXCEPTION 'new work references require a currently valid, unrevoked grant owned by the work owner'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_work_catalog_asset_binding_entitlement_authorization';
  END IF;

  RETURN NEW;
END
$binding_entitlement_authorization$;

DROP TRIGGER creator_work_catalog_asset_entitlement ON public."creator_work_catalog_asset_binding";
CREATE TRIGGER creator_work_catalog_asset_entitlement
BEFORE INSERT OR UPDATE ON public."creator_work_catalog_asset_binding"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_work_catalog_asset_entitlement();

COMMIT;
