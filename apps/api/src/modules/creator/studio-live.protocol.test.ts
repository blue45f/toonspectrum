import { describe, expect, expectTypeOf, it } from "vitest";

import * as gatewayCompatibility from "./studio-live.gateway";
import * as protocol from "./studio-live.protocol";

import type {
  StudioLiveAck,
  StudioLiveAuthPrincipal,
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
  });

  it("owns strict public participant and inter-server relay wire contracts", () => {
    expect(protocol.StudioLivePublicParticipantSchema.safeParse(publicParticipant).success).toBe(
      true
    );
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
