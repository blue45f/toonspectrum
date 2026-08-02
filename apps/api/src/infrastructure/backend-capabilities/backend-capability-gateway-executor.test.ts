import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BackendCapabilitiesModule } from "./backend-capabilities.module";
import {
  BACKEND_CAPABILITY_DURABLE_QUEUE_PORT,
  BackendCapabilityCleanupPayloadSchema,
  type BackendCapabilityDurableQueuePort,
} from "./backend-capability-durable-queue.port";
import { BackendCapabilityGatewayEnvelopeSchema } from "./backend-capability-gateway-contract";
import { BackendCapabilityGatewayExecutor } from "./backend-capability-gateway-executor";
import { resolveBackendCapabilityPolicy } from "./backend-capability-policy";

const providerConfig = (prefix: "CLOUDFLARE" | "UPSTASH_QSTASH") => ({
  [`BACKEND_${prefix}_ENABLED`]: "true",
  [`BACKEND_${prefix}_BASE_URL`]: `https://${prefix
    .toLowerCase()
    .replaceAll("_", "-")}.example`,
  [`BACKEND_${prefix}_AUTH_TOKEN`]: `${prefix.toLowerCase()}-auth-token-that-is-at-least-thirty-two-characters`,
  [`BACKEND_${prefix}_DAILY_REQUEST_BUDGET`]: "100",
  [`BACKEND_${prefix}_DAILY_COST_BUDGET`]: "1000",
  [`BACKEND_${prefix}_MAX_EXECUTION_MS`]: "100",
  [`BACKEND_${prefix}_MAX_PAYLOAD_BYTES`]: "1024",
  [`BACKEND_${prefix}_MAX_RESPONSE_BYTES`]: "4096",
  [`BACKEND_${prefix}_MAX_CONCURRENCY`]: "2",
});

const policy = resolveBackendCapabilityPolicy(
  {
    NODE_ENV: "test",
    BACKEND_DISTRIBUTION_ENABLED: "true",
    ...providerConfig("CLOUDFLARE"),
    ...providerConfig("UPSTASH_QSTASH"),
  },
  { warn: vi.fn() }
);

function envelope(
  workload: "cleanup" | "notification",
  overrides: Record<string, unknown> = {}
) {
  const provider = workload === "cleanup" ? "upstash-qstash" : "cloudflare";
  const idempotencyKey = `${workload}-request-00000001`;
  return BackendCapabilityGatewayEnvelopeSchema.parse({
    version: "toonspectrum.backend-capability.v1",
    provider,
    tenantId: "tenant-001",
    capability: "async-job",
    workload,
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
      estimatedDurationMs: 100,
      durability: "durable",
    },
    payload: {
      operation:
        workload === "cleanup"
          ? "cleanup.dispatch"
          : "notification.dispatch",
      requestKey: idempotencyKey,
      task: {
        name:
          workload === "cleanup"
            ? "assets.expire-orphans"
            : "creator.publish-complete",
        body: { workId: "work-001" },
      },
    },
    ...overrides,
  });
}

