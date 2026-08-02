import { NestFactory } from "@nestjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BACKEND_CAPABILITY_DURABLE_QUEUE_PORT } from "../backend-capabilities/backend-capability-durable-queue.port";

import { UpstashQStashDurableQueuePort } from "./upstash-qstash.client";
import { UpstashQStashModule } from "./upstash-qstash.module";

describe("UpstashQStashModule", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("exports the concrete durable queue port to the Nest provider graph", () => {
    const dynamicModule = UpstashQStashModule.register(
      {
        apiBaseUrl: "https://qstash.upstash.io",
        publishToken: "server-only-qstash-publish-token",
        urlGroup: "toonspectrum-durable-v1",
        timeoutMs: 2_500,
        deliveryTimeoutSeconds: 30,
        retries: 3,
        maximumRequestBytes: 256 * 1_024,
        maximumResponseBytes: 32 * 1_024,
      },
      { fetch: async () => new Response(null, { status: 503 }) }
    );

    expect(dynamicModule.module).toBe(UpstashQStashModule);
    expect(dynamicModule.providers).toContain(UpstashQStashDurableQueuePort);
    expect(dynamicModule.providers).toContainEqual({
      provide: BACKEND_CAPABILITY_DURABLE_QUEUE_PORT,
      useExisting: UpstashQStashDurableQueuePort,
    });
    expect(dynamicModule.exports).toContain(
      BACKEND_CAPABILITY_DURABLE_QUEUE_PORT
    );
  });

  it("resolves the exported token through a real Nest application context", async () => {
    const application = await NestFactory.createApplicationContext(
      UpstashQStashModule.register(
        {
          apiBaseUrl: "https://qstash.upstash.io",
          publishToken: "server-only-qstash-publish-token",
          urlGroup: "toonspectrum-durable-v1",
          timeoutMs: 2_500,
          deliveryTimeoutSeconds: 30,
          retries: 3,
          maximumRequestBytes: 256 * 1_024,
          maximumResponseBytes: 32 * 1_024,
        },
        { fetch: async () => new Response(null, { status: 503 }) }
      ),
      { logger: false }
    );

    try {
      expect(application.get(BACKEND_CAPABILITY_DURABLE_QUEUE_PORT)).toBeInstanceOf(
        UpstashQStashDurableQueuePort
      );
    } finally {
      await application.close();
    }
  });

  it("rejects an unsafe hand-built origin before registering providers", () => {
    expect(() =>
      UpstashQStashModule.register({
        apiBaseUrl: "https://attacker.example",
        publishToken: "server-only-qstash-publish-token",
        urlGroup: "toonspectrum-durable-v1",
        timeoutMs: 2_500,
        deliveryTimeoutSeconds: 30,
        retries: 3,
        maximumRequestBytes: 256 * 1_024,
        maximumResponseBytes: 32 * 1_024,
      })
    ).toThrow("Upstash QStash durable queue configuration is invalid.");
  });

  it("wires the QStash port into the production backend capability module", async () => {
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          name: "toonspectrum-durable-v1",
          endpoints: [
            { name: "worker", url: "https://worker.example/queues/qstash/v1" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetch);
    const environment = {
      BACKEND_DISTRIBUTION_ENABLED: "true",
      BACKEND_UPSTASH_QSTASH_ENABLED: "true",
      BACKEND_UPSTASH_QSTASH_BASE_URL: "https://qstash-facade.example",
      BACKEND_UPSTASH_QSTASH_API_BASE_URL: "https://qstash.upstash.io",
      BACKEND_UPSTASH_QSTASH_AUTH_TOKEN:
        "gateway-admission-token-32-characters-minimum",
      BACKEND_UPSTASH_QSTASH_PUBLISH_TOKEN:
        "qstash-publish-token-32-characters-minimum",
      BACKEND_UPSTASH_QSTASH_URL_GROUP: "toonspectrum-durable-v1",
      BACKEND_UPSTASH_QSTASH_DAILY_REQUEST_BUDGET: "1000",
      BACKEND_UPSTASH_QSTASH_DAILY_COST_BUDGET: "1000",
      BACKEND_UPSTASH_QSTASH_MAX_EXECUTION_MS: "30000",
      BACKEND_UPSTASH_QSTASH_MAX_PAYLOAD_BYTES: "262144",
      BACKEND_UPSTASH_QSTASH_MAX_RESPONSE_BYTES: "32768",
      BACKEND_UPSTASH_QSTASH_MAX_CONCURRENCY: "8",
      BACKEND_CLEANUP_PROVIDER_ORDER: "upstash-qstash",
      BACKEND_NOTIFICATION_PROVIDER_ORDER: "upstash-qstash",
    } as const;
    for (const [key, value] of Object.entries(environment)) {
      vi.stubEnv(key, value);
    }
    vi.resetModules();

    const [backendModule, durableQueueContract, qstashClient, routerContract] =
      await Promise.all([
        import("../backend-capabilities/backend-capabilities.module"),
        import("../backend-capabilities/backend-capability-durable-queue.port"),
        import("./upstash-qstash.client"),
        import("../backend-capabilities/backend-capability-router"),
      ]);
    const application = await NestFactory.createApplicationContext(
      backendModule.BackendCapabilitiesModule,
      { logger: false }
    );

    try {
      const durableQueue = application.get(
        durableQueueContract.BACKEND_CAPABILITY_DURABLE_QUEUE_PORT
      );
      expect(durableQueue).toBeInstanceOf(
        qstashClient.UpstashQStashDurableQueuePort
      );
      await expect(durableQueue.verifyReadiness()).resolves.toMatchObject({
        ready: true,
      });
      expect(fetch).toHaveBeenCalledWith(
        "https://qstash.upstash.io/v2/topics/toonspectrum-durable-v1",
        expect.any(Object)
      );
      expect(
        application.get(routerContract.BACKEND_CAPABILITY_POLICY).providers[
          "upstash-qstash"
        ].baseUrl
      ).toBe("https://qstash-facade.example");
    } finally {
      await application.close();
    }
  });
});
