import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

import {
  POST_BASELINE_RELATIONS,
  buildAuthRuntimeAclSql,
  buildAuthRuntimeAclViolationSql,
  buildCreatorAssetObjectStorageRuntimeAclSql,
  buildCreatorAssetObjectStorageRuntimeAclViolationSql,
  buildCreatorMarketplaceRuntimeAclSql,
  buildCreatorMarketplaceRuntimeAclViolationSql,
  buildHistoricalAdoptionVerificationSql,
  buildMessagingRuntimeAclSql,
  buildMessagingRuntimeAclViolationSql,
  buildMigrationLedgerRuntimeAclSql,
  buildMigrationLedgerRuntimeAclViolationSql,
  buildPersonalCloudRuntimeAclSql,
  buildPersonalCloudRuntimeAclViolationSql,
  buildRepairLockTakeoverSql,
  buildRuntimeCutoverLedgerAclSql,
  buildRuntimeCutoverLedgerAclViolationSql,
  buildRuntimeDatabaseRoleBoundaryStateSql,
  buildStudioProductionRuntimeAclSql,
  buildStudioProductionRuntimeAclViolationSql,
  decideMigrationAction,
  loadMigrationManifest,
  validateMigrationSequenceContinuity,
  validateRuntimeDatabaseRole,
} from "./run-production-database-migrations.mjs";

test("manifest lists every numbered SQL migration exactly once in order", () => {
  const manifest = loadMigrationManifest();
  expect(manifest).toHaveLength(57);
  expect(manifest[0].id).toBe("0001_studio_ai_usage_ledger");
  expect(manifest.at(-1).id).toBe(
    "0057_member_messaging",
  );
  expect(new Set(manifest.map(({ checksum }) => checksum)).size).toBe(57);
});

test("Studio AI free pool migration supports three reviewed provider attempts", () => {
  const migration = loadMigrationManifest().find(
    ({ id }) => id === "0056_studio_ai_free_pool_contract",
  );
  expect(migration?.id).toBe("0056_studio_ai_free_pool_contract");
  const sql = migration?.contents ?? "";

  for (const requiredFragment of [
    'CHECK ("attemptCount" BETWEEN 0 AND 3)',
    "'assistant', 'composition', 'scenario', 'translation', 'dialogue', 'palette'",
    "'gemini', 'groq', 'openrouter', 'zai', 'deepseek'",
    'CHECK ("attemptCount" BETWEEN 1 AND 3)',
    'VALIDATE CONSTRAINT "studio_ai_request_receipt_attempt_count_check"',
    'VALIDATE CONSTRAINT "studio_ai_usage_attempt_count_check"',
  ]) {
    expect(sql).toContain(requiredFragment);
  }
  expect(sql).toMatch(/^--[\s\S]*BEGIN;[\s\S]*COMMIT;\s*$/u);
  expect(sql).not.toMatch(/DROP\s+(?:TABLE|SCHEMA)/iu);
});

test("creator community publishing migration separates immutable releases from discovery state", () => {
  const migration = loadMigrationManifest().find(
    ({ id }) => id === "0049_creator_community_publishing",
  );
  expect(migration?.id).toBe("0049_creator_community_publishing");
  const sql = migration?.contents ?? "";

  for (const requiredFragment of [
    'CREATE TABLE IF NOT EXISTS public."creator_work_bookmark"',
    'CREATE TABLE IF NOT EXISTS public."creator_work_release"',
    'CREATE TABLE IF NOT EXISTS public."creator_work_publication"',
    'CREATE TABLE IF NOT EXISTS public."creator_portfolio_entry"',
    'CREATE TABLE IF NOT EXISTS public."creator_external_publication"',
    'CREATE TABLE IF NOT EXISTS public."creator_work_report"',
    'FOREIGN KEY ("workId", "releaseId")',
    'ON DELETE CASCADE',
    'creator_work_release_immutable_trigger',
    'creator_work_publication_lifecycle_check',
    'REVOKE ALL ON TABLE public."creator_work_bookmark" FROM PUBLIC',
  ]) {
    expect(sql).toContain(requiredFragment);
  }
  expect(sql).not.toMatch(/UPDATE[\s\S]*"manifest"\s*=/u);
});

test("AI Comic Director migration provisions the complete durable workflow schema", () => {
  const migration = loadMigrationManifest().find(
    ({ id }) => id === "0052_studio_ai_comic_director",
  );
  expect(migration?.id).toBe("0052_studio_ai_comic_director");
  const sql = migration?.contents ?? "";

  for (const requiredFragment of [
    'CREATE TABLE IF NOT EXISTS "studio_ai_comic_director_session"',
    'CREATE TABLE IF NOT EXISTS "studio_ai_visual_bible_revision"',
    'CREATE TABLE IF NOT EXISTS "studio_ai_comic_director_job"',
    'CREATE TABLE IF NOT EXISTS "studio_ai_comic_director_job_event"',
    'CREATE TABLE IF NOT EXISTS "studio_ai_comic_director_artifact"',
    'CREATE TABLE IF NOT EXISTS "studio_ai_comic_director_approval"',
    'uq_studio_ai_comic_job_event_sequence',
    'uq_studio_ai_comic_approval_revision_digest',
    'REVOKE ALL ON TABLE',
    'studio AI Comic Director relations are incomplete',
  ]) {
    expect(sql).toContain(requiredFragment);
  }
  expect(sql).not.toMatch(/DROP\s+(?:TABLE|SCHEMA)/iu);
});

