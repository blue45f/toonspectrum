import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path, before, after) {
  const source = readFileSync(path, "utf8");
  const first = source.indexOf(before);
  if (first < 0) {
    throw new Error(`expected patch source not found in ${path}: ${before.slice(0, 100)}`);
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`patch source is not unique in ${path}: ${before.slice(0, 100)}`);
  }
  writeFileSync(path, source.slice(0, first) + after + source.slice(first + before.length));
}

const bootstrap = "scripts/bootstrap-empty-production-database.mjs";
replaceOnce(
  bootstrap,
  '  "0037_creator_marketplace_3d_asset_parity",\n]);',
  '  "0037_creator_marketplace_3d_asset_parity",\n  "0039_creator_asset_platform_foundation",\n]);',
);
replaceOnce(
  bootstrap,
  '  "apps/api/src/db/creator-asset-object-storage.schema.ts",\n  "apps/api/src/db/studio-crdt-raster-checkpoint.schema.ts",',
  '  "apps/api/src/db/creator-asset-object-storage.schema.ts",\n  "apps/api/src/db/creator-asset-platform.schema.ts",\n  "apps/api/src/db/creator-asset-processing.schema.ts",\n  "apps/api/src/db/creator-asset-rights-evidence.schema.ts",\n  "apps/api/src/db/studio-crdt-raster-checkpoint.schema.ts",',
);

const bootstrapTest = "scripts/bootstrap-empty-production-database.test.mjs";
replaceOnce(
  bootstrapTest,
  '      "0037_creator_marketplace_3d_asset_parity",\n      "0038_feedback_community",\n    ]);',
  '      "0037_creator_marketplace_3d_asset_parity",\n      "0038_feedback_community",\n      "0039_creator_asset_platform_foundation",\n    ]);',
);
replaceOnce(
  bootstrapTest,
  '      "apps/api/src/db/creator-asset-object-storage.schema.ts",\n      "apps/api/src/db/studio-crdt-raster-checkpoint.schema.ts",',
  '      "apps/api/src/db/creator-asset-object-storage.schema.ts",\n      "apps/api/src/db/creator-asset-platform.schema.ts",\n      "apps/api/src/db/creator-asset-processing.schema.ts",\n      "apps/api/src/db/creator-asset-rights-evidence.schema.ts",\n      "apps/api/src/db/studio-crdt-raster-checkpoint.schema.ts",',
);

const drizzle = "apps/api/src/db/creator-asset-platform.schema.ts";
replaceOnce(
  drizzle,
  `    foreignKey({
      name: "creator_work_catalog_asset_binding_artifact_fkey",
      columns: [table.artifactSetId, table.selectedArtifactId],
      foreignColumns: [
        creatorAssetArtifacts.artifactSetId,
        creatorAssetArtifacts.artifactId,
      ],
    }).onDelete("restrict"),`,
  `    foreignKey({
      name: "creator_work_catalog_asset_binding_release_entry_fkey",
      columns: [table.releaseId, table.entryId],
      foreignColumns: [
        creatorMarketplaceReleaseArtifactBindings.releaseId,
        creatorMarketplaceReleaseArtifactBindings.entryId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "creator_work_catalog_asset_binding_artifact_fkey",
      columns: [table.artifactSetId, table.selectedArtifactId],
      foreignColumns: [
        creatorAssetArtifacts.artifactSetId,
        creatorAssetArtifacts.artifactId,
      ],
    }).onDelete("restrict"),`,
);

