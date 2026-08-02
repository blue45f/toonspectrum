import "reflect-metadata";

import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { json } from "express";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";


import { BACKEND_CAPABILITY_DURABLE_QUEUE_PORT } from "./backend-capability-durable-queue.port";
import { BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE, BACKEND_CAPABILITY_GATEWAY_PATH, BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER, BACKEND_CAPABILITY_IDEMPOTENCY_HEADER, BackendCapabilityGatewayEnvelopeSchema } from "./backend-capability-gateway-contract";
import { BackendCapabilityGatewayController } from "./backend-capability-gateway-controller";
import { BackendCapabilityGatewayExecutor } from "./backend-capability-gateway-executor";
import { resolveBackendCapabilityPolicy } from "./backend-capability-policy";
import { BACKEND_CAPABILITY_POLICY } from "./backend-capability-router";

import type { INestApplication } from "@nestjs/common";
import type { AddressInfo } from "node:net";

const policyEnv = {
  NODE_ENV: "test",
  BACKEND_DISTRIBUTION_ENABLED: "true",
  BACKEND_WEBHOOK_PROVIDER_ORDER: "cloudflare",
  BACKEND_CLOUDFLARE_ENABLED: "true",
  BACKEND_CLOUDFLARE_BASE_URL: "https://gateway.example",
  BACKEND_CLOUDFLARE_AUTH_TOKEN:
    "cloudflare-auth-token-that-is-at-least-thirty-two-characters",
  BACKEND_CLOUDFLARE_DAILY_REQUEST_BUDGET: "100",
  BACKEND_CLOUDFLARE_DAILY_COST_BUDGET: "1000",
  BACKEND_CLOUDFLARE_MAX_EXECUTION_MS: "30000",
  BACKEND_CLOUDFLARE_MAX_PAYLOAD_BYTES: "1048576",
  BACKEND_CLOUDFLARE_MAX_RESPONSE_BYTES: "1048576",
  BACKEND_CLOUDFLARE_MAX_CONCURRENCY: "1",
  ZAI_API_KEY: "zai-api-key-for-gateway-integration",
  DEEPSEEK_API_KEY: "deepseek-api-key",
} as const;

const policy = resolveBackendCapabilityPolicy(policyEnv);
process.env.ZAI_API_KEY = policyEnv.ZAI_API_KEY;
process.env.DEEPSEEK_API_KEY = policyEnv.DEEPSEEK_API_KEY;

const cloudflareToken = policyEnv.BACKEND_CLOUDFLARE_AUTH_TOKEN;

const durableQueuePort = {
  verifyReadiness: vi.fn(async () => ({
    ready: true as const,
    providerIds: ["cloudflare"] as const,
    workloads: ["cleanup", "notification"] as const,
  })),
  submit: vi.fn(async (command: { workload: "cleanup" | "notification" }) => ({
    outcome: "accepted" as const,
    jobId: `${command.workload}-job-001`,
  })),
};

@Module({
  controllers: [BackendCapabilityGatewayController],
  providers: [
    { provide: BACKEND_CAPABILITY_POLICY, useValue: policy },
    {
      provide: BACKEND_CAPABILITY_DURABLE_QUEUE_PORT,
      useValue: durableQueuePort,
    },
    BackendCapabilityGatewayExecutor,
  ],
})
class GatewayBoundaryTestModule {}

const validGatewayIdempotencyKey = "webhook-request-00000000000001";
const validRequestKey = "studio-request-00000000000001";

function gatewayEnvelope(
  idempotencyKey: string,
  payloadOverride: Record<string, unknown> = {}
) {
  const payload = {
    operation: "studio-ai-chat",
    capability: "studio-ai-chat",
    tenant: "tenant-001",
    provider: "zai",
    modelHint: "glm-5.1",
    temperature: 0.7,
    maxTokens: 1024,
    responseFormat: "text",
    task: "composition",
    system: "system prompt",
    user: "user prompt",
    anonymousUserId: null,
    requestKey: validRequestKey,
    ...payloadOverride,
  };

  const envelope = {
    version: "toonspectrum.backend-capability.v1",
    provider: "cloudflare",
    tenantId: "tenant-001",
    capability: "async-job",
    workload: "webhook",
    idempotencyKey,
    idempotent: true,
    createdAt: "2026-07-31T00:00:00.000Z",
    nonce: "00000000-0000-4000-8000-000000000001",
    requirements: {
      fidelity: "exact",
      allowDegraded: false,
      latency: "tolerant",
    },
    execution: {
      estimatedCostUnits: 2,
      estimatedDurationMs: 30_000,
      durability: "best-effort",
    },
    payload,
  } as const;
  const parsed = BackendCapabilityGatewayEnvelopeSchema.safeParse(envelope);
  if (!parsed.success) {
    throw new Error("fixture invalid");
  }
  return parsed.data;
}