test("member messaging migration provisions request-gated conversations", () => {
  const migration = loadMigrationManifest().find(
    ({ id }) => id === "0057_member_messaging",
  );
  expect(migration?.id).toBe("0057_member_messaging");
  const sql = migration?.contents ?? "";

  for (const requiredFragment of [
    'CREATE TABLE IF NOT EXISTS public."member_message_thread"',
    'CREATE TABLE IF NOT EXISTS public."member_message_participant"',
    'CREATE TABLE IF NOT EXISTS public."member_message"',
    'CREATE TABLE IF NOT EXISTS public."member_message_block"',
    'CREATE TABLE IF NOT EXISTS public."member_message_preference"',
    'CREATE TABLE IF NOT EXISTS public."member_message_report"',
    'member_message_thread_pair_unique',
    'member_message_report_reporter_message_unique',
    'REVOKE ALL ON TABLE public."member_message_thread" FROM PUBLIC',
    'member messaging relations are incomplete',
  ]) {
    expect(sql).toContain(requiredFragment);
  }
  expect(sql).not.toMatch(/DROP\s+(?:TABLE|SCHEMA)/iu);
});

test("member messaging runtime ACL grants bounded DML without PUBLIC access", () => {
  const grant = buildMessagingRuntimeAclSql("toonspectrum_runtime");
  const violation = buildMessagingRuntimeAclViolationSql("toonspectrum_runtime");

  for (const relation of [
    "member_message",
    "member_message_block",
    "member_message_participant",
    "member_message_preference",
    "member_message_report",
    "member_message_thread",
  ]) {
    expect(grant).toContain(`public.${relation}`);
    expect(violation).toContain(`public.${relation}`);
  }
  expect(grant).toContain("SELECT, INSERT, UPDATE, DELETE");
  expect(grant).toContain("FROM PUBLIC");
  expect(violation).toContain("TRUNCATE");
  expect(violation).toContain("'PUBLIC'");
});

test("personal cloud runtime ACL grants only bounded credential DML", () => {
  const grant = buildPersonalCloudRuntimeAclSql("toonspectrum_runtime");
  const violation = buildPersonalCloudRuntimeAclViolationSql("toonspectrum_runtime");

  expect(grant).toContain("REVOKE ALL ON TABLE public.personal_cloud_connection FROM PUBLIC");
  expect(grant).toContain("SELECT, INSERT, UPDATE, DELETE");
  expect(grant).not.toContain("TRUNCATE");
  expect(violation).toContain("personal_cloud_connection");
  expect(violation).toContain("TRUNCATE");
  expect(violation).toContain("REFERENCES");
  expect(violation).toContain("TRIGGER");
  expect(violation).toContain("'PUBLIC'");
});

test("creator storage location migration pins primaries and inventories verified replicas", () => {
  const migration = loadMigrationManifest().find(
    ({ id }) => id === "0048_creator_asset_storage_locations",
  );
  expect(migration?.id).toBe("0048_creator_asset_storage_locations");
  const sql = migration?.contents ?? "";

  for (const requiredFragment of [
    'ADD COLUMN IF NOT EXISTS "providerId" text',
    "coalesce(\"providerId\", 'supabase')",
    "toonspectrum.private-object-storage.v2",
    "creator_asset_storage_object_provider_check",
    "CREATE TABLE IF NOT EXISTS public.creator_asset_storage_replica",
    "creator_asset_storage_replica_object_fkey",
    "creator_asset_storage_replica_path_unique",
    "creator_asset_storage_replica_validate_trigger",
    "storage replica cannot duplicate the primary provider",
    "storage replica metadata differs from the primary object",
  ]) {
    expect(sql).toContain(requiredFragment);
  }
  expect(sql).toContain("REVOKE ALL ON TABLE public.creator_asset_storage_replica FROM PUBLIC");
});

test("studio production migration persists private workflows and token-hashed review links", () => {
  const migration = loadMigrationManifest().find(
    ({ id }) => id === "0050_studio_production_workspace_review_links_personal_kit",
  );
  expect(migration?.id).toBe(
    "0050_studio_production_workspace_review_links_personal_kit",
  );
  const sql = migration?.contents ?? "";

  for (const requiredFragment of [
    'CREATE TABLE IF NOT EXISTS "creator_work_production_workspace"',
    'CREATE TABLE IF NOT EXISTS "creator_studio_personal_kit"',
    'CREATE TABLE IF NOT EXISTS "creator_work_review_link"',
    'CREATE TABLE IF NOT EXISTS "creator_work_review_feedback"',
    '"tokenHash" text NOT NULL UNIQUE',
    "creator_work_review_link_hash_check",
    "creator_work_review_feedback_anchor_check",
    'REFERENCES "creator_work"("id") ON DELETE CASCADE',
    'REVOKE ALL ON TABLE "creator_work_production_workspace" FROM PUBLIC',
    'REVOKE ALL ON TABLE "creator_studio_personal_kit" FROM PUBLIC',
    'REVOKE ALL ON TABLE "creator_work_review_link" FROM PUBLIC',
    'REVOKE ALL ON TABLE "creator_work_review_feedback" FROM PUBLIC',
  ]) {
    expect(sql).toContain(requiredFragment);
  }
  expect(sql).not.toContain('"token" text');
});

test("creator marketplace release migration backfills immutable SemVer order", () => {
  const migration = loadMigrationManifest().find(
    ({ id }) => id === "0030_creator_marketplace_immutable_releases",
  );
  expect(migration?.id).toBe("0030_creator_marketplace_immutable_releases");
  const sql = migration?.contents ?? "";

  for (const requiredFragment of [
    'ADD COLUMN IF NOT EXISTS "releaseOrdinal" integer',
    'ADD COLUMN IF NOT EXISTS "delistedAt" timestamptz',
    "creator_marketplace_semver_compare",
    "creator_marketplace_resource_immutable_release",
    "pg_advisory_xact_lock",
    "equal-precedence release equivocation",
    'creator_marketplace_resource_publisher_package_ordinal_unique',
    'creator_marketplace_resource_publisher_package_precedence_uniq',
    'WHERE "hidden" = false AND "delistedAt" IS NULL',
    "0030_creator_marketplace_immutable_releases",
  ]) {
    expect(sql).toContain(requiredFragment);
  }
  expect(sql).not.toMatch(/UPDATE[\s\S]*"manifest"\s*=/u);
});

