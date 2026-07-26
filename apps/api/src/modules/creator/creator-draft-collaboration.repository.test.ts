import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CREATOR_DRAFT_COLLABORATION_ACTIVE_ROOM_LIMIT,
  CREATOR_DRAFT_COLLABORATION_INITIAL_SNAPSHOT_MAX_BYTES,
  CREATOR_DRAFT_COLLABORATION_PROVISION_LIMIT,
  CREATOR_DRAFT_COLLABORATION_PROVISION_WINDOW_MS,
  CREATOR_DRAFT_COLLABORATION_ROOM_IDLE_TTL_MS,
  CreatorDraftCollaborationAlreadyPromotedError,
  CreatorDraftCollaborationGraphConflictError,
  CreatorDraftCollaborationMutationReuseError,
  CreatorDraftCollaborationRateLimitError,
  CreatorDraftCollaborationRepository,
  CreatorDraftCollaborationRoomExpiredError,
  CreatorDraftCollaborationRoomLimitError,
  CreatorDraftCollaborationRoomNotFoundError,
  CreatorDraftCollaborationTargetMismatchError,
  type CreateCreatorDraftCollaborationRoomInput,
  type CreatorDraftCollaborationPersistence,
  type CreatorDraftCollaborationRoomRecord,
  type CreatorDraftCollaborationUnitOfWork,
  type PromoteCreatorDraftCollaborationRoomMutation,
} from "./creator-draft-collaboration.repository";

const NOW = Date.parse("2026-07-26T00:00:00.000Z");
const OWNER = "owner-a";
const UUIDS = Array.from(
  { length: 80 },
  (_, index) =>
    `${String(index + 1).padStart(8, "0")}-1111-4111-8111-${String(index + 1).padStart(12, "0")}`
);

function draftId(index = 0): string {
  return `draft_${UUIDS[index]}`;
}

function mutationId(index = 30): string {
  return UUIDS[index];
}

function cloneRoom(
  room: CreatorDraftCollaborationRoomRecord
): CreatorDraftCollaborationRoomRecord {
  return {
    ...room,
    createdAt: new Date(room.createdAt),
    lastActivityAt: new Date(room.lastActivityAt),
    expiresAt: new Date(room.expiresAt),
    promotedAt: room.promotedAt ? new Date(room.promotedAt) : null,
    updatedAt: new Date(room.updatedAt),
  };
}

