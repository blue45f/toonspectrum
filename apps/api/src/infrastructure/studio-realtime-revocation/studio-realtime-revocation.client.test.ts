import { describe, expect, it, vi } from "vitest";

import {
  REALTIME_CONTROL_NONCE_HEADER,
  REALTIME_CONTROL_SIGNATURE_HEADER,
  REALTIME_CONTROL_TIMESTAMP_HEADER,
  verifyRealtimeControlEvent,
} from "../../../../../deploy/cloudflare-realtime/src/control";

import {
  StudioRealtimeRevocationService,
  StudioRealtimeRevocationUnavailableError,
} from "./studio-realtime-revocation.client";

const NOW = 1_700_000_000_000;
const CONTROL_SECRET = "control-secret-0123456789abcdef0123456789"; // gitleaks:allow -- deterministic unit-test fixture
const CONTROL_URL =
  "https://realtime.example.com/v1/control/revocations";

function response(
  status: number,
  body: Readonly<Record<string, unknown>>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

describe("Studio realtime revocation client", () => {
  it("retries transient failures with fresh signed nonces", async () => {
    const nonces = [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ];
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      requests.push({ input, init });
      return requests.length < 3
        ? response(503, { ok: false })
        : response(200, {
            ok: true,
            complete: true,
            roomsRevoked: 2,
            connectionsRevoked: 3,
          });
    });
    const service = new StudioRealtimeRevocationService(
      {
        enabled: true,
        controlUrl: CONTROL_URL,
        controlSecret: CONTROL_SECRET,
        timeoutMs: 3000,
      },
      {
        nowEpochMs: () => NOW,
        createNonce: () => nonces.shift() ?? crypto.randomUUID(),
        fetch: fetchMock,
      },
    );

    await expect(
      service.revokeSessionVersion("artist.control", 8),
    ).resolves.toEqual({
      enabled: true,
      roomsRevoked: 2,
      connectionsRevoked: 3,
    });
    expect(requests).toHaveLength(3);
    for (let index = 0; index < requests.length; index += 1) {
      const request = requests[index];
      expect(String(request?.input)).toBe(CONTROL_URL);
      const headers = new Headers(request?.init?.headers);
      const body = new Uint8Array(request?.init?.body as ArrayBuffer);
      await expect(
        verifyRealtimeControlEvent(
          body,
          {
            nonce: headers.get(REALTIME_CONTROL_NONCE_HEADER) ?? "",
            timestamp:
              headers.get(REALTIME_CONTROL_TIMESTAMP_HEADER) ?? "",
            signature:
              headers.get(REALTIME_CONTROL_SIGNATURE_HEADER) ?? "",
          },
          CONTROL_SECRET,
          NOW,
        ),
      ).resolves.toMatchObject({ ok: true });
    }
    expect(
      requests.map(
        ({ init }) =>
          new Headers(init?.headers).get(REALTIME_CONTROL_NONCE_HEADER),
      ),
    ).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ]);
  });

  it("does not retry authentication failures", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      response(401, { ok: false }),
    );
    const service = new StudioRealtimeRevocationService(
      {
        enabled: true,
        controlUrl: CONTROL_URL,
        controlSecret: CONTROL_SECRET,
        timeoutMs: 3000,
      },
      {
        nowEpochMs: () => NOW,
        createNonce: () => crypto.randomUUID(),
        fetch: fetchMock,
      },
    );

    await expect(
      service.revokeSessionVersion("artist.control", 8),
    ).rejects.toBeInstanceOf(StudioRealtimeRevocationUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when the control plane is disabled", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const service = new StudioRealtimeRevocationService(
      { enabled: false },
      {
        nowEpochMs: () => NOW,
        createNonce: () => crypto.randomUUID(),
        fetch: fetchMock,
      },
    );

    await expect(
      service.revokeSessionVersion("artist.control", 8),
    ).resolves.toEqual({
      enabled: false,
      roomsRevoked: 0,
      connectionsRevoked: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
