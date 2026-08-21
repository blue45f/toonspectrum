import { describe, expect, it, vi } from "vitest";

import {
  preflightStudioAiIdempotencySchema,
  studioAiIdempotencySchemaPreflightProvider,
  STUDIO_AI_IDEMPOTENCY_CANONICAL_CHECK_DEFINITIONS,
  STUDIO_AI_IDEMPOTENCY_SCHEMA_PREFLIGHT,
} from "./studio-ai-idempotency-schema-preflight";

vi.mock("../../db", () => ({ dbPool: {} }));

function healthyRow() {
  return {
    receiptTable: "studio_ai_request_receipt",
    tableColumnCount: 9,
    requiredColumnCount: 9,
    checkDefinitions: { ...STUDIO_AI_IDEMPOTENCY_CANONICAL_CHECK_DEFINITIONS },
    primaryKeyReady: true,
    userCascadeReady: true,
    userRequestUniqueReady: true,
    expiryIndexReady: true,
    attemptDefault: "0",
    createdDefault: "CURRENT_TIMESTAMP",
    updatedDefault: "CURRENT_TIMESTAMP",
  };
}

describe("Studio AI idempotency schema preflight", () => {
  it("accepts only the complete canonical receipt schema", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [healthyRow()] });
    await expect(preflightStudioAiIdempotencySchema({ query } as never)).resolves.toBeUndefined();
    expect(String(query.mock.calls[0]?.[0])).toContain("studio_ai_request_receipt");
    expect(String(query.mock.calls[0]?.[0])).not.toMatch(/\bCREATE\b|\bALTER\b|\bUPDATE\b/iu);
  });

  it.each([
    ["extra prompt/body column", { tableColumnCount: 10 }],
    ["wrong key/hash uniqueness", { userRequestUniqueReady: false }],
    ["wrong expiry index", { expiryIndexReady: false }],
    ["weak status check", {
      checkDefinitions: {
        ...STUDIO_AI_IDEMPOTENCY_CANONICAL_CHECK_DEFINITIONS,
        studio_ai_request_receipt_status_check: "CHECK (true)",
      },
    }],
  ])("fails closed for %s", async (_label, drift) => {
    const query = vi.fn().mockResolvedValue({ rows: [{ ...healthyRow(), ...drift }] });
    await expect(preflightStudioAiIdempotencySchema({ query } as never)).rejects.toThrow(
      /0019_studio_ai_request_receipt\.sql/u
    );
  });

  it("exposes an eager Nest bootstrap provider", () => {
    expect(studioAiIdempotencySchemaPreflightProvider.provide).toBe(
      STUDIO_AI_IDEMPOTENCY_SCHEMA_PREFLIGHT
    );
    expect(studioAiIdempotencySchemaPreflightProvider.useFactory).toEqual(expect.any(Function));
  });
});
