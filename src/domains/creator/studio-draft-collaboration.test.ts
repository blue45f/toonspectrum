import { describe, expect, it } from "vitest";

import {
  STUDIO_DRAFT_COLLABORATION_POLICY,
  STUDIO_DRAFT_COLLABORATION_STORAGE_KEY,
  consumeStudioDraftCollaborationProvisionAttempt,
  createStudioDraftCollaborationPromotionRequest,
  createStudioDraftCollaborationProvisionRequest,
  loadOrCreateStudioDraftCollaborationIdentity,
  type StudioDraftCollaborationIdentity,
  type StudioDraftCollaborationTemporaryRoom,
} from "./studio-draft-collaboration";

const NOW = Date.parse("2026-07-26T00:00:00.000Z");
const UUIDS = {
  draftA: "11111111-1111-4111-8111-111111111111",
  draftB: "22222222-2222-4222-8222-222222222222",
  mutation: "33333333-3333-4333-8333-333333333333",
  room: "44444444-4444-4444-8444-444444444444",
} as const;

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    },
    value(key = STUDIO_DRAFT_COLLABORATION_STORAGE_KEY) {
      return entries.get(key) ?? null;
    },
  };
}

function identity(
  overrides: Partial<StudioDraftCollaborationIdentity> = {}
): StudioDraftCollaborationIdentity {
  return {
    version: 1,
    draftDocumentId: `draft_${UUIDS.draftA}`,
    documentScopeKey: "autosave:new-work",
    ownerScopeKey: "account-a",
    createdAt: new Date(NOW).toISOString(),
    lastOpenedAt: new Date(NOW).toISOString(),
    expiresAt: new Date(
      NOW + STUDIO_DRAFT_COLLABORATION_POLICY.localIdentityIdleTtlMs
    ).toISOString(),
    persistence: "persistent",
    ...overrides,
  };
}

function room(
  overrides: Partial<StudioDraftCollaborationTemporaryRoom> = {}
): StudioDraftCollaborationTemporaryRoom {
  return {
    version: 1,
    roomId: `draft-room_${UUIDS.room}`,
    provisionalWorkId: "saved-work-1",
    draftDocumentId: `draft_${UUIDS.draftA}`,
    ownerScopeKey: "account-a",
    graphRevision: 7,
    provisionedAt: new Date(NOW).toISOString(),
    expiresAt: new Date(
      NOW + STUDIO_DRAFT_COLLABORATION_POLICY.temporaryRoomIdleTtlMs
    ).toISOString(),
    ...overrides,
  };
}

