import { createHash, createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  UpstashQStashReceiver,
  type UpstashQStashHandlers,
  type UpstashQStashReceiverConfig,
} from "./upstash-qstash.receiver";

import type { UpstashCoordinationPort } from "../upstash-coordination/upstash-coordination.port";

const now = 1_775_000_000;
const currentKey = "current-signing-key-that-is-long-enough";
const nextKey = "next-signing-key-that-is-also-long-enough";
const endpointUrl = "https://worker.example/queues/qstash/v1";

const config: UpstashQStashReceiverConfig = {
  endpointUrl,
  currentSigningKey: currentKey,
  nextSigningKey: nextKey,
  maximumBodyBytes: 16_384,
  clockToleranceSeconds: 5,
  handlerTimeoutMs: 1_000,
  pendingReceiptTtlMs: 60_000,
  completedReceiptTtlMs: 7 * 24 * 60 * 60_000,
};

const delivery = {
  contractVersion: "toonspectrum.backend-durable-queue.v1",
  providerId: "upstash-qstash",
  tenantId: "tenant-1",
  workload: "cleanup",
  idempotencyKey: "cleanup:work-1:revision-4",
  createdAt: "2026-04-01T00:00:00.000Z",
  task: {
    name: "assets.expire-orphans",
    body: { workId: "work-1", revision: 4 },
  },
} as const;

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(
  body: Uint8Array,
  overrides: Record<string, unknown> = {},
  key = currentKey
): string {
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    iss: "Upstash",
    sub: endpointUrl,
    exp: now + 60,
    nbf: now - 60,
    iat: now - 60,
    jti: "message-1",
    body: createHash("sha256").update(body).digest("base64url"),
    ...overrides,
  });
  const signed = `${header}.${payload}`;
  return `${signed}.${createHmac("sha256", key).update(signed).digest("base64url")}`;
}

function raw(value: unknown = delivery): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function dependencies() {
  const coordination = {
    ping: vi.fn(async () => true),
    reserveIdempotencyReceipt: vi.fn(async () => ({
      reserved: true,
      state: "pending" as const,
      remainingTtlMs: config.pendingReceiptTtlMs,
    })),
    completeIdempotencyReceipt: vi.fn(async () => ({
      outcome: "completed" as const,
    })),
  } as unknown as UpstashCoordinationPort;
  const handlers: UpstashQStashHandlers = {
    expireOrphanAssets: vi.fn(async () => undefined),
    publishComplete: vi.fn(async () => undefined),
  };
  const receiver = new UpstashQStashReceiver(
    config,
    coordination,
    handlers,
    {
      nowEpochSeconds: () => now,
      claimToken: () => "claim_token_that_is_long_enough_1234567890",
    }
  );
  return { receiver, coordination, handlers };
}

describe("Upstash QStash receiver boundary", () => {
  it("verifies the official HS256 claims and dispatches only the fixed cleanup handler", async () => {
    const { receiver, coordination, handlers } = dependencies();
    const body = raw();

    await expect(receiver.receive(sign(body), body)).resolves.toEqual({
      outcome: "accepted",
      idempotencyKey: delivery.idempotencyKey,
    });
    expect(handlers.expireOrphanAssets).toHaveBeenCalledOnce();
    expect(handlers.publishComplete).not.toHaveBeenCalled();
    expect(coordination.reserveIdempotencyReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "async-job",
        operation: "qstash.consume",
        ttlMs: config.pendingReceiptTtlMs,
      })
    );
    expect(coordination.completeIdempotencyReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ ttlMs: config.completedReceiptTtlMs })
    );
  });

  it("accepts the next signing key during key rotation", async () => {
    const { receiver } = dependencies();
    const body = raw();
    await expect(receiver.receive(sign(body, {}, nextKey), body)).resolves.toMatchObject({
      outcome: "accepted",
    });
  });

  it("rejects wrong signatures and expired messages before coordination", async () => {
    const wrong = dependencies();
    const body = raw();
    await expect(
      wrong.receiver.receive(sign(body, {}, "wrong-signing-key-that-is-long-enough"), body)
    ).resolves.toMatchObject({
      outcome: "rejected",
      errorCode: "QSTASH_INVALID_SIGNATURE",
    });
    expect(wrong.coordination.reserveIdempotencyReceipt).not.toHaveBeenCalled();

    const expired = dependencies();
    await expect(
      expired.receiver.receive(sign(body, { exp: now - 10 }), body)
    ).resolves.toMatchObject({
      outcome: "rejected",
      errorCode: "QSTASH_INVALID_SIGNATURE",
    });
    expect(expired.coordination.reserveIdempotencyReceipt).not.toHaveBeenCalled();
  });

  it("rejects malformed, oversized, and non-allowlisted bodies before dispatch", async () => {
    const malformed = dependencies();
    const malformedBody = new TextEncoder().encode("{not-json");
    await expect(
      malformed.receiver.receive(sign(malformedBody), malformedBody)
    ).resolves.toMatchObject({
      outcome: "rejected",
      errorCode: "QSTASH_INVALID_BODY",
    });

    const oversized = dependencies();
    const oversizedBody = new Uint8Array(config.maximumBodyBytes + 1);
    await expect(
      oversized.receiver.receive("not-even-a-jwt", oversizedBody)
    ).resolves.toMatchObject({
      outcome: "rejected",
      errorCode: "QSTASH_BODY_TOO_LARGE",
    });

    const unknown = dependencies();
    const unknownBody = raw({
      ...delivery,
      task: { name: "arbitrary.execute", body: { url: "https://evil.example" } },
    });
    await expect(
      unknown.receiver.receive(sign(unknownBody), unknownBody)
    ).resolves.toMatchObject({
      outcome: "rejected",
      errorCode: "QSTASH_INVALID_BODY",
    });
    expect(unknown.handlers.expireOrphanAssets).not.toHaveBeenCalled();
  });

  it("returns duplicate success for a durable completed receipt", async () => {
    const { receiver, coordination, handlers } = dependencies();
    vi.mocked(coordination.reserveIdempotencyReceipt).mockResolvedValueOnce({
      reserved: false,
      state: "completed",
      remainingTtlMs: 86_400_000,
    });
    const body = raw();
    await expect(receiver.receive(sign(body), body)).resolves.toEqual({
      outcome: "duplicate",
      idempotencyKey: delivery.idempotencyKey,
    });
    expect(handlers.expireOrphanAssets).not.toHaveBeenCalled();
  });

  it("rejects an idempotency-key replay carrying a different signed request", async () => {
    const { receiver, coordination, handlers } = dependencies();
    vi.mocked(coordination.reserveIdempotencyReceipt).mockResolvedValueOnce({
      reserved: false,
      state: "request-conflict",
      remainingTtlMs: 86_400_000,
    });
    const body = raw();
    await expect(receiver.receive(sign(body), body)).resolves.toMatchObject({
      outcome: "rejected",
      errorCode: "QSTASH_REPLAY_CONFLICT",
    });
    expect(handlers.expireOrphanAssets).not.toHaveBeenCalled();
  });

  it("fails readiness closed when durable coordination is unavailable", async () => {
    const { receiver, coordination } = dependencies();
    vi.mocked(coordination.ping).mockRejectedValueOnce(new Error("offline"));
    await expect(receiver.verifyReadiness()).resolves.toBe(false);
  });

  it("rejects invalid receiver configuration synchronously", () => {
    const { coordination, handlers } = dependencies();
    expect(
      () =>
        new UpstashQStashReceiver(
          { ...config, endpointUrl: "http://worker.example/qstash" },
          coordination,
          handlers
        )
    ).toThrow();
  });
});
