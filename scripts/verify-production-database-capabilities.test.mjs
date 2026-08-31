import { expect, test } from "vitest";

import {
  buildAuthRuntimeAclViolationSql,
  buildAuthSchemaCapabilityViolationSql,
  buildProductionCapabilityVerificationSql,
  loadHealthReadinessContract,
  validateRuntimeDatabaseRole,
} from "./verify-production-database-capabilities.mjs";
import {
  buildCreatorAssetObjectStorageRuntimeAclViolationSql,
  buildCreatorMarketplaceRuntimeAclViolationSql,
  buildMigrationLedgerRuntimeAclViolationSql,
  buildRuntimeCutoverLedgerAclViolationSql,
  buildRuntimeDatabaseRoleBoundaryStateSql,
} from "./run-production-database-migrations.mjs";

test("loads the runtime health readiness relation and cutover contract", () => {
  const contract = loadHealthReadinessContract();
  expect(contract.relationNames.length).toBeGreaterThan(50);
  expect(contract.relationNames).toContain("creator_draft_collaboration_room");
  expect(contract.relationNames).toContain("creator_marketplace_resource");
  expect(contract.relationNames).toContain("creator_marketplace_library_item");
  expect(contract.relationNames).toContain(
    "creator_marketplace_package_moderation",
  );
  expect(contract.migrationIds).toEqual([
    "0017_creator_work_live_lock_revision",
    "0025_auth_lifecycle_contract",
    "0026_creator_draft_cloud_save_intent",
    "0027_creator_draft_atomic_publication",
    "0030_creator_marketplace_immutable_releases",
    "0031_creator_marketplace_moderation",
    "0032_creator_marketplace_release_lifecycle",
    "0033_creator_marketplace_cloud_library",
    "0034_creator_marketplace_package_moderation",
  ]);
});

test("generated verification covers runtime capabilities and exact migration checksums", () => {
  const sql = buildProductionCapabilityVerificationSql("webdex_runtime");
  expect(sql).toContain(
    buildCreatorAssetObjectStorageRuntimeAclViolationSql("webdex_runtime"),
  );
  expect(sql).toContain(
    buildCreatorMarketplaceRuntimeAclViolationSql("webdex_runtime"),
  );
  expect(sql).toContain(
    buildRuntimeCutoverLedgerAclViolationSql("webdex_runtime"),
  );
  expect(sql).toContain(
    buildMigrationLedgerRuntimeAclViolationSql("webdex_runtime"),
  );
  expect(sql).toContain(
    buildRuntimeDatabaseRoleBoundaryStateSql("webdex_runtime"),
  );
  expect(sql).toContain(buildAuthSchemaCapabilityViolationSql());
  expect(sql).toContain(
    buildAuthRuntimeAclViolationSql("webdex_runtime"),
  );
  for (const requiredFragment of [
    "creator_work_team_comment_activity_action_check",
    "creator_work_team_comment_mutation_operation_check",
    "idx_creator_marketplace_resource_search",
    "gin_trgm_ops",
    "idx_creator_marketplace_resource_tags",
    "jsonb_path_ops",
    "creator_work_series_idx",
    "creator_work_challenge_idx",
    "creator_series_user_idx",
    "creator community runtime index capability is missing",
    "toonspectrum_ops.deployment_migration",
    "deployment_migration_provenance_check",
    "deployment_migration_provenance_state_check",
    "migration ledger contains interrupted or failed rows",
    "__managed_history_through_0019__",
    "0023_production_migration_ledger",
    "0024_creator_asset_object_storage",
    "0025_auth_lifecycle_contract",
    "0026_creator_draft_cloud_save_intent",
    "0027_creator_draft_atomic_publication",
    "0029_creator_community_runtime_indexes",
    "0030_creator_marketplace_immutable_releases",
    "0031_creator_marketplace_moderation",
    "0032_creator_marketplace_release_lifecycle",
    "0033_creator_marketplace_cloud_library",
    "0034_creator_marketplace_package_moderation",
    "timestamp\\(3\\) with time zone",
    "creator_marketplace_resource_relist_non_head",
    "creator_marketplace_resource_delist_non_head",
    "creator_marketplace_resource_hidden_legacy",
    "creator_marketplace_resource_lifecycle_timestamp_required",
    "creator_marketplace_package_moderated",
    "creator_marketplace_library_insert_guard",
    "creator_marketplace_library_000_package_update_guard",
    "creator_marketplace_library_package_available",
    "exact_release_listed",
    "creator_marketplace_library_soft_delete_cleanup",
    "creator_marketplace_package_moderation_state_guard",
    "creator marketplace cloud-library trigger capability is missing",
    "creator marketplace package-moderation trigger capability is missing",
    "creator_marketplace_resource_report_package_epoch_reporter_v3_unique",
    "packageReportEpoch",
    "package_report_epoch",
    "creator marketplace report epoch capability is missing",
    "creator marketplace resource timestamp precision capability is missing",
    "creator marketplace lifecycle trigger capability is missing",
    "'adopted'",
    "'executed'",
    "'bootstrap'",
    "runtime and migration database roles are not safely separated",
    "runtime database role owns the migration ledger",
    "runtime role lacks the exact creator object-storage privileges",
    "runtime role lacks the exact creator marketplace privileges",
    "runtime role lacks the exact cutover-readiness ledger privileges",
    "authentication lifecycle schema capability is incomplete",
    "runtime role lacks the exact authentication lifecycle privileges",
    "idx_user_status_created",
    "idx_account_user",
    "user_status_check",
    "user_session_version_check",
    "runtime-has-memberships",
    "runtime-can-create-database-objects",
    "runtime-can-create-public-objects",
    "runtime-owns-public-relation",
    "runtime-owns-extension",
    "runtime database role retains migration schema or ledger privileges",
    "creator_asset_storage_object",
    "creator_work_asset_storage_reference",
    "has_column_privilege",
    "has_schema_privilege",
    "has_table_privilege",
    "'webdex_runtime'",
  ]) {
    expect(sql).toMatch(new RegExp(requiredFragment, "u"));
  }
});

