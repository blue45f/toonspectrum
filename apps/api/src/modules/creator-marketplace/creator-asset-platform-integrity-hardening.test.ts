import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(
  resolve(
    root,
    "apps/api/src/db/migrations/0040_creator_asset_platform_integrity_hardening.sql",
  ),
  "utf8",
);
const productionManifest = readFileSync(
  resolve(root, "scripts/production-database-migrations.manifest"),
  "utf8",
);

describe("creator asset platform integrity hardening", () => {
  it("registers the additive production migration", () => {
    expect(productionManifest).toContain(
      "0040_creator_asset_platform_integrity_hardening.sql",
    );
  });

  it("requires complete artifact dimensions and entitlement ranges", () => {
    expect(migration).toContain('"width" IS NOT NULL');
    expect(migration).toContain('"height" IS NOT NULL');
    expect(migration).toContain('"minimumOrdinal" IS NOT NULL');
    expect(migration).toContain('"maximumOrdinal" IS NOT NULL');
  });

  it("freezes artifact, QA and processing evidence after a set becomes terminal", () => {
    expect(migration).toContain("creator_asset_artifact_set_identity_immutable");
    expect(migration).toContain("creator_asset_qa_report_terminal_immutable");
    expect(migration).toContain("creator_asset_processing_run_terminal_immutable");
    expect(migration).toContain("BEFORE INSERT OR UPDATE OR DELETE");
  });

  it("binds work attachments to the exact release lineage", () => {
    expect(migration).toContain(
      "creator_work_catalog_asset_binding_release_lineage",
    );
    expect(migration).toContain(
      'release_binding."releaseId" = NEW."releaseId"',
    );
    expect(migration).toContain(
      'release_binding."licenseSnapshotId" = NEW."licenseSnapshotId"',
    );
  });

  it("preserves entitlement grants and requires explicit revocation", () => {
    expect(migration).toContain(
      "creator_marketplace_entitlement_delete_forbidden",
    );
    expect(migration).toContain(
      "use the modeled revocation transition",
    );
  });
});
