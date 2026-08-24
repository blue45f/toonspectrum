import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { dbPool } from "../../db";

import {
  preflightStudioAiAdmissionSchema,
  STUDIO_AI_ADMISSION_CANONICAL_CHECK_DEFINITIONS,
  STUDIO_AI_ADMISSION_SCHEMA_PREFLIGHT,
  studioAiAdmissionSchemaPreflightProvider,
} from "./studio-ai-admission-schema-preflight";

vi.mock("../../db", () => ({ dbPool: { query: vi.fn() } }));

function completeSchema(overrides: Record<string, unknown> = {}) {
  return {
    gateTable: "studio_ai_request_gate",
    requiredColumns: 7,
    requestTimesType: "timestamp with time zone[]",
    requestTimesNotNull: true,
    requestTimesDefault: "'{}'::timestamp with time zone[]",
    leaseTokenType: "bytea",
    leaseTokenNullable: true,
    leaseFenceType: "bigint",
    leaseFenceNotNull: true,
    leaseFenceDefault: "0",
    leaseExpiryType: "timestamp with time zone",
    leaseExpiryNullable: true,
    createdAtType: "timestamp with time zone",
    createdAtNotNull: true,
    createdAtDefault: "CURRENT_TIMESTAMP",
    updatedAtType: "timestamp with time zone",
    updatedAtNotNull: true,
    updatedAtDefault: "CURRENT_TIMESTAMP",
    primaryKeyReady: true,
    userCascadeReady: true,
    requestTimesConstraintReady: true,
    leaseFenceConstraintReady: true,
    leaseStateConstraintReady: true,
    requestTimesConstraintDefinition:
      STUDIO_AI_ADMISSION_CANONICAL_CHECK_DEFINITIONS.studio_ai_request_gate_request_times_check,
    leaseFenceConstraintDefinition:
      STUDIO_AI_ADMISSION_CANONICAL_CHECK_DEFINITIONS.studio_ai_request_gate_lease_fence_check,
    leaseStateConstraintDefinition:
      STUDIO_AI_ADMISSION_CANONICAL_CHECK_DEFINITIONS.studio_ai_request_gate_lease_state_check,
    ...overrides,
  };
}

