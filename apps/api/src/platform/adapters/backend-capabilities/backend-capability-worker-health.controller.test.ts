import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { resolveBackendCapabilityPolicy } from "./backend-capability-policy";
import {
  BackendCapabilityWorkerHealthController,
  createBackendCapabilityWorkerHealthSignature,
} from "./backend-capability-worker-health.controller";

import type { BackendCapabilityGatewayRuntime } from "./backend-capability-gateway-dispatcher";
import type { BackendCapabilityGatewayExecutor } from "./backend-capability-gateway-executor";

const now = 1_800_000_000_000;
const token = "render-worker-health-token-1234567890";
const environment = {
  BACKEND_DISTRIBUTION_ENABLED: "true",
  BACKEND_RENDER_ENABLED: "true",
  BACKEND_RENDER_BASE_URL: "https://render-worker.example.test",
  BACKEND_RENDER_AUTH_TOKEN: token,
  BACKEND_RENDER_DAILY_REQUEST_BUDGET: "100",
  BACKEND_RENDER_DAILY_COST_BUDGET: "10000",
  BACKEND_RENDER_MAX_EXECUTION_MS: "30000",
  BACKEND_RENDER_MAX_PAYLOAD_BYTES: "1048576",
  BACKEND_RENDER_MAX_RESPONSE_BYTES: "1048576",
  BACKEND_RENDER_MAX_CONCURRENCY: "2",
} as const;

describe("signed capability worker health", () => {
  function controller() {
    const executor = {
      hasCapabilityWorkerExecutor: vi.fn(() => true),
      capabilityWorkerReadiness: vi.fn(async () => ({
        ready: true,
        operations: ["thumbnail.render"],
      })),
    };
    const runtime = {
      now: () => now,
      nonce: () => "00000000-0000-4000-8000-000000000000",
      fetch: vi.fn(),
    } satisfies BackendCapabilityGatewayRuntime;
    return {
      executor,
      subject: new BackendCapabilityWorkerHealthController(
        resolveBackendCapabilityPolicy(environment),
        runtime,
        executor as unknown as BackendCapabilityGatewayExecutor,
      ),
    };
  }

  it("returns only bounded readiness for a fresh provider-scoped signature", async () => {
    const timestamp = String(now);
    const signature = createBackendCapabilityWorkerHealthSignature(
      token,
      "render",
      timestamp,
    );
    const { subject, executor } = controller();

    await expect(
      subject.ready("render", timestamp, signature),
    ).resolves.toEqual({
      version: "toonspectrum.backend-capability.v1",
      role: "capability-worker",
      ready: true,
      operations: ["thumbnail.render"],
    });
    expect(executor.capabilityWorkerReadiness).toHaveBeenCalledTimes(1);
  });

  it("rejects stale and forged signatures without probing the worker", async () => {
    const { subject, executor } = controller();
    const stale = String(now - 60_001);
    await expect(
      subject.ready(
        "render",
        stale,
        createBackendCapabilityWorkerHealthSignature(token, "render", stale),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      subject.ready("render", String(now), `sha256:${"0".repeat(64)}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(executor.capabilityWorkerReadiness).not.toHaveBeenCalled();
  });
});
