import {
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import {
  DenyAllStudioRealtimeTicketAuthorization,
} from "./studio-realtime-ticket.authorization";
import { StudioRealtimeTicketService } from "./studio-realtime-ticket.service";

const REQUEST = {
  version: 1,
  providerId: "cloudflare-realtime-seoul",
  sessionId: "session-1",
  scope: { workId: "work-1", roomId: "room-1" },
  workloads: ["comments"],
  capabilities: [
    "comments.invalidation-v1",
    "comments.resume-v1",
  ],
} as const;
const ORIGIN = "https://www.toonstudio.cloud";
const PRINCIPAL = {
  userId: "commenter-1",
  sessionVersion: 7,
  expiresAt: 2_000_000_000_000,
} as const;
const ALLOWED = {
  ...REQUEST,
  allowed: true,
  actorUserId: "commenter-1",
  authorizationEpoch: "2026-07-31T00:59:59.000Z",
  origin: ORIGIN,
  role: "commenter",
  creatorCapabilities: {
    view: true,
    comment: true,
    edit: false,
    manageMembers: false,
  },
} as const;
const DESCRIPTOR = {
  providerId: REQUEST.providerId,
  provider: "cloudflare",
  audience: "toonspectrum-realtime",
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
} as const;

function harness(
  authorize: (input: unknown) => Promise<unknown>,
  signerOverrides: Partial<{
    descriptor: unknown;
    issue: (input: unknown) => Promise<unknown>;
  }> = {},
) {
  const issue = vi.fn(
    signerOverrides.issue ??
      (async () => ({
        ticket: `${"a".repeat(80)}.${"b".repeat(43)}`,
        issuedAt: "2026-07-31T01:00:00.000Z",
        expiresAt: "2026-07-31T01:02:00.000Z",
      })),
  );
  const signer = {
    descriptor: signerOverrides.descriptor ?? DESCRIPTOR,
    issue,
  };
  return {
    issue,
    service: new StudioRealtimeTicketService(
      { authorize } as never,
      [signer] as never,
    ),
  };
}

describe("StudioRealtimeTicketService", () => {
  it("authorizes and signs the exact provider, scope, workloads, capabilities, and origin", async () => {
    const authorize = vi.fn(async () => ALLOWED);
    const subject = harness(authorize);

    const response = await subject.service.issue(
      PRINCIPAL,
      ORIGIN,
      REQUEST,
    );

    expect(authorize).toHaveBeenCalledWith({
      ...REQUEST,
      actorUserId: "commenter-1",
      origin: ORIGIN,
    });
    expect(subject.issue).toHaveBeenCalledWith({
      actorUserId: "commenter-1",
      sessionVersion: PRINCIPAL.sessionVersion,
      authorizationEpochMs: Date.parse(ALLOWED.authorizationEpoch),
      sessionExpiresAtEpochMs: PRINCIPAL.expiresAt,
      sessionId: "session-1",
      scope: REQUEST.scope,
      workloads: REQUEST.workloads,
      capabilities: REQUEST.capabilities,
      origin: ORIGIN,
    });
    expect(response).toEqual({
      version: 1,
      providerId: REQUEST.providerId,
      scope: REQUEST.scope,
      workloads: REQUEST.workloads,
      capabilities: REQUEST.capabilities,
      ticket: `${"a".repeat(80)}.${"b".repeat(43)}`,
      issuedAt: "2026-07-31T01:00:00.000Z",
      expiresAt: "2026-07-31T01:02:00.000Z",
    });
  });

  it("fails closed when the creator ACL adapter is omitted", async () => {
    const denyAll = new DenyAllStudioRealtimeTicketAuthorization();
    const subject = harness((input) => denyAll.authorize(input as never));

    await expect(
      subject.service.issue(PRINCIPAL, ORIGIN, REQUEST),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(subject.issue).not.toHaveBeenCalled();
  });

  it("rejects mismatched bindings and prevents comment capability elevation", async () => {
    const mismatch = harness(
      vi.fn(async () => ({
        ...ALLOWED,
        scope: { ...ALLOWED.scope, roomId: "room-other" },
      })),
    );
    await expect(
      mismatch.service.issue(PRINCIPAL, ORIGIN, REQUEST),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mismatch.issue).not.toHaveBeenCalled();

    const viewer = harness(
      vi.fn(async () => ({
        ...ALLOWED,
        role: "viewer",
        creatorCapabilities: {
          ...ALLOWED.creatorCapabilities,
          comment: false,
        },
      })),
    );
    await expect(
      viewer.service.issue(PRINCIPAL, ORIGIN, REQUEST),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(viewer.issue).not.toHaveBeenCalled();
  });

  it("does not silently downgrade an incomplete provider contract", async () => {
    const subject = harness(
      vi.fn(async () => ALLOWED),
      {
        descriptor: {
          ...DESCRIPTOR,
          capabilities: ["comments.invalidation-v1"],
        },
      },
    );

    await expect(
      subject.service.issue(PRINCIPAL, ORIGIN, REQUEST),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(subject.issue).not.toHaveBeenCalled();
  });

  it("replaces authorization and signer internals with non-secret errors", async () => {
    const authorizationSecret = "postgres://private-creator-acl";
    const failedAuthorization = harness(
      vi.fn(async () => {
        throw new Error(authorizationSecret);
      }),
    );
    const authorizationError = await failedAuthorization.service
      .issue(PRINCIPAL, ORIGIN, REQUEST)
      .catch((error: unknown) => error);
    expect(authorizationError).toBeInstanceOf(ServiceUnavailableException);
    expect(String(authorizationError)).not.toContain(authorizationSecret);

    const signerSecret = "cloudflare-hmac-private";
    const failedSigner = harness(
      vi.fn(async () => ALLOWED),
      {
        issue: vi.fn(async () => {
          throw new Error(signerSecret);
        }),
      },
    );
    const signerError = await failedSigner.service
      .issue(PRINCIPAL, ORIGIN, REQUEST)
      .catch((error: unknown) => error);
    expect(signerError).toBeInstanceOf(ServiceUnavailableException);
    expect(String(signerError)).not.toContain(signerSecret);
  });
});
