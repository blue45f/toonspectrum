import { describe, expect, it } from "vitest";

import {
  REALTIME_TICKET_PROTOCOL_PREFIX,
  REALTIME_WEBSOCKET_PROTOCOL,
} from "./protocol";
import {
  REALTIME_TICKET_VERSION,
  extractRealtimeTicketFromSubprotocols,
  signRealtimeTicket,
  verifyRealtimeTicket,
  type RealtimeTicketClaims,
} from "./ticket";

const SECRET = "0123456789abcdef0123456789abcdef"; // gitleaks:allow -- deterministic unit-test fixture
const NOW = 1_700_000_000_000;

function claims(
  overrides: Partial<RealtimeTicketClaims> = {},
): RealtimeTicketClaims {
  return {
    version: REALTIME_TICKET_VERSION,
    issuer: "toonspectrum-api",
    audience: "toonspectrum-realtime",
    subject: "artist-1",
    sessionVersion: 4,
    authorizationEpochMs: NOW - 5_000,
    workId: "work-1",
    roomId: "room-1",
    clientId: "client-1",
    origin: "https://toonstudio.cloud",
    scopes: ["presence", "comments", "screen-signaling"],
    nonce: "nonce_0123456789abcdef",
    issuedAtMs: NOW - 1_000,
    expiresAtMs: NOW + 60_000,
    sessionExpiresAtMs: NOW + 4 * 60 * 1000,
    ...overrides,
  };
}

const expectation = {
  issuer: "toonspectrum-api",
  audience: "toonspectrum-realtime",
  workId: "work-1",
  roomId: "room-1",
  origin: "https://toonstudio.cloud",
  nowMs: NOW,
} as const;

describe("realtime HMAC ticket", () => {
  it("signs and verifies canonical short-lived bound claims", async () => {
    const ticket = await signRealtimeTicket(claims(), SECRET);

    await expect(
      verifyRealtimeTicket(ticket, SECRET, expectation),
    ).resolves.toEqual({ ok: true, claims: claims() });
    await expect(
      verifyRealtimeTicket(
        ticket,
        new TextEncoder().encode(SECRET),
        expectation,
      ),
    ).resolves.toEqual({ ok: true, claims: claims() });
  });

  it("rejects signature tampering without reflecting token material", async () => {
    const ticket = await signRealtimeTicket(claims(), SECRET);
    const tampered = `${ticket.slice(0, -1)}${ticket.endsWith("A") ? "B" : "A"}`;

    await expect(
      verifyRealtimeTicket(tampered, SECRET, expectation),
    ).resolves.toEqual({ ok: false, code: "invalid-signature" });
  });

  it("binds tickets to issuer, audience, work, room and exact origin", async () => {
    const ticket = await signRealtimeTicket(claims(), SECRET);

    await expect(
      verifyRealtimeTicket(ticket, SECRET, {
        ...expectation,
        issuer: "other-api",
      }),
    ).resolves.toEqual({ ok: false, code: "binding-mismatch" });
    await expect(
      verifyRealtimeTicket(ticket, SECRET, {
        ...expectation,
        audience: "other-realtime",
      }),
    ).resolves.toEqual({ ok: false, code: "binding-mismatch" });
    await expect(
      verifyRealtimeTicket(ticket, SECRET, {
        ...expectation,
        workId: "work-2",
      }),
    ).resolves.toEqual({ ok: false, code: "binding-mismatch" });
    await expect(
      verifyRealtimeTicket(ticket, SECRET, {
        ...expectation,
        roomId: "room-2",
      }),
    ).resolves.toEqual({ ok: false, code: "binding-mismatch" });
    await expect(
      verifyRealtimeTicket(ticket, SECRET, {
        ...expectation,
        origin: "https://www.toonstudio.cloud",
      }),
    ).resolves.toEqual({ ok: false, code: "binding-mismatch" });
  });

  it("rejects expired and not-yet-valid tickets", async () => {
    const expired = await signRealtimeTicket(
      claims({
        authorizationEpochMs: NOW - 121_000,
        issuedAtMs: NOW - 120_000,
        expiresAtMs: NOW - 1,
        sessionExpiresAtMs: NOW + 60_000,
      }),
      SECRET,
    );
    await expect(
      verifyRealtimeTicket(expired, SECRET, expectation),
    ).resolves.toEqual({ ok: false, code: "expired" });

    const future = await signRealtimeTicket(
      claims({
        issuedAtMs: NOW + 30_000,
        expiresAtMs: NOW + 60_000,
      }),
      SECRET,
    );
    await expect(
      verifyRealtimeTicket(future, SECRET, expectation),
    ).resolves.toEqual({ ok: false, code: "not-yet-valid" });
  });

  it("fails closed when the HMAC secret is too short", async () => {
    const ticket = await signRealtimeTicket(claims(), SECRET);

    await expect(
      verifyRealtimeTicket(ticket, "too-short", expectation),
    ).resolves.toEqual({ ok: false, code: "invalid-secret" });
  });

  it("requires a positive signed source-session version", async () => {
    await expect(
      signRealtimeTicket(claims({ sessionVersion: 0 }), SECRET),
    ).rejects.toThrow("Invalid realtime ticket claims");
  });

  it("rejects an ACL authorization epoch later than ticket issuance", async () => {
    await expect(
      signRealtimeTicket(
        claims({
          authorizationEpochMs: NOW,
          issuedAtMs: NOW - 1,
        }),
        SECRET,
      ),
    ).rejects.toThrow("Invalid realtime ticket claims");
  });

  it("extracts a ticket only from the exact two-subprotocol handshake", () => {
    const ticket = "payload.signature";
    expect(
      extractRealtimeTicketFromSubprotocols(
        `${REALTIME_WEBSOCKET_PROTOCOL}, ${REALTIME_TICKET_PROTOCOL_PREFIX}${ticket}`,
      ),
    ).toEqual({ ok: true, ticket });

    expect(
      extractRealtimeTicketFromSubprotocols(
        `${REALTIME_TICKET_PROTOCOL_PREFIX}${ticket}`,
      ),
    ).toEqual({ ok: false });
    expect(
      extractRealtimeTicketFromSubprotocols(
        `${REALTIME_WEBSOCKET_PROTOCOL}, ${REALTIME_TICKET_PROTOCOL_PREFIX}${ticket}, extra`,
      ),
    ).toEqual({ ok: false });
  });
});
