import { expect, test } from "vitest";

import {
  buildProductionCapabilityVerificationSql,
  loadHealthReadinessContract,
  validateRuntimeDatabaseRole,
} from "./verify-production-database-capabilities.mjs";

test("loads the runtime health readiness relation and cutover contract", () => {
  const contract = loadHealthReadinessContract();
  expect(contract.relationNames.length).toBeGreaterThan(50);
  expect(contract.relationNames).toContain("creator_draft_collaboration_room");
  expect(contract.relationNames).toContain("creator_marketplace_resource");
  expect(contract.migrationIds).toEqual([
    "0017_creator_work_live_lock_revision",
  ]);
});

test("generated verification covers runtime capabilities and exact migration checksums", () => {
  const sql = buildProductionCapabilityVerificationSql("webdex_runtime");
  for (const requiredFragment of [
    "creator_work_team_comment_activity_action_check",
    "creator_work_team_comment_mutation_operation_check",
    "idx_creator_marketplace_resource_search",
    "gin_trgm_ops",
    "idx_creator_marketplace_resource_tags",
    "jsonb_path_ops",
    "toonspectrum_ops.deployment_migration",
    "deployment_migration_provenance_check",
    "deployment_migration_provenance_state_check",
    "migration ledger contains interrupted or failed rows",
    "__managed_history_through_0019__",
    "0023_production_migration_ledger",
    "'adopted'",
    "'executed'",
    "'bootstrap'",
    "runtime and migration database roles are not safely separated",
    "runtime database role owns the migration ledger",
    "has_schema_privilege",
    "has_table_privilege",
    "'webdex_runtime'",
  ]) {
    expect(sql).toMatch(new RegExp(requiredFragment, "u"));
  }
});

test("capability verifier rejects an implicit or unsafe runtime role", () => {
  expect(validateRuntimeDatabaseRole("webdex_runtime")).toBe(
    "webdex_runtime",
  );
  for (const invalidRole of [undefined, "", "webdex-runtime"]) {
    expect(() => validateRuntimeDatabaseRole(invalidRole)).toThrow(
      /explicit lowercase PostgreSQL role/u,
    );
  }
  expect(() => buildProductionCapabilityVerificationSql()).toThrow(
    /explicit lowercase PostgreSQL role/u,
  );
});