function gatewayEnvelopeWithPayload(
  idempotencyKey: string,
  payload: Record<string, unknown>
) {
  const envelope = {
    version: "toonspectrum.backend-capability.v1",
    provider: "cloudflare",
    tenantId: "tenant-001",
    capability: "async-job",
    workload: "webhook",
    idempotencyKey,
    idempotent: true,
    createdAt: "2026-07-31T00:00:00.000Z",
    nonce: "00000000-0000-4000-8000-000000000001",
    requirements: {
      fidelity: "exact",
      allowDegraded: false,
      latency: "tolerant",
    },
    execution: {
      estimatedCostUnits: 2,
      estimatedDurationMs: 30_000,
      durability: "best-effort",
    },
    payload,
  } as const;
  const parsed = BackendCapabilityGatewayEnvelopeSchema.safeParse(envelope);
  if (!parsed.success) {
    throw new Error("fixture invalid");
  }
  return parsed.data;
}

function durableQueueEnvelope(
  workload: "cleanup" | "notification",
  idempotencyKey: string,
  payloadOverride: Record<string, unknown> = {}
) {
  return BackendCapabilityGatewayEnvelopeSchema.parse({
    version: "toonspectrum.backend-capability.v1",
    provider: "cloudflare",
    tenantId: "tenant-001",
    capability: "async-job",
    workload,
    idempotencyKey,
    idempotent: true,
    createdAt: "2026-07-31T00:00:00.000Z",
    nonce: "00000000-0000-4000-8000-000000000001",
    requirements: {
      fidelity: "exact",
      allowDegraded: false,
      latency: "tolerant",
    },
    execution: {
      estimatedCostUnits: 1,
      estimatedDurationMs: 5_000,
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
      ...payloadOverride,
    },
  });
}