const migration = "apps/api/src/db/migrations/0039_creator_asset_platform_foundation.sql";
replaceOnce(
  migration,
  '  CONSTRAINT "creator_work_catalog_asset_binding_pkey" PRIMARY KEY ("workId", "attachmentId"),\n  CONSTRAINT "creator_work_catalog_asset_binding_receipt_unique" UNIQUE ("useReceiptId"),\n  CONSTRAINT "creator_work_catalog_asset_binding_artifact_fkey"',
  '  CONSTRAINT "creator_work_catalog_asset_binding_pkey" PRIMARY KEY ("workId", "attachmentId"),\n  CONSTRAINT "creator_work_catalog_asset_binding_receipt_unique" UNIQUE ("useReceiptId"),\n  CONSTRAINT "creator_work_catalog_asset_binding_release_entry_fkey"\n    FOREIGN KEY ("releaseId", "entryId")\n    REFERENCES public."creator_marketplace_release_artifact_binding"("releaseId", "entryId")\n    ON DELETE RESTRICT,\n  CONSTRAINT "creator_work_catalog_asset_binding_artifact_fkey"',
);
replaceOnce(
  migration,
  `  target_set := CASE WHEN TG_OP = 'DELETE' THEN OLD."artifactSetId" ELSE NEW."artifactSetId" END;
  SELECT "state" INTO parent_state`,
  `  IF TG_OP = 'INSERT' THEN
    target_set := NEW."artifactSetId";
  ELSE
    target_set := OLD."artifactSetId";
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW."artifactSetId" IS DISTINCT FROM OLD."artifactSetId"
    OR NEW."artifactId" IS DISTINCT FROM OLD."artifactId"
  ) THEN
    RAISE EXCEPTION 'artifact identity cannot move between artifact sets'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_asset_artifact_identity_immutable';
  END IF;
  SELECT "state" INTO parent_state`,
);

const workBindingTrigger = `
CREATE OR REPLACE FUNCTION public.enforce_creator_work_catalog_asset_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $work_catalog_binding$
DECLARE
  bound_artifact_set text;
  bound_license_snapshot text;
  selected_digest text;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."workId" IS DISTINCT FROM OLD."workId"
    OR NEW."attachmentId" IS DISTINCT FROM OLD."attachmentId"
    OR NEW."assetType" IS DISTINCT FROM OLD."assetType"
    OR NEW."releaseId" IS DISTINCT FROM OLD."releaseId"
    OR NEW."entryId" IS DISTINCT FROM OLD."entryId"
    OR NEW."artifactSetId" IS DISTINCT FROM OLD."artifactSetId"
    OR NEW."selectedArtifactId" IS DISTINCT FROM OLD."selectedArtifactId"
    OR NEW."expectedContentDigest" IS DISTINCT FROM OLD."expectedContentDigest"
    OR NEW."licenseSnapshotId" IS DISTINCT FROM OLD."licenseSnapshotId"
    OR NEW."entitlementGrantId" IS DISTINCT FROM OLD."entitlementGrantId"
    OR NEW."useReceiptId" IS DISTINCT FROM OLD."useReceiptId"
    OR NEW."qualityProfile" IS DISTINCT FROM OLD."qualityProfile"
    OR NEW."insertedBy" IS DISTINCT FROM OLD."insertedBy"
    OR NEW."insertedAt" IS DISTINCT FROM OLD."insertedAt"
  ) THEN
    RAISE EXCEPTION 'work catalog asset binding identity and receipt are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_work_catalog_asset_binding_identity_immutable';
  END IF;

  SELECT binding."artifactSetId", binding."licenseSnapshotId"
  INTO bound_artifact_set, bound_license_snapshot
  FROM public."creator_marketplace_release_artifact_binding" AS binding
  WHERE binding."releaseId" = NEW."releaseId"
    AND binding."entryId" = NEW."entryId";
  IF bound_artifact_set IS DISTINCT FROM NEW."artifactSetId"
    OR bound_license_snapshot IS DISTINCT FROM NEW."licenseSnapshotId"
  THEN
    RAISE EXCEPTION 'work binding must use the artifact and license sealed into the release'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_work_catalog_asset_binding_release_integrity';
  END IF;

  SELECT artifact."objectDigest" INTO selected_digest
  FROM public."creator_asset_artifact" AS artifact
  WHERE artifact."artifactSetId" = NEW."artifactSetId"
    AND artifact."artifactId" = NEW."selectedArtifactId";
  IF selected_digest IS DISTINCT FROM NEW."expectedContentDigest" THEN
    RAISE EXCEPTION 'work binding digest must match the selected artifact'
      USING ERRCODE = '23514', CONSTRAINT = 'creator_work_catalog_asset_binding_digest_integrity';
  END IF;
  RETURN NEW;
END
$work_catalog_binding$;
CREATE TRIGGER creator_work_catalog_asset_binding_guard
BEFORE INSERT OR UPDATE ON public."creator_work_catalog_asset_binding"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_work_catalog_asset_binding();
`;
replaceOnce(
  migration,
  `CREATE TRIGGER creator_marketplace_entitlement_update
BEFORE UPDATE ON public."creator_marketplace_entitlement_grant"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_marketplace_entitlement_update();

REVOKE ALL ON TABLE`,
  `CREATE TRIGGER creator_marketplace_entitlement_update
BEFORE UPDATE ON public."creator_marketplace_entitlement_grant"
FOR EACH ROW EXECUTE FUNCTION public.enforce_creator_marketplace_entitlement_update();
${workBindingTrigger}
REVOKE ALL ON TABLE`,
);