class FakeDraftCollaborationStore
  implements CreatorDraftCollaborationPersistence, CreatorDraftCollaborationUnitOfWork
{
  rooms = new Map<string, CreatorDraftCollaborationRoomRecord>();
  works = new Map<
    string,
    { ownerUserId: string; status: "draft"; hidden: boolean; revisions: number }
  >();
  operations: string[] = [];
  transactionCount = 0;
  createCount = 0;
  renewCount = 0;
  promoteCount = 0;

  async transaction<T>(
    run: (unit: CreatorDraftCollaborationUnitOfWork) => Promise<T>
  ): Promise<T> {
    this.transactionCount += 1;
    return run(this);
  }

  async acquireOwnerProvisionLock(ownerUserId: string): Promise<void> {
    this.operations.push(`lock:${ownerUserId}`);
  }

  async deleteExpiredProvisionalWorks(
    ownerUserId: string,
    now: Date,
    limit: number
  ): Promise<number> {
    this.operations.push(`cleanup:${ownerUserId}`);
    const expired = [...this.rooms.values()]
      .filter(
        (room) =>
          room.ownerUserId === ownerUserId &&
          room.status === "active" &&
          room.expiresAt.getTime() <= now.getTime()
      )
      .sort(
        (left, right) =>
          left.expiresAt.getTime() - right.expiresAt.getTime() ||
          left.roomId.localeCompare(right.roomId)
      )
      .slice(0, limit);
    for (const room of expired) {
      this.rooms.delete(room.roomId);
      this.works.delete(room.workId);
    }
    return expired.length;
  }

  async findRoomByOwnerDraft(
    ownerUserId: string,
    draftDocumentId: string,
    _lock: boolean
  ): Promise<CreatorDraftCollaborationRoomRecord | null> {
    const room = [...this.rooms.values()].find(
      (candidate) =>
        candidate.ownerUserId === ownerUserId &&
        candidate.draftDocumentId === draftDocumentId
    );
    return room ? cloneRoom(room) : null;
  }

  async findRoomByOwnerProvisionMutation(
    ownerUserId: string,
    mutationIdValue: string
  ): Promise<CreatorDraftCollaborationRoomRecord | null> {
    const room = [...this.rooms.values()].find(
      (candidate) =>
        candidate.ownerUserId === ownerUserId &&
        candidate.provisionMutationId === mutationIdValue
    );
    return room ? cloneRoom(room) : null;
  }

  async findRoomByOwnerPromotionMutation(
    ownerUserId: string,
    mutationIdValue: string
  ): Promise<CreatorDraftCollaborationRoomRecord | null> {
    const room = [...this.rooms.values()].find(
      (candidate) =>
        candidate.ownerUserId === ownerUserId &&
        candidate.promotionMutationId === mutationIdValue
    );
    return room ? cloneRoom(room) : null;
  }

  async findRoomByOwnerRoomId(
    ownerUserId: string,
    roomId: string,
    _lock: boolean
  ): Promise<CreatorDraftCollaborationRoomRecord | null> {
    const room = this.rooms.get(roomId);
    return room?.ownerUserId === ownerUserId ? cloneRoom(room) : null;
  }

  async countOwnerRoomsCreatedSince(
    ownerUserId: string,
    since: Date
  ): Promise<number> {
    return [...this.rooms.values()].filter(
      (room) =>
        room.ownerUserId === ownerUserId &&
        room.createdAt.getTime() >= since.getTime()
    ).length;
  }

  async countOwnerActiveRooms(ownerUserId: string, now: Date): Promise<number> {
    return [...this.rooms.values()].filter(
      (room) =>
        room.ownerUserId === ownerUserId &&
        room.status === "active" &&
        room.expiresAt.getTime() > now.getTime()
    ).length;
  }

  async createProvisionalRoom(
    input: CreateCreatorDraftCollaborationRoomInput
  ): Promise<CreatorDraftCollaborationRoomRecord> {
    this.operations.push(`create:${input.ownerUserId}`);
    this.createCount += 1;
    this.works.set(input.workId, {
      ownerUserId: input.ownerUserId,
      status: "draft",
      hidden: true,
      revisions: 1,
    });
    const room: CreatorDraftCollaborationRoomRecord = {
      roomId: input.roomId,
      draftDocumentId: input.draftDocumentId,
      ownerUserId: input.ownerUserId,
      workId: input.workId,
      status: "active",
      graphRevision: 0,
      initialSnapshotByteLength: input.initialSnapshotByteLength,
      provisionIntent: input.provisionIntent,
      provisionMutationId: input.provisionMutationId,
      promotionMutationId: null,
      createdAt: new Date(input.createdAt),
      lastActivityAt: new Date(input.createdAt),
      expiresAt: new Date(input.expiresAt),
      promotedAt: null,
      updatedAt: new Date(input.createdAt),
    };
    this.rooms.set(room.roomId, room);
    return cloneRoom(room);
  }

  async renewActiveRoom(
    ownerUserId: string,
    roomId: string,
    graphRevision: number,
    now: Date,
    expiresAt: Date
  ): Promise<CreatorDraftCollaborationRoomRecord | null> {
    const room = this.rooms.get(roomId);
    if (
      !room ||
      room.ownerUserId !== ownerUserId ||
      room.status !== "active" ||
      room.graphRevision !== graphRevision
    ) {
      return null;
    }
    this.renewCount += 1;
    const renewed = {
      ...room,
      lastActivityAt: new Date(now),
      expiresAt: new Date(expiresAt),
      updatedAt: new Date(now),
    };
    this.rooms.set(roomId, renewed);
    return cloneRoom(renewed);
  }

  async promoteRoom(
    input: PromoteCreatorDraftCollaborationRoomMutation
  ): Promise<CreatorDraftCollaborationRoomRecord | null> {
    const room = this.rooms.get(input.roomId);
    const work = this.works.get(input.workId);
    if (
      !room ||
      !work ||
      room.ownerUserId !== input.ownerUserId ||
      room.workId !== input.workId ||
      room.status !== "active" ||
      room.graphRevision !== input.expectedGraphRevision ||
      room.expiresAt.getTime() <= input.promotedAt.getTime() ||
      !work.hidden
    ) {
      return null;
    }
    this.promoteCount += 1;
    const promoted: CreatorDraftCollaborationRoomRecord = {
      ...room,
      status: "promoted",
      graphRevision: room.graphRevision + 1,
      promotionMutationId: input.promotionMutationId,
      promotedAt: new Date(input.promotedAt),
      lastActivityAt: new Date(input.promotedAt),
      updatedAt: new Date(input.promotedAt),
    };
    this.rooms.set(room.roomId, promoted);
    this.works.set(input.workId, { ...work, hidden: false });
    return cloneRoom(promoted);
  }

  async deleteProvisionalWork(
    ownerUserId: string,
    workId: string
  ): Promise<boolean> {
    const work = this.works.get(workId);
    if (!work || work.ownerUserId !== ownerUserId || !work.hidden) return false;
    this.works.delete(workId);
    for (const room of this.rooms.values()) {
      if (room.workId === workId) this.rooms.delete(room.roomId);
    }
    return true;
  }

  seedRoom(input: {
    index: number;
    ownerUserId?: string;
    createdAt: number;
    expiresAt: number;
    mutationIndex?: number;
  }): CreatorDraftCollaborationRoomRecord {
    const workId = `work-${input.index}`;
    const room: CreatorDraftCollaborationRoomRecord = {
      roomId: `draft-room_${UUIDS[input.index]}`,
      draftDocumentId: draftId(input.index),
      ownerUserId: input.ownerUserId ?? OWNER,
      workId,
      status: "active",
      graphRevision: 0,
      initialSnapshotByteLength: 0,
      provisionIntent: "share-link",
      provisionMutationId: mutationId(input.mutationIndex ?? input.index + 30),
      promotionMutationId: null,
      createdAt: new Date(input.createdAt),
      lastActivityAt: new Date(input.createdAt),
      expiresAt: new Date(input.expiresAt),
      promotedAt: null,
      updatedAt: new Date(input.createdAt),
    };
    this.rooms.set(room.roomId, room);
    this.works.set(workId, {
      ownerUserId: room.ownerUserId,
      status: "draft",
      hidden: true,
      revisions: 1,
    });
    return room;
  }
}

