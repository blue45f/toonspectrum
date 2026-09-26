import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { HIRING_RELATIONS, HIRING_FUNCTIONS, buildHiringAutomationRuntimeAclSql, buildHiringAutomationCapabilitySql } from "./creator-hiring-automation-database-contract.mjs";
import { loadMigrationManifest } from "./run-production-database-migrations.mjs";
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const sql = read("../apps/api/src/platform/database/migrations/0079_creator_hiring_automation.sql");
test("0079 closes its atomic transaction and exactly matches the canonical job/receipt contract", () => {
  expect(sql).toMatch(/^BEGIN;[\s\S]*COMMIT;\s*$/u);
  expect([...sql.matchAll(/CREATE TABLE (\w+)/gu)].map((m) => m[1]).sort()).toEqual(HIRING_RELATIONS.map((r) => r.relation).sort());
  expect([...sql.matchAll(/CREATE FUNCTION (\w+)/gu)].map((m) => m[1]).sort()).toEqual([...HIRING_FUNCTIONS].sort());
  expect(sql).toContain("claim_token"); expect(sql).toContain("next_round");
  expect(sql).not.toContain("target_round"); expect(sql).not.toContain("lease_token");
  const manifest = loadMigrationManifest(); expect(manifest).toHaveLength(92);
  expect(manifest.slice(-10).map((m) => m.id)).toEqual(["0082_studio_review_policy", "0083_studio_review_vote_epoch", "0084_production_model_v2_compatibility", "0085_production_team_workspace", "0086_production_operation_policy", "0087_studio_pinned_review_share", "0088_studio_review_delivery", "0089_creator_series_spatial_showcase", "0090_studio_review_voice_note", "0091_creator_work_publication_media", "0092_collaboration_application_selection"]);
  expect(createHash("sha256").update(read("../apps/api/src/platform/database/migrations/0078_creator_hiring_workspace.sql")).digest("hex")).toBe("c8094e53ce497dfd8f0649adb3e51ad67ae4a67f27d4547b5863484d2e8e2085");
});
test("runtime is DML-only and round receipts are immutable", () => {
  const acl = buildHiringAutomationRuntimeAclSql("app_runtime");
  expect(acl).toContain('GRANT SELECT, INSERT ON TABLE "public".creator_hiring_campaign_round');
  expect(acl).not.toContain("GRANT DELETE"); expect(acl).not.toContain("SECURITY DEFINER");
  expect(acl).toContain("creator_hiring_automation_require_ready()");
  expect(buildHiringAutomationCapabilitySql("app_runtime")).toContain("WITH GRANT OPTION");
  expect(sql).toContain("creator_hiring_automation_round_immutable");
});
test.each(["public", "PUBLIC", "", 'role"', "runtime-role"])("rejects unsafe runtime role %s", (role) => {
  expect(() => buildHiringAutomationRuntimeAclSql(role)).toThrow();
  expect(() => buildHiringAutomationCapabilitySql(role)).toThrow();
});