test("creator marketplace moderation migration preserves evidence and separates visibility", () => {
  const migration = loadMigrationManifest().find(
    ({ id }) => id === "0031_creator_marketplace_moderation",
  );
  expect(migration?.id).toBe("0031_creator_marketplace_moderation");
  const sql = migration?.contents ?? "";

  for (const requiredFragment of [
    'CREATE TABLE IF NOT EXISTS public."creator_marketplace_resource_report"',
    'CREATE TABLE IF NOT EXISTS public."creator_marketplace_resource_report_gate"',
    'UNIQUE ("resourceSnapshotId", "reporterKeyHash")',
    'octet_length("reporterKeyHash") = 32',
    "creator marketplace report evidence is immutable",
    "creator marketplace moderation decision is immutable",
    "creator marketplace owner delisting is monotonic",
    'NEW."semverContractVersion" IS DISTINCT FROM OLD."semverContractVersion"',
    "creator_marketplace_resource_lifecycle_update",
    "0031_creator_marketplace_moderation",
  ]) {
    expect(sql).toContain(requiredFragment);
  }
  expect(sql).toContain('NEW."delistedAt"');
  expect(sql).not.toMatch(/UPDATE[\s\S]*"manifest"\s*=/u);
});

test("creator marketplace lifecycle migration permits only a fresh non-moderated head relist", () => {
  const migration = loadMigrationManifest().find(
    ({ id }) => id === "0032_creator_marketplace_release_lifecycle",
  );
  expect(migration?.id).toBe(
    "0032_creator_marketplace_release_lifecycle",
  );
  const sql = migration?.contents ?? "";

  for (const requiredFragment of [
    'ALTER COLUMN "createdAt" TYPE timestamptz(3)',
    'ALTER COLUMN "updatedAt" TYPE timestamptz(3)',
    "creator_marketplace_resource_immutable_content",
    "creator_marketplace_resource_lifecycle_separation",
    "creator_marketplace_resource_relist_moderated",
    "creator_marketplace_resource_relist_non_head",
    "creator_marketplace_resource_lifecycle_timestamp_required",
    "creator_marketplace_resource_publish_moderated",
    "pg_advisory_xact_lock",
    "NEW.\"updatedAt\" <= OLD.\"updatedAt\"",
    "0032_creator_marketplace_release_lifecycle",
  ]) {
    expect(sql).toContain(requiredFragment);
  }
  expect(sql).not.toMatch(/UPDATE[\s\S]*"manifest"\s*=/u);
});

test("creator marketplace package cutover guards withdrawal and confirmation availability", () => {
  const migration = loadMigrationManifest().find(
    ({ id }) => id === "0034_creator_marketplace_package_moderation",
  );
  expect(migration?.id).toBe("0034_creator_marketplace_package_moderation");
  const sql = migration?.contents ?? "";

  for (const requiredFragment of [
    "creator_marketplace_resource_delist_non_head",
    "creator_marketplace_resource_relist_non_head",
    "creator_marketplace_library_package_available",
    "creator marketplace library membership requires an active publisher",
    "creator marketplace library membership requires a listed package head",
    'ADD COLUMN "packageReportEpoch" integer',
    "creator_marketplace_resource_report_package_epoch_reporter_v3_unique",
    "new creator marketplace reports require package epoch evidence v3",
    'package_report_epoch IS DISTINCT FROM NEW."packageReportEpoch"',
    "exact_release_listed",
    "publisher_status IS DISTINCT FROM 'active'",
    'release."delistedAt" IS NULL',
    "ORDER BY account.\"id\"",
  ]) {
    expect(sql).toContain(requiredFragment);
  }
});

test("creator community migration aligns canonical runtime indexes and records readiness", () => {
  const migration = loadMigrationManifest().find(
    ({ id }) => id === "0029_creator_community_runtime_indexes",
  );
  expect(migration?.id).toBe("0029_creator_community_runtime_indexes");
  const sql = migration?.contents ?? "";

  for (const requiredFragment of [
    'DROP INDEX IF EXISTS public."idx_creator_work_series_episode"',
    'DROP INDEX IF EXISTS public."idx_creator_work_challenge_created"',
    'CREATE INDEX "creator_work_series_idx"',
    'CREATE INDEX "creator_work_challenge_idx"',
    'CREATE INDEX "creator_series_user_idx"',
    "creator community runtime indexes are incomplete",
    "0029_creator_community_runtime_indexes",
    'INSERT INTO public."toonspectrum_schema_migration"',
  ]) {
    expect(sql).toContain(requiredFragment);
  }

  const drizzleSchema = readFileSync(
    new URL("../apps/api/src/db/schema/creator.schema.ts", import.meta.url),
    "utf8",
  );
  for (const canonicalIndex of [
    'index("creator_work_series_idx").on(t.seriesId, t.episodeNo)',
    'index("creator_work_challenge_idx").on(t.challengeId)',
    'index("creator_series_user_idx").on(t.userId)',
  ]) {
    expect(drizzleSchema).toContain(canonicalIndex);
  }
  expect(drizzleSchema).not.toContain("idx_creator_work_series_episode");
  expect(drizzleSchema).not.toContain("idx_creator_work_challenge_created");
});

