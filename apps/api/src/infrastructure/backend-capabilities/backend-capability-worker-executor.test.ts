import { describe, expect, it, vi } from "vitest";

import { BackendCapabilityGatewayEnvelopeSchema } from "./backend-capability-gateway-contract";
import { BackendCapabilityGatewayExecutor } from "./backend-capability-gateway-executor";
import { resolveBackendCapabilityPolicy } from "./backend-capability-policy";

import type { BackendCapabilityWorkerPort } from "./backend-capability-worker.port";

const policy = resolveBackendCapabilityPolicy({
  BACKEND_DISTRIBUTION_ENABLED: "true",
  BACKEND_RENDER_ENABLED: "true",
  BACKEND_RENDER_BASE_URL: "https://render-worker.example.test",
  BACKEND_RENDER_AUTH_TOKEN: "render-worker-token-that-is-at-least-32-characters",
  BACKEND_RENDER_DAILY_REQUEST_BUDGET: "100",
  BACKEND_RENDER_DAILY_COST_BUDGET: "1000",
  BACKEND_RENDER_MAX_EXECUTION_MS: "1000",
  BACKEND_RENDER_MAX_PAYLOAD_BYTES: "1048576",
  BACKEND_RENDER_MAX_RESPONSE_BYTES: "65536",
  BACKEND_RENDER_MAX_CONCURRENCY: "2",
});

const digest = "a".repeat(64);
const idempotencyKey = "thumbnail-command-00000001";
const envelope = BackendCapabilityGatewayEnvelopeSchema.parse({
  version: "toonspectrum.backend-capability.v1",
  provider: "render",
  tenantId: "tenant-1",
  capability: "async-job",
  workload: "thumbnail",
  idempotencyKey,
  idempotent: true,
  createdAt: "2026-08-02T00:00:00.000Z",
  nonce: "00000000-0000-4000-8000-000000000001",
  requirements: {
    fidelity: "exact",
    allowDegraded: false,
    latency: "tolerant",
  },
  execution: {
    estimatedCostUnits: 1,
    estimatedDurationMs: 500,
    durability: "best-effort",
  },
  payload: {
    operation: "thumbnail.render",
    tenantId: "tenant-1",
    requestKey: idempotencyKey,
    sourceAssetId: "asset-1",
    sourceObject: {
      contractVersion: "toonspectrum.supabase-object-storage.v1",
      purpose: "source",
      digest: `sha256:${digest}`,
      objectPath: `sha256/aa/${digest}`,
      byteLength: 123,
      contentType: "image/png",
    },
    format: "png",
    maxWidth: 320,
    maxHeight: 240,
  },
});

describe("backend capability worker executor bridge", () => {
  it("submits an exact bounded thumbnail command and canonicalizes completion", async () => {
    const worker = {
      verifyReadiness: vi.fn(async () => ({
        ready: true as const,
        operations: ["thumbnail.render"] as const,
      })),
      submit: vi.fn(async () => ({
        outcome: "completed" as const,
        result: {
          operation: "thumbnail.render",
          width: 320,
          height: 180,
          object: { digest: `sha256:${"b".repeat(64)}` },
        },
      })),
    };
    const executor = new BackendCapabilityGatewayExecutor(
      policy,
      undefined,
      worker as BackendCapabilityWorkerPort,
    );

    await expect(executor.execute(envelope, "render")).resolves.toMatchObject({
      outcome: "completed",
      retryable: false,
      result: {
        operation: "thumbnail.render",
        width: 320,
        height: 180,
      },
    });
    expect(worker.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "thumbnail.render",
        tenantId: "tenant-1",
        idempotencyKey,
        format: "png",
        maxWidth: 320,
        maxHeight: 240,
      }),
      { signal: expect.any(AbortSignal) },
    );
  });

  it("fails closed when readiness does not declare the exact operation", async () => {
    const worker = {
      verifyReadiness: vi.fn(async () => ({
        ready: true as const,
        operations: ["studio-ai-long"] as const,
      })),
      submit: vi.fn(),
    };
    const executor = new BackendCapabilityGatewayExecutor(
      policy,
      undefined,
      worker as unknown as BackendCapabilityWorkerPort,
    );
    await expect(executor.execute(envelope, "render")).resolves.toMatchObject({
      outcome: "rejected",
      retryable: true,
      errorCode: "THUMBNAIL_EXECUTOR_NOT_READY",
    });
    expect(worker.submit).not.toHaveBeenCalled();
  });
});