const shared = "apps/web/src/shared/lib/creator-asset-platform-contract.ts";
replaceOnce(
  shared,
  `  if (
    request.availability === "moderation-hold" ||
    request.availability === "owner-delisted"
  ) {`,
  `  if (request.availability === "moderation-hold") {`,
);
replaceOnce(
  shared,
  `  let sawMatchingVersion = false;
  let sawTeamScopeProblem = false;`,
  `  let sawPackageGrant = false;
  let sawMatchingVersion = false;
  let sawTeamScopeProblem = false;`,
);
replaceOnce(
  shared,
  `    if (!grantIncludesRelease(grant, request.releaseId, request.releaseOrdinal)) {
      continue;
    }
    sawMatchingVersion = true;`,
  `    sawPackageGrant = true;
    if (!grantIncludesRelease(grant, request.releaseId, request.releaseOrdinal)) {
      continue;
    }
    sawMatchingVersion = true;`,
);
replaceOnce(
  shared,
  `  if (request.accessModel === "free") {
    return allowDecision(`,
  `  if (sawPackageGrant && !sawMatchingVersion) {
    return {
      code: "version-not-included",
      allowed: false,
      grantId: null,
      reason: "보유한 권리에 이 릴리스 버전이 포함되지 않습니다.",
    };
  }
  if (request.availability === "owner-delisted") {
    return {
      code: "deny",
      allowed: false,
      grantId: null,
      reason: "제작자가 배포를 중단해 신규 사용을 시작할 수 없습니다.",
    };
  }
  if (request.accessModel === "free") {
    return allowDecision(`,
);

const sharedTest = "apps/web/src/shared/lib/creator-asset-platform-contract.test.ts";
replaceOnce(
  sharedTest,
  `  it("allows free releases while retaining attribution requirements", () => {`,
  `  it("keeps existing grants usable after owner delisting but blocks new use", () => {
    expect(
      resolveCreatorMarketplaceEntitlement(
        entitlementInput({ availability: "owner-delisted", grants: [grant()] }),
      ).code,
    ).toBe("allow");
    expect(
      resolveCreatorMarketplaceEntitlement(
        entitlementInput({ availability: "owner-delisted" }),
      ).code,
    ).toBe("deny");
  });

  it("distinguishes a package grant that excludes the requested release", () => {
    expect(
      resolveCreatorMarketplaceEntitlement(
        entitlementInput({
          releaseId: "release/classroom/2.0.0",
          releaseOrdinal: 2,
          grants: [grant()],
        }),
      ).code,
    ).toBe("version-not-included");
  });

  it("allows free releases while retaining attribution requirements", () => {`,
);

const architectureTest = "scripts/asset-platform-foundation-contract.test.mjs";
replaceOnce(
  architectureTest,
  `      "creator_asset_artifact_sealed_immutable",
      "creator_asset_artifact_set_seal_contents",`,
  `      "creator_asset_artifact_sealed_immutable",
      "creator_asset_artifact_identity_immutable",
      "creator_asset_artifact_set_seal_contents",`,
);
replaceOnce(
  architectureTest,
  `      "creator_marketplace_entitlement_content_immutable",
      "creator_marketplace_entitlement_revocation",`,
  `      "creator_marketplace_entitlement_content_immutable",
      "creator_marketplace_entitlement_revocation",
      "creator_work_catalog_asset_binding_release_integrity",
      "creator_work_catalog_asset_binding_digest_integrity",`,
);
replaceOnce(
  architectureTest,
  `    expect(migration).toContain(
      'REFERENCES public.\"creator_work\"(\"id\")',
    );`,
  `    expect(migration).toContain(
      'REFERENCES public.\"creator_work\"(\"id\")',
    );
    expect(migration).toContain(
      'REFERENCES public.\"creator_marketplace_release_artifact_binding\"(\"releaseId\", \"entryId\")',
    );`,
);

console.log("asset platform CI and integrity follow-up applied");
