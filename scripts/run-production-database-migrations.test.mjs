import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

import {
  POST_BASELINE_RELATIONS,
  buildHistoricalAdoptionVerificationSql,
  buildRepairLockTakeoverSql,
  decideMigrationAction,
  loadMigrationManifest,
  validateMigrationSequenceContinuity,
  validateRuntimeDatabaseRole,
} from "./run-production-database-migrations.mjs";

test("manifest lists every numbered SQL migration exactly once in order", () => {
  const manifest = loadMigrationManifest();
  expect(manifest).toHaveLength(23);
  expect(manifest[0].id).toBe("0001_studio_ai_usage_ledger");
  expect(manifest.at(-1).id).toBe("0023_production_migration_ledger");
  expect(new Set(manifest.map(({ checksum }) => checksum)).size).toBe(23);
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
    "creator_draft_collaboration_room",
    "creator_marketplace_publish_gate",
    "creator_marketplace_resource",
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
        id: "0024_future_contract",
        sequence: 24,
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
      id: "0024_future_contract",
      sequence: 24,
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
