import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { createClient } from "redis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  UpstashRestCoordinationPort,
  type UpstashCoordinationRuntime,
} from "./upstash-coordination.client";

import type { UpstashCoordinationConfig } from "./upstash-coordination.config";

type RedisClient = ReturnType<typeof createClient>;

const redisIntegrationUrl = process.env.REDIS_INTEGRATION_URL?.trim();
const describeWithRedis = redisIntegrationUrl ? describe : describe.skip;

async function connectRedis(url: string): Promise<RedisClient> {
  const client = createClient({
    url,
    socket: {
      connectTimeout: 2_000,
      reconnectStrategy: false,
    },
  });
  client.on("error", () => {
    // Connection failures surface through awaited commands; avoid an EventEmitter crash.
  });
  await client.connect();
  return client;
}

async function closeRedis(client: RedisClient): Promise<void> {
  if (!client.isOpen) return;
  try {
    await client.quit();
  } catch {
    client.destroy();
  }
}

function createRedisRestAdapter(
  client: RedisClient,
  observedEvalKeys: Set<string>
): UpstashCoordinationRuntime["fetch"] {
  return async (_input, init) => {
    if (init?.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    if (init?.method !== "POST" || typeof init.body !== "string") {
      return new Response(JSON.stringify({ error: "invalid request" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const decoded: unknown = JSON.parse(init.body);
    if (
      !Array.isArray(decoded) ||
      decoded.length === 0 ||
      decoded.some(
        (part) => typeof part !== "string" && typeof part !== "number"
      )
    ) {
      return new Response(JSON.stringify({ error: "invalid command" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const command = decoded.map(String);
    if (command[0] === "EVAL" && command[2] === "1" && command[3]) {
      observedEvalKeys.add(command[3]);
    }
    const result = await client.sendCommand(command);
    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

async function waitForExpiry(
  client: RedisClient,
  key: string,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await client.exists(key)) === 0) return;
    await delay(25);
  }
  throw new Error("The Redis rate-limit key did not expire within the test budget.");
}

describeWithRedis("Upstash rate-limit production client with real Redis", () => {
  let firstConnection: RedisClient;
  let secondConnection: RedisClient;
  let inspectorConnection: RedisClient;
  const observedEvalKeys = new Set<string>();

  beforeAll(async () => {
    if (!redisIntegrationUrl) {
      throw new Error("REDIS_INTEGRATION_URL is required for this suite.");
    }
    [firstConnection, secondConnection, inspectorConnection] =
      await Promise.all([
        connectRedis(redisIntegrationUrl),
        connectRedis(redisIntegrationUrl),
        connectRedis(redisIntegrationUrl),
      ]);
  });

  afterAll(async () => {
    if (inspectorConnection?.isOpen && observedEvalKeys.size > 0) {
      await inspectorConnection.del([...observedEvalKeys]).catch(() => undefined);
    }
    await Promise.all(
      [firstConnection, secondConnection, inspectorConnection]
        .filter((client): client is RedisClient => Boolean(client))
        .map(closeRedis)
    );
  });

  it("shares one atomic fixed window across two instances without counting rejects", async () => {
    const namespace = `redis-integration-${randomUUID()}`;
    const config: UpstashCoordinationConfig = {
      restUrl: "https://redis-integration.invalid",
      restToken: "redis-integration-rest-token",
      keyHashSecret:
        "redis-integration-key-hash-secret-with-at-least-thirty-two-characters",
      namespace,
      timeoutMs: 5_000,
      maximumRequestBytes: 16 * 1_024,
      maximumResponseBytes: 32 * 1_024,
    };
    const firstClient = new UpstashRestCoordinationPort(config, {
      fetch: createRedisRestAdapter(firstConnection, observedEvalKeys),
    });
    const secondClient = new UpstashRestCoordinationPort(config, {
      fetch: createRedisRestAdapter(secondConnection, observedEvalKeys),
    });
    const input = {
      scope: "auth",
      subjectFingerprint: `sha256:${createHash("sha256")
        .update(randomUUID(), "utf8")
        .digest("hex")}`,
      maximumRequests: 17,
      windowMs: 1_000,
    } as const;

    const decisions = await Promise.all(
      Array.from({ length: 80 }, (_, index) =>
        (index % 2 === 0 ? firstClient : secondClient).consumeRateLimit(input)
      )
    );
    const accepted = decisions.filter((decision) => decision.accepted);
    const rejected = decisions.filter((decision) => !decision.accepted);

    expect(accepted).toHaveLength(input.maximumRequests);
    expect(rejected).toHaveLength(80 - input.maximumRequests);
    expect(Math.max(...accepted.map((decision) => decision.requestCount))).toBe(
      input.maximumRequests
    );
    expect(
      rejected.every(
        (decision) => decision.requestCount === input.maximumRequests
      )
    ).toBe(true);
    expect(observedEvalKeys).toHaveProperty("size", 1);

    const [rateLimitKey] = observedEvalKeys;
    if (!rateLimitKey) throw new Error("Expected one observed Redis EVAL key.");
    expect(await inspectorConnection.get(rateLimitKey)).toBe(
      String(input.maximumRequests)
    );
    const ttlBeforeReject = await inspectorConnection.pTTL(rateLimitKey);
    expect(ttlBeforeReject).toBeGreaterThan(0);
    expect(ttlBeforeReject).toBeLessThanOrEqual(input.windowMs);

    await expect(secondClient.consumeRateLimit(input)).resolves.toMatchObject({
      accepted: false,
      requestCount: input.maximumRequests,
    });
    expect(await inspectorConnection.get(rateLimitKey)).toBe(
      String(input.maximumRequests)
    );
    const ttlAfterReject = await inspectorConnection.pTTL(rateLimitKey);
    expect(ttlAfterReject).toBeGreaterThan(0);
    expect(ttlAfterReject).toBeLessThanOrEqual(ttlBeforeReject);

    await waitForExpiry(inspectorConnection, rateLimitKey, 3_000);
    await expect(firstClient.consumeRateLimit(input)).resolves.toMatchObject({
      accepted: true,
      requestCount: 1,
    });
    expect(await inspectorConnection.get(rateLimitKey)).toBe("1");
    const newWindowTtl = await inspectorConnection.pTTL(rateLimitKey);
    expect(newWindowTtl).toBeGreaterThan(0);
    expect(newWindowTtl).toBeLessThanOrEqual(input.windowMs);
  });
});
