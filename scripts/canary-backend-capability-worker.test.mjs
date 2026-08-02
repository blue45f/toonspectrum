import { describe, expect, it, vi } from "vitest";

import {
  createHealthSignature,
  isGatewayResponseContentType,
  runBackendCapabilityWorkerCanary,
} from "./canary-backend-capability-worker.mjs";

const token = "canary-auth-token-that-is-at-least-32-characters";

describe("backend capability worker canary", () => {
  it("accepts Express charset insertion only when gateway version 1 remains explicit", () => {
    expect(isGatewayResponseContentType(
      "application/vnd.toonspectrum.backend-capability+json; charset=utf-8; version=1",
    )).toBe(true);
    expect(isGatewayResponseContentType(
      "application/vnd.toonspectrum.backend-capability+json; charset=utf-8",
    )).toBe(false);
  });

  it("authenticates signed health without transmitting the gateway token", async () => {
    const fetch = vi.fn(async (_url, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("x-toonspectrum-gateway-token")).toBeNull();
      expect(headers.get("x-toonspectrum-health-signature")).toBe(
        createHealthSignature(token, "render", "1800000000000"),
      );
      return Response.json({
        version: "toonspectrum.backend-capability.v1",
        role: "capability-worker",
        ready: true,
        operations: ["thumbnail.render"],
      });
    });

    await expect(
      runBackendCapabilityWorkerCanary(
        {
          BACKEND_CAPABILITY_CANARY_BASE_URL:
            "https://worker.example.test",
          BACKEND_CAPABILITY_CANARY_PROVIDER: "render",
          BACKEND_CAPABILITY_CANARY_AUTH_TOKEN: token,
        },
        { fetch, now: () => 1_800_000_000_000 },
      ),
    ).resolves.toEqual({
      provider: "render",
      health: "ready",
      thumbnail: "not-requested",
    });
  });

  it("uses independent timeout scopes for health and thumbnail execution", async () => {
    const signals = [];
    const fetch = vi.fn(async (url, init) => {
      signals.push(init?.signal);
      if (String(url).endsWith("/health")) {
        return Response.json({
          version: "toonspectrum.backend-capability.v1",
          role: "capability-worker",
          ready: true,
          operations: ["thumbnail.render"],
        });
      }
      const envelope = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        version: "toonspectrum.backend-capability.v1",
        provider: "render",
        idempotencyKey: envelope.idempotencyKey,
        outcome: "completed",
        retryable: false,
        fidelity: "exact",
        errorCode: null,
        result: {
          operation: "thumbnail.render",
          object: { purpose: "derived" },
        },
      }), {
        status: 200,
        headers: {
          "content-type":
            "application/vnd.toonspectrum.backend-capability+json; charset=utf-8; version=1",
        },
      });
    });

    await expect(runBackendCapabilityWorkerCanary({
      BACKEND_CAPABILITY_CANARY_BASE_URL: "https://worker.example.test",
      BACKEND_CAPABILITY_CANARY_PROVIDER: "render",
      BACKEND_CAPABILITY_CANARY_AUTH_TOKEN: token,
      BACKEND_CAPABILITY_CANARY_SOURCE_OBJECT_JSON: JSON.stringify({
        contractVersion: "toonspectrum.supabase-object-storage.v1",
        purpose: "source",
        digest: `sha256:${"a".repeat(64)}`,
        objectPath: `sha256/aa/${"a".repeat(64)}`,
        byteLength: 64,
        contentType: "image/png",
      }),
    }, { fetch, now: () => 1_800_000_000_000 })).resolves.toMatchObject({
      thumbnail: "completed",
    });
    expect(signals).toHaveLength(2);
    expect(signals[0]).not.toBe(signals[1]);
  });

  it("rejects insecure remote origins before making a request", async () => {
    const fetch = vi.fn();
    await expect(
      runBackendCapabilityWorkerCanary(
        {
          BACKEND_CAPABILITY_CANARY_BASE_URL: "http://worker.example.test",
          BACKEND_CAPABILITY_CANARY_PROVIDER: "render",
          BACKEND_CAPABILITY_CANARY_AUTH_TOKEN: token,
        },
        { fetch, now: Date.now },
      ),
    ).rejects.toThrow("must be a secure origin");
    expect(fetch).not.toHaveBeenCalled();
  });
});