test("report epoch verifier fails closed for invalid, unready, malformed-key, or wrong-predicate indexes", () => {
  const sql = buildProductionCapabilityVerificationSql("webdex_runtime");
  const boundaryStart = sql.indexOf(
    "FROM pg_catalog.pg_class AS report_epoch_index",
  );
  const boundaryEnd = sql.indexOf(
    "FROM pg_catalog.pg_trigger AS report_insert_trigger",
    boundaryStart,
  );
  expect(boundaryStart).toBeGreaterThan(-1);
  expect(boundaryEnd).toBeGreaterThan(boundaryStart);
  const boundary = sql.slice(boundaryStart, boundaryEnd);
  const compactBoundary = boundary.replace(/\s+/gu, " ");

  expect(compactBoundary).toContain(
    "report_epoch_index_definition.indisvalid",
  );
  expect(compactBoundary).toContain(
    "pg_catalog.current_setting('max_identifier_length')::integer",
  );
  expect(compactBoundary).toContain(
    "report_epoch_index_definition.indisready",
  );
  expect(compactBoundary).toContain(
    "report_epoch_index_definition.indnkeyatts = 5",
  );
  expect(compactBoundary).toContain(
    "report_epoch_index_definition.indnatts = 5",
  );
  expect(compactBoundary).toContain(
    "report_epoch_index_definition.indexprs IS NULL",
  );
  expect(compactBoundary).toContain(
    ") = ARRAY[ 'packagePublisherIdSnapshot', 'packageIdSnapshot', " +
      "'packageModerationRevision', 'packageReportEpoch', 'reporterKeyHash' ]::text[]",
  );
  expect(compactBoundary).toContain(
    "report_epoch_index_definition.indrelid, true ) = " +
      "'(evidence ->> ''schemaVersion''::text) = ''3''::text'",
  );
  expect(boundary).not.toContain("pg_get_indexdef");
  expect(boundary).not.toContain("LIKE '%schemaVersion%3%'");
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