function queuePort(
  overrides: Partial<BackendCapabilityDurableQueuePort> = {}
): BackendCapabilityDurableQueuePort & {
  verifyReadiness: ReturnType<typeof vi.fn>;
  submit: ReturnType<typeof vi.fn>;
} {
  return {
    verifyReadiness: vi.fn(async () => ({
      ready: true as const,
      providerIds: ["upstash-qstash", "cloudflare"] as const,
      workloads: ["cleanup", "notification"] as const,
    })),
    submit: vi.fn(async () => ({
      outcome: "accepted" as const,
      jobId: "queue-job-001",
    })),
    ...overrides,
  } as BackendCapabilityDurableQueuePort & {
    verifyReadiness: ReturnType<typeof vi.fn>;
    submit: ReturnType<typeof vi.fn>;
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("backend capability durable queue gateway executor", () => {
  it("registers an explicit durable queue adapter through the provider-facade module seam", async () => {
    const port = queuePort();
    const application = await NestFactory.createApplicationContext(
      BackendCapabilitiesModule.registerDurableQueue(port),
      { logger: false }
    );
    try {
      expect(application.get(BACKEND_CAPABILITY_DURABLE_QUEUE_PORT)).toBe(port);
      expect(
        application.get(BackendCapabilityGatewayExecutor).hasDurableQueueExecutor()
      ).toBe(true);
    } finally {
      await application.close();
    }
  });

  it("submits cleanup through the declared port and replays an accepted receipt without resubmitting", async () => {
    const port = queuePort();
    const executor = new BackendCapabilityGatewayExecutor(policy, port);
    const command = envelope("cleanup");

    await expect(
      executor.execute(command, "upstash-qstash")
    ).resolves.toEqual({
      version: "toonspectrum.backend-capability.v1",
      provider: "upstash-qstash",
      idempotencyKey: command.idempotencyKey,
      outcome: "accepted",
      retryable: false,
      fidelity: "exact",
      result: {
        requestType: "cleanup",
        status: "accepted",
        jobId: "queue-job-001",
      },
      errorCode: null,
    });
    expect(port.submit).toHaveBeenCalledWith(
      {
        providerId: "upstash-qstash",
        tenantId: "tenant-001",
        workload: "cleanup",
        idempotencyKey: command.idempotencyKey,
        createdAt: command.createdAt,
        task: {
          name: "assets.expire-orphans",
          body: { workId: "work-001" },
        },
      },
      { signal: expect.any(AbortSignal) }
    );
    expect(Object.keys(port.submit.mock.calls[0]?.[0] ?? {})).not.toContain(
      "url"
    );

    await expect(
      executor.execute(command, "upstash-qstash")
    ).resolves.toMatchObject({
      outcome: "duplicate",
      result: { jobId: "queue-job-001", status: "accepted" },
    });
    await expect(
      executor.execute(
        {
          ...command,
          execution: {
            ...command.execution,
            estimatedCostUnits: 2,
          },
        },
        "upstash-qstash"
      )
    ).resolves.toMatchObject({
      outcome: "rejected",
      retryable: false,
      errorCode: "IDEMPOTENCY_KEY_MISMATCH",
    });
    expect(port.verifyReadiness).toHaveBeenCalledOnce();
    expect(port.submit).toHaveBeenCalledOnce();
  });

  it("returns an exact completed notification result from the port", async () => {
    const port = queuePort({
      submit: vi.fn(async () => ({
        outcome: "completed" as const,
        result: { delivered: true, channel: "in-app" },
      })),
    });
    const executor = new BackendCapabilityGatewayExecutor(policy, port);
    const command = envelope("notification");

    await expect(executor.execute(command, "cloudflare")).resolves.toMatchObject(
      {
        provider: "cloudflare",
        outcome: "completed",
        retryable: false,
        result: { delivered: true, channel: "in-app" },
        errorCode: null,
      }
    );
  });

  it("rejects a completed result that exceeds the provider response ceiling", async () => {
    const port = queuePort({
      submit: vi.fn(async () => ({
        outcome: "completed" as const,
        result: { marker: "x".repeat(5_000) },
      })),
    });
    const executor = new BackendCapabilityGatewayExecutor(policy, port);

    await expect(
      executor.execute(envelope("notification"), "cloudflare")
    ).resolves.toMatchObject({
      outcome: "rejected",
      retryable: false,
      result: null,
      errorCode: "PROVIDER_RESPONSE_LIMIT_EXCEEDED",
    });
    expect(port.submit).toHaveBeenCalledOnce();
  });

  it("fails closed when no executor port is installed or its declaration is not ready", async () => {
    const command = envelope("cleanup");
    const missing = new BackendCapabilityGatewayExecutor(policy);

    expect(missing.isDurableQueueExecutorRequired()).toBe(true);
    expect(missing.hasDurableQueueExecutor()).toBe(false);
    await expect(missing.isDurableQueueReady()).resolves.toBe(false);
    await expect(
      missing.execute(command, "upstash-qstash")
    ).resolves.toMatchObject({
      outcome: "rejected",
      retryable: true,
      errorCode: "DURABLE_QUEUE_EXECUTOR_UNAVAILABLE",
    });

    const port = queuePort({
      verifyReadiness: vi.fn(async () => ({
        ready: true as const,
        providerIds: ["cloudflare"] as const,
        workloads: ["cleanup", "notification"] as const,
      })),
    });
    const undeclared = new BackendCapabilityGatewayExecutor(policy, port);
    await expect(
      undeclared.execute(command, "upstash-qstash")
    ).resolves.toMatchObject({
      outcome: "rejected",
      retryable: true,
      errorCode: "DURABLE_QUEUE_EXECUTOR_NOT_READY",
    });
    expect(port.submit).not.toHaveBeenCalled();
  });

  it("rejects non-durable, non-idempotent and extra-key payloads before the port", async () => {
    const port = queuePort();
    const executor = new BackendCapabilityGatewayExecutor(policy, port);
    const nonDurable = envelope("cleanup", {
      idempotent: false,
      execution: {
        estimatedCostUnits: 1,
        estimatedDurationMs: 100,
        durability: "best-effort",
      },
    });

    await expect(
      executor.execute(nonDurable, "upstash-qstash")
    ).resolves.toMatchObject({
      outcome: "rejected",
      retryable: false,
      errorCode: "DURABLE_QUEUE_REQUIRES_IDEMPOTENT_DURABLE_COMMAND",
    });

    const invalidPayload = envelope("cleanup", {
      payload: {
        operation: "cleanup.dispatch",
        requestKey: "cleanup-request-00000001",
        targetUrl: "http://169.254.169.254/latest/meta-data",
        task: {
          name: "assets.expire-orphans",
          body: { workId: "work-001" },
        },
      },
    });
    await expect(
      executor.execute(invalidPayload, "upstash-qstash")
    ).resolves.toMatchObject({
      outcome: "rejected",
      retryable: false,
      errorCode: "INVALID_DURABLE_QUEUE_PAYLOAD",
    });
    expect(port.verifyReadiness).not.toHaveBeenCalled();
    expect(port.submit).not.toHaveBeenCalled();
    expect(
      BackendCapabilityCleanupPayloadSchema.safeParse(invalidPayload.payload)
        .success
    ).toBe(false);
  });

  it("enforces the declared provider body and execution ceilings before queue I/O", async () => {
    const port = queuePort();
    const executor = new BackendCapabilityGatewayExecutor(policy, port);
    const oversized = envelope("cleanup", {
      payload: {
        operation: "cleanup.dispatch",
        requestKey: "cleanup-request-00000001",
        task: {
          name: "assets.expire-orphans",
          body: { marker: "x".repeat(2_000) },
        },
      },
    });

    await expect(
      executor.execute(oversized, "upstash-qstash")
    ).resolves.toMatchObject({
      outcome: "rejected",
      retryable: false,
      errorCode: "PROVIDER_LIMIT_EXCEEDED",
    });
    expect(port.verifyReadiness).not.toHaveBeenCalled();
    expect(port.submit).not.toHaveBeenCalled();
  });

  it("treats malformed port responses and caller aborts as retryable fail-closed rejections", async () => {
    const malformedPort = queuePort({
      submit: vi.fn(async () => ({ outcome: "accepted", targetUrl: "https://evil.example" }) as never),
    });
    const malformed = new BackendCapabilityGatewayExecutor(
      policy,
      malformedPort
    );
    await expect(
      malformed.execute(envelope("notification"), "cloudflare")
    ).resolves.toMatchObject({
      outcome: "rejected",
      retryable: true,
      errorCode: "DURABLE_QUEUE_INVALID_RESPONSE",
    });

    const waitingPort = queuePort({
      verifyReadiness: vi.fn(
        () => new Promise(() => undefined)
      ),
    });
    const waiting = new BackendCapabilityGatewayExecutor(policy, waitingPort);
    const controller = new AbortController();
    controller.abort(new Error("caller left"));
    await expect(
      waiting.execute(
        envelope("cleanup"),
        "upstash-qstash",
        controller.signal
      )
    ).resolves.toMatchObject({
      outcome: "rejected",
      retryable: true,
      errorCode: "DURABLE_QUEUE_EXECUTION_ABORTED",
    });
    expect(waitingPort.submit).not.toHaveBeenCalled();
  });

  it("bounds an executor that ignores its abort signal", async () => {
    vi.useFakeTimers();
    const port = queuePort({
      submit: vi.fn(() => new Promise(() => undefined)),
    });
    const executor = new BackendCapabilityGatewayExecutor(policy, port);
    const result = executor.execute(envelope("cleanup"), "upstash-qstash");

    await vi.advanceTimersByTimeAsync(101);

    await expect(result).resolves.toMatchObject({
      outcome: "rejected",
      retryable: true,
      errorCode: "DURABLE_QUEUE_EXECUTION_TIMEOUT",
    });
  });

  it("reports readiness only for a port covering both declared workloads", async () => {
    const readyPort = queuePort();
    const ready = new BackendCapabilityGatewayExecutor(policy, readyPort);
    expect(ready.hasDurableQueueExecutor()).toBe(true);
    await expect(ready.isDurableQueueReady()).resolves.toBe(true);

    const partialPort = queuePort({
      verifyReadiness: vi.fn(async () => ({
        ready: true as const,
        providerIds: ["upstash-qstash"] as const,
        workloads: ["cleanup"] as const,
      })),
    });
    const partial = new BackendCapabilityGatewayExecutor(policy, partialPort);
    await expect(partial.isDurableQueueReady()).resolves.toBe(false);
  });
});