describe("BackendCapabilityGatewayController", () => {
  let app: INestApplication;
  let baseUrl: string;
  let fetchMock: ReturnType<typeof vi.fn>;
  let requestFetch: typeof fetch;

  beforeAll(async () => {
    requestFetch = globalThis.fetch.bind(globalThis);
    app = await NestFactory.create(GatewayBoundaryTestModule, { logger: false });
    const gatewayContentType = BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE
      .toLowerCase()
      .split(";")[0]
      .trim();
    app.use(
      json({
        limit: "16mb",
        type: (request) => {
          const contentType = String(request.headers["content-type"] ?? "")
            .toLowerCase()
            .split(";")[0]
            .trim();
          return (
            contentType === "application/json" ||
            contentType === gatewayContentType
          );
        },
      })
    );
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    fetchMock = vi.fn(async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            model: "glm-5.1",
            choices: [
              {
                message: { content: "gateway result" },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
            id: "provider-response-id",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    durableQueuePort.verifyReadiness.mockReset();
    durableQueuePort.verifyReadiness.mockResolvedValue({
      ready: true,
      providerIds: ["cloudflare"],
      workloads: ["cleanup", "notification"],
    });
    durableQueuePort.submit.mockReset();
    durableQueuePort.submit.mockImplementation(async (command) => ({
      outcome: "accepted",
      jobId: `${command.workload}-job-001`,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  afterAll(async () => {
    await app.close();
  });

  it("executes webhook payloads through the distributed AI adapter and returns a complete response", async () => {
    const envelope = gatewayEnvelope(validGatewayIdempotencyKey);
    const result = await requestFetch(`${baseUrl}${BACKEND_CAPABILITY_GATEWAY_PATH}`, {
      method: "POST",
      headers: {
        "content-type": BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
        [BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER]: cloudflareToken,
        [BACKEND_CAPABILITY_IDEMPOTENCY_HEADER]: validGatewayIdempotencyKey,
      },
      body: JSON.stringify(envelope),
    });
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body).toMatchObject({
      version: "toonspectrum.backend-capability.v1",
      outcome: "completed",
      provider: "cloudflare",
      idempotencyKey: validGatewayIdempotencyKey,
      retryable: false,
      errorCode: null,
      result: {
        content: "gateway result",
        provider: "zai",
        model: "glm-5.1",
        requestId: "provider-response-id",
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
      },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("replays identical idempotent command as duplicate without calling providers", async () => {
    const envelope = gatewayEnvelope(`${validGatewayIdempotencyKey}-dup`);
    const first = await requestFetch(`${baseUrl}${BACKEND_CAPABILITY_GATEWAY_PATH}`, {
      method: "POST",
      headers: {
        "content-type": BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
        [BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER]: cloudflareToken,
        [BACKEND_CAPABILITY_IDEMPOTENCY_HEADER]: envelope.idempotencyKey,
      },
      body: JSON.stringify(envelope),
    });
    expect(first.status).toBe(200);
    expect((await first.json())).toMatchObject({ outcome: "completed" });
    expect(fetchMock).toHaveBeenCalledOnce();

    const second = await requestFetch(`${baseUrl}${BACKEND_CAPABILITY_GATEWAY_PATH}`, {
      method: "POST",
      headers: {
        "content-type": BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
        [BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER]: cloudflareToken,
        [BACKEND_CAPABILITY_IDEMPOTENCY_HEADER]: envelope.idempotencyKey,
      },
      body: JSON.stringify(envelope),
    });
    expect(second.status).toBe(200);
    expect((await second.json())).toMatchObject({ outcome: "duplicate" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects an invalid content type before attempting execution", async () => {
    const envelope = gatewayEnvelope(`${validGatewayIdempotencyKey}-type`);
    const result = await requestFetch(`${baseUrl}${BACKEND_CAPABILITY_GATEWAY_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER]: cloudflareToken,
        [BACKEND_CAPABILITY_IDEMPOTENCY_HEADER]: envelope.idempotencyKey,
      },
      body: JSON.stringify(envelope),
    });
    expect(result.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects token mismatch and unknown token before execution", async () => {
    const envelope = gatewayEnvelope(`${validGatewayIdempotencyKey}-token`);
    const unauthorized = await requestFetch(`${baseUrl}${BACKEND_CAPABILITY_GATEWAY_PATH}`, {
      method: "POST",
      headers: {
        "content-type": BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
        [BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER]: "wrong-token-that-does-not-match-conditions",
        [BACKEND_CAPABILITY_IDEMPOTENCY_HEADER]: envelope.idempotencyKey,
      },
      body: JSON.stringify(envelope),
    });
    expect(unauthorized.status).toBe(401);

    const mismatch = await requestFetch(`${baseUrl}${BACKEND_CAPABILITY_GATEWAY_PATH}`, {
      method: "POST",
      headers: {
        "content-type": BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
        [BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER]: cloudflareToken,
        [BACKEND_CAPABILITY_IDEMPOTENCY_HEADER]: "other-key",
      },
      body: JSON.stringify(envelope),
    });
    expect(mismatch.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns rejected responses for unsupported workload payload mismatches", async () => {
    const envelope = gatewayEnvelope(
      `${validGatewayIdempotencyKey}-unsupported`,
      { requestKey: "studio-request-00000000000002" }
    );
    const result = await requestFetch(`${baseUrl}${BACKEND_CAPABILITY_GATEWAY_PATH}`, {
      method: "POST",
      headers: {
        "content-type": BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
        [BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER]: cloudflareToken,
        [BACKEND_CAPABILITY_IDEMPOTENCY_HEADER]: envelope.idempotencyKey,
      },
      body: JSON.stringify({
        ...envelope,
        workload: "studio-asset",
      }),
    });
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body).toMatchObject({
      outcome: "rejected",
      retryable: false,
      errorCode: "UNSUPPORTED_WORKLOAD",
      provider: "cloudflare",
    });
  });

  it("routes webhook workloads with studio-ai-long operation to the long-job path without calling providers", async () => {
    const requestKey = "studio-request-00000000000003";
    const envelope = gatewayEnvelopeWithPayload(
      `${validGatewayIdempotencyKey}-long-workload`,
      {
        operation: "studio-ai-long",
        tenantId: "tenant-001",
        requestKey,
        jobType: "image-sequence",
        task: {
          scene: "shot-1",
          prompt: "test prompt",
        },
      }
    );
    const result = await requestFetch(`${baseUrl}${BACKEND_CAPABILITY_GATEWAY_PATH}`, {
      method: "POST",
      headers: {
        "content-type": BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
        [BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER]: cloudflareToken,
        [BACKEND_CAPABILITY_IDEMPOTENCY_HEADER]: envelope.idempotencyKey,
      },
      body: JSON.stringify(envelope),
    });
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body).toMatchObject({
      outcome: "accepted",
      retryable: false,
      errorCode: null,
      provider: "cloudflare",
      idempotencyKey: envelope.idempotencyKey,
    });
    expect(body).toMatchObject({
      result: {
        requestType: "studio-ai-long",
        status: "accepted",
        jobId: `studio-ai-long:${requestKey}`,
        jobType: "image-sequence",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("routes thumbnail workloads to the thumbnail executor and returns an accepted async result without calling providers", async () => {
    const requestKey = "studio-request-00000000000004";
    const envelope = gatewayEnvelopeWithPayload(
      `${validGatewayIdempotencyKey}-thumbnail`,
      {
        operation: "thumbnail.render",
        tenantId: "tenant-001",
        sourceAssetId: "asset-001",
        requestKey,
      }
    );
    const result = await requestFetch(`${baseUrl}${BACKEND_CAPABILITY_GATEWAY_PATH}`, {
      method: "POST",
      headers: {
        "content-type": BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
        [BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER]: cloudflareToken,
        [BACKEND_CAPABILITY_IDEMPOTENCY_HEADER]: envelope.idempotencyKey,
      },
      body: JSON.stringify({
        ...envelope,
        workload: "thumbnail",
      }),
    });
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body).toMatchObject({
      outcome: "accepted",
      retryable: false,
      errorCode: null,
      provider: "cloudflare",
      idempotencyKey: envelope.idempotencyKey,
    });
    expect(body).toMatchObject({
      result: {
        requestType: "thumbnail",
        status: "accepted",
        jobId: `thumbnail:${requestKey}`,
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["cleanup", "notification"] as const)(
    "executes %s through the declared durable queue port and returns the exact acknowledgement",
    async (workload) => {
      const idempotencyKey = `${workload}-gateway-request-0001`;
      const envelope = durableQueueEnvelope(workload, idempotencyKey);
      const result = await requestFetch(
        `${baseUrl}${BACKEND_CAPABILITY_GATEWAY_PATH}`,
        {
          method: "POST",
          headers: {
            "content-type": BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
            [BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER]: cloudflareToken,
            [BACKEND_CAPABILITY_IDEMPOTENCY_HEADER]: idempotencyKey,
          },
          body: JSON.stringify(envelope),
        }
      );

      expect(result.status).toBe(200);
      await expect(result.json()).resolves.toMatchObject({
        version: "toonspectrum.backend-capability.v1",
        provider: "cloudflare",
        idempotencyKey,
        outcome: "accepted",
        retryable: false,
        fidelity: "exact",
        result: {
          requestType: workload,
          status: "accepted",
          jobId: `${workload}-job-001`,
        },
        errorCode: null,
      });
      expect(durableQueuePort.submit).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: "cloudflare",
          tenantId: "tenant-001",
          workload,
          idempotencyKey,
        }),
        { signal: expect.any(AbortSignal) }
      );
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("fails a durable queue gateway request closed when readiness is unavailable", async () => {
    durableQueuePort.verifyReadiness.mockResolvedValueOnce({
      ready: false,
      reason: "unreachable",
    } as never);
    const idempotencyKey = "cleanup-gateway-unready-0001";
    const envelope = durableQueueEnvelope("cleanup", idempotencyKey);
    const result = await requestFetch(
      `${baseUrl}${BACKEND_CAPABILITY_GATEWAY_PATH}`,
      {
        method: "POST",
        headers: {
          "content-type": BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
          [BACKEND_CAPABILITY_GATEWAY_TOKEN_HEADER]: cloudflareToken,
          [BACKEND_CAPABILITY_IDEMPOTENCY_HEADER]: idempotencyKey,
        },
        body: JSON.stringify(envelope),
      }
    );

    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toMatchObject({
      outcome: "rejected",
      retryable: true,
      errorCode: "DURABLE_QUEUE_EXECUTOR_NOT_READY",
    });
    expect(durableQueuePort.submit).not.toHaveBeenCalled();
  });
});
