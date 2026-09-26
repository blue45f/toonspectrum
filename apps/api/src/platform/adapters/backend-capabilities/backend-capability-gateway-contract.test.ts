import { describe, expect, it } from "vitest";

import {
  BACKEND_CAPABILITY_GATEWAY_VERSION,
  BackendCapabilityGatewayCommandSchema,
  BackendCapabilityGatewayResponseSchema,
  canonicalJsonStringify,
} from "./backend-capability-gateway-contract";

describe("backend capability gateway contract", () => {
  it("canonicalizes every object level without changing array or value semantics", () => {
    expect(
      canonicalJsonStringify({
        z: 1,
        a: { y: true, x: ["same", { b: 2, a: 1 }] },
      })
    ).toBe('{"a":{"x":["same",{"a":1,"b":2}],"y":true},"z":1}');
  });

  it("does not expose core authority operations as a routable command", () => {
    expect(
      BackendCapabilityGatewayCommandSchema.safeParse({
        tenantId: "tenant-1",
        capability: "work-save",
        workload: "document",
        estimatedCostUnits: 1,
        estimatedDurationMs: 1_000,
        durability: "durable",
        idempotencyKey: "work-save-01",
        idempotent: true,
        payload: {},
      }).success
    ).toBe(false);
  });

  it("requires an explicit tenant boundary for every routable command", () => {
    const command = {
      tenantId: "tenant-1",
      capability: "async-job",
      workload: "webhook",
      estimatedCostUnits: 1,
      estimatedDurationMs: 1_000,
      durability: "durable",
      idempotencyKey: "webhook-01",
      idempotent: true,
      payload: { eventId: "event-1" },
    } as const;

    expect(BackendCapabilityGatewayCommandSchema.safeParse(command).success)
      .toBe(true);
    expect(
      BackendCapabilityGatewayCommandSchema.safeParse({
        ...command,
        tenantId: undefined,
      }).success
    ).toBe(false);
  });

  it("requires an exact-fidelity, extra-key-free response", () => {
    const response = {
      version: BACKEND_CAPABILITY_GATEWAY_VERSION,
      provider: "cloudflare",
      idempotencyKey: "thumbnail-01", // gitleaks:allow -- deterministic test fixture
      outcome: "completed",
      retryable: false,
      fidelity: "exact",
      result: { assetId: "asset-1" },
      errorCode: null,
    } as const;

    expect(BackendCapabilityGatewayResponseSchema.safeParse(response).success)
      .toBe(true);
    expect(
      BackendCapabilityGatewayResponseSchema.safeParse({
        ...response,
        fidelity: "degraded",
      }).success
    ).toBe(false);
    expect(
      BackendCapabilityGatewayResponseSchema.safeParse({
        ...response,
        vendorMetadata: "not-in-contract",
      }).success
    ).toBe(false);
  });
});