function provisionInput(index = 0) {
  return {
    ownerUserId: OWNER,
    ownerScopeKey: OWNER,
    draftDocumentId: draftId(index),
    intent: "share-link" as const,
    clientMutationId: mutationId(index + 30),
    initialSnapshotByteLength: 1_024,
  };
}

function repository(
  store: FakeDraftCollaborationStore,
  options: { now?: () => Date; uuids?: string[] } = {}
): CreatorDraftCollaborationRepository {
  const queue = [...(options.uuids ?? [UUIDS[70], UUIDS[71]])];
  return new CreatorDraftCollaborationRepository(store, {
    now: options.now ?? (() => new Date(NOW)),
    createUuid: () => {
      const value = queue.shift();
      if (!value) throw new Error("test UUID queue exhausted");
      return value;
    },
  });
}

describe("CreatorDraftCollaborationRepository provision", () => {
  it("locks the owner before creating one hidden draft work, revision and marker atomically", async () => {
    const store = new FakeDraftCollaborationStore();
    const result = await repository(store).provision(provisionInput());

    expect(result).toMatchObject({
      version: 1,
      roomId: `draft-room_${UUIDS[70]}`,
      draftDocumentId: draftId(),
      provisionalWorkId: UUIDS[71],
      ownerScopeKey: OWNER,
      status: "active",
      graphRevision: 0,
      initialSnapshotByteLength: 1_024,
      provisionIntent: "share-link",
      promotedAt: null,
    });
    expect(Date.parse(result.expiresAt) - NOW).toBe(
      CREATOR_DRAFT_COLLABORATION_ROOM_IDLE_TTL_MS
    );
    expect(store.works.get(result.provisionalWorkId)).toEqual({
      ownerUserId: OWNER,
      status: "draft",
      hidden: true,
      revisions: 1,
    });
    expect(store.operations.slice(0, 3)).toEqual([
      `lock:${OWNER}`,
      `cleanup:${OWNER}`,
      `create:${OWNER}`,
    ]);
    expect(store.transactionCount).toBe(1);
  });

  it("returns and renews the same owner+draft room without allocating another work", async () => {
    let now = NOW;
    const store = new FakeDraftCollaborationStore();
    const repo = repository(store, {
      now: () => new Date(now),
      uuids: [UUIDS[70], UUIDS[71]],
    });
    const first = await repo.provision(provisionInput());
    now += 60_000;
    const second = await repo.provision({
      ...provisionInput(),
      clientMutationId: mutationId(50),
      intent: "invite-member",
    });

    expect(second.roomId).toBe(first.roomId);
    expect(second.provisionalWorkId).toBe(first.provisionalWorkId);
    expect(Date.parse(second.expiresAt)).toBe(
      now + CREATOR_DRAFT_COLLABORATION_ROOM_IDLE_TTL_MS
    );
    expect(store.createCount).toBe(1);
    expect(store.renewCount).toBe(1);
  });

  it("reaps an expired provisional work by cascade and creates a fresh graph for the same draft", async () => {
    let now = NOW;
    const store = new FakeDraftCollaborationStore();
    const repo = repository(store, {
      now: () => new Date(now),
      uuids: [UUIDS[70], UUIDS[71], UUIDS[72], UUIDS[73]],
    });
    const first = await repo.provision(provisionInput());
    now += CREATOR_DRAFT_COLLABORATION_ROOM_IDLE_TTL_MS + 1;
    const second = await repo.provision({
      ...provisionInput(),
      clientMutationId: mutationId(51),
    });

    expect(second.provisionalWorkId).not.toBe(first.provisionalWorkId);
    expect(store.works.has(first.provisionalWorkId)).toBe(false);
    expect(store.rooms.has(first.roomId)).toBe(false);
    expect(store.createCount).toBe(2);
  });

  it("enforces owner+mutation idempotency, DB-window rate and active-room caps", async () => {
    const mutationStore = new FakeDraftCollaborationStore();
    mutationStore.seedRoom({
      index: 0,
      createdAt: NOW,
      expiresAt: NOW + CREATOR_DRAFT_COLLABORATION_ROOM_IDLE_TTL_MS,
      mutationIndex: 30,
    });
    await expect(
      repository(mutationStore).provision({
        ...provisionInput(1),
        clientMutationId: mutationId(30),
      })
    ).rejects.toBeInstanceOf(CreatorDraftCollaborationMutationReuseError);

    const rateStore = new FakeDraftCollaborationStore();
    for (let index = 0; index < CREATOR_DRAFT_COLLABORATION_PROVISION_LIMIT; index += 1) {
      rateStore.seedRoom({
        index,
        createdAt: NOW - CREATOR_DRAFT_COLLABORATION_PROVISION_WINDOW_MS + 1,
        expiresAt: NOW + CREATOR_DRAFT_COLLABORATION_ROOM_IDLE_TTL_MS,
      });
    }
    await expect(
      repository(rateStore).provision(provisionInput(20))
    ).rejects.toBeInstanceOf(CreatorDraftCollaborationRateLimitError);

    const capacityStore = new FakeDraftCollaborationStore();
    for (
      let index = 0;
      index < CREATOR_DRAFT_COLLABORATION_ACTIVE_ROOM_LIMIT;
      index += 1
    ) {
      capacityStore.seedRoom({
        index,
        createdAt: NOW - CREATOR_DRAFT_COLLABORATION_PROVISION_WINDOW_MS - 1,
        expiresAt: NOW + CREATOR_DRAFT_COLLABORATION_ROOM_IDLE_TTL_MS,
      });
    }
    await expect(
      repository(capacityStore).provision(provisionInput(20))
    ).rejects.toBeInstanceOf(CreatorDraftCollaborationRoomLimitError);
  });

  it("fails closed for a spoofed owner or an oversized initial snapshot", async () => {
    const store = new FakeDraftCollaborationStore();
    await expect(
      repository(store).provision({
        ...provisionInput(),
        ownerScopeKey: "owner-b",
      })
    ).rejects.toBeInstanceOf(CreatorDraftCollaborationTargetMismatchError);
    await expect(
      repository(store).provision({
        ...provisionInput(),
        initialSnapshotByteLength:
          CREATOR_DRAFT_COLLABORATION_INITIAL_SNAPSHOT_MAX_BYTES + 1,
      })
    ).rejects.toBeInstanceOf(CreatorDraftCollaborationTargetMismatchError);
    expect(store.transactionCount).toBe(0);
  });
});

