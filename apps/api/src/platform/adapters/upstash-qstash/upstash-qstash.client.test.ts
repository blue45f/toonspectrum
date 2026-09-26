import { describe, expect, it, vi } from "vitest";

import {
  UPSTASH_QSTASH_CONTRACT_VERSION,
  UpstashQStashDurableQueuePort,
  type UpstashQStashRuntime,
} from "./upstash-qstash.client";
import { UpstashQStashDeliverySchema } from "./upstash-qstash.contract";

import type { UpstashQStashConfig } from "./upstash-qstash.config";
import type { BackendCapabilityDurableQueueCommand } from "../backend-capabilities/backend-capability-durable-queue.port";

const config: UpstashQStashConfig = {
  apiBaseUrl: "https://qstash.upstash.io",
  publishToken: "server-only-qstash-publish-token",
  urlGroup: "toonspectrum-durable-v1",
  timeoutMs: 2_500,
  deliveryTimeoutSeconds: 30,
  retries: 3,
  maximumRequestBytes: 256 * 1_024,
  maximumResponseBytes: 32 * 1_024,
};

const command: BackendCapabilityDurableQueueCommand = {
  providerId: "upstash-qstash",
  tenantId: "tenant-1",
  workload: "cleanup",
  idempotencyKey: "cleanup:work-1:revision-4",
  createdAt: "2026-08-02T00:00:00.000Z",
  task: {
    name: "assets.expire-orphans",
    body: { workId: "work-1", revision: 4 },
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function port(fetch: UpstashQStashRuntime["fetch"]) {
  return new UpstashQStashDurableQueuePort(config, { fetch });
}

describe("Upstash QStash durable queue adapter", () => {
  it("requires the configured URL group to exist with at least one HTTPS endpoint", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({
        name: config.urlGroup,
        endpoints: [
          {
            name: "worker",
            url: "https://worker.example/api/qstash",
          },
        ],
      })
    );

    await expect(port(fetch).verifyReadiness()).resolves.toEqual({
      ready: true,
      providerIds: ["upstash-qstash"],
      workloads: ["cleanup", "notification"],
    });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://qstash.upstash.io/v2/topics/toonspectrum-durable-v1"
    );
    expect(init?.redirect).toBe("error");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${config.publishToken}`
    );
  });

  it("fails readiness closed for a missing group or insecure endpoint", async () => {
    await expect(
      port(async () => jsonResponse({ error: "missing" }, 404)).verifyReadiness()
    ).resolves.toEqual({ ready: false, reason: "not-configured" });
    await expect(
      port(async () =>
        jsonResponse({
          name: config.urlGroup,
          endpoints: [{ url: "http://worker.example/queue" }],
        })
      ).verifyReadiness()
    ).resolves.toEqual({ ready: false, reason: "unsupported" });
  });

  it("publishes an exact versioned command with bounded retry and redaction headers", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({ messageId: "msg_123", deduplicated: false })
    );

    const result = await port(fetch).submit(command);
    expect(result).toMatchObject({
      outcome: "accepted",
      jobId: expect.stringMatching(/^qstash:[a-f0-9]{64}$/u),
    });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://qstash.upstash.io/v2/publish/toonspectrum-durable-v1"
    );
    expect(init?.credentials).toBe("omit");
    expect(init?.redirect).toBe("error");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(
      `Bearer ${config.publishToken}`
    );
    expect(headers.get("upstash-redact-fields")).toBe("body");
    expect(headers.get("upstash-retries")).toBe("3");
    expect(headers.get("upstash-timeout")).toBe("30s");
    expect(headers.get("upstash-deduplication-id")).toMatch(
      /^[a-f0-9]{64}$/u
    );

    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      contractVersion: UPSTASH_QSTASH_CONTRACT_VERSION,
      providerId: "upstash-qstash",
      tenantId: "tenant-1",
      workload: "cleanup",
      idempotencyKey: command.idempotencyKey,
      task: command.task,
    });
    expect(UpstashQStashDeliverySchema.safeParse(body).success).toBe(true);
    expect(JSON.stringify(body)).not.toContain(config.publishToken);
  });

  it("rejects unsupported or workload-mismatched tasks before publishing", async () => {
    const fetch = vi.fn();
    await expect(
      port(fetch).submit({
        ...command,
        task: { name: "arbitrary.execute", body: { workId: "work-1" } },
      })
    ).resolves.toEqual({
      outcome: "rejected",
      retryable: false,
      errorCode: "QSTASH_INVALID_COMMAND",
    });
    await expect(
      port(fetch).submit({
        ...command,
        workload: "notification",
        task: command.task,
      })
    ).resolves.toEqual({
      outcome: "rejected",
      retryable: false,
      errorCode: "QSTASH_INVALID_COMMAND",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps QStash deduplication to the same deterministic logical job", async () => {
    const accepted = await port(async () =>
      jsonResponse({ messageId: "msg_original", deduplicated: false })
    ).submit(command);
    const duplicate = await port(async () =>
      jsonResponse({ messageId: "msg_original", deduplicated: true }, 202)
    ).submit(command);

    expect(accepted.outcome).toBe("accepted");
    expect(duplicate).toEqual({
      outcome: "duplicate",
      jobId:
        accepted.outcome === "accepted" ? accepted.jobId : "unreachable",
    });
  });

  it("accepts URL-group fan-out responses but returns one logical job ID", async () => {
    await expect(
      port(async () =>
        jsonResponse([
          { messageId: "msg_a", deduplicated: false },
          { messageId: "msg_b", deduplicated: false },
        ])
      ).submit(command)
    ).resolves.toMatchObject({
      outcome: "accepted",
      jobId: expect.stringMatching(/^qstash:[a-f0-9]{64}$/u),
    });
  });

  it("treats a partially deduplicated URL-group fan-out as accepted", async () => {
    await expect(
      port(async () =>
        jsonResponse([
          { messageId: "msg_existing", deduplicated: true },
          { messageId: "msg_new", deduplicated: false },
        ])
      ).submit(command)
    ).resolves.toMatchObject({
      outcome: "accepted",
      jobId: expect.stringMatching(/^qstash:[a-f0-9]{64}$/u),
    });
  });

  it("rejects oversized commands before a remote call", async () => {
    const fetch = vi.fn();
    const constrained = new UpstashQStashDurableQueuePort(
      { ...config, maximumRequestBytes: 1_024 },
      { fetch }
    );
    const result = await constrained.submit({
      ...command,
      task: {
        ...command.task,
        body: { payload: "x".repeat(2_000) },
      },
    });
    expect(result).toEqual({
      outcome: "rejected",
      retryable: false,
      errorCode: "QSTASH_PAYLOAD_TOO_LARGE",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("classifies provider throttling as retryable and auth rejection as terminal", async () => {
    await expect(
      port(async () => jsonResponse({ error: "limited" }, 429)).submit(command)
    ).resolves.toEqual({
      outcome: "rejected",
      retryable: true,
      errorCode: "QSTASH_TEMPORARILY_UNAVAILABLE",
    });
    await expect(
      port(async () => jsonResponse({ error: "unauthorized" }, 401)).submit(
        command
      )
    ).resolves.toEqual({
      outcome: "rejected",
      retryable: false,
      errorCode: "QSTASH_REJECTED",
    });
  });

  it("does not let provider-controlled response cancellation exceed the call budget", async () => {
    const cancellationNeverSettles = new Promise<void>(() => undefined);
    await expect(
      port(async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            cancel: async () => cancellationNeverSettles,
          }),
          { status: 429, headers: { "content-type": "application/json" } }
        )
      ).submit(command)
    ).resolves.toEqual({
      outcome: "rejected",
      retryable: true,
      errorCode: "QSTASH_TEMPORARILY_UNAVAILABLE",
    });
  });

  it("rejects invalid or oversized response bodies without reflecting provider data", async () => {
    await expect(
      port(async () =>
        new Response("not-json", {
          status: 200,
          headers: { "content-type": "text/plain" },
        })
      ).submit(command)
    ).resolves.toEqual({
      outcome: "rejected",
      retryable: true,
      errorCode: "QSTASH_INVALID_RESPONSE",
    });

    const oversized = new UpstashQStashDurableQueuePort(
      { ...config, maximumResponseBytes: 1_024 },
      {
        fetch: async () =>
          jsonResponse({ messageId: `m${"x".repeat(2_000)}` }),
      }
    );
    await expect(oversized.submit(command)).resolves.toEqual({
      outcome: "rejected",
      retryable: true,
      errorCode: "QSTASH_INVALID_RESPONSE",
    });
  });

  it("rejects undocumented success statuses and contradictory duplicate responses", async () => {
    await expect(
      port(async () =>
        jsonResponse({ messageId: "msg_created", deduplicated: false }, 201)
      ).submit(command)
    ).resolves.toEqual({
      outcome: "rejected",
      retryable: true,
      errorCode: "QSTASH_INVALID_RESPONSE",
    });

    await expect(
      port(async () =>
        jsonResponse({ messageId: "msg_not_duplicate", deduplicated: false }, 202)
      ).submit(command)
    ).resolves.toEqual({
      outcome: "rejected",
      retryable: true,
      errorCode: "QSTASH_INVALID_RESPONSE",
    });
  });

  it("does not invoke the provider for an already-aborted call", async () => {
    const fetch = vi.fn();
    const controller = new AbortController();
    controller.abort(new Error("caller stopped"));

    await expect(port(fetch).submit(command, { signal: controller.signal })).resolves.toEqual({
      outcome: "rejected",
      retryable: true,
      errorCode: "QSTASH_UNREACHABLE",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("enforces its timeout even when the injected fetch ignores AbortSignal", async () => {
    const neverSettles = new Promise<Response>(() => undefined);
    const constrained = new UpstashQStashDurableQueuePort(
      { ...config, timeoutMs: 100 },
      { fetch: async () => neverSettles }
    );

    await expect(constrained.submit(command)).resolves.toEqual({
      outcome: "rejected",
      retryable: true,
      errorCode: "QSTASH_UNREACHABLE",
    });
  });

  it("enforces its timeout while reading a stalled provider response body", async () => {
    const constrained = new UpstashQStashDurableQueuePort(
      { ...config, timeoutMs: 100 },
      {
        fetch: async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('{"messageId":'));
              },
            }),
            { headers: { "content-type": "application/json" } }
          ),
      }
    );

    await expect(constrained.submit(command)).resolves.toEqual({
      outcome: "rejected",
      retryable: true,
      errorCode: "QSTASH_UNREACHABLE",
    });
  });

  it("cancels a provider response that arrives after caller abort", async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    let cancelled = false;
    const fetch = vi.fn(
      async () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        })
    );
    const controller = new AbortController();
    const submission = port(fetch).submit(command, { signal: controller.signal });

    controller.abort(new Error("caller stopped"));
    await expect(submission).resolves.toEqual({
      outcome: "rejected",
      retryable: true,
      errorCode: "QSTASH_UNREACHABLE",
    });

    resolveResponse?.(
      new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "content-type": "application/json" } }
      )
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(cancelled).toBe(true);
  });
});
