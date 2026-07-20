import { describe, expect, expectTypeOf, it } from "vitest";

import * as gatewayCompatibility from "./studio-live.gateway";
import * as protocol from "./studio-live.protocol";

import type {
  StudioLiveAck,
  StudioLiveAuthPrincipal,
  StudioLiveLockUpdate,
  StudioLiveParticipant,
  StudioLiveSessionAuthenticator,
  StudioLiveSessionRevalidator,
} from "./studio-live.protocol";

const publicParticipant = {
  connectionId: "socket-1",
  clientInstanceId: "client-1",
  name: "작가",
  role: "editor",
  capabilities: {
    view: true,
    comment: true,
    edit: true,
    manageMembers: false,
  },
  state: "active",
  pageId: "page-1",
  tool: "brush",
  sharingScreen: false,
  joinedAt: "2026-07-19T01:02:03.000Z",
  updatedAt: "2026-07-19T01:02:04.000Z",
} as const satisfies StudioLiveParticipant;

describe("studio live protocol module", () => {
  it("pins advanced drawing-assist rooms to CRDT protocol v4", () => {
    expect(protocol.STUDIO_CRDT_PROTOCOL_VERSION).toBe(4);
    expect(protocol.STUDIO_LIVE_LOCK_PROTOCOL_VERSION).toBe(2);
  });

  it("validates v2 renewal fences and correlated release requests strictly", () => {
    const renewal = {
      workId: "work-1",
      resourceId: "page:page-1",
      protocolVersion: 2,
      requestId: "00000000-0000-4000-8000-000000000001",
      renewLeaseId: "lease-1",
      leaseMs: 15_000,
    };
    expect(protocol.StudioLiveLockRequestSchema.safeParse(renewal).success).toBe(true);
    expect(
      protocol.StudioLiveLockRequestSchema.safeParse({ ...renewal, renewLeaseId: "x".repeat(81) })
        .success
    ).toBe(false);
    expect(
      protocol.StudioLiveLockRequestSchema.safeParse({ ...renewal, protocolVersion: 1 }).success
    ).toBe(false);
    const { protocolVersion: _protocolVersion, ...renewalWithoutVersion } = renewal;
    expect(
      protocol.StudioLiveLockRequestSchema.safeParse(renewalWithoutVersion).success
    ).toBe(false);
    const { requestId: _requestId, ...v2WithoutRequestId } = renewal;
    expect(
      protocol.StudioLiveLockRequestSchema.safeParse(v2WithoutRequestId).success
    ).toBe(false);

    const release = {
      workId: "work-1",
      resourceId: "page:page-1",
      leaseId: "lease-2",
      requestId: "00000000-0000-4000-8000-000000000002",
    };
    expect(protocol.StudioLiveLockReleaseSchema.safeParse(release).success).toBe(true);
    expect(
      protocol.StudioLiveLockReleaseSchema.safeParse({ ...release, requestId: "not-a-uuid" })
        .success
    ).toBe(false);
    expect(
      protocol.StudioLiveLockReleaseSchema.safeParse({ ...release, internalNonce: "private" })
        .success
    ).toBe(false);
  });

  it("owns strict public participant and inter-server relay wire contracts", () => {
    expect(protocol.StudioLivePublicParticipantSchema.safeParse(publicParticipant).success).toBe(
      true
    );
    expect(
      protocol.StudioLiveActiveScreenShareSchema.safeParse({
        connectionId: "socket-1",
        shareId: "share-1",
        label: "작업 화면",
      }).success
    ).toBe(true);
    expect(
      protocol.StudioLiveActiveScreenShareSchema.safeParse({
        connectionId: "socket-1",
        shareId: "share-1",
        label: "작업 화면",
        userId: "private-user-id",
      }).success
    ).toBe(false);
    expect(
      protocol.StudioLivePublicParticipantSchema.safeParse({
        ...publicParticipant,
        userId: "private-user-id",
      }).success
    ).toBe(false);

    const request = {
      workId: "work-1",
      targetConnectionId: "socket-2",
      deadlineAt: Date.now() + 2_000,
      sender: publicParticipant,
      relay: {
        type: "screen-request",
        shareId: "share-1",
      },
    } as const;
    expect(protocol.StudioLiveInterServerRelayRequestSchema.safeParse(request).success).toBe(true);
    expect(
      protocol.StudioLiveInterServerRelayRequestSchema.safeParse({
        ...request,
        relay: { ...request.relay, userId: "private-user-id" },
      }).success
    ).toBe(false);
  });

  it("keeps ACK and authentication contracts independently consumable", () => {
    expectTypeOf<StudioLiveAck<{ accepted: true }>>().toEqualTypeOf<
      | { ok: true; data: { accepted: true } }
      | {
          ok: false;
          code:
            | "unauthenticated"
            | "forbidden"
            | "invalid_payload"
            | "not_joined"
            | "rate_limited"
            | "lock_conflict"
            | "lock_stale"
            | "lock_limit"
            | "peer_unavailable"
            | "temporarily_unavailable"
            | "storage_corruption"
            | "internal_error";
          message: string;
        }
    >();
    expectTypeOf<StudioLiveSessionAuthenticator>().returns.resolves.toEqualTypeOf<
      StudioLiveAuthPrincipal | null
    >();
    expectTypeOf<StudioLiveSessionRevalidator>().returns.resolves.toBeBoolean();
    expectTypeOf<Extract<StudioLiveLockUpdate, { action: "released" }>>()
      .toHaveProperty("releaseRequestId");
    expectTypeOf<Extract<StudioLiveLockUpdate, { action: "expired" | "revoked" }>>()
      .not.toHaveProperty("releaseRequestId");

    expect(protocol.studioLiveSessionAuthenticatorProvider.provide).toBe(
      protocol.STUDIO_LIVE_SESSION_AUTHENTICATOR
    );
    expect(protocol.studioLiveSessionRevalidatorProvider.provide).toBe(
      protocol.STUDIO_LIVE_SESSION_REVALIDATOR
    );
  });

  it("preserves every pre-existing gateway value export as the same protocol singleton", () => {
    const compatibilityExports = [
      "STUDIO_LIVE_SESSION_AUTHENTICATOR",
      "STUDIO_LIVE_SESSION_REVALIDATOR",
      "StudioLiveChatSchema",
      "StudioLiveCrdtSyncSchema",
      "StudioLiveCrdtUpdateSchema",
      "StudioLiveCursorSchema",
      "StudioLiveJoinSchema",
      "StudioLiveLockReleaseSchema",
      "StudioLiveLockRequestSchema",
      "StudioLivePresenceSchema",
      "StudioLiveScreenAccessSchema",
      "StudioLiveScreenAnnounceSchema",
      "StudioLiveScreenRequestSchema",
      "StudioLiveScreenStateSchema",
      "StudioLiveScreenStopSchema",
      "StudioLiveSignalSchema",
      "StudioLiveVoiceJoinSchema",
      "StudioLiveVoiceLeaveSchema",
      "StudioLiveVoiceSignalSchema",
      "StudioLiveVoiceStateSchema",
      "studioLiveSessionAuthenticatorProvider",
      "studioLiveSessionRevalidatorProvider",
    ] as const;

    for (const exportName of compatibilityExports) {
      expect(gatewayCompatibility[exportName]).toBe(protocol[exportName]);
    }
  });
});