describe("Studio AI admission schema preflight", () => {
  it("accepts only the complete shared rate-limit and lease schema", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [completeSchema()] });

    await expect(preflightStudioAiAdmissionSchema({ query } as never)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("constraint_record.conkey");
    expect(query.mock.calls[0]?.[0]).toContain("constraint_record.confkey");
    expect(query.mock.calls[0]?.[0]).toContain("constraint_record.contype = 'c'");
    expect(query.mock.calls[0]?.[0]).toContain("pg_get_constraintdef(constraint_record.oid, true)");
    expect(query.mock.calls[0]?.[0]).not.toMatch(/pg_get_constraintdef[^\n]*LIKE/iu);
  });

  it.each([
    ["table", { gateTable: null }],
    ["columns", { requiredColumns: 6 }],
    ["rolling window type", { requestTimesType: "timestamp without time zone[]" }],
    ["rolling window nullability", { requestTimesNotNull: false }],
    ["rolling window default", { requestTimesDefault: "'broken'::text" }],
    ["token digest type", { leaseTokenType: "text" }],
    ["nullable token", { leaseTokenNullable: false }],
    ["fence", { leaseFenceType: "integer" }],
    ["fence default", { leaseFenceDefault: "1" }],
    ["expiry", { leaseExpiryType: "timestamp without time zone" }],
    ["nullable expiry", { leaseExpiryNullable: false }],
    ["created timestamp", { createdAtType: "timestamp without time zone" }],
    ["created default", { createdAtDefault: null }],
    ["updated timestamp nullability", { updatedAtNotNull: false }],
    ["updated default", { updatedAtDefault: null }],
    ["primary key", { primaryKeyReady: false }],
    ["cascade", { userCascadeReady: false }],
    ["request window check", { requestTimesConstraintReady: false }],
    ["fence check", { leaseFenceConstraintReady: false }],
    ["lease-state check", { leaseStateConstraintReady: false }],
    ["request-window definition", { requestTimesConstraintDefinition: "CHECK (true)" }],
    ["lease-fence definition", { leaseFenceConstraintDefinition: "CHECK (true)" }],
    ["lease-state definition", { leaseStateConstraintDefinition: "CHECK (true)" }],
  ])("fails closed when the %s contract is incomplete", async (_case, override) => {
    const query = vi.fn().mockResolvedValue({ rows: [completeSchema(override)] });

    await expect(preflightStudioAiAdmissionSchema({ query } as never)).rejects.toThrow(
      /0018_studio_ai_request_gate\.sql/u
    );
  });

  it.each([
    [
      "window OR true",
      {
        requestTimesConstraintDefinition:
          "CHECK (cardinality(\"requestTimes\") >= 0 AND cardinality(\"requestTimes\") <= 10000 OR true)",
      },
    ],
    [
      "window bound expansion",
      {
        requestTimesConstraintDefinition:
          "CHECK (cardinality(\"requestTimes\") >= 0 AND cardinality(\"requestTimes\") <= 100000)",
      },
    ],
    [
      "negative fence bypass",
      { leaseFenceConstraintDefinition: "CHECK (\"leaseFence\" >= 0 OR 1 = 1)" },
    ],
    [
      "NULL/expiry UNKNOWN bypass",
      {
        leaseStateConstraintDefinition: `CHECK (
          ("leaseTokenHash" IS NULL AND "leaseExpiresAt" IS NULL)
          OR (octet_length("leaseTokenHash") = 32 AND "leaseExpiresAt" IS NOT NULL)
        )`,
      },
    ],
  ])("rejects a structurally present same-name CHECK weakened by %s", async (_case, override) => {
    const query = vi.fn().mockResolvedValue({ rows: [completeSchema(override)] });

    await expect(preflightStudioAiAdmissionSchema({ query } as never)).rejects.toThrow(
      /0018_studio_ai_request_gate\.sql/u
    );
  });

  it("exports an eager Nest provider for StudioAiModule boot", () => {
    expect(studioAiAdmissionSchemaPreflightProvider.provide).toBe(
      STUDIO_AI_ADMISSION_SCHEMA_PREFLIGHT
    );
    expect(studioAiAdmissionSchemaPreflightProvider.useFactory).toEqual(expect.any(Function));
  });

  it("ships a transactional canonical replacement for every owned CHECK", () => {
    const migration = readFileSync(
      new URL(
        "../../db/migrations/0018_studio_ai_request_gate.sql",
        import.meta.url
      ),
      "utf8"
    );
    for (const name of Object.keys(STUDIO_AI_ADMISSION_CANONICAL_CHECK_DEFINITIONS)) {
      expect(migration).toContain(`DROP CONSTRAINT IF EXISTS "${name}"`);
      expect(migration).toContain(`ADD CONSTRAINT "${name}"`);
    }
    expect(migration).toContain('ALTER COLUMN "requestTimes" SET NOT NULL');
    expect(migration).toContain('ALTER COLUMN "leaseExpiresAt" DROP NOT NULL');
    expect(migration).not.toMatch(/pg_get_constraintdef[\s\S]*?LIKE/iu);
  });

  it("keeps the API booting when the preflight cannot reach the database at all", async () => {
    vi.mocked(dbPool.query).mockRejectedValue(
      Object.assign(new Error("compute time quota exceeded"), { code: "53000" })
    );

    await expect(studioAiAdmissionSchemaPreflightProvider.useFactory()).resolves.toBe(true);
  });

  it("still refuses boot through the provider when the schema contract is violated", async () => {
    vi.mocked(dbPool.query).mockResolvedValue({ rows: [] } as never);

    await expect(studioAiAdmissionSchemaPreflightProvider.useFactory()).rejects.toThrow(
      /0018_studio_ai_request_gate/u
    );
  });
});
