import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const migration = readFileSync(fileURLToPath(new URL(
  "../../db/migrations/0063_studio_project_graph_v3.sql",
  import.meta.url,
)), "utf8");
const schemaIndex = readFileSync(fileURLToPath(new URL(
  "../../db/schema/index.ts",
  import.meta.url,
)), "utf8");
const appModule = readFileSync(fileURLToPath(new URL(
  "../../app.module.ts",
  import.meta.url,
)), "utf8");

const TABLES = [
  "studio_project_graph",
  "studio_artifact",
  "studio_revision",
  "studio_revision_parent",
  "studio_blob",
  "studio_revision_blob",
  "studio_operation",
  "studio_mutation_receipt",
  "studio_compatibility_report",
  "studio_external_file_binding",
  "studio_review",
  "studio_review_reviewer",
  "studio_review_comment",
  "studio_review_comment_assignee",
  "studio_capability_ledger",
] as const;
describe("Studio ProjectGraph migration contract", () => {
  it("creates the complete authority graph inside one migration transaction", () => {
    expect(migration.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(migration.trimEnd().endsWith("COMMIT;")).toBe(true);
    for (const table of TABLES) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it("keeps revision, operation and retry records immutable", () => {
    for (const trigger of [
      "studio_revision_immutable_update",
      "studio_revision_parent_immutable_update",
      "studio_revision_blob_immutable_update",
      "studio_operation_immutable_update",
      "studio_mutation_receipt_immutable_update",
    ]) {
      expect(migration).toContain(`CREATE TRIGGER ${trigger}`);
    }
    expect(migration).toContain("studio_reject_immutable_update");
  });

  it("defers cross-row revision and review topology until transaction commit", () => {
    expect(migration).toContain("CREATE CONSTRAINT TRIGGER studio_revision_topology_revision");
    expect(migration).toContain("CREATE CONSTRAINT TRIGGER studio_revision_topology_parent");
    expect(migration).toContain("CREATE CONSTRAINT TRIGGER studio_artifact_revision_pointer_check");
    expect(migration).toContain("CREATE CONSTRAINT TRIGGER studio_review_snapshot_check");
    expect(migration.match(/DEFERRABLE INITIALLY DEFERRED/gu)?.length ?? 0)
      .toBeGreaterThanOrEqual(4);
  });
  it("binds comments to frozen artifact revisions and explicit targets", () => {
    expect(migration).toContain("anchor ? 'artifactId'");
    expect(migration).toContain("anchor ? 'revisionId'");
    expect(migration).toContain("anchor ? 'scope'");
    expect(migration).toContain("anchor ? 'target'");
    expect(migration).toContain("studio_validate_review_comment_anchor");
  });

  it("requires evidence-shaped capability records and loss approval", () => {
    expect(migration).toContain("jsonb_typeof(entry->'requiredChecks') = 'array'");
    expect(migration).toContain("jsonb_typeof(entry->'passedChecks') = 'array'");
    expect(migration).toContain("jsonb_typeof(entry->'evidence') = 'array'");
    expect(migration).toContain("jsonb_typeof(entry->'remainingGaps') = 'array'");
    expect(migration).toContain("studio_compatibility_report_approval_only");
  });

  it("does not leave the new tables accessible to PUBLIC", () => {
    expect(migration).toContain("REVOKE ALL ON TABLE");
    expect(migration).toContain("FROM PUBLIC;");
    expect(migration).not.toMatch(/GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE).*PUBLIC/iu);
  });

  it("registers both the Drizzle schema and Nest module", () => {
    expect(schemaIndex).toContain('export * from "./studio-project-graph.schema";');
    expect(appModule).toContain("StudioProjectGraphModule");
  });
});
