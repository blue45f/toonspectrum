import { describe, expect, test } from "vitest";

import {
  EMPTY_DATABASE_BOOTSTRAP_CONFIRMATION,
  assessBootstrapState,
  buildBootstrapDatabaseInspectionSql,
  buildResetApplicationSchemasSql,
  buildRuntimeBootstrapAclSql,
  buildRuntimeLoginGateSql,
  buildRuntimeLoginGateVerificationSql,
  buildRuntimeLoginRestoreSql,
  expectedResetConfirmation,
  loadBootstrapContract,
  parseBootstrapArguments,
  redactDatabaseSecrets,
  validateRuntimeDatabasePassword,
} from "./bootstrap-empty-production-database.mjs";
import { validateProductionDatabaseUrl } from "./validate-production-database-url.mjs";

const RELEASE_SHA = "a".repeat(40);
const DATABASE_CONTRACT = validateProductionDatabaseUrl(
  "postgresql://migrator:secret@127.0.0.1:55432/toonspectrum_bootstrap",
  { allowLoopback: true },
);

function inspection(overrides = {}) {
  return {
    activeConnectionCount: 0,
    applicationObjectCount: 0,
    applicationObjectSample: [],
    databaseName: "toonspectrum_bootstrap",
    migratorCanCreateInDatabase: true,
    migratorCanCreateInPublic: true,
    migratorCanCreateRole: true,
    migratorRole: "toonspectrum_migrator",
    operationsSchemaExists: false,
    readOnly: false,
    runtimeRoleCanLogin: true,
    runtimeBoundaryState: "separated",
    runtimeRoleExists: true,
    runtimeRoleHasMemberships: false,
    runtimeRoleInheritsMigrator: false,
    runtimeRoleOwnsDatabase: false,
    runtimeRolePrivileged: false,
    trigramExtensionInstalled: false,
    ...overrides,
  };
}

describe("empty production database bootstrap CLI boundary", () => {
  test("accepts a read-only plan without destructive tokens", () => {
    expect(
      parseBootstrapArguments([
        "--",
        "--plan",
        "--runtime-database-role",
        "toonspectrum_runtime",
        "--release-sha",
        RELEASE_SHA,
        "--allow-loopback",
      ]),
    ).toMatchObject({
      allowLoopback: true,
      execute: false,
      releaseSha: RELEASE_SHA,
      runtimeDatabaseRole: "toonspectrum_runtime",
    });
  });

  test("treats dry-run as the plan boundary", () => {
    expect(
      parseBootstrapArguments([
        "--dry-run",
        "--runtime-database-role",
        "toonspectrum_runtime",
        "--release-sha",
        RELEASE_SHA,
      ]).execute,
    ).toBe(false);
  });

  test("requires exactly one plan or execute mode", () => {
    const common = [
      "--runtime-database-role",
      "toonspectrum_runtime",
      "--release-sha",
      RELEASE_SHA,
    ];
    expect(() => parseBootstrapArguments(common)).toThrow(/exactly one/u);
    expect(() =>
      parseBootstrapArguments(["--plan", "--execute", ...common]),
    ).toThrow(/exactly one/u);
    expect(() =>
      parseBootstrapArguments(["--plan", "--dry-run", ...common]),
    ).toThrow(/exactly one/u);
  });

  test("requires the independent bootstrap confirmation for execution", () => {
    const arguments_ = [
      "--execute",
      "--runtime-database-role",
      "toonspectrum_runtime",
      "--release-sha",
      RELEASE_SHA,
    ];
    expect(() => parseBootstrapArguments(arguments_)).toThrow(
      /exact destructive confirmation/u,
    );
    expect(
      parseBootstrapArguments([
        ...arguments_,
        "--confirmation",
        EMPTY_DATABASE_BOOTSTRAP_CONFIRMATION,
      ]).execute,
    ).toBe(true);
  });

  test("rejects malformed releases, duplicate values and unknown flags", () => {
    expect(() =>
      parseBootstrapArguments([
        "--plan",
        "--runtime-database-role",
        "toonspectrum_runtime",
        "--release-sha",
        "short",
      ]),
    ).toThrow(/40-character/u);
    expect(() =>
      parseBootstrapArguments([
        "--plan",
        "--runtime-database-role",
        "toonspectrum_runtime",
        "--runtime-database-role",
        "another_runtime",
        "--release-sha",
        RELEASE_SHA,
      ]),
    ).toThrow(/duplicate/iu);
    expect(() => parseBootstrapArguments(["--unsafe"])).toThrow(/unknown/iu);
  });
});

