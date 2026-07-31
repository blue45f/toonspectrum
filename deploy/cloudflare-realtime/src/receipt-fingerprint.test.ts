import { describe, expect, it } from "vitest";

import { createPublishReceiptFingerprints } from "./receipt-fingerprint";

describe("realtime teardown receipt fingerprints", () => {
  it("canonicalizes equivalent payloads to the same fixed-width request", async () => {
    const first = await createPublishReceiptFingerprints({
      idempotencyKey: "canonical-stop",
      actorId: "actor-canonical",
      clientId: "client-canonical",
      channel: "screen-signaling",
      payload: {
        kind: "signal.stop",
        shareId: "share-canonical",
      },
    });
    const second = await createPublishReceiptFingerprints({
      idempotencyKey: "canonical-stop",
      actorId: "actor-canonical",
      clientId: "client-canonical",
      channel: "screen-signaling",
      payload: {
        shareId: "share-canonical",
        kind: "signal.stop",
      },
    });

    expect(second).toEqual(first);
    expect(first.idempotencyFingerprint).toMatch(
      /^[0-9a-f]{64}$/u,
    );
    expect(first.requestFingerprint).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("shares the key lookup across users while binding the request to identity", async () => {
    const first = await createPublishReceiptFingerprints({
      idempotencyKey: "cross-user-stop",
      actorId: "actor-first",
      clientId: "client-first",
      channel: "screen-signaling",
      payload: {
        kind: "signal.stop",
        shareId: "share-first",
      },
    });
    const otherUser = await createPublishReceiptFingerprints({
      idempotencyKey: "cross-user-stop",
      actorId: "actor-other",
      clientId: "client-other",
      channel: "screen-signaling",
      payload: {
        kind: "signal.stop",
        shareId: "share-other",
      },
    });

    expect(otherUser.idempotencyFingerprint).toBe(
      first.idempotencyFingerprint,
    );
    expect(otherUser.requestFingerprint).not.toBe(
      first.requestFingerprint,
    );
  });
});