test("auth lifecycle migration owns schema repair and a durable readiness marker", () => {
  const migration = loadMigrationManifest().find(
    ({ id }) => id === "0025_auth_lifecycle_contract",
  );
  expect(migration?.id).toBe("0025_auth_lifecycle_contract");
  const sql = migration?.contents ?? "";

  for (const requiredFragment of [
    'ALTER TABLE "user"',
    'ALTER TABLE "account"',
    'CONSTRAINT "user_status_check"',
    'CONSTRAINT "user_session_version_check"',
    'CONSTRAINT "account_userId_user_id_fk"',
    'CREATE INDEX "idx_user_status_created"',
    'CREATE INDEX "idx_account_user"',
    "0025_auth_lifecycle_contract",
    'INSERT INTO "toonspectrum_schema_migration"',
  ]) {
    expect(sql).toContain(requiredFragment);
  }
  expect(sql).toContain('ON DELETE CASCADE');
  expect(sql).not.toMatch(/GRANT\s+CREATE|ALTER\s+ROLE/u);

  // db/schema.ts 는 배럴이다 — user/account 테이블 선언은 schema/auth.schema.ts 가 소유한다.
  const drizzleSchema = readFileSync(
    new URL("../apps/api/src/db/schema/auth.schema.ts", import.meta.url),
    "utf8",
  );
  expect(drizzleSchema).toContain(
    'index("idx_user_status_created").on(u.status, u.createdAt)',
  );
});

test("cloud-save intent migration widens and validates the existing room check", () => {
  const migration = loadMigrationManifest().find(
    ({ id }) => id === "0026_creator_draft_cloud_save_intent",
  );
  expect(migration?.id).toBe("0026_creator_draft_cloud_save_intent");
  const sql = migration?.contents ?? "";

  expect(sql).toContain(
    'DROP CONSTRAINT IF EXISTS "creator_draft_collaboration_room_provision_intent_check"',
  );
  expect(sql).toContain(
    "CHECK (\"provisionIntent\" IN ('share-link', 'invite-member', 'cloud-save'))",
  );
  expect(sql).toContain(
    'VALIDATE CONSTRAINT "creator_draft_collaboration_room_provision_intent_check"',
  );
  expect(sql).toContain("0026_creator_draft_cloud_save_intent");
  expect(sql).toContain('INSERT INTO "toonspectrum_schema_migration"');
});

test("atomic publication migration records an exact revision and final-status receipt", () => {
  const migration = loadMigrationManifest().find(
    ({ id }) => id === "0027_creator_draft_atomic_publication"
  );
  expect(migration?.id).toBe("0027_creator_draft_atomic_publication");
  const sql = migration?.contents ?? "";

  expect(sql).toContain('ADD COLUMN IF NOT EXISTS "promotionExpectedWorkRevision" integer');
  expect(sql).toContain('ADD COLUMN IF NOT EXISTS "promotionFinalStatus" text');
  expect(sql).toContain("'draft', 'published'");
  expect(sql).toContain(
    'VALIDATE CONSTRAINT "creator_draft_collaboration_room_state_check"',
  );
  expect(sql).toContain("0027_creator_draft_atomic_publication");
  expect(sql).toContain('INSERT INTO "toonspectrum_schema_migration"');
  expect(sql).not.toMatch(/UPDATE\s+"creator_draft_collaboration_room"/u);
});

test("manifest sequence continuity rejects a missing middle number", () => {
  expect(() =>
    validateMigrationSequenceContinuity([
      { id: "0001_first", sequence: 1 },
      { id: "0003_gap", sequence: 3 },
    ]),
  ).toThrow(/expected 0002 but found 0003/u);
});

test("runtime database role is explicit and identifier-safe", () => {
  expect(validateRuntimeDatabaseRole("toonspectrum_runtime")).toBe(
    "toonspectrum_runtime",
  );
  for (const invalidRole of [undefined, "", "RuntimeRole", "role-with-dash"]) {
    expect(() => validateRuntimeDatabaseRole(invalidRole)).toThrow(
      /explicit lowercase PostgreSQL role/u,
    );
  }
});

test("auth runtime ACL is normalized to the exact DML contract", () => {
  const sql = buildAuthRuntimeAclSql("toonspectrum_runtime");
  const violation = buildAuthRuntimeAclViolationSql("toonspectrum_runtime");

  expect(sql).toContain('public."user",\n  public.account\nFROM PUBLIC;');
  expect(sql).toContain('public."user",\n  public.account\nFROM "toonspectrum_runtime";');
  expect(sql).toContain(
    'GRANT SELECT, INSERT, UPDATE, DELETE\n  ON TABLE public."user", public.account',
  );
  expect(sql).not.toMatch(/GRANT[^;]*(?:TRUNCATE|REFERENCES|TRIGGER)/u);
  expect(violation).toContain("'SELECT, INSERT, UPDATE, DELETE'");
  for (const elevatedPrivilege of ["TRUNCATE", "REFERENCES", "TRIGGER"]) {
    expect(violation).toContain(`'${elevatedPrivilege}'`);
  }
});