describe("CreatorDraftCollaborationRepository promotion", () => {
  it("promotes the same workId, increments graph revision and unhides the work once", async () => {
    const store = new FakeDraftCollaborationStore();
    const repo = repository(store, {
      uuids: [UUIDS[70], UUIDS[71]],
    });
    const provisioned = await repo.provision(provisionInput());
    const promotionInput = {
      ownerUserId: OWNER,
      ownerScopeKey: OWNER,
      roomId: provisioned.roomId,
      draftDocumentId: provisioned.draftDocumentId,
      targetWorkId: provisioned.provisionalWorkId,
      expectedGraphRevision: 0,
      clientMutationId: mutationId(60),
    };
    const promoted = await repo.promote(promotionInput);

    expect(promoted).toMatchObject({
      status: "promoted",
      provisionalWorkId: provisioned.provisionalWorkId,
      graphRevision: 1,
    });
    expect(store.works.get(provisioned.provisionalWorkId)?.hidden).toBe(false);
    expect(store.promoteCount).toBe(1);

    await expect(repo.promote(promotionInput)).resolves.toEqual(promoted);
    expect(store.promoteCount).toBe(1);
    await expect(
      repo.promote({ ...promotionInput, clientMutationId: mutationId(61) })
    ).rejects.toBeInstanceOf(CreatorDraftCollaborationAlreadyPromotedError);
  });

  it("rejects re-keying and stale graph revisions without mutating the room", async () => {
    const store = new FakeDraftCollaborationStore();
    const repo = repository(store, {
      uuids: [UUIDS[70], UUIDS[71]],
    });
    const provisioned = await repo.provision(provisionInput());
    const base = {
      ownerUserId: OWNER,
      ownerScopeKey: OWNER,
      roomId: provisioned.roomId,
      draftDocumentId: provisioned.draftDocumentId,
      targetWorkId: provisioned.provisionalWorkId,
      expectedGraphRevision: 0,
      clientMutationId: mutationId(60),
    };

    await expect(
      repo.promote({ ...base, targetWorkId: "different-work" })
    ).rejects.toBeInstanceOf(CreatorDraftCollaborationTargetMismatchError);
    const room = store.rooms.get(provisioned.roomId);
    if (!room) throw new Error("missing test room");
    store.rooms.set(provisioned.roomId, { ...room, graphRevision: 2 });
    await expect(repo.promote(base)).rejects.toMatchObject(
      new CreatorDraftCollaborationGraphConflictError(2)
    );
    expect(store.works.get(provisioned.provisionalWorkId)?.hidden).toBe(true);
  });

  it("deletes an expired provisional graph and hides owner mismatches as not found", async () => {
    let now = NOW;
    const store = new FakeDraftCollaborationStore();
    const repo = repository(store, {
      now: () => new Date(now),
      uuids: [UUIDS[70], UUIDS[71]],
    });
    const provisioned = await repo.provision(provisionInput());
    now += CREATOR_DRAFT_COLLABORATION_ROOM_IDLE_TTL_MS;
    await expect(
      repo.promote({
        ownerUserId: OWNER,
        ownerScopeKey: OWNER,
        roomId: provisioned.roomId,
        draftDocumentId: provisioned.draftDocumentId,
        targetWorkId: provisioned.provisionalWorkId,
        expectedGraphRevision: 0,
        clientMutationId: mutationId(60),
      })
    ).rejects.toBeInstanceOf(CreatorDraftCollaborationRoomExpiredError);
    expect(store.works.has(provisioned.provisionalWorkId)).toBe(false);
    expect(store.rooms.has(provisioned.roomId)).toBe(false);

    await expect(
      repo.promote({
        ownerUserId: "owner-b",
        ownerScopeKey: "owner-b",
        roomId: provisioned.roomId,
        draftDocumentId: provisioned.draftDocumentId,
        targetWorkId: provisioned.provisionalWorkId,
        expectedGraphRevision: 0,
        clientMutationId: mutationId(61),
      })
    ).rejects.toBeInstanceOf(CreatorDraftCollaborationRoomNotFoundError);
  });
});

