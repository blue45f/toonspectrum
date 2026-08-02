import { describe, expect, it } from "vitest";

import {
  REALTIME_CONTROL_MAX_AGE_MS,
  REALTIME_CONTROL_VERSION,
  signRealtimeControlEvent,
  verifyRealtimeControlEvent,
  type RealtimeControlEvent,
} from "./control";

const NOW = 1_700_000_000_000;
const SECRET = "0123456789abcdef0123456789abcdef"; // gitleaks:allow -- deterministic unit-test fixture

function event(
  overrides: Partial<RealtimeControlEvent> = {},
): RealtimeControlEvent {
  return {
    version: REALTIME_CONTROL_VERSION,
    kind: "session-version",
    actorId: "artist.control",
    minimumSessionVersion: 7,
    issuedAtMs: NOW,
    nonce: "00000000-0000-4000-8000-000000000001",
    ...overrides,
  } as RealtimeControlEvent;
}

describe("realtime revocation control HMAC", () => {
  it("round-trips with Node WebCrypto and browser-compatible base64 globals", async () => {
    expect(typeof crypto.subtle).toBe("object");
    expect(typeof btoa).toBe("function");
    expect(typeof atob).toBe("function");

    const signed = await signRealtimeControlEvent(event(), SECRET);

    await expect(
      verifyRealtimeControlEvent(
        signed.body,
        signed.headers,
        SECRET,
        NOW,
      ),
    ).resolves.toEqual({ ok: true, event: event() });
  });

  it("rejects body, header, and secret substitution without parsing trust", async () => {
    const signed = await signRealtimeControlEvent(event(), SECRET);
    const tamperedBody = new Uint8Array(signed.body);
    tamperedBody[tamperedBody.length - 2] ^= 1;

    await expect(
      verifyRealtimeControlEvent(
        tamperedBody,
        signed.headers,
        SECRET,
        NOW,
      ),
    ).resolves.toEqual({ ok: false, code: "invalid-signature" });
    await expect(
      verifyRealtimeControlEvent(
        signed.body,
        { ...signed.headers, nonce: crypto.randomUUID() },
        SECRET,
        NOW,
      ),
    ).resolves.toEqual({ ok: false, code: "invalid-signature" });
    await expect(
      verifyRealtimeControlEvent(
        signed.body,
        signed.headers,
        `${SECRET}-other`,
        NOW,
      ),
    ).resolves.toEqual({ ok: false, code: "invalid-signature" });
  });

  it("rejects expired and future control timestamps", async () => {
    const expiredEvent = event({
      issuedAtMs: NOW - REALTIME_CONTROL_MAX_AGE_MS - 1,
    });
    const expired = await signRealtimeControlEvent(expiredEvent, SECRET);
    await expect(
      verifyRealtimeControlEvent(
        expired.body,
        expired.headers,
        SECRET,
        NOW,
      ),
    ).resolves.toEqual({ ok: false, code: "expired" });

    const futureEvent = event({ issuedAtMs: NOW + 5_001 });
    const future = await signRealtimeControlEvent(futureEvent, SECRET);
    await expect(
      verifyRealtimeControlEvent(
        future.body,
        future.headers,
        SECRET,
        NOW,
      ),
    ).resolves.toEqual({ ok: false, code: "expired" });
  });
});