test("creator object storage runtime ACL is least-privilege and preserves immutable identity", () => {
  const sql = buildCreatorAssetObjectStorageRuntimeAclSql(
    "toonspectrum_runtime",
  );

  expect(sql).toContain(
    'REVOKE ALL ON TABLE\n  public.creator_asset_storage_object,',
  );
  expect(sql).toContain(
    'public.creator_work_asset_storage_reference\nFROM PUBLIC;',
  );
  expect(sql).toContain(
    'GRANT SELECT\n  ON TABLE public.creator_asset_storage_object',
  );
  expect(sql).toContain(
    'GRANT INSERT (\n  "purpose",\n  "digest",\n  "contractVersion",',
  );
  expect(sql).toContain(
    'GRANT UPDATE ("state", "deleteToken", "updatedAt", "deletedAt")',
  );
  expect(sql).toContain(
    'GRANT SELECT, DELETE\n  ON TABLE public.creator_work_asset_storage_reference',
  );
  expect(sql).toContain(
    'GRANT INSERT (\n  "workId",\n  "purpose",\n  "referenceId",',
  );
  expect(sql).toContain(
    'GRANT UPDATE ("state", "deleteToken", "updatedAt")',
  );
  expect(sql).not.toMatch(/GRANT[^;]*UPDATE\s+ON TABLE/u);
  expect(sql).not.toMatch(/GRANT[^;(]*INSERT\s+ON TABLE/u);
  for (const immutableColumn of [
    "purpose",
    "digest",
    "providerId",
    "objectPath",
    "byteLength",
    "contentType",
    "workId",
    "referenceId",
    "objectDigest",
    "sourceAssetId",
  ]) {
    expect(sql).not.toContain(`UPDATE ("${immutableColumn}"`);
  }
});

test("creator object-storage grants and verification share one exact SQL contract", () => {
  const violation = buildCreatorAssetObjectStorageRuntimeAclViolationSql(
    "toonspectrum_runtime",
  );
  for (const requiredColumn of [
    "contractVersion",
    "providerId",
    "objectPath",
    "byteLength",
    "contentType",
    "deleteToken",
    "deletedAt",
    "objectDigest",
    "sourceAssetId",
    "createdBy",
  ]) {
    expect(violation).toContain(`'${requiredColumn}'`);
  }
  expect(violation).toContain("has_column_privilege");
  expect(violation).toContain("has_table_privilege");
  expect(violation).toContain("'toonspectrum_runtime'");
});

test("Studio production runtime ACL is exact and append-only where required", () => {
  const sql = buildStudioProductionRuntimeAclSql("toonspectrum_runtime");
  const violation = buildStudioProductionRuntimeAclViolationSql(
    "toonspectrum_runtime",
  );

  expect(sql).toContain("DO $studio_production_acl$");
  expect(sql).toContain(
    "REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM %I",
  );
  expect(sql).toContain(
    "REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC",
  );
  expect(sql).toContain(
    "GRANT SELECT, INSERT\n  ON TABLE\n    public.creator_work_production_workspace,",
  );
  expect(sql).toContain(
    'GRANT UPDATE ("revision", "document", "updatedBy", "updatedAt")',
  );
  expect(sql).toContain(
    'GRANT UPDATE ("revision", "document", "updatedAt")',
  );
  expect(sql).toContain('GRANT UPDATE ("revokedAt", "updatedAt")');
  expect(sql).not.toMatch(
    /GRANT[^;]*UPDATE[^;]*creator_work_review_feedback/u,
  );
  expect(sql).not.toMatch(/GRANT[^;]*DELETE/u);

  for (const relation of [
    "creator_work_production_workspace",
    "creator_studio_personal_kit",
    "creator_work_review_link",
    "creator_work_review_feedback",
  ]) {
    expect(violation).toContain(`'${relation}'`);
  }  for (const mutableColumn of [
    "updatedBy",
    "revision",
    "document",
    "revokedAt",
    "updatedAt",
  ]) {
    expect(violation).toContain(`'${mutableColumn}'`);
  }
  for (const privilege of [
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "TRUNCATE",
    "REFERENCES",
    "TRIGGER",
  ]) {
    expect(violation).toContain(`'${privilege}'`);
  }
  expect(violation).toContain("WITH GRANT OPTION");
  expect(violation).toContain("has_any_column_privilege");
  expect(violation).toContain("0::oid");

  const runner = readFileSync(
    new URL("./run-production-database-migrations.mjs", import.meta.url),
    "utf8",
  );
  expect(runner).toContain(
    "buildStudioProductionRuntimeAclSql(runtimeDatabaseRole)",
  );
});

test("creator marketplace runtime ACL is normalized to the repository contract", () => {
  const sql = buildCreatorMarketplaceRuntimeAclSql("toonspectrum_runtime");
  const violation = buildCreatorMarketplaceRuntimeAclViolationSql(
    "toonspectrum_runtime",
  );

  expect(sql).toContain(
    "REVOKE ALL ON TABLE\n  public.creator_marketplace_resource,\n  public.creator_marketplace_library_item,\n  public.creator_marketplace_package_moderation,\n  public.creator_marketplace_package_moderation_decision,\n  public.creator_marketplace_publish_gate,",
  );
  expect(sql).toContain("DO $creator_marketplace_acl$");
  expect(sql).toContain("REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM %I");
  expect(sql).toContain("REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC");
  expect(sql).toContain(
    "GRANT SELECT, INSERT\n  ON TABLE public.creator_marketplace_resource",
  );
  expect(sql).toContain(
    'GRANT UPDATE ("delistedAt", "updatedAt")\n  ON TABLE public.creator_marketplace_resource',
  );
  expect(sql).not.toMatch(/GRANT UPDATE \([^)]*"hidden"/u);
  expect(sql).toContain(
    "GRANT SELECT, INSERT\n  ON TABLE public.creator_marketplace_library_item",
  );
  expect(sql).toContain('"lastConfirmedReleaseOrdinal"');
  expect(sql).toContain(
    "GRANT SELECT, INSERT\n  ON TABLE public.creator_marketplace_package_moderation",
  );
  expect(sql).toContain('"currentDecisionId"');
  expect(sql).toContain(
    "GRANT SELECT, INSERT\n  ON TABLE public.creator_marketplace_package_moderation_decision",
  );
  expect(sql).not.toMatch(
    /GRANT[^;]*DELETE[^;]*creator_marketplace_library_item/u,
  );
  expect(sql).not.toContain(
    "GRANT SELECT, INSERT, DELETE\n  ON TABLE public.creator_marketplace_resource",
  );
  expect(sql).not.toMatch(
    /GRANT SELECT, INSERT, UPDATE, DELETE\n {2}ON TABLE public\.creator_marketplace_resource\n/u,
  );
  expect(sql).toContain(
    "GRANT SELECT, INSERT, UPDATE, DELETE\n  ON TABLE public.creator_marketplace_publish_gate",
  );
  expect(sql).toContain(
    "GRANT SELECT, INSERT\n  ON TABLE public.creator_marketplace_resource_report",
  );
  expect(sql).toContain(
    'GRANT UPDATE ("status", "resolutionNote", "reviewedBy", "reviewedAt")',
  );
  expect(sql).toContain(
    "GRANT SELECT, INSERT, UPDATE, DELETE\n  ON TABLE public.creator_marketplace_resource_report_gate",
  );
  expect(sql).toContain('FROM "toonspectrum_runtime";');
  for (const privilege of [
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "TRUNCATE",
    "REFERENCES",
    "TRIGGER",
  ]) {
    expect(violation).toContain(`'${privilege}'`);
  }
  expect(violation).toContain("public.creator_marketplace_resource");
  expect(violation).toContain("public.creator_marketplace_library_item");
  expect(violation).toContain("public.creator_marketplace_package_moderation");
  expect(violation).toContain(
    "public.creator_marketplace_package_moderation_decision",
  );
  expect(violation).toContain("public.creator_marketplace_publish_gate");
  expect(violation).toContain("public.creator_marketplace_resource_report");
  expect(violation).toContain("public.creator_marketplace_resource_report_gate");
  expect(violation).toContain("immutable_attribute");
  expect(violation).toContain("'hidden'");
  expect(violation).toContain("'delistedAt'");
  expect(violation).toContain("'updatedAt'");
  expect(violation).toContain("'toonspectrum_runtime'");
  expect(violation).toContain("has_any_column_privilege");
  expect(violation).toContain("WITH GRANT OPTION");
  expect(violation).toContain("0::oid");
  expect(violation).toContain("public_column_privilege");
  expect(violation).toContain("public_table_privilege");

  const runner = readFileSync(
    new URL("./run-production-database-migrations.mjs", import.meta.url),
    "utf8",
  );
  expect(runner).toContain(
    "buildCreatorMarketplaceRuntimeAclSql(runtimeDatabaseRole)",
  );
});

test("runtime role boundary rejects membership, DDL and ownership capabilities", () => {
  const sql = buildRuntimeDatabaseRoleBoundaryStateSql(
    "toonspectrum_runtime",
  );
  for (const boundary of [
    "runtime-has-memberships",
    "runtime-owns-database",
    "runtime-can-create-database-objects",
    "runtime-can-create-public-objects",
    "runtime-owns-public-relation",
    "runtime-owns-extension",
  ]) {
    expect(sql).toContain(boundary);
  }
  expect(sql).toContain("pg_catalog.pg_has_role");
  expect(sql).toContain("pg_catalog.has_database_privilege");
  expect(sql).toContain("pg_catalog.has_schema_privilege");
  expect(sql).toContain("OR NOT rolcanlogin");

  const bootstrapGatedSql = buildRuntimeDatabaseRoleBoundaryStateSql(
    "toonspectrum_runtime",
    { requireLogin: false },
  );
  expect(bootstrapGatedSql).not.toContain("OR NOT rolcanlogin");
  expect(bootstrapGatedSql).toContain("runtime-has-memberships");
  expect(() =>
    buildRuntimeDatabaseRoleBoundaryStateSql("toonspectrum_runtime", {
      requireLogin: "sometimes",
    }),
  ).toThrow(/login boundary mode/u);
});

test("runtime cutover ledger ACL is exact, read-only and private", () => {
  const normalization = buildRuntimeCutoverLedgerAclSql(
    "toonspectrum_runtime",
  );
  expect(normalization).toContain(
    "REVOKE ALL ON TABLE public.toonspectrum_schema_migration FROM PUBLIC",
  );
  expect(normalization).toContain(
    'REVOKE ALL ON TABLE public.toonspectrum_schema_migration FROM "toonspectrum_runtime"',
  );
  expect(normalization).toContain(
    'GRANT SELECT ("id") ON TABLE public.toonspectrum_schema_migration TO "toonspectrum_runtime"',
  );

  const violation = buildRuntimeCutoverLedgerAclViolationSql(
    "toonspectrum_runtime",
  );
  expect(violation).toContain("public.toonspectrum_schema_migration");
  expect(violation).toContain("'SELECT WITH GRANT OPTION'");
  expect(violation).toContain("'appliedAt'");
  expect(violation).toContain("has_column_privilege");
  expect(violation).toContain("has_any_column_privilege");
  expect(violation).toContain("0::oid");
  for (const privilege of [
    "INSERT",
    "UPDATE",
    "DELETE",
    "TRUNCATE",
    "REFERENCES",
    "TRIGGER",
  ]) {
    expect(violation).toContain(`'${privilege}'`);
  }

  const runner = readFileSync(
    new URL("./run-production-database-migrations.mjs", import.meta.url),
    "utf8",
  );
  expect(runner).toContain(
    "buildRuntimeCutoverLedgerAclSql(runtimeDatabaseRole)",
  );
});

test("migration ledger ACL revokes PUBLIC and runtime access and verifies effective denial", () => {
  const normalization = buildMigrationLedgerRuntimeAclSql(
    "toonspectrum_runtime",
  );
  expect(normalization).toContain(
    "REVOKE ALL ON SCHEMA toonspectrum_ops FROM PUBLIC",
  );
  expect(normalization).toContain(
    "REVOKE ALL ON ALL TABLES IN SCHEMA toonspectrum_ops FROM PUBLIC",
  );
  expect(normalization).toContain("FROM %I");

  const violation = buildMigrationLedgerRuntimeAclViolationSql(
    "toonspectrum_runtime",
  );
  expect(violation).toContain("toonspectrum_ops.deployment_migration");
  expect(violation).toContain("toonspectrum_ops.deployment_migration_lock");
  for (const privilege of [
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "TRUNCATE",
    "REFERENCES",
    "TRIGGER",
  ]) {
    expect(violation).toContain(`'${privilege}'`);
  }
});

test("historical adoption requires structural evidence through 0019", () => {
  const sql = buildHistoricalAdoptionVerificationSql();
  for (const requiredFragment of [
    "0017_creator_work_live_lock_revision",
    "creator_work_live_lock_revision_check",
    "creator_work_team_comment_mutation_operation_check",
    "studio_ai_request_gate_lease_state_check",
    "studio_ai_request_receipt_status_check",
    "idx_studio_ai_request_receipt_expires",
    "cannot adopt through 0019",
  ]) {
    expect(sql).toContain(requiredFragment);
  }
  expect(sql).not.toContain("creator_marketplace_resource");
});

test("historical adoption and post-baseline relations exactly partition runtime readiness", () => {
  expect(POST_BASELINE_RELATIONS).toEqual([
    "admin_announcements",
    "admin_audit_logs",
    "admin_banned_words",
    "admin_content_reports",
    "admin_promos",
    "admin_security_policies",
    "creator_asset_artifact",
    "creator_asset_artifact_set",
    "creator_asset_license_snapshot",
    "creator_asset_processing_run",
    "creator_asset_processing_step",
    "creator_asset_qa_report",
    "creator_asset_rights_evidence",
    "creator_asset_storage_object",
    "creator_asset_storage_replica",
    "creator_asset_upload_session",
    "creator_collab_application",
    "creator_collab_bookmark",
    "creator_collab_post",
    "creator_collab_report",
    "creator_draft_collaboration_room",
    "creator_external_publication",
    "creator_marketplace_draft",
    "creator_marketplace_draft_revision",
    "creator_marketplace_entitlement_grant",
    "creator_marketplace_library_item",
    "creator_marketplace_package_moderation",
    "creator_marketplace_package_moderation_decision",
    "creator_marketplace_publish_gate",
    "creator_marketplace_release_artifact_binding",
    "creator_marketplace_release_availability",
    "creator_marketplace_resource",
    "creator_marketplace_resource_report",
    "creator_marketplace_resource_report_gate",
    "creator_portfolio_entry",
    "creator_promotion_bookmark",
    "creator_promotion_comment",
    "creator_promotion_post",
    "creator_promotion_report",
    "creator_work_asset_storage_reference",
    "creator_work_bookmark",
    "creator_work_catalog_asset_binding",
    "creator_studio_personal_kit",
    "creator_work_production_workspace",
    "creator_work_publication",
    "creator_work_release",
    "creator_work_release_approval",
    "creator_work_report",
    "creator_work_review_feedback",
    "creator_work_review_link",
    "member_message",
    "member_message_block",
    "member_message_participant",
    "member_message_preference",
    "member_message_report",
    "member_message_thread",
    "personal_cloud_connection",
    "studio_ai_comic_director_approval",
    "studio_ai_comic_director_artifact",
    "studio_ai_comic_director_job",
    "studio_ai_comic_director_job_event",
    "studio_ai_comic_director_session",
    "studio_ai_visual_bible_revision",
  ]);
  const readinessSource = readFileSync(
    new URL(
      "../apps/api/src/modules/health/health-readiness.repository.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const readinessDeclaration =
    /export const REQUIRED_DATABASE_RELATIONS = \[([\s\S]*?)\] as const/u.exec(
      readinessSource,
    );
  expect(readinessDeclaration).not.toBeNull();
  const requiredRelations = [
    ...readinessDeclaration[1].matchAll(/"([^"]+)"/gu),
  ].map((match) => match[1]);

  const historicalSql = buildHistoricalAdoptionVerificationSql();
  const historicalRequirementArray =
    /FROM unnest\(ARRAY\[([\s\S]*?)\]::text\[\]\) AS required_relation/u.exec(
      historicalSql,
    );
  expect(historicalRequirementArray).not.toBeNull();
  const historicalRelations = [
    ...historicalRequirementArray[1].matchAll(/'([^']+)'/gu),
  ].map((match) => match[1]);

  expect(historicalRelations).toEqual(
    requiredRelations.filter(
      (relation) => !POST_BASELINE_RELATIONS.includes(relation),
    ),
  );
  expect([...historicalRelations, ...POST_BASELINE_RELATIONS].toSorted()).toEqual(
    requiredRelations.toSorted(),
  );
  expect(new Set(requiredRelations).size).toBe(requiredRelations.length);
});

test("an exact applied checksum is skipped", () => {
  const migration = {
    id: "0023_production_migration_ledger",
    sequence: 23,
    checksum: "a".repeat(64),
  };
  expect(
    decideMigrationAction({
      migration,
      ledgerEntry: {
        id: migration.id,
        checksum: migration.checksum,
        state: "applied",
        provenance: "bootstrap",
      },
      mode: "apply",
      adoptionMarkerPresent: true,
    }),
  ).toBe("skip");
});

test("historical missing ledger entries fail closed in normal apply mode", () => {
  expect(
    () =>
      decideMigrationAction({
        migration: {
          id: "0019_studio_ai_request_receipt",
          sequence: 19,
          checksum: "b".repeat(64),
        },
        ledgerEntry: undefined,
        mode: "apply",
        adoptionMarkerPresent: true,
      }),
  ).toThrow(/no adopted ledger record/u);
});

test("adoption marks reviewed historical rows without treating them as executable", () => {
  expect(
    decideMigrationAction({
      migration: {
        id: "0019_studio_ai_request_receipt",
        sequence: 19,
        checksum: "b".repeat(64),
      },
      ledgerEntry: undefined,
      mode: "adopt",
      adoptionMarkerPresent: false,
    }),
  ).toBe("adopt");
});

test("a future missing migration is pending after historical adoption", () => {
  expect(
    decideMigrationAction({
      migration: {
        id: "0026_future_contract",
        sequence: 26,
        checksum: "c".repeat(64),
      },
      ledgerEntry: undefined,
      mode: "apply",
      adoptionMarkerPresent: true,
    }),
  ).toBe("apply");
});

test("an interrupted migration requires explicit repair", () => {
  const migration = {
    id: "0022_creator_marketplace_distributed_gate_search",
    sequence: 22,
    checksum: "d".repeat(64),
  };
  expect(
    () =>
      decideMigrationAction({
        migration,
        ledgerEntry: {
          id: migration.id,
          checksum: migration.checksum,
          state: "applying",
          provenance: "executed",
        },
        mode: "apply",
        adoptionMarkerPresent: true,
      }),
  ).toThrow(/explicit repair/u);
  expect(
    decideMigrationAction({
      migration,
      ledgerEntry: {
        id: migration.id,
        checksum: migration.checksum,
        state: "failed",
        provenance: "executed",
      },
      mode: "repair",
      adoptionMarkerPresent: false,
    }),
  ).toBe("repair");
});

test("repair never creates a missing historical or pending ledger row", () => {
  for (const migration of [
    {
      id: "0019_studio_ai_request_receipt",
      sequence: 19,
      checksum: "e".repeat(64),
    },
    {
      id: "0026_future_contract",
      sequence: 26,
      checksum: "f".repeat(64),
    },
  ]) {
    expect(() =>
      decideMigrationAction({
        migration,
        ledgerEntry: undefined,
        mode: "repair",
        adoptionMarkerPresent: true,
      }),
    ).toThrow(/Repair cannot create missing migration/u);
  }
});

test("repair lock takeover is an owner-token CAS with a stale-age fence", () => {
  const ownerToken = "9".repeat(64);
  const sql = buildRepairLockTakeoverSql(ownerToken);
  expect(sql).toContain(`'${ownerToken}'`);
  expect(sql).toContain("current_lock.\"acquiredAt\" <=");
  expect(sql).toContain("interval '60 minutes'");
  expect(sql).toContain("'owner-mismatch'");
  expect(sql).toContain("'token-required'");
  expect(sql).not.toMatch(/DELETE FROM[^]*WHERE lock\."singleton" = true;\s*$/u);
});

test("editing an already adopted migration is always rejected", () => {
  expect(
    () =>
      decideMigrationAction({
        migration: {
          id: "0013_creator_asset_marketplace",
          sequence: 13,
          checksum: "1".repeat(64),
        },
        ledgerEntry: {
          id: "0013_creator_asset_marketplace",
          checksum: "2".repeat(64),
          state: "applied",
          provenance: "adopted",
        },
        mode: "repair",
        adoptionMarkerPresent: true,
      }),
  ).toThrow(/checksum drift/u);
});

test("an exact checksum with the wrong provenance is rejected", () => {
  const migration = {
    id: "0023_production_migration_ledger",
    sequence: 23,
    checksum: "3".repeat(64),
  };
  expect(() =>
    decideMigrationAction({
      migration,
      ledgerEntry: {
        id: migration.id,
        checksum: migration.checksum,
        state: "applied",
        provenance: "executed",
      },
      mode: "apply",
      adoptionMarkerPresent: true,
    }),
  ).toThrow(/provenance drift/u);
});


test("personal cloud migration persists only encrypted account credentials", () => {
  const migration = loadMigrationManifest().find(
    ({ id }) => id === "0051_personal_cloud_connections",
  );
  expect(migration?.id).toBe("0051_personal_cloud_connections");
  const sql = migration?.contents ?? "";

  for (const requiredFragment of [
    "CREATE TABLE IF NOT EXISTS public.personal_cloud_connection",
    'PRIMARY KEY ("userId", "provider")',
    "personal_cloud_connection_user_fkey",
    "personal_cloud_connection_provider_check",
    '"encryptedAccessToken" text NOT NULL',
    '"encryptedRefreshToken" text NOT NULL',
    "idx_personal_cloud_connection_updated",
    "REVOKE ALL ON TABLE public.personal_cloud_connection FROM PUBLIC",
  ]) {
    expect(sql).toContain(requiredFragment);
  }
  expect(sql).not.toMatch(/\b(?:access|refresh)_token\b/iu);
});

test("personal cloud cutover marker is a forward-only verified repair", () => {
  const migration = loadMigrationManifest().find(
    ({ id }) => id === "0055_personal_cloud_cutover_marker",
  );
  expect(migration?.id).toBe("0055_personal_cloud_cutover_marker");
  const sql = migration?.contents ?? "";

  for (const requiredFragment of [
    "personal_cloud_cutover_marker_contract",
    "IN SHARE ROW EXCLUSIVE MODE",
    "personal cloud connection columns are incomplete",
    "personal cloud connection constraints are incomplete",
    "personal cloud connection indexes are incomplete",
    'INSERT INTO public."toonspectrum_schema_migration"',
    "0051_personal_cloud_connections",
    "ON CONFLICT",
  ]) {
    expect(sql).toContain(requiredFragment);
  }
  expect(sql).not.toMatch(/DROP\s+(?:TABLE|SCHEMA)/iu);
  expect(sql).not.toContain(
    "CREATE TABLE IF NOT EXISTS public.personal_cloud_connection",
  );
});
