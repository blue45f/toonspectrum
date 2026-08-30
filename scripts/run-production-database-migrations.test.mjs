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
  buildMigrationLedgerRuntimeAclSql,
  buildMigrationLedgerRuntimeAclViolationSql,
  buildRepairLockTakeoverSql,
  buildRuntimeCutoverLedgerAclSql,
  buildRuntimeCutoverLedgerAclViolationSql,
  buildRuntimeDatabaseRoleBoundaryStateSql,
  decideMigrationAction,
  loadMigrationManifest,
  validateMigrationSequenceContinuity,
  validateRuntimeDatabaseRole,
} from "./run-production-database-migrations.mjs";

test("manifest lists every numbered SQL migration exactly once in order", () => {
  const manifest = loadMigrationManifest();
  expect(manifest).toHaveLength(29);
  expect(manifest[0].id).toBe("0001_studio_ai_usage_ledger");
  expect(manifest.at(-1).id).toBe("0029_creator_community_runtime_indexes");
  expect(new Set(manifest.map(({ checksum }) => checksum)).size).toBe(29);
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

test("creator marketplace runtime ACL is normalized to the repository contract", () => {
  const sql = buildCreatorMarketplaceRuntimeAclSql("toonspectrum_runtime");
  const violation = buildCreatorMarketplaceRuntimeAclViolationSql(
    "toonspectrum_runtime",
  );

  expect(sql).toContain(
    "REVOKE ALL ON TABLE\n  public.creator_marketplace_resource,\n  public.creator_marketplace_publish_gate\nFROM PUBLIC;",
  );
  expect(sql).toContain(
    "GRANT SELECT, INSERT, DELETE\n  ON TABLE public.creator_marketplace_resource",
  );
  expect(sql).not.toContain(
    "GRANT SELECT, INSERT, UPDATE, DELETE\n  ON TABLE public.creator_marketplace_resource",
  );
  expect(sql).toContain(
    "GRANT SELECT, INSERT, UPDATE, DELETE\n  ON TABLE public.creator_marketplace_publish_gate",
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
  expect(violation).toContain("public.creator_marketplace_publish_gate");
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

test("post-baseline relation classification stays synchronized with the CI fixture reset", () => {
  expect(POST_BASELINE_RELATIONS).toEqual([
    "creator_asset_storage_object",
    "creator_draft_collaboration_room",
    "creator_marketplace_publish_gate",
    "creator_marketplace_resource",
    "creator_work_asset_storage_reference",
  ]);
  const workflow = readFileSync(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  const fixtureReset =
    /DROP TABLE IF EXISTS([\s\S]*?)CASCADE;/u.exec(workflow)?.[1] ?? "";
  for (const relation of POST_BASELINE_RELATIONS) {
    expect(fixtureReset).toContain(`"${relation}"`);
  }
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
