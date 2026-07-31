import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { createPublishReceiptFingerprints } from "./receipt-fingerprint";
import {
  REALTIME_ROOM_APPLICATION_SCHEMA_VERSION,
  RealtimeReceiptBudgetExceededError,
  RealtimeRoomStore,
  type AppendScreenSignalEventInput,
  type RealtimeReceiptBudget,
  type ScreenSignalActor,
  type ScreenSignalPublication,
} from "./room-store";

import type {
  SqlCursorLike,
  SqlStorageLike,
  SqlValue,
  TransactionalSqlStorageLike,
} from "./runtime-types";

class NodeSqlStorage
  implements SqlStorageLike, TransactionalSqlStorageLike
{
  readonly database = new DatabaseSync(":memory:");
  readonly sql = this;

  exec<Row extends Record<string, unknown>>(
    query: string,
    ...bindings: SqlValue[]
  ): SqlCursorLike<Row> {
    let rows: Row[] = [];
    if (bindings.length === 0 && query.includes(";")) {
      this.database.exec(query);
    } else {
      const statement = this.database.prepare(query);
      const parameters = bindings as Array<string | number | null>;
      if (
        /^\s*(?:SELECT|PRAGMA|WITH)\b/iu.test(query)
      ) {
        rows = statement.all(...parameters) as Row[];
      } else {
        statement.run(...parameters);
      }
    }
    return {
      [Symbol.iterator]: () => rows[Symbol.iterator](),
      toArray: () => [...rows],
    };
  }

  transactionSync<T>(callback: () => T): T {
    this.database.exec("BEGIN TRANSACTION");
    try {
      const result = callback();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

const openDatabases: DatabaseSync[] = [];
const TEST_RECEIPT_BUDGET = {
  maximumCount: 1_000,
  maximumBytes: 16 * 1024 * 1024,
} as const;

async function appendScreenSignal(
  store: RealtimeRoomStore,
  input: AppendScreenSignalEventInput,
  actor: ScreenSignalActor,
  nowMs: number,
  budget: RealtimeReceiptBudget = TEST_RECEIPT_BUDGET,
): Promise<ScreenSignalPublication> {
  return store.appendAuthorizedScreenSignal(
    input,
    actor,
    nowMs,
    budget,
    await createPublishReceiptFingerprints({
      idempotencyKey: input.idempotencyKey,
      actorId: input.actorId,
      clientId: input.clientId,
      channel: input.channel,
      payload: input.payload,
    }),
  );
}

function createStoreContext(): {
  readonly store: RealtimeRoomStore;
  readonly database: DatabaseSync;
  readonly storage: NodeSqlStorage;
} {
  const sql = new NodeSqlStorage();
  openDatabases.push(sql.database);
  const store = new RealtimeRoomStore(sql);
  store.initialize();
  expect(store.bindScope("work-1", "room-1")).toBe(true);
  return { store, database: sql.database, storage: sql };
}

function createStore(): RealtimeRoomStore {
  return createStoreContext().store;
}

afterEach(() => {
  for (const database of openDatabases.splice(0)) {
    database.close();
  }
});

describe("realtime SQLite room store", () => {
  it("applies ordered application schema migrations idempotently from v1", () => {
    const { store, database, storage } = createStoreContext();
    store.appendEvent(
      {
        idempotencyKey: "migration-preserved-event",
        actorId: "actor-1",
        clientId: "client-1",
        connectionId: "connection-1",
        channel: "comments",
        serverAtMs: 1_000,
        eventExpiresAtMs: 10_000,
        receiptExpiresAtMs: 10_000,
        payload: {
          kind: "comment.changed",
          threadId: "thread-1",
          activitySequence: "1",
          change: "created",
        },
      },
      TEST_RECEIPT_BUDGET,
    );
    expect(store.getApplicationSchemaVersion()).toBe(
      REALTIME_ROOM_APPLICATION_SCHEMA_VERSION,
    );

    // Migrations are additive, so removing v2/v3 state and history recreates
    // the exact persisted shape produced by application schema v1.
    database.exec(`
      DROP TRIGGER screen_share_predecessor_cleanup;
      DROP TRIGGER screen_member_predecessor_cleanup;
      DROP TABLE teardown_ack_tombstone;
      DROP TABLE screen_member_teardown_predecessor;
      DROP TABLE screen_share_teardown_predecessor;
      DROP TRIGGER ordinary_receipt_key_conflict;
      DROP TRIGGER teardown_receipt_key_conflict;
      DROP TABLE teardown_receipt_usage;
      DROP TABLE teardown_idempotency_receipt;
      DELETE FROM _sql_schema_migrations WHERE version >= 2;
    `);

    const upgraded = new RealtimeRoomStore(storage);
    upgraded.initialize();
    upgraded.initialize();

    expect(upgraded.getApplicationSchemaVersion()).toBe(
      REALTIME_ROOM_APPLICATION_SCHEMA_VERSION,
    );
    expect(
      upgraded.findReceipt("migration-preserved-event")?.event
        .sequence,
    ).toBe(1);
    expect(
      database
        .prepare(
          "SELECT version, name FROM _sql_schema_migrations ORDER BY version",
        )
        .all(),
    ).toEqual([
      { version: 1, name: "initial-room-schema" },
      { version: 2, name: "reserved-teardown-receipts" },
      { version: 3, name: "predecessor-bound-teardown-acks" },
    ]);
    expect(
      database
        .prepare(
          "SELECT receipt_count, receipt_bytes FROM teardown_receipt_usage",
        )
        .get(),
    ).toEqual({ receipt_count: 0, receipt_bytes: 0 });
  });

  it("upgrades persisted v2 signaling state to consumable v3 predecessors", async () => {
    const { store, database, storage } = createStoreContext();
    const owner = {
      actorId: "actor-v2-owner",
      clientId: "client-v2-owner",
      connectionId: "connection-v2-owner",
      sessionExpiresAtMs: 100_000,
    } as const;
    const viewer = {
      actorId: "actor-v2-viewer",
      clientId: "client-v2-viewer",
      connectionId: "connection-v2-viewer",
      sessionExpiresAtMs: 100_000,
    } as const;

    await appendScreenSignal(
      store,
      {
        idempotencyKey: "v2-announce",
        actorId: owner.actorId,
        clientId: owner.clientId,
        connectionId: owner.connectionId,
        channel: "screen-signaling",
        serverAtMs: 1_000,
        eventExpiresAtMs: 100_000,
        receiptExpiresAtMs: 100_000,
        payload: {
          kind: "signal.announce",
          shareId: "share-v2",
          label: "V2 Share",
        },
      },
      owner,
      1_000,
    );
    await appendScreenSignal(
      store,
      {
        idempotencyKey: "v2-request",
        actorId: viewer.actorId,
        clientId: viewer.clientId,
        connectionId: viewer.connectionId,
        channel: "screen-signaling",
        serverAtMs: 1_100,
        eventExpiresAtMs: 100_000,
        receiptExpiresAtMs: 100_000,
        payload: {
          kind: "signal.request",
          shareId: "share-v2",
          sessionId: "share-v2",
          targetClientId: owner.clientId,
        },
      },
      viewer,
      1_100,
    );

    database.exec(`
      DROP TRIGGER screen_share_predecessor_cleanup;
      DROP TRIGGER screen_member_predecessor_cleanup;
      DROP TABLE teardown_ack_tombstone;
      DROP TABLE screen_member_teardown_predecessor;
      DROP TABLE screen_share_teardown_predecessor;
      DELETE FROM _sql_schema_migrations WHERE version = 3;
    `);

    const upgraded = new RealtimeRoomStore(storage);
    expect(upgraded.getApplicationSchemaVersion()).toBe(2);
    upgraded.initialize();
    upgraded.initialize();

    expect(upgraded.getApplicationSchemaVersion()).toBe(3);
    expect(
      database
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM screen_share) AS shares,
             (SELECT COUNT(*) FROM screen_session_member
              WHERE role = 'viewer' AND status = 'pending')
               AS pending_viewers,
             (SELECT COUNT(*) FROM screen_share_teardown_predecessor)
               AS share_predecessors,
             (SELECT COUNT(*) FROM screen_member_teardown_predecessor)
               AS member_predecessors,
             (SELECT COUNT(*) FROM idempotency_receipt)
               AS preserved_receipts`,
        )
        .get(),
    ).toEqual({
      shares: 1,
      pending_viewers: 1,
      share_predecessors: 1,
      member_predecessors: 1,
      preserved_receipts: 2,
    });

    await expect(
      appendScreenSignal(
        upgraded,
        {
          idempotencyKey: "v3-ended-from-v2",
          actorId: viewer.actorId,
          clientId: viewer.clientId,
          connectionId: viewer.connectionId,
          channel: "screen-signaling",
          serverAtMs: 1_200,
          eventExpiresAtMs: 100_000,
          receiptExpiresAtMs: 100_000,
          payload: {
            kind: "signal.access",
            shareId: "share-v2",
            sessionId: "share-v2",
            targetClientId: owner.clientId,
            decision: "ended",
          },
        },
        viewer,
        1_200,
      ),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      appendScreenSignal(
        upgraded,
        {
          idempotencyKey: "v3-stop-from-v2",
          actorId: owner.actorId,
          clientId: owner.clientId,
          connectionId: owner.connectionId,
          channel: "screen-signaling",
          serverAtMs: 1_300,
          eventExpiresAtMs: 100_000,
          receiptExpiresAtMs: 100_000,
          payload: {
            kind: "signal.stop",
            shareId: "share-v2",
          },
        },
        owner,
        1_300,
      ),
    ).resolves.toMatchObject({ ok: true });
    expect(
      database
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM screen_share) AS shares,
             (SELECT COUNT(*) FROM screen_session_member) AS members,
             (SELECT COUNT(*) FROM teardown_ack_tombstone)
               AS teardown_acks`,
        )
        .get(),
    ).toEqual({ shares: 0, members: 0, teardown_acks: 2 });
  });

  it("consumes each ticket nonce once and releases only expired receipts", () => {
    const store = createStore();

    expect(
      store.consumeTicketNonce(
        "nonce-000000000001",
        10_000,
        1_000,
      ),
    ).toBe(true);
    expect(
      store.consumeTicketNonce(
        "nonce-000000000001",
        10_000,
        1_001,
      ),
    ).toBe(false);
    expect(
      store.consumeTicketNonce(
        "nonce-000000000001",
        20_000,
        10_000,
      ),
    ).toBe(true);
  });

  it("projects sequence and replay floors per channel while retaining durable receipts", () => {
    const store = createStore();
    const common = {
      actorId: "actor-1",
      clientId: "client-1",
      connectionId: "connection-1",
      serverAtMs: 1_000,
      eventExpiresAtMs: 2_000,
      receiptExpiresAtMs: 20_000,
    } as const;

    expect(
      store.appendEvent({
        ...common,
        idempotencyKey: "presence-event-0001",
        channel: "presence",
        payload: { kind: "presence.leave" },
      }, TEST_RECEIPT_BUDGET).event.sequence,
    ).toBe(1);
    expect(
      store.appendEvent({
        ...common,
        idempotencyKey: "comment-event-0001",
        channel: "comments",
        eventExpiresAtMs: 20_000,
        payload: {
          kind: "comment.changed",
          threadId: "thread-1",
          activitySequence: "1",
          change: "created",
        },
      }, TEST_RECEIPT_BUDGET).event.sequence,
    ).toBe(1);

    expect(store.getAllSequenceStates()).toEqual({
      presence: {
        currentSequence: 1,
        replayFloorSequence: 1,
      },
      comments: {
        currentSequence: 1,
        replayFloorSequence: 1,
      },
      "screen-signaling": {
        currentSequence: 0,
        replayFloorSequence: 1,
      },
    });

    store.prune(3_000, 128);
    expect(store.readEventsAfter("presence", 0, 10)).toEqual([]);
    expect(store.getSequenceState("presence")).toEqual({
      currentSequence: 1,
      replayFloorSequence: 2,
    });
    expect(store.readEventsAfter("comments", 0, 10)).toHaveLength(1);
    expect(
      store.findReceipt("presence-event-0001")?.event.sequence,
    ).toBe(1);

    store.prune(20_000, 128);
    expect(store.findReceipt("presence-event-0001")).toBeNull();
  });

  it("pre-admits receipt count and bytes without partial sequence writes", () => {
    const { store, database } = createStoreContext();
    const event = {
      actorId: "actor-1",
      clientId: "client-1",
      connectionId: "connection-1",
      serverAtMs: 1_000,
      eventExpiresAtMs: 2_000,
      receiptExpiresAtMs: 2_000,
      channel: "comments",
      payload: {
        kind: "comment.changed",
        threadId: "thread-1",
        activitySequence: "1",
        change: "created",
      },
    } as const;
    const oneReceiptBudget = {
      maximumCount: 1,
      maximumBytes: 1_000_000,
    };

    store.appendEvent(
      { ...event, idempotencyKey: "receipt-budget-event-0001" },
      oneReceiptBudget,
    );
    const firstUsage = store.getReceiptUsage();
    expect(firstUsage.count).toBe(1);
    expect(firstUsage.bytes).toBeGreaterThan(0);

    const second = {
      ...event,
      idempotencyKey: "receipt-budget-event-0002",
      payload: {
        ...event.payload,
        activitySequence: "2",
      },
    } as const;
    expect(store.canAppendReceipt(second, oneReceiptBudget)).toBe(false);
    expect(() =>
      store.appendEvent(second, oneReceiptBudget),
    ).toThrow(RealtimeReceiptBudgetExceededError);
    expect(store.getSequenceState("comments").currentSequence).toBe(1);
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM event_log")
        .get(),
    ).toEqual({ count: 1 });

    const byteBudget = {
      maximumCount: 10,
      maximumBytes: firstUsage.bytes + 1,
    };
    expect(store.canAppendReceipt(second, byteBudget)).toBe(false);

    store.prune(2_000, 128);
    expect(store.getReceiptUsage()).toEqual({ count: 0, bytes: 0 });
    expect(store.getSequenceState("comments")).toEqual({
      currentSequence: 1,
      replayFloorSequence: 2,
    });
    expect(store.canAppendReceipt(second, oneReceiptBudget)).toBe(true);
    expect(
      store.appendEvent(second, oneReceiptBudget).event.sequence,
    ).toBe(2);
  });

  it("binds client identity to one actor and persists connection-level presence snapshots", () => {
    const store = createStore();
    expect(
      store.registerConnection({
        connectionId: "connection-1",
        actorId: "actor-1",
        clientId: "client-1",
        sessionExpiresAtMs: 100_000,
        nowMs: 1_000,
      }),
    ).toBe(true);
    expect(
      store.registerConnection({
        connectionId: "connection-2",
        actorId: "actor-1",
        clientId: "client-1",
        sessionExpiresAtMs: 100_000,
        nowMs: 1_000,
      }),
    ).toBe(true);
    expect(
      store.registerConnection({
        connectionId: "connection-3",
        actorId: "actor-2",
        clientId: "client-1",
        sessionExpiresAtMs: 100_000,
        nowMs: 1_000,
      }),
    ).toBe(false);

    store.updatePresence(
      "connection-1",
      "actor-1",
      "client-1",
      {
        kind: "presence.update",
        pageId: "page-1",
        profile: {
          displayName: "작가 1",
          role: "editor",
          state: "active",
        },
        tool: "g-pen",
      },
      2_000,
    );
    store.updatePresence(
      "connection-2",
      "actor-1",
      "client-1",
      {
        kind: "presence.cursor",
        x: 0.25,
        y: 0.75,
        pageId: "page-1",
        tool: "g-pen",
        drawing: true,
        points: [10, 20, 30, 40],
      },
      2_100,
    );

    const snapshot = store.listPresenceSnapshot(3_000);
    expect(snapshot).toHaveLength(2);
    expect(snapshot[0]).toMatchObject({
      connectionId: "connection-1",
      actorId: "actor-1",
      clientId: "client-1",
      update: { kind: "presence.update" },
      cursor: null,
    });
    expect(snapshot[1]).toMatchObject({
      connectionId: "connection-2",
      update: null,
      cursor: { kind: "presence.cursor", x: 0.25, y: 0.75 },
    });
    expect(snapshot[1].cursor).not.toHaveProperty("points");

    store.unregisterConnection("connection-1");
    expect(
      store.countClientConnections("actor-1", "client-1", 3_000),
    ).toBe(1);
    expect(store.countClientPresence("actor-1", "client-1")).toBe(1);
    store.unregisterConnection("connection-2");
    expect(
      store.countClientConnections("actor-1", "client-1", 3_000),
    ).toBe(0);
    expect(store.listPresenceSnapshot(3_000)).toEqual([]);
  });

  it("claims connection cleanup once and distinguishes idle connection churn", () => {
    const store = createStore();
    expect(
      store.registerConnection({
        connectionId: "connection-idle",
        actorId: "actor-1",
        clientId: "client-1",
        sessionExpiresAtMs: 100_000,
        nowMs: 1_000,
      }),
    ).toBe(true);
    expect(store.unregisterConnection("connection-idle")).toEqual({
      actorId: "actor-1",
      clientId: "client-1",
      hadPresence: false,
    });
    expect(store.unregisterConnection("connection-idle")).toBeNull();

    expect(
      store.registerConnection({
        connectionId: "connection-present",
        actorId: "actor-1",
        clientId: "client-1",
        sessionExpiresAtMs: 100_000,
        nowMs: 1_000,
      }),
    ).toBe(true);
    store.updatePresence(
      "connection-present",
      "actor-1",
      "client-1",
      {
        kind: "presence.update",
        pageId: null,
        profile: {
          displayName: "작가 1",
          role: "editor",
          state: "active",
        },
        tool: null,
      },
      2_000,
    );
    expect(store.unregisterConnection("connection-present")).toEqual({
      actorId: "actor-1",
      clientId: "client-1",
      hadPresence: true,
    });
    expect(store.unregisterConnection("connection-present")).toBeNull();
  });

  it("atomically reconciles an orphan connection into exact-once replay events", () => {
    const { store, database } = createStoreContext();
    const owner = {
      actorId: "actor-owner",
      clientId: "client-owner",
      connectionId: "connection-orphan",
      sessionExpiresAtMs: 100_000,
    } as const;
    expect(
      store.registerConnection({ ...owner, nowMs: 1_000 }),
    ).toBe(true);
    store.updatePresence(
      owner.connectionId,
      owner.actorId,
      owner.clientId,
      {
        kind: "presence.update",
        pageId: null,
        profile: {
          displayName: "Orphan Owner",
          role: "editor",
          state: "active",
        },
        tool: null,
      },
      2_000,
    );
    expect(
      store.authorizeScreenSignal(
        {
          kind: "signal.announce",
          shareId: "share-orphan",
          label: "Orphan Share",
        },
        owner,
        2_000,
      ),
    ).toMatchObject({ ok: true });

    const events = store.reconcileRegisteredConnections(
      new Set(),
      3_000,
      20_000,
    );
    expect(events.map((stored) => stored.event.payload.kind)).toEqual([
      "presence.leave",
      "signal.stop",
    ]);
    expect(
      store.reconcileRegisteredConnections(
        new Set(),
        3_001,
        20_000,
      ),
    ).toEqual([]);
    expect(
      store
        .readEventsAfter("presence", 0, 10)
        .map((stored) => stored.event.payload.kind),
    ).toEqual(["presence.leave"]);
    expect(
      store
        .readEventsAfter("screen-signaling", 0, 10)
        .map((stored) => stored.event.payload.kind),
    ).toEqual(["signal.stop"]);
    expect(
      database
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM connection_registry) AS connections,
             (SELECT COUNT(*) FROM presence_state) AS presence,
             (SELECT COUNT(*) FROM screen_share) AS shares,
             (SELECT COUNT(*) FROM idempotency_receipt) AS ordinary_receipts,
             (SELECT COUNT(*) FROM teardown_idempotency_receipt) AS teardown_receipts`,
        )
        .get(),
    ).toMatchObject({
      connections: 0,
      presence: 0,
      shares: 0,
      ordinary_receipts: 0,
      teardown_receipts: 0,
    });
  });

  it("rolls back connection cleanup when a replay event cannot be persisted", () => {
    const { store, database } = createStoreContext();
    expect(
      store.registerConnection({
        connectionId: "connection-rollback",
        actorId: "actor-1",
        clientId: "client-1",
        sessionExpiresAtMs: 100_000,
        nowMs: 1_000,
      }),
    ).toBe(true);
    store.updatePresence(
      "connection-rollback",
      "actor-1",
      "client-1",
      {
        kind: "presence.update",
        pageId: null,
        profile: {
          displayName: "Rollback Artist",
          role: "editor",
          state: "active",
        },
        tool: null,
      },
      2_000,
    );
    database
      .prepare(
        `INSERT INTO event_log
          (channel, sequence, expires_at_ms, envelope_json,
           target_actor_id, target_client_id)
         VALUES ('presence', 1, 20_000, '{}', NULL, NULL)`,
      )
      .run();

    expect(() =>
      store.cleanupConnectionWithEvents(
        "connection-rollback",
        3_000,
        20_000,
      ),
    ).toThrow();
    expect(
      database
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM connection_registry) AS connections,
             (SELECT COUNT(*) FROM presence_state) AS presence`,
        )
        .get(),
    ).toEqual({ connections: 1, presence: 1 });
  });

  it("enforces owner-viewer screen share and peer signaling state", () => {
    const { store, database } = createStoreContext();
    const owner = {
      actorId: "actor-owner",
      clientId: "client-owner",
      connectionId: "connection-owner",
      sessionExpiresAtMs: 100_000,
    } as const;
    const viewer = {
      actorId: "actor-viewer",
      clientId: "client-viewer",
      connectionId: "connection-viewer",
      sessionExpiresAtMs: 100_000,
    } as const;
    const attacker = {
      actorId: "actor-attacker",
      clientId: "client-attacker",
      connectionId: "connection-attacker",
      sessionExpiresAtMs: 100_000,
    } as const;
    for (const actor of [owner, viewer, attacker]) {
      expect(
        store.registerConnection({ ...actor, nowMs: 1_000 }),
      ).toBe(true);
    }

    expect(
      store.authorizeScreenSignal(
        {
          kind: "signal.announce",
          shareId: "share-1",
          label: "작업 화면",
        },
        owner,
        2_000,
      ),
    ).toMatchObject({ ok: true, targetClientId: null });
    expect(
      store.authorizeScreenSignal(
        { kind: "signal.stop", shareId: "share-1" },
        attacker,
        2_100,
      ),
    ).toEqual({ ok: false });
    expect(
      store.authorizeScreenSignal(
        {
          kind: "signal.request",
          shareId: "share-1",
          sessionId: "share-1",
          targetClientId: "client-owner",
        },
        viewer,
        2_200,
      ),
    ).toMatchObject({
      ok: true,
      targetActorId: "actor-owner",
      targetClientId: "client-owner",
    });
    expect(
      store.authorizeScreenSignal(
        {
          kind: "signal.access",
          shareId: "share-1",
          sessionId: "share-1",
          targetClientId: "client-viewer",
          decision: "approved",
        },
        attacker,
        2_300,
      ),
    ).toEqual({ ok: false });
    expect(
      store.authorizeScreenSignal(
        {
          kind: "signal.access",
          shareId: "share-1",
          sessionId: "share-1",
          targetClientId: "client-viewer",
          decision: "approved",
        },
        owner,
        2_400,
      ),
    ).toEqual({
      ok: true,
      targetActorId: "actor-viewer",
      targetClientId: "client-viewer",
    });

    const offer = {
      kind: "signal.offer",
      sessionId: "share-1",
      peerConnectionId: "peer-1",
      targetClientId: "client-owner",
      sdp: "v=0",
    } as const;
    expect(
      store.authorizeScreenSignal(offer, attacker, 2_500),
    ).toEqual({ ok: false });
    expect(
      store.authorizeScreenSignal(offer, viewer, 2_600),
    ).toEqual({
      ok: true,
      targetActorId: "actor-owner",
      targetClientId: "client-owner",
    });
    expect(
      store.authorizeScreenSignal(
        {
          ...offer,
          kind: "signal.answer",
          targetClientId: "client-viewer",
        },
        owner,
        2_700,
      ),
    ).toEqual({
      ok: true,
      targetActorId: "actor-viewer",
      targetClientId: "client-viewer",
    });
    expect(
      store.authorizeScreenSignal(
        {
          kind: "signal.access",
          shareId: "share-1",
          sessionId: "share-1",
          targetClientId: "client-owner",
          decision: "ended",
        },
        viewer,
        2_750,
      ),
    ).toMatchObject({
      ok: true,
      targetActorId: "actor-owner",
      targetClientId: "client-owner",
    });
    expect(
      store.authorizeScreenSignal(offer, viewer, 2_760),
    ).toEqual({ ok: false });
    expect(
      store.authorizeScreenSignal(
        {
          kind: "signal.request",
          shareId: "share-1",
          sessionId: "share-1",
          targetClientId: "client-owner",
        },
        viewer,
        2_770,
      ),
    ).toMatchObject({ ok: true });
    expect(
      store.authorizeScreenSignal(
        {
          kind: "signal.access",
          shareId: "share-1",
          sessionId: "share-1",
          targetClientId: "client-viewer",
          decision: "approved",
        },
        owner,
        2_780,
      ),
    ).toMatchObject({ ok: true });
    expect(
      store.authorizeScreenSignal(offer, viewer, 2_790),
    ).toMatchObject({ ok: true });
    expect(
      store.authorizeScreenSignal(
        {
          kind: "signal.access",
          shareId: "share-1",
          sessionId: "share-1",
          targetClientId: "client-viewer",
          decision: "ended",
        },
        owner,
        2_795,
      ),
    ).toMatchObject({
      ok: true,
      targetActorId: "actor-viewer",
      targetClientId: "client-viewer",
    });
    expect(
      store.authorizeScreenSignal(
        {
          ...offer,
          kind: "signal.answer",
          targetClientId: "client-viewer",
        },
        owner,
        2_796,
      ),
    ).toEqual({ ok: false });
    expect(
      store.authorizeScreenSignal(
        {
          kind: "signal.ice",
          sessionId: "share-1",
          peerConnectionId: "peer-1",
          targetClientId: "client-owner",
          candidate: {
            candidate: "",
            sdpMid: null,
            sdpMLineIndex: null,
            usernameFragment: null,
          },
        },
        attacker,
        2_800,
      ),
    ).toEqual({ ok: false });
    expect(
      store.authorizeScreenSignal(
        { kind: "signal.stop", shareId: "share-1" },
        owner,
        2_900,
      ),
    ).toMatchObject({ ok: true });
    expect(
      database
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM screen_share) AS shares,
             (SELECT COUNT(*) FROM screen_session_member) AS members,
             (SELECT COUNT(*) FROM screen_peer) AS peers`,
        )
        .get(),
    ).toEqual({ shares: 0, members: 0, peers: 0 });
    expect(
      store.authorizeScreenSignal(offer, viewer, 3_000),
    ).toEqual({ ok: false });
    expect(
      store.authorizeScreenSignal(
        {
          kind: "signal.announce",
          shareId: "share-1",
          label: "새 작업 화면",
        },
        owner,
        3_100,
      ),
    ).toMatchObject({ ok: true });
    // A restarted share does not inherit the previous viewer grant or peer.
    expect(
      store.authorizeScreenSignal(offer, viewer, 3_200),
    ).toEqual({ ok: false });
  });

  it("bypasses an exhausted ordinary quota only for predecessor-bound teardown", async () => {
    const { store, database } = createStoreContext();
    const owner = {
      actorId: "actor-owner",
      clientId: "client-owner",
      connectionId: "connection-owner",
      sessionExpiresAtMs: 100_000,
    } as const;
    const viewer = {
      actorId: "actor-viewer",
      clientId: "client-viewer",
      connectionId: "connection-viewer",
      sessionExpiresAtMs: 100_000,
    } as const;
    const fourReceiptBudget = {
      maximumCount: 4,
      maximumBytes: 1_000_000,
    } as const;
    const eventInput = (
      idempotencyKey: string,
      actor: ScreenSignalActor,
      serverAtMs: number,
      payload: AppendScreenSignalEventInput["payload"],
    ): AppendScreenSignalEventInput => ({
      idempotencyKey,
      actorId: actor.actorId,
      clientId: actor.clientId,
      connectionId: actor.connectionId,
      channel: "screen-signaling",
      serverAtMs,
      eventExpiresAtMs: 100_000,
      receiptExpiresAtMs: 100_000,
      payload,
    });

    await appendScreenSignal(
      store,
      eventInput("announce-stop-event", owner, 2_000, {
        kind: "signal.announce",
        shareId: "share-stop",
        label: "Stop Share",
      }),
      owner,
      2_000,
      fourReceiptBudget,
    );
    const stopInput = eventInput(
      "predecessor-stop-event",
      owner,
      2_100,
      { kind: "signal.stop", shareId: "share-stop" },
    );
    const stopFingerprints =
      await createPublishReceiptFingerprints(stopInput);
    await expect(
      appendScreenSignal(
        store,
        stopInput,
        owner,
        2_100,
        fourReceiptBudget,
      ),
    ).resolves.toMatchObject({ ok: true });

    await appendScreenSignal(
      store,
      eventInput("announce-access-event", owner, 3_000, {
        kind: "signal.announce",
        shareId: "share-access",
        label: "Access Share",
      }),
      owner,
      3_000,
      fourReceiptBudget,
    );
    await appendScreenSignal(
      store,
      eventInput("request-access-event", viewer, 3_100, {
        kind: "signal.request",
        shareId: "share-access",
        sessionId: "share-access",
        targetClientId: owner.clientId,
      }),
      viewer,
      3_100,
      fourReceiptBudget,
    );
    await appendScreenSignal(
      store,
      eventInput("approve-access-event", owner, 3_200, {
        kind: "signal.access",
        shareId: "share-access",
        sessionId: "share-access",
        targetClientId: viewer.clientId,
        decision: "approved",
      }),
      owner,
      3_200,
      fourReceiptBudget,
    );
    expect(store.getReceiptUsage().count).toBe(4);

    const accessEndedInput = eventInput(
      "predecessor-access-ended",
      viewer,
      3_400,
      {
        kind: "signal.access",
        shareId: "share-access",
        sessionId: "share-access",
        targetClientId: owner.clientId,
        decision: "ended",
      },
    );
    const accessFingerprints =
      await createPublishReceiptFingerprints(accessEndedInput);
    await expect(
      appendScreenSignal(
        store,
        accessEndedInput,
        viewer,
        3_400,
        fourReceiptBudget,
      ),
    ).resolves.toMatchObject({ ok: true });

    expect(
      store.findTeardownAck(
        stopFingerprints.idempotencyFingerprint,
      ),
    ).toMatchObject({
      requestFingerprint: stopFingerprints.requestFingerprint,
      sequence: 2,
    });
    expect(
      store.findTeardownAck(
        accessFingerprints.idempotencyFingerprint,
      ),
    ).toMatchObject({
      requestFingerprint: accessFingerprints.requestFingerprint,
      sequence: 6,
    });
    expect(
      database
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM teardown_ack_tombstone) AS teardown_acks,
             (SELECT COUNT(*) FROM screen_session_member
              WHERE session_id = 'share-access'
                AND client_id = 'client-viewer') AS viewer_members`,
        )
        .get(),
    ).toEqual({ teardown_acks: 2, viewer_members: 0 });
  });

  it("rotates share and member predecessors before one-shot teardown", async () => {
    const { store, database } = createStoreContext();
    const owner = {
      actorId: "actor-rotation-owner",
      clientId: "client-rotation-owner",
      connectionId: "connection-rotation-owner",
      sessionExpiresAtMs: 100_000,
    } as const;
    const viewer = {
      actorId: "actor-rotation-viewer",
      clientId: "client-rotation-viewer",
      connectionId: "connection-rotation-viewer",
      sessionExpiresAtMs: 100_000,
    } as const;
    const announce = (
      idempotencyKey: string,
      serverAtMs: number,
    ): Promise<ScreenSignalPublication> =>
      appendScreenSignal(
        store,
        {
          idempotencyKey,
          actorId: owner.actorId,
          clientId: owner.clientId,
          connectionId: owner.connectionId,
          channel: "screen-signaling",
          serverAtMs,
          eventExpiresAtMs: 100_000,
          receiptExpiresAtMs: 100_000,
          payload: {
            kind: "signal.announce",
            shareId: "share-rotation",
            label: "Rotation Share",
          },
        },
        owner,
        serverAtMs,
      );
    const request = (
      idempotencyKey: string,
      serverAtMs: number,
    ): Promise<ScreenSignalPublication> =>
      appendScreenSignal(
        store,
        {
          idempotencyKey,
          actorId: viewer.actorId,
          clientId: viewer.clientId,
          connectionId: viewer.connectionId,
          channel: "screen-signaling",
          serverAtMs,
          eventExpiresAtMs: 100_000,
          receiptExpiresAtMs: 100_000,
          payload: {
            kind: "signal.request",
            shareId: "share-rotation",
            sessionId: "share-rotation",
            targetClientId: owner.clientId,
          },
        },
        viewer,
        serverAtMs,
      );
    const readShareToken = (): string =>
      (
        database
          .prepare(
            `SELECT predecessor_token
             FROM screen_share_teardown_predecessor
             WHERE share_id = 'share-rotation'`,
          )
          .get() as { predecessor_token: string }
      ).predecessor_token;
    const readMemberToken = (): string =>
      (
        database
          .prepare(
            `SELECT predecessor_token
             FROM screen_member_teardown_predecessor
             WHERE session_id = 'share-rotation'
               AND actor_id = 'actor-rotation-viewer'
               AND client_id = 'client-rotation-viewer'`,
          )
          .get() as { predecessor_token: string }
      ).predecessor_token;

    await announce("rotation-announce-1", 1_000);
    const firstShareToken = readShareToken();
    await announce("rotation-announce-2", 1_100);
    const currentShareToken = readShareToken();
    expect(currentShareToken).not.toBe(firstShareToken);

    await request("rotation-request-1", 1_200);
    const firstMemberToken = readMemberToken();
    await request("rotation-request-2", 1_300);
    const currentMemberToken = readMemberToken();
    expect(currentMemberToken).not.toBe(firstMemberToken);

    await expect(
      appendScreenSignal(
        store,
        {
          idempotencyKey: "rotation-ended",
          actorId: viewer.actorId,
          clientId: viewer.clientId,
          connectionId: viewer.connectionId,
          channel: "screen-signaling",
          serverAtMs: 1_400,
          eventExpiresAtMs: 100_000,
          receiptExpiresAtMs: 100_000,
          payload: {
            kind: "signal.access",
            shareId: "share-rotation",
            sessionId: "share-rotation",
            targetClientId: owner.clientId,
            decision: "ended",
          },
        },
        viewer,
        1_400,
      ),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      appendScreenSignal(
        store,
        {
          idempotencyKey: "rotation-stop",
          actorId: owner.actorId,
          clientId: owner.clientId,
          connectionId: owner.connectionId,
          channel: "screen-signaling",
          serverAtMs: 1_500,
          eventExpiresAtMs: 100_000,
          receiptExpiresAtMs: 100_000,
          payload: {
            kind: "signal.stop",
            shareId: "share-rotation",
          },
        },
        owner,
        1_500,
      ),
    ).resolves.toMatchObject({ ok: true });

    const consumedTokens = database
      .prepare(
        `SELECT predecessor_token
         FROM teardown_ack_tombstone
         ORDER BY sequence`,
      )
      .all()
      .map(
        (row) =>
          (row as { predecessor_token: string }).predecessor_token,
      );
    expect(consumedTokens).toEqual([
      currentMemberToken,
      currentShareToken,
    ]);
    expect(consumedTokens).not.toContain(firstMemberToken);
    expect(consumedTokens).not.toContain(firstShareToken);
  });

  it("rolls back teardown authorization when ACK persistence fails", async () => {
    const { store, database } = createStoreContext();
    const owner = {
      actorId: "actor-rollback-owner",
      clientId: "client-rollback-owner",
      connectionId: "connection-rollback-owner",
      sessionExpiresAtMs: 100_000,
    } as const;
    await appendScreenSignal(
      store,
      {
        idempotencyKey: "rollback-announce",
        actorId: owner.actorId,
        clientId: owner.clientId,
        connectionId: owner.connectionId,
        channel: "screen-signaling",
        serverAtMs: 1_000,
        eventExpiresAtMs: 100_000,
        receiptExpiresAtMs: 100_000,
        payload: {
          kind: "signal.announce",
          shareId: "share-rollback",
          label: "Rollback Share",
        },
      },
      owner,
      1_000,
    );
    database.exec(`
      CREATE TRIGGER reject_teardown_ack
      BEFORE INSERT ON teardown_ack_tombstone
      BEGIN
        SELECT RAISE(ABORT, 'forced teardown ACK failure');
      END;
    `);
    const stopInput = {
      idempotencyKey: "rollback-stop",
      actorId: owner.actorId,
      clientId: owner.clientId,
      connectionId: owner.connectionId,
      channel: "screen-signaling",
      serverAtMs: 1_100,
      eventExpiresAtMs: 100_000,
      receiptExpiresAtMs: 100_000,
      payload: {
        kind: "signal.stop",
        shareId: "share-rollback",
      },
    } as const;

    await expect(
      appendScreenSignal(store, stopInput, owner, 1_100),
    ).rejects.toThrow(/forced teardown ACK failure/iu);
    expect(
      database
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM screen_share
              WHERE share_id = 'share-rollback') AS shares,
             (SELECT COUNT(*) FROM screen_share_teardown_predecessor
              WHERE share_id = 'share-rollback') AS predecessors,
             (SELECT COUNT(*) FROM event_log) AS events,
             (SELECT COUNT(*) FROM teardown_ack_tombstone)
               AS teardown_acks,
             (SELECT current_sequence FROM channel_state
              WHERE channel = 'screen-signaling') AS sequence`,
        )
        .get(),
    ).toEqual({
      shares: 1,
      predecessors: 1,
      events: 1,
      teardown_acks: 0,
      sequence: 1,
    });

    database.exec("DROP TRIGGER reject_teardown_ack");
    await expect(
      appendScreenSignal(store, stopInput, owner, 1_100),
    ).resolves.toMatchObject({ ok: true });
    expect(
      database
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM screen_share
              WHERE share_id = 'share-rollback') AS shares,
             (SELECT COUNT(*) FROM screen_share_teardown_predecessor
              WHERE share_id = 'share-rollback') AS predecessors,
             (SELECT COUNT(*) FROM event_log) AS events,
             (SELECT COUNT(*) FROM teardown_ack_tombstone)
               AS teardown_acks,
             (SELECT current_sequence FROM channel_state
              WHERE channel = 'screen-signaling') AS sequence`,
        )
        .get(),
    ).toEqual({
      shares: 0,
      predecessors: 0,
      events: 2,
      teardown_acks: 1,
      sequence: 2,
    });
  });

  it("stores fixed-width teardown ACKs and prunes them at expiry", async () => {
    const { store, database } = createStoreContext();
    const owner = {
      actorId: "actor-fixed-owner",
      clientId: "client-fixed-owner",
      connectionId: "connection-fixed-owner",
      sessionExpiresAtMs: 100_000,
    } as const;
    await appendScreenSignal(
      store,
      {
        idempotencyKey: "fixed-announce",
        actorId: owner.actorId,
        clientId: owner.clientId,
        connectionId: owner.connectionId,
        channel: "screen-signaling",
        serverAtMs: 1_000,
        eventExpiresAtMs: 10_000,
        receiptExpiresAtMs: 10_000,
        payload: {
          kind: "signal.announce",
          shareId: "share-fixed",
          label: "Fixed Width Share",
        },
      },
      owner,
      1_000,
    );
    const stopInput = {
      idempotencyKey: `fixed-stop-${"x".repeat(96)}`,
      actorId: owner.actorId,
      clientId: owner.clientId,
      connectionId: owner.connectionId,
      channel: "screen-signaling",
      serverAtMs: 1_100,
      eventExpiresAtMs: 10_000,
      receiptExpiresAtMs: 2_000,
      payload: {
        kind: "signal.stop",
        shareId: "share-fixed",
      },
    } as const;
    const fingerprints =
      await createPublishReceiptFingerprints(stopInput);
    await expect(
      appendScreenSignal(store, stopInput, owner, 1_100),
    ).resolves.toMatchObject({ ok: true });

    expect(
      database
        .prepare("PRAGMA table_info(teardown_ack_tombstone)")
        .all()
        .map((row) => (row as { name: string }).name),
    ).toEqual([
      "idempotency_fingerprint",
      "request_fingerprint",
      "predecessor_token",
      "sequence",
      "expires_at_ms",
    ]);
    const fixedAck = database
      .prepare(
        `SELECT
           length(idempotency_fingerprint) AS idempotency_bytes,
           length(request_fingerprint) AS request_bytes,
           length(predecessor_token) AS predecessor_bytes,
           length(idempotency_fingerprint)
             + length(request_fingerprint)
             + length(predecessor_token) AS fixed_text_bytes,
           predecessor_token
         FROM teardown_ack_tombstone`,
      )
      .get() as {
      idempotency_bytes: number;
      request_bytes: number;
      predecessor_bytes: number;
      fixed_text_bytes: number;
      predecessor_token: string;
    };
    expect(fixedAck).toMatchObject({
      idempotency_bytes: 64,
      request_bytes: 64,
      predecessor_bytes: 32,
      fixed_text_bytes: 160,
    });
    expect(
      database
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM teardown_ack_tombstone)
               AS teardown_acks,
             (SELECT COUNT(*) FROM idempotency_receipt)
               AS ordinary_predecessors`,
        )
        .get(),
    ).toEqual({ teardown_acks: 1, ordinary_predecessors: 1 });
    expect(() =>
      database
        .prepare(
          `INSERT INTO teardown_ack_tombstone
             (idempotency_fingerprint, request_fingerprint,
              predecessor_token, sequence, expires_at_ms)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          "0".repeat(64),
          "1".repeat(64),
          fixedAck.predecessor_token,
          99,
          3_000,
        ),
    ).toThrow(/UNIQUE/iu);

    store.prune(1_999, 128);
    expect(
      store.findTeardownAck(
        fingerprints.idempotencyFingerprint,
      ),
    ).not.toBeNull();
    store.prune(2_000, 128);
    expect(
      store.findTeardownAck(
        fingerprints.idempotencyFingerprint,
      ),
    ).toBeNull();
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM teardown_ack_tombstone",
        )
        .get(),
    ).toEqual({ count: 0 });
  });

  it("admits cross-actor teardown after 64 tombstones and rejects unauthorized mutation", async () => {
    const { store, database } = createStoreContext();
    const filler = {
      actorId: "actor-filler",
      clientId: "client-filler",
      connectionId: "connection-filler",
      sessionExpiresAtMs: 100_000,
    } as const;
    for (let index = 0; index < 64; index += 1) {
      const suffix = index.toString().padStart(2, "0");
      const shareId = `share-filled-${suffix}`;
      await appendScreenSignal(
        store,
        {
          idempotencyKey: `announce-filled-${suffix}`,
          actorId: filler.actorId,
          clientId: filler.clientId,
          connectionId: filler.connectionId,
          channel: "screen-signaling",
          serverAtMs: 2_000 + index,
          eventExpiresAtMs: 100_000,
          receiptExpiresAtMs: 100_000,
          payload: {
            kind: "signal.announce",
            shareId,
            label: `Filled Share ${suffix}`,
          },
        },
        filler,
        2_000 + index,
      );
      await appendScreenSignal(
        store,
        {
          idempotencyKey: `stop-filled-${suffix}`,
          actorId: filler.actorId,
          clientId: filler.clientId,
          connectionId: filler.connectionId,
          channel: "screen-signaling",
          serverAtMs: 3_000 + index,
          eventExpiresAtMs: 100_000,
          receiptExpiresAtMs: 100_000,
          payload: { kind: "signal.stop", shareId },
        },
        filler,
        3_000 + index,
      );
    }
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM teardown_ack_tombstone",
        )
        .get(),
    ).toEqual({ count: 64 });

    const owner = {
      actorId: "actor-other-owner",
      clientId: "client-other-owner",
      connectionId: "connection-other-owner",
      sessionExpiresAtMs: 100_000,
    } as const;
    const otherStopShare = "share-other-stop";
    await appendScreenSignal(
      store,
      {
        idempotencyKey: "announce-other-stop",
        actorId: owner.actorId,
        clientId: owner.clientId,
        connectionId: owner.connectionId,
        channel: "screen-signaling",
        serverAtMs: 4_000,
        eventExpiresAtMs: 100_000,
        receiptExpiresAtMs: 100_000,
        payload: {
          kind: "signal.announce",
          shareId: otherStopShare,
          label: "Other Stop Share",
        },
      },
      owner,
      4_000,
    );
    const otherStopInput = {
      idempotencyKey: "stop-other-after-64",
      actorId: owner.actorId,
      clientId: owner.clientId,
      connectionId: owner.connectionId,
      channel: "screen-signaling",
      serverAtMs: 4_100,
      eventExpiresAtMs: 100_000,
      receiptExpiresAtMs: 100_000,
      payload: {
        kind: "signal.stop",
        shareId: otherStopShare,
      },
    } as const;
    const otherStopFingerprints =
      await createPublishReceiptFingerprints(otherStopInput);
    const otherStop = await appendScreenSignal(
      store,
      otherStopInput,
      owner,
      4_100,
    );
    expect(otherStop).toMatchObject({ ok: true });
    const otherStopSequence =
      otherStop.ok ? otherStop.stored.event.sequence : 0;
    const otherStopAck = store.findTeardownAck(
      otherStopFingerprints.idempotencyFingerprint,
    );
    expect(otherStopAck).toMatchObject({
      requestFingerprint:
        otherStopFingerprints.requestFingerprint,
      sequence: otherStopSequence,
    });
    expect(
      store.findTeardownAck(
        otherStopFingerprints.idempotencyFingerprint,
      ),
    ).toEqual(otherStopAck);

    const viewer = {
      actorId: "actor-other-viewer",
      clientId: "client-other-viewer",
      connectionId: "connection-other-viewer",
      sessionExpiresAtMs: 100_000,
    } as const;
    await appendScreenSignal(
      store,
      {
        idempotencyKey: "announce-other-access",
        actorId: owner.actorId,
        clientId: owner.clientId,
        connectionId: owner.connectionId,
        channel: "screen-signaling",
        serverAtMs: 4_120,
        eventExpiresAtMs: 100_000,
        receiptExpiresAtMs: 100_000,
        payload: {
          kind: "signal.announce",
          shareId: "share-other-access",
          label: "Other Access Share",
        },
      },
      owner,
      4_120,
    );
    await appendScreenSignal(
      store,
      {
        idempotencyKey: "request-other-access",
        actorId: viewer.actorId,
        clientId: viewer.clientId,
        connectionId: viewer.connectionId,
        channel: "screen-signaling",
        serverAtMs: 4_130,
        eventExpiresAtMs: 100_000,
        receiptExpiresAtMs: 100_000,
        payload: {
          kind: "signal.request",
          shareId: "share-other-access",
          sessionId: "share-other-access",
          targetClientId: owner.clientId,
        },
      },
      viewer,
      4_130,
    );
    await appendScreenSignal(
      store,
      {
        idempotencyKey: "approve-other-access",
        actorId: owner.actorId,
        clientId: owner.clientId,
        connectionId: owner.connectionId,
        channel: "screen-signaling",
        serverAtMs: 4_140,
        eventExpiresAtMs: 100_000,
        receiptExpiresAtMs: 100_000,
        payload: {
          kind: "signal.access",
          shareId: "share-other-access",
          sessionId: "share-other-access",
          targetClientId: viewer.clientId,
          decision: "approved",
        },
      },
      owner,
      4_140,
    );
    const otherAccessEndedInput = {
      idempotencyKey: "access-ended-other-after-64",
      actorId: viewer.actorId,
      clientId: viewer.clientId,
      connectionId: viewer.connectionId,
      channel: "screen-signaling",
      serverAtMs: 4_150,
      eventExpiresAtMs: 100_000,
      receiptExpiresAtMs: 100_000,
      payload: {
        kind: "signal.access",
        shareId: "share-other-access",
        sessionId: "share-other-access",
        targetClientId: owner.clientId,
        decision: "ended",
      },
    } as const;
    const otherAccessFingerprints =
      await createPublishReceiptFingerprints(
        otherAccessEndedInput,
      );
    const otherAccessEnded = await appendScreenSignal(
      store,
      otherAccessEndedInput,
      viewer,
      4_150,
    );
    expect(otherAccessEnded).toMatchObject({ ok: true });
    const otherAccessSequence = otherAccessEnded.ok
      ? otherAccessEnded.stored.event.sequence
      : 0;
    expect(
      store.findTeardownAck(
        otherAccessFingerprints.idempotencyFingerprint,
      ),
    ).toMatchObject({
      requestFingerprint:
        otherAccessFingerprints.requestFingerprint,
      sequence: otherAccessSequence,
    });
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM teardown_ack_tombstone",
        )
        .get(),
    ).toEqual({ count: 66 });

    const unauthorizedShare = "share-unauthorized-stop";
    await appendScreenSignal(
      store,
      {
        idempotencyKey: "announce-unauthorized-stop",
        actorId: owner.actorId,
        clientId: owner.clientId,
        connectionId: owner.connectionId,
        channel: "screen-signaling",
        serverAtMs: 4_200,
        eventExpiresAtMs: 100_000,
        receiptExpiresAtMs: 100_000,
        payload: {
          kind: "signal.announce",
          shareId: unauthorizedShare,
          label: "Protected Share",
        },
      },
      owner,
      4_200,
    );
    const attacker = {
      actorId: "actor-attacker",
      clientId: "client-attacker",
      connectionId: "connection-attacker",
      sessionExpiresAtMs: 100_000,
    } as const;
    const unauthorizedInput = {
      idempotencyKey: "unauthorized-stop-after-64",
      actorId: attacker.actorId,
      clientId: attacker.clientId,
      connectionId: attacker.connectionId,
      channel: "screen-signaling",
      serverAtMs: 4_300,
      eventExpiresAtMs: 100_000,
      receiptExpiresAtMs: 100_000,
      payload: {
        kind: "signal.stop",
        shareId: unauthorizedShare,
      },
    } as const;
    const unauthorizedFingerprints =
      await createPublishReceiptFingerprints(unauthorizedInput);
    const sequenceBeforeUnauthorized =
      store.getSequenceState("screen-signaling").currentSequence;
    await expect(
      appendScreenSignal(
        store,
        unauthorizedInput,
        attacker,
        4_300,
      ),
    ).resolves.toEqual({ ok: false });
    expect(
      store.findTeardownAck(
        unauthorizedFingerprints.idempotencyFingerprint,
      ),
    ).toBeNull();
    expect(
      store.getSequenceState("screen-signaling").currentSequence,
    ).toBe(sequenceBeforeUnauthorized);
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM screen_share WHERE share_id = ?",
        )
        .get(unauthorizedShare),
    ).toEqual({ count: 1 });
  });

  it("claims expired shares once and removes legacy inactive signaling rows", () => {
    const { store, database } = createStoreContext();
    const owner = {
      actorId: "actor-owner",
      clientId: "client-owner",
      connectionId: "connection-owner",
      sessionExpiresAtMs: 2_000,
    } as const;
    expect(
      store.authorizeScreenSignal(
        {
          kind: "signal.announce",
          shareId: "share-expiring",
          label: "작업 화면",
        },
        owner,
        1_000,
      ),
    ).toMatchObject({ ok: true });
    expect(store.endExpiredShares(1_999)).toEqual([]);
    expect(store.endExpiredShares(2_000)).toEqual([
      {
        shareId: "share-expiring",
        ownerActorId: "actor-owner",
        ownerClientId: "client-owner",
        ownerConnectionId: "connection-owner",
        expiresAtMs: 2_000,
      },
    ]);
    expect(store.endExpiredShares(2_000)).toEqual([]);
    expect(
      database
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM screen_share) AS shares,
             (SELECT COUNT(*) FROM screen_session_member) AS members,
             (SELECT COUNT(*) FROM screen_peer) AS peers`,
        )
        .get(),
    ).toEqual({ shares: 0, members: 0, peers: 0 });

    expect(
      store.authorizeScreenSignal(
        {
          kind: "signal.announce",
          shareId: "share-expiring",
          label: "다시 공유",
        },
        {
          ...owner,
          sessionExpiresAtMs: 10_000,
        },
        2_100,
      ),
    ).toMatchObject({ ok: true });

    database.exec(`
      INSERT INTO screen_share
        (share_id, owner_actor_id, owner_client_id, owner_connection_id,
         label, active, expires_at_ms, updated_at_ms)
      VALUES
        ('share-legacy', 'actor-owner', 'client-owner',
         'connection-owner', 'legacy', 0, 9_000, 2_000);
      INSERT INTO screen_session_member
        (session_id, share_id, actor_id, client_id, role, status, expires_at_ms)
      VALUES
        ('share-legacy', 'share-legacy', 'actor-owner',
         'client-owner', 'owner', 'ended', 9_000);
      INSERT INTO screen_peer
        (session_id, peer_connection_id, owner_actor_id, owner_client_id,
         viewer_actor_id, viewer_client_id, expires_at_ms)
      VALUES
        ('share-legacy', 'peer-legacy', 'actor-owner', 'client-owner',
         'actor-viewer', 'client-viewer', 9_000);
    `);
    store.prune(2_100, 128);
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM screen_share WHERE active = 0",
        )
        .get(),
    ).toEqual({ count: 0 });
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM screen_session_member WHERE share_id = 'share-legacy'",
        )
        .get(),
    ).toEqual({ count: 0 });
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM screen_peer WHERE session_id = 'share-legacy'",
        )
        .get(),
    ).toEqual({ count: 0 });
  });

  it("enforces durable actor-channel rate and byte budgets independently", () => {
    const store = createStore();
    const limit = { maximumEvents: 2, maximumBytes: 100 };

    expect(
      store.consumeRateBudget(
        "actor-1",
        "presence",
        1_000,
        40,
        1_000,
        limit,
      ).ok,
    ).toBe(true);
    expect(
      store.consumeRateBudget(
        "actor-1",
        "presence",
        1_100,
        60,
        1_000,
        limit,
      ).ok,
    ).toBe(true);
    expect(
      store.consumeRateBudget(
        "actor-1",
        "presence",
        1_200,
        1,
        1_000,
        limit,
      ),
    ).toEqual({ ok: false, retryAtMs: 2_000 });
    expect(
      store.consumeRateBudget(
        "actor-1",
        "comments",
        1_200,
        100,
        1_000,
        limit,
      ).ok,
    ).toBe(true);
    expect(
      store.consumeRateBudget(
        "actor-1",
        "presence",
        2_000,
        100,
        1_000,
        limit,
      ).ok,
    ).toBe(true);
  });
});