describe("creator draft collaboration SQL boundary", () => {
  it("ships an indexed FK-safe marker migration with lease, size and promotion constraints", () => {
    const migration = readFileSync(
      new URL(
        "../../../../../lib/db/migrations/0020_creator_draft_collaboration_room.sql",
        import.meta.url
      ),
      "utf8"
    );
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "creator_draft_collaboration_room"');
    expect(migration).toContain('FOREIGN KEY ("workId") REFERENCES "creator_work"("id") ON DELETE CASCADE');
    expect(migration).toContain('UNIQUE ("ownerUserId", "draftDocumentId")');
    expect(migration).toContain('UNIQUE ("workId")');
    expect(migration).toContain('"initialSnapshotByteLength" BETWEEN 0 AND 16777216');
    expect(migration).toContain(`WHERE "status" = 'active'`);
    expect(migration).toContain(`"status" = 'promoted'`);
    expect(migration).not.toMatch(/ALTER TABLE\s+"creator_work_collaborator"/u);
  });

  it("serializes provision admission across API nodes before count or insert", () => {
    const source = readFileSync(
      new URL("./creator-draft-collaboration.repository.ts", import.meta.url),
      "utf8"
    );
    const lock = source.indexOf("await unit.acquireOwnerProvisionLock");
    const cleanup = source.indexOf("await unit.deleteExpiredProvisionalWorks", lock);
    const lookup = source.indexOf("unit.findRoomByOwnerDraft", cleanup);
    const rate = source.indexOf("unit.countOwnerRoomsCreatedSince", lookup);
    const create = source.indexOf("unit.createProvisionalRoom", rate);

    expect(source).toContain("pg_advisory_xact_lock");
    expect(lock).toBeGreaterThan(0);
    expect(cleanup).toBeGreaterThan(lock);
    expect(lookup).toBeGreaterThan(cleanup);
    expect(rate).toBeGreaterThan(lookup);
    expect(create).toBeGreaterThan(rate);
  });
});