describe("local Studio draft collaboration identity", () => {
  it("keeps one stable persisted identity for the same document and owner", () => {
    const storage = memoryStorage();
    const first = loadOrCreateStudioDraftCollaborationIdentity(storage, {
      documentScopeKey: "autosave:new-work",
      ownerScopeKey: "account-a",
      now: NOW,
      createUuid: () => UUIDS.draftA,
    });
    const second = loadOrCreateStudioDraftCollaborationIdentity(storage, {
      documentScopeKey: "autosave:new-work",
      ownerScopeKey: "account-a",
      now: NOW + 60_000,
      createUuid: () => {
        throw new Error("stable identity must not rotate");
      },
    });

    expect(second.draftDocumentId).toBe(first.draftDocumentId);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.lastOpenedAt).toBe(new Date(NOW + 60_000).toISOString());
    expect(second.persistence).toBe("persistent");
    expect(JSON.parse(storage.value() ?? "{}")).toMatchObject({
      version: 1,
      identities: [{ draftDocumentId: first.draftDocumentId }],
    });
  });

  it("isolates identities by both document and owner scope", () => {
    const storage = memoryStorage();
    const first = loadOrCreateStudioDraftCollaborationIdentity(storage, {
      documentScopeKey: "autosave:new-work",
      ownerScopeKey: "account-a",
      now: NOW,
      createUuid: () => UUIDS.draftA,
    });
    const second = loadOrCreateStudioDraftCollaborationIdentity(storage, {
      documentScopeKey: "autosave:new-work",
      ownerScopeKey: "account-b",
      now: NOW,
      createUuid: () => UUIDS.draftB,
    });

    expect(second.draftDocumentId).not.toBe(first.draftDocumentId);
    expect(JSON.parse(storage.value() ?? "{}").identities).toHaveLength(2);
  });

  it("rotates an expired identity and drops corrupt or oversized persisted input", () => {
    const storage = memoryStorage();
    storage.setItem(
      STUDIO_DRAFT_COLLABORATION_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        identities: [
          {
            draftDocumentId: `draft_${UUIDS.draftA}`,
            documentScopeKey: "autosave:new-work",
            ownerScopeKey: "account-a",
            createdAt: new Date(NOW - 10_000).toISOString(),
            lastOpenedAt: new Date(NOW - 5_000).toISOString(),
            expiresAt: new Date(NOW).toISOString(),
          },
        ],
      })
    );
    const rotated = loadOrCreateStudioDraftCollaborationIdentity(storage, {
      documentScopeKey: "autosave:new-work",
      ownerScopeKey: "account-a",
      now: NOW,
      createUuid: () => UUIDS.draftB,
    });
    expect(rotated.draftDocumentId).toBe(`draft_${UUIDS.draftB}`);

    storage.setItem(
      STUDIO_DRAFT_COLLABORATION_STORAGE_KEY,
      "x".repeat(STUDIO_DRAFT_COLLABORATION_POLICY.maxStorageBytes + 1)
    );
    const recovered = loadOrCreateStudioDraftCollaborationIdentity(storage, {
      documentScopeKey: "autosave:recovered",
      ownerScopeKey: "account-a",
      now: NOW,
      createUuid: () => UUIDS.draftA,
    });
    expect(recovered.draftDocumentId).toBe(`draft_${UUIDS.draftA}`);
  });

  it("returns an explicit memory-only identity when storage is blocked", () => {
    const blockedStorage = {
      getItem() {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem() {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    const result = loadOrCreateStudioDraftCollaborationIdentity(blockedStorage, {
      documentScopeKey: "autosave:new-work",
      ownerScopeKey: "account-a",
      now: NOW,
      createUuid: () => UUIDS.draftA,
    });

    expect(result.persistence).toBe("memory-only");
    expect(result.draftDocumentId).toBe(`draft_${UUIDS.draftA}`);
  });

  it("rejects whitespace-rewritten scope keys and invalid UUID generators", () => {
    expect(() =>
      loadOrCreateStudioDraftCollaborationIdentity(null, {
        documentScopeKey: " autosave:new-work",
        ownerScopeKey: "account-a",
        now: NOW,
        createUuid: () => UUIDS.draftA,
      })
    ).toThrow("문서 또는 소유자 범위");
    expect(() =>
      loadOrCreateStudioDraftCollaborationIdentity(null, {
        documentScopeKey: "autosave:new-work",
        ownerScopeKey: "account-a",
        now: NOW,
        createUuid: () => "predictable",
      })
    ).toThrow("올바른 UUID");
  });
});

describe("lazy draft collaboration provision and promotion contract", () => {
  it("builds an idempotent provision request only on explicit share or invite intent", () => {
    const request = createStudioDraftCollaborationProvisionRequest({
      identity: identity(),
      actorAuthScopeKey: "account-a",
      intent: "invite-member",
      initialSnapshotByteLength: 1_024,
      now: NOW + 1,
      createUuid: () => UUIDS.mutation,
    });

    expect(request).toEqual({
      version: 1,
      draftDocumentId: `draft_${UUIDS.draftA}`,
      ownerScopeKey: "account-a",
      intent: "invite-member",
      clientMutationId: UUIDS.mutation,
      initialSnapshotByteLength: 1_024,
      requestedAt: new Date(NOW + 1).toISOString(),
    });
  });

  it("fails closed for the wrong owner, expired identity, or oversized snapshot", () => {
    expect(() =>
      createStudioDraftCollaborationProvisionRequest({
        identity: identity(),
        actorAuthScopeKey: "account-b",
        intent: "share-link",
        initialSnapshotByteLength: 0,
        now: NOW,
      })
    ).toThrow("소유하지 않습니다");
    expect(() =>
      createStudioDraftCollaborationProvisionRequest({
        identity: identity({ expiresAt: new Date(NOW).toISOString() }),
        actorAuthScopeKey: "account-a",
        intent: "share-link",
        initialSnapshotByteLength: 0,
        now: NOW,
      })
    ).toThrow("만료");
    expect(() =>
      createStudioDraftCollaborationProvisionRequest({
        identity: identity(),
        actorAuthScopeKey: "account-a",
        intent: "share-link",
        initialSnapshotByteLength:
          STUDIO_DRAFT_COLLABORATION_POLICY.maxInitialSnapshotBytes + 1,
        now: NOW,
      })
    ).toThrow("허용 크기");
  });

  it("locally limits repeated provision clicks per owner and draft window", () => {
    let gate = null;
    for (
      let attempt = 0;
      attempt < STUDIO_DRAFT_COLLABORATION_POLICY.provisionAttemptsPerWindow;
      attempt += 1
    ) {
      const result = consumeStudioDraftCollaborationProvisionAttempt(gate, {
        identity: identity(),
        now: NOW + attempt,
      });
      expect(result.allowed).toBe(true);
      gate = result.next;
    }
    const limited = consumeStudioDraftCollaborationProvisionAttempt(gate, {
      identity: identity(),
      now: NOW + 10,
    });
    expect(limited.allowed).toBe(false);
    expect(limited.retryAfterMs).toBeGreaterThan(0);

    const reset = consumeStudioDraftCollaborationProvisionAttempt(limited.next, {
      identity: identity(),
      now: NOW + STUDIO_DRAFT_COLLABORATION_POLICY.provisionRateWindowMs,
    });
    expect(reset.allowed).toBe(true);
    expect(reset.next.attempts).toBe(1);
  });

  it("binds promotion to the same owner, draft, room and graph revision", () => {
    const request = createStudioDraftCollaborationPromotionRequest({
      identity: identity(),
      room: room(),
      actorAuthScopeKey: "account-a",
      targetWorkId: "saved-work-1",
      now: NOW + 1,
      createUuid: () => UUIDS.mutation,
    });

    expect(request).toMatchObject({
      draftDocumentId: `draft_${UUIDS.draftA}`,
      roomId: `draft-room_${UUIDS.room}`,
      ownerScopeKey: "account-a",
      targetWorkId: "saved-work-1",
      expectedGraphRevision: 7,
      clientMutationId: UUIDS.mutation,
    });
    expect(() =>
      createStudioDraftCollaborationPromotionRequest({
        identity: identity(),
        room: room({ draftDocumentId: `draft_${UUIDS.draftB}` }),
        actorAuthScopeKey: "account-a",
        targetWorkId: "saved-work-1",
        now: NOW + 1,
      })
    ).toThrow("승격할 수 없습니다");
    expect(() =>
      createStudioDraftCollaborationPromotionRequest({
        identity: identity(),
        room: room(),
        actorAuthScopeKey: "account-a",
        targetWorkId: "different-work",
        now: NOW + 1,
      })
    ).toThrow("승격할 수 없습니다");
  });
});
