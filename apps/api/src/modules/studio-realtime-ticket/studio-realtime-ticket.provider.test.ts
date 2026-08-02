import { describe, expect, it } from "vitest";

import {
  verifyRealtimeTicket,
} from "../../../../../deploy/cloudflare-realtime/src/ticket";

import {
  CloudflareStudioRealtimeTicketSigner,
  StudioRealtimeTicketSignerUnavailableError,
} from "./studio-realtime-ticket.provider";

import type {
  CloudflareStudioRealtimeTicketSignerConfiguration,
} from "./studio-realtime-ticket.configuration";

const NOW = Date.parse("2026-07-31T01:00:00.000Z");
const SECRET = "cloudflare-realtime-ticket-secret-2026-01";
const CONFIGURATION: CloudflareStudioRealtimeTicketSignerConfiguration = {
  providerId: "cloudflare-realtime-seoul",
  provider: "cloudflare",
  issuer: "toonspectrum-api",
  audience: "toonspectrum-realtime",
  hmacSecret: SECRET,
  ticketTtlSeconds: 120,
  sessionTtlSeconds: 5 * 60,
  workloads: ["presence", "comments", "screen-signaling"],
  capabilities: [
    "presence.snapshot-v1",
    "presence.members-v1",
    "presence.cursor-v1",
    "presence.resume-v1",
    "comments.invalidation-v1",
    "comments.resume-v1",
    "screen-signaling.session-v1",
    "screen-signaling.webrtc-v1",
    "screen-signaling.resume-v1",
  ],
};

function signer(
  configuration: CloudflareStudioRealtimeTicketSignerConfiguration =
    CONFIGURATION,
) {
  return new CloudflareStudioRealtimeTicketSigner(configuration, {
    nowEpochMs: () => NOW,
    createNonce: () => "7cf7f16e-944a-4b19-9a7c-745737294c21",
  });
}

describe("CloudflareStudioRealtimeTicketSigner", () => {
  it("issues a canonical two-part ticket accepted by the deployment verifier", async () => {
    const result = await signer().issue({
      actorUserId: "editor-1",
      sessionVersion: 7,
      sessionExpiresAtEpochMs: NOW + 60 * 60 * 1_000,
      sessionId: "session-1",
      scope: { workId: "work-1", roomId: "room-1" },
      workloads: ["comments", "screen-signaling"],
      capabilities: [
        "comments.invalidation-v1",
        "comments.resume-v1",
        "screen-signaling.session-v1",
        "screen-signaling.webrtc-v1",
      ],
      origin: "https://www.toonstudio.cloud",
    });
    const verified = await verifyRealtimeTicket(result.ticket, SECRET, {
      issuer: CONFIGURATION.issuer,
      audience: CONFIGURATION.audience,
      workId: "work-1",
      roomId: "room-1",
      origin: "https://www.toonstudio.cloud",
      nowMs: NOW,
    });

    expect(result.ticket.split(".")).toHaveLength(2);
    expect(verified.ok).toBe(true);
    if (!verified.ok) throw new Error("ticket fixture was not verified");
    expect(verified.claims).toMatchObject({
      subject: "editor-1",
      sessionVersion: 7,
      workId: "work-1",
      roomId: "room-1",
      clientId: "session-1",
      scopes: ["comments", "screen-signaling"],
      issuedAtMs: NOW,
      expiresAtMs: NOW + 120_000,
      sessionExpiresAtMs: NOW + 5 * 60 * 1_000,
    });
  });

  it("binds roomId independently and caps both ticket and session at the ACL lease", async () => {
    const authorizationExpiresAtEpochMs = NOW + 42_000;
    const result = await signer().issue({
      actorUserId: "commenter-1",
      sessionVersion: 3,
      sessionExpiresAtEpochMs: NOW + 60 * 60 * 1_000,
      sessionId: "session-1",
      scope: { workId: "work-1", roomId: "room-review" },
      workloads: ["comments"],
      capabilities: [
        "comments.invalidation-v1",
        "comments.resume-v1",
      ],
      origin: "https://www.toonstudio.cloud",
      authorizationExpiresAtEpochMs,
    });
    const verified = await verifyRealtimeTicket(result.ticket, SECRET, {
      issuer: CONFIGURATION.issuer,
      audience: CONFIGURATION.audience,
      workId: "work-1",
      roomId: "room-review",
      origin: "https://www.toonstudio.cloud",
      nowMs: NOW,
    });
    const wrongRoom = await verifyRealtimeTicket(result.ticket, SECRET, {
      issuer: CONFIGURATION.issuer,
      audience: CONFIGURATION.audience,
      workId: "work-1",
      roomId: "room-other",
      origin: "https://www.toonstudio.cloud",
      nowMs: NOW,
    });

    expect(verified.ok).toBe(true);
    if (!verified.ok) throw new Error("ticket fixture was not verified");
    expect(verified.claims.expiresAtMs).toBe(authorizationExpiresAtEpochMs);
    expect(verified.claims.sessionExpiresAtMs).toBe(
      authorizationExpiresAtEpochMs,
    );
    expect(wrongRoom).toEqual({ ok: false, code: "binding-mismatch" });
  });

  it("caps both the ticket and edge lease at the verified source session expiry", async () => {
    const sourceSessionExpiresAt = NOW + 90_000;
    const result = await signer().issue({
      actorUserId: "editor-2",
      sessionVersion: 11,
      sessionExpiresAtEpochMs: sourceSessionExpiresAt,
      sessionId: "session-2",
      scope: { workId: "work-2", roomId: "room-2" },
      workloads: ["presence"],
      capabilities: ["presence.snapshot-v1"],
      origin: "https://www.toonstudio.cloud",
    });
    const verified = await verifyRealtimeTicket(result.ticket, SECRET, {
      issuer: CONFIGURATION.issuer,
      audience: CONFIGURATION.audience,
      workId: "work-2",
      roomId: "room-2",
      origin: "https://www.toonstudio.cloud",
      nowMs: NOW,
    });

    expect(verified.ok).toBe(true);
    if (!verified.ok) throw new Error("ticket fixture was not verified");
    expect(verified.claims).toMatchObject({
      subject: "editor-2",
      sessionVersion: 11,
      expiresAtMs: sourceSessionExpiresAt,
      sessionExpiresAtMs: sourceSessionExpiresAt,
    });
  });

  it("keeps secrets out of the public descriptor and generic failures", () => {
    expect(JSON.stringify(signer().descriptor)).not.toContain(SECRET);

    const invalid = {
      ...CONFIGURATION,
      hmacSecret: "short",
    } as CloudflareStudioRealtimeTicketSignerConfiguration;
    expect(() => signer(invalid)).toThrow(
      StudioRealtimeTicketSignerUnavailableError,
    );
    try {
      signer(invalid);
    } catch (error) {
      expect(String(error)).not.toContain("short");
      expect(String(error)).not.toContain("hmacSecret");
    }
  });
});