describe("bootstrap target assessment", () => {
  test("permits a genuinely empty database with separated roles", () => {
    const result = assessBootstrapState({
      databaseContract: DATABASE_CONTRACT,
      inspection: inspection(),
      runtimeDatabaseRole: "toonspectrum_runtime",
    });
    expect(result).toMatchObject({
      nonempty: false,
      resetAuthorized: false,
      runtimeRoleMustBeCreated: false,
    });
  });

  test("requires a second database-bound token before resetting objects", () => {
    const state = inspection({
      applicationObjectCount: 3,
      applicationObjectSample: ["public.user", "public.creator_work"],
    });
    const withoutReset = assessBootstrapState({
      databaseContract: DATABASE_CONTRACT,
      inspection: state,
      runtimeDatabaseRole: "toonspectrum_runtime",
    });
    expect(withoutReset.nonempty).toBe(true);
    expect(withoutReset.resetAuthorized).toBe(false);
    expect(withoutReset.expectedResetConfirmation).toBe(
      "RESET-AND-BOOTSTRAP-TOONSPECTRUM-DATABASE:toonspectrum_bootstrap",
    );

    expect(
      assessBootstrapState({
        databaseContract: DATABASE_CONTRACT,
        inspection: state,
        resetConfirmation: expectedResetConfirmation(
          DATABASE_CONTRACT.databaseName,
        ),
        runtimeDatabaseRole: "toonspectrum_runtime",
      }).resetAuthorized,
    ).toBe(true);
    expect(() =>
      assessBootstrapState({
        databaseContract: DATABASE_CONTRACT,
        inspection: state,
        resetConfirmation:
          "RESET-AND-BOOTSTRAP-TOONSPECTRUM-DATABASE:another_database",
        runtimeDatabaseRole: "toonspectrum_runtime",
      }),
    ).toThrow(/does not exactly match/u);
  });

  test("blocks active clients, read-only targets and same-role execution", () => {
    const base = {
      databaseContract: DATABASE_CONTRACT,
      runtimeDatabaseRole: "toonspectrum_runtime",
    };
    expect(() =>
      assessBootstrapState({
        ...base,
        inspection: inspection({ activeConnectionCount: 1 }),
      }),
    ).toThrow(/other client connection/u);
    expect(() =>
      assessBootstrapState({
        ...base,
        inspection: inspection({ readOnly: true }),
      }),
    ).toThrow(/read-only/u);
    expect(() =>
      assessBootstrapState({
        ...base,
        inspection: inspection({ migratorRole: "toonspectrum_runtime" }),
      }),
    ).toThrow(/must be different/u);
  });

  test.each([
    ["runtimeRoleCanLogin", false],
    ["runtimeRolePrivileged", true],
    ["runtimeRoleHasMemberships", true],
    ["runtimeRoleInheritsMigrator", true],
    ["runtimeRoleOwnsDatabase", true],
  ])("blocks an unsafe existing runtime role: %s", (field, value) => {
    expect(() =>
      assessBootstrapState({
        databaseContract: DATABASE_CONTRACT,
        inspection: inspection({ [field]: value }),
        runtimeDatabaseRole: "toonspectrum_runtime",
      }),
    ).toThrow(/separation boundary/u);
  });

  test("allows plan inspection of a missing role but requires a strong secret to execute", () => {
    const missingRole = inspection({
      runtimeBoundaryState: "missing",
      runtimeRoleCanLogin: false,
      runtimeRoleExists: false,
    });
    expect(
      assessBootstrapState({
        databaseContract: DATABASE_CONTRACT,
        inspection: missingRole,
        runtimeDatabaseRole: "toonspectrum_runtime",
      }).runtimeRoleMustBeCreated,
    ).toBe(true);
    expect(() =>
      assessBootstrapState({
        databaseContract: DATABASE_CONTRACT,
        inspection: missingRole,
        requireRuntimePassword: true,
        runtimeDatabaseRole: "toonspectrum_runtime",
      }),
    ).toThrow(/24-1024/u);
    expect(
      assessBootstrapState({
        databaseContract: DATABASE_CONTRACT,
        inspection: missingRole,
        requireRuntimePassword: true,
        runtimeDatabasePassword: "a-strong-runtime-password-1234",
        runtimeDatabaseRole: "toonspectrum_runtime",
      }).runtimeRoleMustBeCreated,
    ).toBe(true);
  });
});

