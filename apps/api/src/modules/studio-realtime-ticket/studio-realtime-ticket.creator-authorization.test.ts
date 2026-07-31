import { describe, expect, it, vi } from "vitest";

import { CreatorCollaborationRepository } from "../creator/creator-collaboration.repository";

import {
  CreatorStudioRealtimeTicketAuthorization,
  isCanonicalCreatorStudioRealtimeScope,
} from "./studio-realtime-ticket.creator-authorization";

import type {
  StudioRealtimeTicketAuthorizationInput,
} from "./studio-realtime-ticket.authorization";

const ORIGIN = "https://www.toonstudio.cloud";
const PROVIDER_ID = "cloudflare-realtime-v1";

function request(
  overrides: Partial<StudioRealtimeTicketAuthorizationInput> = {},
): StudioRealtimeTicketAuthorizationInput {
  return {
    version: 1,
    actorUserId: "artist-1",
    providerId: PROVIDER_ID,
    sessionId: "session-1",
    scope: { workId: "work-1", roomId: "work-1" },
    workloads: ["presence", "comments", "screen-signaling"],
    capabilities: [
      "presence.snapshot-v1",
      "comments.invalidation-v1",
      "screen-signaling.session-v1",
    ],
    origin: ORIGIN,
    ...overrides,
  };
}

function repository(
  getAuthorization: ReturnType<typeof vi.fn>,
): CreatorCollaborationRepository {
  return {
    getAuthorization,
  } as unknown as CreatorCollaborationRepository;
}

function authorization(
  getAuthorization: ReturnType<typeof vi.fn>,
): CreatorStudioRealtimeTicketAuthorization {
  return new CreatorStudioRealtimeTicketAuthorization(
    repository(getAuthorization),
    {
      providerIds: [PROVIDER_ID],
      allowedOrigins: [ORIGIN],
    },
  );
}

describe("Creator Studio realtime room binding", () => {
  it("uses the work id as the canonical live room for saved and provisional works", () => {
    expect(
      isCanonicalCreatorStudioRealtimeScope({
        workId: "saved-work-1",
        roomId: "saved-work-1",
      }),
    ).toBe(true);
    expect(
      isCanonicalCreatorStudioRealtimeScope({
        workId: "22222222-2222-4222-8222-222222222222",
        roomId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toBe(true);
  });

  it("does not treat the draft provisioning lease id as a live room id", () => {
    expect(
      isCanonicalCreatorStudioRealtimeScope({
        workId: "22222222-2222-4222-8222-222222222222",
        roomId:
          "draft-room_11111111-1111-4111-8111-111111111111",
      }),
    ).toBe(false);
  });
});

describe("CreatorStudioRealtimeTicketAuthorization", () => {
  it("maps the transactionally fenced Creator ACL snapshot without widening it", async () => {
    const getAuthorization = vi.fn().mockResolvedValue({
      workId: "work-1",
      viewer: {
        userId: "artist-1",
        role: "commenter",
        status: "active",
        capabilities: {
          view: true,
          comment: true,
          edit: false,
          manageMembers: false,
        },
      },
      authorizationExpiresAt: "2026-08-01T00:00:00.000Z",
    });

    await expect(
      authorization(getAuthorization).authorize(request()),
    ).resolves.toEqual({
      allowed: true,
      ...request(),
      role: "commenter",
      creatorCapabilities: {
        view: true,
        comment: true,
        edit: false,
        manageMembers: false,
      },
      authorizationExpiresAt: "2026-08-01T00:00:00.000Z",
    });
    expect(getAuthorization).toHaveBeenCalledWith(
      "artist-1",
      "work-1",
    );
  });

  it.each([
    {
      label: "unknown provider",
      override: { providerId: "unknown-provider" },
    },
    {
      label: "unapproved origin",
      override: { origin: "https://attacker.example" },
    },
    {
      label: "missing browser origin",
      override: { origin: null },
    },
    {
      label: "non-canonical room",
      override: {
        scope: { workId: "work-1", roomId: "other-room" },
      },
    },
  ])("denies $label before touching the Creator ACL", async ({ override }) => {
    const getAuthorization = vi.fn();

    await expect(
      authorization(getAuthorization).authorize(request(override)),
    ).resolves.toEqual({ allowed: false });
    expect(getAuthorization).not.toHaveBeenCalled();
  });

  it("turns repository failures into a denial without reflecting the cause", async () => {
    const getAuthorization = vi
      .fn()
      .mockRejectedValue(new Error("database-secret-detail"));

    await expect(
      authorization(getAuthorization).authorize(request()),
    ).resolves.toEqual({ allowed: false });
  });

  it.each([
    {
      label: "pending member",
      snapshot: {
        workId: "work-1",
        viewer: {
          userId: "artist-1",
          role: "editor",
          status: "pending",
          capabilities: {
            view: true,
            comment: true,
            edit: true,
            manageMembers: false,
          },
        },
      },
    },
    {
      label: "viewer without view capability",
      snapshot: {
        workId: "work-1",
        viewer: {
          userId: "artist-1",
          role: "viewer",
          status: "active",
          capabilities: {
            view: false,
            comment: false,
            edit: false,
            manageMembers: false,
          },
        },
      },
    },
    {
      label: "mismatched work",
      snapshot: {
        workId: "work-2",
        viewer: {
          userId: "artist-1",
          role: "owner",
          status: "active",
          capabilities: {
            view: true,
            comment: true,
            edit: true,
            manageMembers: true,
          },
        },
      },
    },
  ])("denies a $label snapshot", async ({ snapshot }) => {
    await expect(
      authorization(vi.fn().mockResolvedValue(snapshot)).authorize(
        request(),
      ),
    ).resolves.toEqual({ allowed: false });
  });
});
