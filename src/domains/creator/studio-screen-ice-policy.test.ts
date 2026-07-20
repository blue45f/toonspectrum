import { describe, expect, it, vi } from "vitest";

import { acquireStudioScreenIcePolicyLease } from "./studio-screen-ice-policy";

describe("studio screen ICE policy", () => {
  it("injects authenticated TURN configuration into screen-share peer connections", async () => {
    const createPeerConnection = vi.fn(
      () => ({ connectionState: "new" }) as unknown as RTCPeerConnection
    );
    const lease = await acquireStudioScreenIcePolicyLease("screen-work-a", {
      loadPolicy: async () => ({
        version: 1,
        mode: "turn",
        iceServers: [{
          urls: ["turn:screen.example.com?transport=udp"],
          username: "expires:opaque-user",
          credential: "temporary-credential",
          credentialType: "password",
        }],
        issuedAt: "2026-07-20T00:00:00.000Z",
        expiresAt: "2026-07-20T00:15:00.000Z",
        ttlSeconds: 900,
      }),
      createPeerConnection,
      now: () => 1_000,
      setTimer: () => 1 as unknown as ReturnType<typeof setTimeout>,
      clearTimer: vi.fn(),
    });

    expect(lease.mode).toBe("turn");
    lease.createPeerConnection();
    expect(createPeerConnection).toHaveBeenCalledWith({
      iceServers: [{
        urls: ["turn:screen.example.com?transport=udp"],
        username: "expires:opaque-user",
        credential: "temporary-credential",
        credentialType: "password",
      }],
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      iceTransportPolicy: "all",
      iceCandidatePoolSize: 0,
    });
    lease.close();
  });

  it("keeps the injectable loader seam for cancellation and boundary tests", async () => {
    const abortController = new AbortController();
    abortController.abort();
    const loadPolicy = vi.fn();

    await expect(acquireStudioScreenIcePolicyLease("screen-work-b", {
      signal: abortController.signal,
      loadPolicy,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(loadPolicy).not.toHaveBeenCalled();
  });
});