describe("bootstrap SQL and repository contract", () => {
  test("inspection observes application objects, connections and role hazards", () => {
    const sql = buildBootstrapDatabaseInspectionSql("toonspectrum_runtime");
    expect(sql).toContain("pg_catalog.pg_stat_activity");
    expect(sql).toContain("backend_type = 'client backend'");
    expect(sql).toContain("toonspectrum_ops");
    expect(sql).toContain("pg_catalog.pg_auth_members");
    expect(sql).toContain("runtimeRoleOwnsDatabase");
  });

  test("reset SQL is database-bound and drops only application schemas", () => {
    const sql = buildResetApplicationSchemasSql({
      databaseName: "toonspectrum_bootstrap",
      runtimeDatabaseRole: "toonspectrum_runtime",
    });
    expect(sql).toContain(
      "current_database() <> 'toonspectrum_bootstrap'",
    );
    expect(sql).toContain("DROP SCHEMA IF EXISTS toonspectrum_ops CASCADE");
    expect(sql).toContain("DROP SCHEMA IF EXISTS public CASCADE");
    expect(sql).toContain("CREATE SCHEMA public AUTHORIZATION CURRENT_USER");
    expect(sql).not.toMatch(/DROP DATABASE|DROP OWNED/u);
  });

  test("runtime ACL preserves migration and object-storage boundaries", () => {
    const sql = buildRuntimeBootstrapAclSql("toonspectrum_runtime");
    expect(sql).toContain("REVOKE ALL ON ALL TABLES IN SCHEMA public");
    expect(sql).toContain("GRANT SELECT ON TABLE public.toonspectrum_schema_migration");
    expect(sql).toContain("creator_asset_storage_object");
    expect(sql).toContain("creator_work_asset_storage_reference");
    expect(sql).toContain("\\gexec");
    expect(sql).not.toContain("GRANT CREATE ON SCHEMA public");
  });

  test("runtime writer gate is database-bound, blocks login and rechecks clients", () => {
    const gate = buildRuntimeLoginGateSql({
      databaseName: "toonspectrum_bootstrap",
      runtimeDatabaseRole: "toonspectrum_runtime",
    });
    const verification = buildRuntimeLoginGateVerificationSql({
      databaseName: "toonspectrum_bootstrap",
      runtimeDatabaseRole: "toonspectrum_runtime",
    });

    expect(gate).toContain(
      "current_database() <> 'toonspectrum_bootstrap'",
    );
    expect(gate).toContain("ALTER ROLE %I NOLOGIN");
    expect(gate).toContain("backend_type = 'client backend'");
    expect(verification).toContain("AND NOT rolcanlogin");
    expect(verification).toContain("database client raced");
    expect(gate).not.toContain("REVOKE CONNECT");
    expect(gate).not.toContain("FROM PUBLIC");
  });

  test("runtime writer gate restoration is idempotent and refuses unsafe roles", () => {
    const restore = buildRuntimeLoginRestoreSql({
      databaseName: "toonspectrum_bootstrap",
      runtimeDatabaseRole: "toonspectrum_runtime",
    });
    expect(restore).toContain("ALTER ROLE %I LOGIN");
    expect(restore).toContain("AND rolcanlogin");
    expect(restore).toContain("pg_catalog.pg_has_role");
    expect(restore).toContain("runtime role became missing or unsafe");
    expect(restore).not.toContain("PASSWORD");
  });

  test("requires a nontrivial runtime password only when role creation is needed", () => {
    expect(() => validateRuntimeDatabasePassword("too-short")).toThrow(
      /24-1024/u,
    );
    expect(
      validateRuntimeDatabasePassword("a-strong-runtime-password-1234"),
    ).toBe("a-strong-runtime-password-1234");
  });

  test("redacts raw URLs, decoded passwords and encoded password forms", () => {
    const url =
      "postgresql://migrator:p%40ssword@db.example.test/app?sslmode=verify-full";
    const redacted = redactDatabaseSecrets(
      `failed for ${url}; password=p@ssword; encoded=p%40ssword`,
      [url, "p@ssword"],
    );
    expect(redacted).not.toContain(url);
    expect(redacted).not.toContain("p@ssword");
    expect(redacted).not.toContain("p%40ssword");
    expect(redacted).toContain("[REDACTED]");
  });

  test("pins continuous history and every required forward migration", () => {
    const contract = loadBootstrapContract();
    expect(contract.historical).toHaveLength(19);
    expect(contract.historical[0].id).toBe("0001_studio_ai_usage_ledger");
    expect(contract.historical.at(-1).id).toBe(
      "0019_studio_ai_request_receipt",
    );
    expect(contract.pending.map((migration) => migration.id)).toEqual([
      "0020_creator_draft_collaboration_room",
      "0021_creator_marketplace_resource",
      "0022_creator_marketplace_distributed_gate_search",
      "0024_creator_asset_object_storage",
      "0025_auth_lifecycle_contract",
      "0026_creator_draft_cloud_save_intent",
      "0027_creator_draft_atomic_publication",
      "0028_studio_ai_openrouter_provider",
    ]);
    expect(contract.fingerprint).toMatch(/^[0-9a-f]{64}$/u);
  });
});
