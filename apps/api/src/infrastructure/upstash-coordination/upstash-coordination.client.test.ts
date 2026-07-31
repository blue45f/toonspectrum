import { describe, expect, it, vi } from "vitest";

import {
  UpstashCoordinationError,
  UpstashRestCoordinationPort,
  type UpstashCoordinationRuntime,
} from "./upstash-coordination.client";

import type { UpstashCoordinationConfig } from "./upstash-coordination.config";

const config: UpstashCoordinationConfig = {
  restUrl: "https://coordination.example",
  restToken: "test-rest-token-with-sufficient-length",
  keyHashSecret:
    "test-key-hash-secret-with-at-least-thirty-two-characters",
  namespace: "toonspectrum-test",
  timeoutMs: 100,
  maximumRequestBytes: 16 * 1_024,
  maximumResponseBytes: 32 * 1_024,
};

function response(result: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify({ result }), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function createClient(
  implementation: UpstashCoordinationRuntime["fetch"]
): {
  client: UpstashRestCoordinationPort;
  fetchMock: ReturnType<typeof vi.fn<UpstashCoordinationRuntime["fetch"]>>;
} {
  const fetchMock = vi.fn<UpstashCoordinationRuntime["fetch"]>(implementation);
  return {
    client: new UpstashRestCoordinationPort(config, { fetch: fetchMock }),
    fetchMock,
  };
}

function commandFromCall(
  fetchMock: ReturnType<typeof vi.fn<UpstashCoordinationRuntime["fetch"]>>,
  call = 0
): unknown[] {
  const body = fetchMock.mock.calls[call]?.[1]?.body;
  if (typeof body !== "string") throw new Error("Expected a JSON command body.");
  return JSON.parse(body) as unknown[];
}

const leaseInput = {
  scope: "provider-dispatch",
  resourceId: "private-provider-resource-123",
  leaseToken: "private_lease_token_abcdefghijklmnopqrstuvwxyz",
  ttlMs: 30_000,
} as const;

const budgetInput = {
  providerId: "cloudflare",
  operationId: "private-dispatch-operation-123",
  requestUnits: 2,
  costUnits: 10,
  maximumRequestUnits: 100,
  maximumCostUnits: 1_000,
  expiryGraceMs: 3_600_000,
} as const;

describe("Upstash REST coordination port", () => {
  it("proves authenticated Redis reachability without touching coordination state", async () => {
    const { client, fetchMock } = createClient(async () => response("PONG"));

    await expect(client.ping()).resolves.toBe(true);
    expect(commandFromCall(fetchMock)).toEqual(["PING"]);
  });

  it("uses EVAL CAS leases with only HMAC-transformed keys and proofs", async () => {
    const { client, fetchMock } = createClient(async () =>
      response([1, 30_000])
    );

    await expect(client.acquireLease(leaseInput)).resolves.toEqual({
      acquired: true,
      remainingTtlMs: 30_000,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(config.restUrl);
    expect(init).toMatchObject({
      method: "POST",
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${config.restToken}`
    );

    const serialized = JSON.stringify(commandFromCall(fetchMock));
    const command = commandFromCall(fetchMock);
    expect(command[0]).toBe("EVAL");
    expect(String(command[1])).toContain('"NX"');
    expect(String(command[1])).toContain('"PX"');
    expect(serialized).not.toContain(leaseInput.resourceId);
    expect(serialized).not.toContain(leaseInput.leaseToken);
    expect(serialized).not.toContain(config.namespace);
    expect(serialized).not.toContain(config.keyHashSecret);
    expect(serialized).not.toContain(config.restToken);
  });

  it("maps lease renewal and release ownership mismatch without guessing success", async () => {
    const results = [
      response([1, 45_000]),
      response([0, 12_500]),
      response([1, -1]),
    ];
    const { client } = createClient(async () => {
      const next = results.shift();
      if (!next) throw new Error("Unexpected request.");
      return next;
    });

    await expect(
      client.renewLease({ ...leaseInput, ttlMs: 45_000 })
    ).resolves.toEqual({ matched: true, remainingTtlMs: 45_000 });
    await expect(client.releaseLease(leaseInput)).resolves.toEqual({
      matched: false,
      remainingTtlMs: 12_500,
    });
    await expect(client.releaseLease(leaseInput)).resolves.toEqual({
      matched: true,
      remainingTtlMs: null,
    });
  });

  it("binds metadata-only idempotency receipts to one immutable request", async () => {
    const results = [
      response([1, 1, 60_000]),
      response([0, 2, 55_000]),
      response([0, 3, 54_000]),
      response(1),
      response(2),
      response(-2),
      response(-1),
    ];
    const { client, fetchMock } = createClient(async () => {
      const next = results.shift();
      if (!next) throw new Error("Unexpected request.");
      return next;
    });
    const receipt = {
      scope: "async-job",
      operation: "thumbnail.render",
      idempotencyKey: "private-idempotency-key-123", // gitleaks:allow -- deterministic test fixture
      requestFingerprint: `sha256:${"a".repeat(64)}`,
      claimToken: "private_claim_token_abcdefghijklmnopqrstuvwxyz",
      ttlMs: 60_000,
    } as const;

    await expect(
      client.reserveIdempotencyReceipt(receipt)
    ).resolves.toEqual({
      reserved: true,
      state: "pending",
      remainingTtlMs: 60_000,
    });
    await expect(
      client.reserveIdempotencyReceipt(receipt)
    ).resolves.toEqual({
      reserved: false,
      state: "completed",
      remainingTtlMs: 55_000,
    });
    const conflictingRequest = {
      ...receipt,
      requestFingerprint: `sha256:${"c".repeat(64)}`,
    } as const;
    await expect(
      client.reserveIdempotencyReceipt(conflictingRequest)
    ).resolves.toEqual({
      reserved: false,
      state: "request-conflict",
      remainingTtlMs: 54_000,
    });
    const completion = {
      ...receipt,
      outcomeFingerprint: `sha256:${"b".repeat(64)}`,
    } as const;
    await expect(
      client.completeIdempotencyReceipt(completion)
    ).resolves.toEqual({ outcome: "completed" });
    await expect(
      client.completeIdempotencyReceipt(completion)
    ).resolves.toEqual({ outcome: "duplicate" });
    await expect(
      client.completeIdempotencyReceipt({
        ...completion,
        requestFingerprint: conflictingRequest.requestFingerprint,
      })
    ).resolves.toEqual({ outcome: "request-conflict" });
    await expect(
      client.completeIdempotencyReceipt(completion)
    ).resolves.toEqual({ outcome: "conflict" });

    const firstReserveCommand = commandFromCall(fetchMock, 0);
    const conflictingReserveCommand = commandFromCall(fetchMock, 2);
    // Request fingerprints are receipt values, never key dimensions.
    expect(firstReserveCommand[3]).toBe(conflictingReserveCommand[3]);
    expect(firstReserveCommand[5]).not.toBe(conflictingReserveCommand[5]);
    expect(String(firstReserveCommand[1])).toContain(
      "requestFingerprint ~= ARGV[2]"
    );
    expect(String(commandFromCall(fetchMock, 5)[1])).toContain(
      "requestFingerprint ~= ARGV[3]"
    );

    const allCommands = fetchMock.mock.calls
      .map((_, index) => JSON.stringify(commandFromCall(fetchMock, index)))
      .join("\n");
    expect(allCommands).not.toContain(receipt.idempotencyKey);
    expect(allCommands).not.toContain(receipt.claimToken);
    expect(allCommands).not.toContain(receipt.requestFingerprint);
    expect(allCommands).not.toContain(conflictingRequest.requestFingerprint);
    expect(allCommands).not.toContain(completion.outcomeFingerprint);

    const inconsistent = createClient(async () =>
      response([1, 3, 60_000])
    );
    await expect(
      inconsistent.client.reserveIdempotencyReceipt(receipt)
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("uses Redis TIME to atomically expose provider circuit and UTC-day budget decisions", async () => {
    const now = Date.UTC(2026, 6, 31, 12, 0, 0);
    const results = [
      response([3, now + 60_000, now]),
      response([3, now + 60_000, now + 1_000]),
      response([0, 0, now + 2_000]),
      response([1, 1, 7, 40, 20_665, 46_800_000]),
      response([2, 1, 7, 40, 20_665, 46_800_000]),
    ];
    const { client, fetchMock } = createClient(async () => {
      const next = results.shift();
      if (!next) throw new Error("Unexpected request.");
      return next;
    });

    await expect(
      client.recordProviderFailure({
        providerId: "cloudflare",
        failureThreshold: 3,
        cooldownMs: 60_000,
        stateTtlMs: 120_000,
      })
    ).resolves.toEqual({
      state: "open",
      consecutiveFailures: 3,
      openedUntilEpochMs: now + 60_000,
      observedAtEpochMs: now,
    });
    await expect(
      client.readProviderCircuit({ providerId: "cloudflare" })
    ).resolves.toMatchObject({ state: "open" });
    await expect(
      client.closeProviderCircuit({ providerId: "cloudflare" })
    ).resolves.toMatchObject({
      state: "closed",
      consecutiveFailures: 0,
    });

    await expect(client.consumeProviderBudget(budgetInput)).resolves.toEqual({
      accepted: true,
      duplicate: false,
      requestUnits: 7,
      costUnits: 40,
      windowId: "utc-day:20665",
      remainingTtlMs: 46_800_000,
    });
    await expect(client.consumeProviderBudget(budgetInput)).resolves.toEqual({
      accepted: true,
      duplicate: true,
      requestUnits: 7,
      costUnits: 40,
      windowId: "utc-day:20665",
      remainingTtlMs: 46_800_000,
    });

    const firstBudgetCommand = commandFromCall(fetchMock, 3);
    const duplicateBudgetCommand = commandFromCall(fetchMock, 4);
    expect(firstBudgetCommand[2]).toBe(1);
    expect(firstBudgetCommand[3]).toBe(duplicateBudgetCommand[3]);
    expect(String(firstBudgetCommand[1])).toContain(
      'redis.call("TIME")'
    );
    expect(String(firstBudgetCommand[1])).toContain(
      "math.floor(nowSeconds / 86400)"
    );
    expect(String(firstBudgetCommand[1])).toContain(
      'redis.call("PEXPIRE", KEYS[1], remainingTtlMs)'
    );
    expect(JSON.stringify(firstBudgetCommand)).not.toContain(
      budgetInput.operationId
    );
    expect(JSON.stringify(firstBudgetCommand)).not.toContain(
      budgetInput.providerId
    );
    expect(JSON.stringify(firstBudgetCommand)).not.toContain("2026-07-31");
    expect(firstBudgetCommand[9]).toBe(budgetInput.expiryGraceMs);
  });

  it("fails closed on malformed Redis budget decision tuples", async () => {
    const malformedResults = [
      [1, 1, 7, 40, 20_665],
      [3, 1, 7, 40, 20_665, 46_800_000],
      [1, 1, 7, 40, 20_665.5, 46_800_000],
      [1, 1, 7, 40, 20_665, -1],
      [1, 1, 7, 40, 20_665, 46_800_000, 1],
    ] as const;

    for (const malformed of malformedResults) {
      const { client } = createClient(async () => response(malformed));
      await expect(
        client.consumeProviderBudget(budgetInput)
      ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });

  it("rejects creator payload fields before any remote request", async () => {
    const { client, fetchMock } = createClient(async () =>
      response([1, 30_000])
    );

    await expect(
      client.acquireLease({
        ...leaseInput,
        assetBytes: "forbidden",
      } as never)
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed on non-exact, oversized and rejected responses", async () => {
    const scenarios = [
      new Response(JSON.stringify({ result: [1, 30_000], extra: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      new Response("x", {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-length": String(config.maximumResponseBytes + 1),
        },
      }),
      new Response(JSON.stringify({ error: "private remote detail" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    ];

    for (const remoteResponse of scenarios) {
      const { client } = createClient(async () => remoteResponse);
      await expect(client.acquireLease(leaseInput)).rejects.toBeInstanceOf(
        UpstashCoordinationError
      );
    }
  });

  it("honors external aborts and whole-response deadlines", async () => {
    const aborted = new AbortController();
    aborted.abort();
    const first = createClient(async () => response([1, 30_000]));
    await expect(
      first.client.acquireLease(leaseInput, { signal: aborted.signal })
    ).rejects.toMatchObject({ code: "ABORTED" });
    expect(first.fetchMock).not.toHaveBeenCalled();

    const timeoutConfig = { ...config, timeoutMs: 5 };
    const fetchMock = vi.fn<UpstashCoordinationRuntime["fetch"]>(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("transport aborted")),
            { once: true }
          );
        })
    );
    const client = new UpstashRestCoordinationPort(timeoutConfig, {
      fetch: fetchMock,
    });
    await expect(client.acquireLease(leaseInput)).rejects.toMatchObject({
      code: "TIMEOUT",
    });

    const stalledBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"result":'));
      },
    });
    const stalledClient = new UpstashRestCoordinationPort(timeoutConfig, {
      fetch: async () =>
        new Response(stalledBody, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    await expect(stalledClient.acquireLease(leaseInput)).rejects.toMatchObject({
      code: "TIMEOUT",
    });
  });
});
