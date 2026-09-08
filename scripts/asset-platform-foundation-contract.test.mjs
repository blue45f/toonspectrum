import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

const migrationPath =
  "apps/api/src/db/migrations/0039_creator_asset_platform_foundation.sql";
const drizzlePath = "apps/api/src/db/creator-asset-platform.schema.ts";
const processingPath = "apps/api/src/db/creator-asset-processing.schema.ts";
const rightsPath = "apps/api/src/db/creator-asset-rights-evidence.schema.ts";
const sharedContractPath =
  "apps/web/src/shared/lib/creator-asset-platform-contract.ts";
const publishPagePath =
  "apps/web/src/domains/market/pages/MarketPublishPage.tsx";

const managedTables = [
  "creator_marketplace_draft",
  "creator_marketplace_draft_revision",
  "creator_asset_upload_session",
  "creator_asset_processing_run",
  "creator_asset_processing_step",
  "creator_asset_artifact_set",
  "creator_asset_artifact",
  "creator_asset_qa_report",
  "creator_asset_license_snapshot",
  "creator_asset_rights_evidence",
  "creator_marketplace_release_artifact_binding",
  "creator_marketplace_release_availability",
  "creator_marketplace_entitlement_grant",
  "creator_work_catalog_asset_binding",
];

describe("asset platform production migration", () => {
  it("preserves the ordered foundation migrations when later migrations are appended", () => {
    const manifest = read("scripts/production-database-migrations.manifest")
      .trim()
      .split("\n");
    expect(manifest.slice(38, 42)).toEqual([
      migrationPath,
      "apps/api/src/db/migrations/0040_creator_asset_platform_integrity.sql",
      "apps/api/src/db/migrations/0041_creator_asset_evidence_lineage.sql",
      "apps/api/src/db/migrations/0042_creator_asset_publication_retention.sql",
    ]);
    expect(manifest[43]).toBe("apps/api/src/db/migrations/0044_creator_work_entitlement_authorization.sql");
    expect(new Set(manifest).size).toBe(manifest.length);
  });

  it("creates every platform relation and keeps public access closed", () => {
    const migration = read(migrationPath);
    for (const table of managedTables) {
      expect(migration).toContain(`CREATE TABLE public.\"${table}\"`);
      expect(migration).toContain(`public.\"${table}\"`);
    }
    expect(migration).toContain("REVOKE ALL ON TABLE");
    expect(migration).toContain("FROM PUBLIC;");
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/iu);
    expect(migration).not.toMatch(/\bTRUNCATE\b/iu);
  });

  it("enforces the lifecycle and immutable release boundaries in PostgreSQL", () => {
    const migration = read(migrationPath);
    for (const marker of [
      "creator_marketplace_draft_state_transition",
      "creator_marketplace_draft_revision_monotonic",
      "creator_asset_artifact_sealed_immutable",
      "creator_asset_artifact_set_seal_contents",
      "creator_asset_artifact_set_seal_qa",
      "creator_asset_license_snapshot_content_immutable",
      "creator_marketplace_release_artifact_binding_immutable",
      "creator_marketplace_release_availability_monotonic",
      "creator_marketplace_entitlement_content_immutable",
      "creator_marketplace_entitlement_revocation",
    ]) {
      expect(migration).toContain(marker);
    }
  });

  it("binds artifacts to the existing content-addressed storage ledger", () => {
    const migration = read(migrationPath);
    expect(migration).toContain(
      'REFERENCES public.creator_asset_storage_object("purpose", "digest")',
    );
    expect(migration).toContain(
      'REFERENCES public."creator_marketplace_resource"("id")',
    );
    expect(migration).toContain(
      'REFERENCES public."creator_work"("id")',
    );
  });
});

describe("asset platform code contracts", () => {
  it("exports every Drizzle schema from the API database boundary", () => {
    const index = read("apps/api/src/db/index.ts");
    expect(index).toContain('export * from "./creator-asset-platform.schema";');
    expect(index).toContain('export * from "./creator-asset-processing.schema";');
    expect(index).toContain(
      'export * from "./creator-asset-rights-evidence.schema";',
    );
  });

  it("keeps SQL, Drizzle and shared contracts on the same durable concepts", () => {
    const sources = [
      read(drizzlePath),
      read(processingPath),
      read(rightsPath),
      read(sharedContractPath),
    ].join("\n");
    for (const marker of [
      "creatorMarketplaceDrafts",
      "creatorAssetUploadSessions",
      "creatorAssetProcessingRuns",
      "creatorAssetProcessingSteps",
      "creatorAssetArtifactSets",
      "creatorAssetArtifacts",
      "creatorAssetQaReports",
      "creatorAssetLicenseSnapshots",
      "creatorAssetRightsEvidence",
      "creatorMarketplaceReleaseArtifactBindings",
      "creatorMarketplaceEntitlementGrants",
      "creatorWorkCatalogAssetBindings",
      "resolveCreatorMarketplaceEntitlement",
      "CreatorWorkCatalogAssetBindingSchema",
    ]) {
      expect(sources).toContain(marker);
    }
  });

  it("never persists signed delivery URLs in the catalog binding contract", () => {
    const contract = read(sharedContractPath);
    const bindingStart = contract.indexOf(
      "export const CreatorWorkCatalogAssetBindingSchema",
    );
    expect(bindingStart).toBeGreaterThanOrEqual(0);
    const binding = contract.slice(bindingStart);
    expect(binding).not.toMatch(/signedUrl|bucket|objectPath|accessToken/iu);
    expect(binding).toContain("expectedContentDigest");
    expect(binding).toContain("artifactSetId");
  });
});

describe("market publish truthfulness", () => {
  it("shows success only for the server-returned immutable release", () => {
    const page = read(publishPagePath);
    expect(page).toContain(
      "const published = await publishCreatorMarketplaceResource",
    );
    expect(page).toContain("saveCustomPublishedResource(published);");
    expect(page).toContain("setPublishedRecord(published);");
    expect(page).toContain("setPublishError(");
    expect(page).toContain('role="alert"');
    expect(page).not.toContain("safe fallback to client registry");
    expect(page).not.toContain("setPublishedRecord(finalRecord)");
  });
});
