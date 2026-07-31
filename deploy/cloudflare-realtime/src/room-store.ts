import {
  REALTIME_CHANNELS,
  isServerEventMessage,
  serializeRealtimeServerMessage,
  utf8ByteLength,
  validatePayloadForChannel,
  type PresenceCursorPayload,
  type PresenceSnapshotEntry,
  type PresenceUpdatePayload,
  type RealtimeChannel,
  type RealtimeChannelSequenceStates,
  type RealtimePayload,
  type ScreenSignalingPayload,
  type ServerEventMessage,
} from "./protocol";
import {
  computeReplayPrefixCutoff,
  evaluateRateBudget,
  type RealtimeChannelRateLimit,
  type RealtimeRateBudgetState,
} from "./room-core";

import type { PublishReceiptFingerprints } from "./receipt-fingerprint";
import type {
  SqlStorageLike,
  TransactionalSqlStorageLike,
} from "./runtime-types";

interface RoomStateRow extends Record<string, unknown> {
  readonly work_id: string | null;
  readonly room_id: string | null;
}

interface ChannelStateRow extends Record<string, unknown> {
  readonly channel: string;
  readonly current_sequence: number;
  readonly replay_floor_sequence: number;
}

interface EventRow extends Record<string, unknown> {
  readonly channel: string;
  readonly sequence: number;
  readonly envelope_json: string;
  readonly target_actor_id: string | null;
  readonly target_client_id: string | null;
}

interface ReceiptRow extends EventRow {
  readonly actor_id: string;
  readonly client_id: string;
}

interface CountRow extends Record<string, unknown> {
  readonly count: number;
}

interface ActorRow extends Record<string, unknown> {
  readonly actor_id: string;
}

interface MaximumSequenceRow extends Record<string, unknown> {
  readonly maximum_sequence: number | null;
}

interface PresenceRow extends Record<string, unknown> {
  readonly connection_id: string;
  readonly actor_id: string;
  readonly client_id: string;
  readonly update_json: string | null;
  readonly cursor_json: string | null;
}

interface RateBudgetRow extends Record<string, unknown> {
  readonly window_started_at_ms: number;
  readonly event_count: number;
  readonly byte_count: number;
}

interface ReceiptUsageRow extends Record<string, unknown> {
  readonly receipt_count: number;
  readonly receipt_bytes: number;
}

interface SchemaMigrationRow extends Record<string, unknown> {
  readonly version: number;
  readonly name: string;
}

interface TeardownAckRow extends Record<string, unknown> {
  readonly request_fingerprint: string;
  readonly sequence: number;
  readonly predecessor_token: string;
}

interface TeardownPredecessorRow extends Record<string, unknown> {
  readonly predecessor_token: string;
}

interface ConnectionRegistryRow extends Record<string, unknown> {
  readonly connection_id: string;
  readonly actor_id: string;
  readonly client_id: string;
  readonly session_expires_at_ms: number;
}

interface ConnectionCleanupRow extends Record<string, unknown> {
  readonly actor_id: string;
  readonly client_id: string;
  readonly had_presence: number;
}

interface ScreenShareRow extends Record<string, unknown> {
  readonly share_id: string;
  readonly owner_actor_id: string;
  readonly owner_client_id: string;
  readonly owner_connection_id: string;
  readonly active: number;
  readonly expires_at_ms: number;
}

interface ScreenMemberRow extends Record<string, unknown> {
  readonly session_id: string;
  readonly share_id: string;
  readonly actor_id: string;
  readonly client_id: string;
  readonly role: string;
  readonly status: string;
  readonly expires_at_ms: number;
}

interface ScreenPeerRow extends Record<string, unknown> {
  readonly session_id: string;
  readonly peer_connection_id: string;
  readonly owner_actor_id: string;
  readonly owner_client_id: string;
  readonly viewer_actor_id: string;
  readonly viewer_client_id: string;
  readonly expires_at_ms: number;
}

export interface AppendRoomEventInput {
  readonly idempotencyKey: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly connectionId: string;
  readonly channel: RealtimeChannel;
  readonly serverAtMs: number;
  readonly eventExpiresAtMs: number;
  readonly receiptExpiresAtMs: number;
  readonly payload: RealtimePayload;
  readonly targetActorId?: string;
  readonly targetClientId?: string;
}

export type AppendScreenSignalEventInput = Omit<
  AppendRoomEventInput,
  "channel" | "payload" | "targetActorId" | "targetClientId"
> & {
  readonly channel: "screen-signaling";
  readonly payload: ScreenSignalingPayload;
};

export type AppendSystemRoomEventInput = Omit<
  AppendRoomEventInput,
  "receiptExpiresAtMs"
>;

export interface RoomSequenceState {
  readonly currentSequence: number;
  readonly replayFloorSequence: number;
}

export interface StoredRoomEvent {
  readonly event: ServerEventMessage;
  readonly targetActorId: string | null;
  readonly targetClientId: string | null;
}

export interface RegisterConnectionInput {
  readonly connectionId: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly sessionExpiresAtMs: number;
  readonly nowMs: number;
}

export interface RealtimeRateAdmission {
  readonly ok: boolean;
  readonly retryAtMs: number;
}

export interface RealtimeReceiptBudget {
  readonly maximumCount: number;
  readonly maximumBytes: number;
}

export interface RealtimeReceiptUsage {
  readonly count: number;
  readonly bytes: number;
}

export class RealtimeReceiptBudgetExceededError extends Error {
  constructor() {
    super("Realtime idempotency receipt budget is exhausted");
    this.name = "RealtimeReceiptBudgetExceededError";
  }
}

export interface ScreenSignalActor {
  readonly actorId: string;
  readonly clientId: string;
  readonly connectionId: string;
  readonly sessionExpiresAtMs: number;
}

export type ScreenSignalAuthorization =
  | {
      readonly ok: true;
      readonly targetActorId: string | null;
      readonly targetClientId: string | null;
      readonly consumedPredecessorToken?: string;
    }
  | { readonly ok: false };

export type ScreenSignalPublication =
  | {
      readonly ok: true;
      readonly stored: StoredRoomEvent;
    }
  | { readonly ok: false };

export interface TeardownAckReceipt {
  readonly requestFingerprint: string;
  readonly sequence: number;
  readonly predecessorToken: string;
}

export interface EndedScreenShare {
  readonly shareId: string;
  readonly ownerActorId: string;
  readonly ownerClientId: string;
  readonly ownerConnectionId: string;
  readonly expiresAtMs: number;
}

export interface ConnectionCleanupClaim {
  readonly actorId: string;
  readonly clientId: string;
  readonly hadPresence: boolean;
}

export interface RegisteredConnection {
  readonly connectionId: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly sessionExpiresAtMs: number;
}

const ROOM_SCHEMA_V1 = `
  CREATE TABLE IF NOT EXISTS room_state (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    work_id TEXT,
    room_id TEXT
  );
  INSERT OR IGNORE INTO room_state (singleton, work_id, room_id)
    VALUES (1, NULL, NULL);

  CREATE TABLE IF NOT EXISTS channel_state (
    channel TEXT PRIMARY KEY,
    current_sequence INTEGER NOT NULL,
    replay_floor_sequence INTEGER NOT NULL
  );
  INSERT OR IGNORE INTO channel_state
    (channel, current_sequence, replay_floor_sequence)
    VALUES
      ('presence', 0, 1),
      ('comments', 0, 1),
      ('screen-signaling', 0, 1);

  CREATE TABLE IF NOT EXISTS event_log (
    channel TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL,
    envelope_json TEXT NOT NULL,
    target_actor_id TEXT,
    target_client_id TEXT,
    PRIMARY KEY (channel, sequence)
  );
  CREATE INDEX IF NOT EXISTS event_log_expiry_idx
    ON event_log (channel, expires_at_ms, sequence);

  CREATE TABLE IF NOT EXISTS idempotency_receipt (
    idempotency_key TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    envelope_json TEXT NOT NULL,
    target_actor_id TEXT,
    target_client_id TEXT,
    storage_bytes INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idempotency_receipt_expiry_idx
    ON idempotency_receipt (expires_at_ms);

  CREATE TABLE IF NOT EXISTS receipt_usage (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    receipt_count INTEGER NOT NULL,
    receipt_bytes INTEGER NOT NULL
  );
  INSERT OR IGNORE INTO receipt_usage
    (singleton, receipt_count, receipt_bytes)
    VALUES (1, 0, 0);

  CREATE TABLE IF NOT EXISTS ticket_nonce (
    nonce TEXT PRIMARY KEY,
    expires_at_ms INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ticket_nonce_expiry_idx
    ON ticket_nonce (expires_at_ms);

  CREATE TABLE IF NOT EXISTS connection_registry (
    connection_id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    session_expires_at_ms INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS connection_registry_client_idx
    ON connection_registry (client_id, session_expires_at_ms);

  CREATE TABLE IF NOT EXISTS presence_state (
    connection_id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    update_json TEXT,
    cursor_json TEXT,
    updated_at_ms INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS presence_state_client_idx
    ON presence_state (actor_id, client_id);

  CREATE TABLE IF NOT EXISTS rate_budget (
    actor_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    window_started_at_ms INTEGER NOT NULL,
    event_count INTEGER NOT NULL,
    byte_count INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL,
    PRIMARY KEY (actor_id, channel)
  );
  CREATE INDEX IF NOT EXISTS rate_budget_expiry_idx
    ON rate_budget (expires_at_ms);

  CREATE TABLE IF NOT EXISTS screen_share (
    share_id TEXT PRIMARY KEY,
    owner_actor_id TEXT NOT NULL,
    owner_client_id TEXT NOT NULL,
    owner_connection_id TEXT NOT NULL,
    label TEXT NOT NULL,
    active INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS screen_share_expiry_idx
    ON screen_share (expires_at_ms, active);

  CREATE TABLE IF NOT EXISTS screen_session_member (
    session_id TEXT NOT NULL,
    share_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    expires_at_ms INTEGER NOT NULL,
    PRIMARY KEY (session_id, actor_id, client_id)
  );
  CREATE INDEX IF NOT EXISTS screen_member_client_idx
    ON screen_session_member (session_id, client_id, status);

  CREATE TABLE IF NOT EXISTS screen_peer (
    session_id TEXT NOT NULL,
    peer_connection_id TEXT NOT NULL,
    owner_actor_id TEXT NOT NULL,
    owner_client_id TEXT NOT NULL,
    viewer_actor_id TEXT NOT NULL,
    viewer_client_id TEXT NOT NULL,
    expires_at_ms INTEGER NOT NULL,
    PRIMARY KEY (session_id, peer_connection_id)
  );
  CREATE INDEX IF NOT EXISTS screen_peer_expiry_idx
    ON screen_peer (expires_at_ms);
`;

// V2 remains in the ordered history so existing objects retain duplicate ACKs
// until their legacy receipts expire. New teardown publishes never write it.
const ROOM_SCHEMA_V2 = `
  CREATE TABLE IF NOT EXISTS teardown_idempotency_receipt (
    idempotency_key TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    envelope_json TEXT NOT NULL,
    target_actor_id TEXT,
    target_client_id TEXT,
    storage_bytes INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS teardown_receipt_expiry_idx
    ON teardown_idempotency_receipt (expires_at_ms);
  CREATE TRIGGER IF NOT EXISTS ordinary_receipt_key_conflict
    BEFORE INSERT ON idempotency_receipt
    WHEN EXISTS (
      SELECT 1
      FROM teardown_idempotency_receipt
      WHERE idempotency_key = NEW.idempotency_key
    )
    BEGIN
      SELECT RAISE(ABORT, 'realtime receipt key already reserved');
    END;
  CREATE TRIGGER IF NOT EXISTS teardown_receipt_key_conflict
    BEFORE INSERT ON teardown_idempotency_receipt
    WHEN EXISTS (
      SELECT 1
      FROM idempotency_receipt
      WHERE idempotency_key = NEW.idempotency_key
    )
    BEGIN
      SELECT RAISE(ABORT, 'realtime receipt key already ordinary');
    END;

  CREATE TABLE IF NOT EXISTS teardown_receipt_usage (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    receipt_count INTEGER NOT NULL,
    receipt_bytes INTEGER NOT NULL
  );
  INSERT OR IGNORE INTO teardown_receipt_usage
    (singleton, receipt_count, receipt_bytes)
    VALUES (1, 0, 0);
`;

const ROOM_SCHEMA_V3 = `
  CREATE TABLE IF NOT EXISTS screen_share_teardown_predecessor (
    share_id TEXT PRIMARY KEY,
    predecessor_token TEXT NOT NULL UNIQUE
      CHECK (
        length(predecessor_token) = 32
        AND predecessor_token NOT GLOB '*[^0-9a-f]*'
      )
  );

  CREATE TABLE IF NOT EXISTS screen_member_teardown_predecessor (
    session_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    predecessor_token TEXT NOT NULL UNIQUE
      CHECK (
        length(predecessor_token) = 32
        AND predecessor_token NOT GLOB '*[^0-9a-f]*'
      ),
    PRIMARY KEY (session_id, actor_id, client_id)
  );

  CREATE TABLE IF NOT EXISTS teardown_ack_tombstone (
    idempotency_fingerprint TEXT PRIMARY KEY
      CHECK (
        length(idempotency_fingerprint) = 64
        AND idempotency_fingerprint NOT GLOB '*[^0-9a-f]*'
      ),
    request_fingerprint TEXT NOT NULL
      CHECK (
        length(request_fingerprint) = 64
        AND request_fingerprint NOT GLOB '*[^0-9a-f]*'
      ),
    predecessor_token TEXT NOT NULL UNIQUE
      CHECK (
        length(predecessor_token) = 32
        AND predecessor_token NOT GLOB '*[^0-9a-f]*'
      ),
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    expires_at_ms INTEGER NOT NULL CHECK (expires_at_ms > 0)
  );
  CREATE INDEX IF NOT EXISTS teardown_ack_expiry_idx
    ON teardown_ack_tombstone (expires_at_ms);

  INSERT OR IGNORE INTO screen_share_teardown_predecessor
    (share_id, predecessor_token)
    SELECT share_id, lower(hex(randomblob(16)))
    FROM screen_share
    WHERE active = 1;

  INSERT OR IGNORE INTO screen_member_teardown_predecessor
    (session_id, actor_id, client_id, predecessor_token)
    SELECT session_id, actor_id, client_id, lower(hex(randomblob(16)))
    FROM screen_session_member
    WHERE role = 'viewer'
      AND status IN ('pending', 'approved');

  CREATE TRIGGER IF NOT EXISTS screen_share_predecessor_cleanup
    AFTER DELETE ON screen_share
    BEGIN
      DELETE FROM screen_share_teardown_predecessor
      WHERE share_id = OLD.share_id;
    END;

  CREATE TRIGGER IF NOT EXISTS screen_member_predecessor_cleanup
    AFTER DELETE ON screen_session_member
    BEGIN
      DELETE FROM screen_member_teardown_predecessor
      WHERE session_id = OLD.session_id
        AND actor_id = OLD.actor_id
        AND client_id = OLD.client_id;
    END;
`;

const SCHEMA_MIGRATION_TABLE = `
  CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at_ms INTEGER NOT NULL
  );
`;

const APPLICATION_SCHEMA_MIGRATIONS = [
  {
    version: 1,
    name: "initial-room-schema",
    sql: ROOM_SCHEMA_V1,
  },
  {
    version: 2,
    name: "reserved-teardown-receipts",
    sql: ROOM_SCHEMA_V2,
  },
  {
    version: 3,
    name: "predecessor-bound-teardown-acks",
    sql: ROOM_SCHEMA_V3,
  },
] as const;

export const REALTIME_ROOM_APPLICATION_SCHEMA_VERSION =
  APPLICATION_SCHEMA_MIGRATIONS[
    APPLICATION_SCHEMA_MIGRATIONS.length - 1
  ].version;

function firstRow<Row extends Record<string, unknown>>(
  rows: Row[],
): Row | null {
  return rows.length > 0 ? rows[0] : null;
}

function parseEventRow(row: EventRow): StoredRoomEvent {
  if (
    !Number.isSafeInteger(row.sequence) ||
    typeof row.envelope_json !== "string"
  ) {
    throw new Error("Realtime event log row is invalid");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.envelope_json) as unknown;
  } catch {
    throw new Error("Realtime event log JSON is invalid");
  }
  if (
    !isServerEventMessage(parsed) ||
    parsed.sequence !== row.sequence ||
    parsed.channel !== row.channel
  ) {
    throw new Error("Realtime event log envelope is invalid");
  }
  return {
    event: parsed,
    targetActorId: row.target_actor_id,
    targetClientId: row.target_client_id,
  };
}

function parsePresencePayload<T extends RealtimePayload>(
  source: string | null,
  kind: T["kind"],
): T | null {
  if (source === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    throw new Error("Realtime presence state JSON is invalid");
  }
  if (
    !validatePayloadForChannel("presence", parsed) ||
    parsed.kind !== kind
  ) {
    throw new Error("Realtime presence state payload is invalid");
  }
  return parsed as T;
}

function isApprovedMember(row: ScreenMemberRow | null): row is ScreenMemberRow {
  return row !== null && row.status === "approved";
}

function receiptStorageBytes(
  input: AppendSystemRoomEventInput,
  envelopeJson: string,
): number {
  const textBytes = [
    input.idempotencyKey,
    input.actorId,
    input.clientId,
    input.channel,
    envelopeJson,
  ].reduce((total, value) => total + utf8ByteLength(value), 0);
  // Include the maximum two target identifiers plus a conservative allowance
  // for SQLite row/index metadata and integer columns. That keeps pre-admission
  // independent of signaling authorization side effects.
  return textBytes + 512;
}

export function isScreenSignalTeardown(
  payload: ScreenSignalingPayload,
): boolean {
  return (
    payload.kind === "signal.stop" ||
    (payload.kind === "signal.access" &&
      payload.decision === "ended")
  );
}

function createTeardownPredecessorToken(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

export class RealtimeRoomStore {
  private readonly sql: SqlStorageLike;

  constructor(
    private readonly storage: TransactionalSqlStorageLike,
  ) {
    this.sql = storage.sql;
  }

  initialize(): void {
    this.sql.exec(SCHEMA_MIGRATION_TABLE);
    const appliedRows = this.sql
      .exec<SchemaMigrationRow>(
        "SELECT version, name FROM _sql_schema_migrations ORDER BY version ASC",
      )
      .toArray();
    for (let index = 0; index < appliedRows.length; index += 1) {
      const row = appliedRows[index];
      const migration = APPLICATION_SCHEMA_MIGRATIONS[index];
      if (
        migration === undefined ||
        row.version !== migration.version ||
        row.name !== migration.name
      ) {
        throw new Error(
          "Realtime application schema migration history is invalid",
        );
      }
    }
    for (
      let index = appliedRows.length;
      index < APPLICATION_SCHEMA_MIGRATIONS.length;
      index += 1
    ) {
      const migration = APPLICATION_SCHEMA_MIGRATIONS[index];
      this.storage.transactionSync(() => {
        this.sql.exec(migration.sql);
        this.sql.exec(
          `INSERT INTO _sql_schema_migrations
            (version, name, applied_at_ms)
           VALUES (?, ?, ?)`,
          migration.version,
          migration.name,
          Date.now(),
        );
      });
    }
    this.synchronizeReceiptUsage();
    this.synchronizeTeardownReceiptUsage();
  }

  getApplicationSchemaVersion(): number {
    const row = firstRow(
      this.sql
        .exec<{ version: number }>(
          "SELECT COALESCE(MAX(version), 0) AS version FROM _sql_schema_migrations",
        )
        .toArray(),
    );
    if (
      row === null ||
      !Number.isSafeInteger(row.version) ||
      row.version < 0
    ) {
      throw new Error(
        "Realtime application schema version is unavailable",
      );
    }
    return row.version;
  }

  bindScope(workId: string, roomId: string): boolean {
    this.sql.exec(
      "UPDATE room_state SET work_id = ?, room_id = ? WHERE singleton = 1 AND work_id IS NULL AND room_id IS NULL",
      workId,
      roomId,
    );
    const row = firstRow(
      this.sql
        .exec<RoomStateRow>(
          "SELECT work_id, room_id FROM room_state WHERE singleton = 1",
        )
        .toArray(),
    );
    return (
      row !== null &&
      row.work_id === workId &&
      row.room_id === roomId
    );
  }

  getSequenceState(channel: RealtimeChannel): RoomSequenceState {
    const row = firstRow(
      this.sql
        .exec<ChannelStateRow>(
          "SELECT channel, current_sequence, replay_floor_sequence FROM channel_state WHERE channel = ?",
          channel,
        )
        .toArray(),
    );
    if (
      row === null ||
      row.channel !== channel ||
      !Number.isSafeInteger(row.current_sequence) ||
      !Number.isSafeInteger(row.replay_floor_sequence)
    ) {
      throw new Error("Realtime channel state is unavailable");
    }
    return {
      currentSequence: row.current_sequence,
      replayFloorSequence: row.replay_floor_sequence,
    };
  }

  getAllSequenceStates(): RealtimeChannelSequenceStates {
    return {
      presence: this.getSequenceState("presence"),
      comments: this.getSequenceState("comments"),
      "screen-signaling": this.getSequenceState("screen-signaling"),
    };
  }

  consumeTicketNonce(
    nonce: string,
    expiresAtMs: number,
    nowMs: number,
  ): boolean {
    this.sql.exec(
      "DELETE FROM ticket_nonce WHERE expires_at_ms <= ?",
      nowMs,
    );
    const existing = firstRow(
      this.sql
        .exec<CountRow>(
          "SELECT COUNT(*) AS count FROM ticket_nonce WHERE nonce = ?",
          nonce,
        )
        .toArray(),
    );
    if (existing === null || existing.count !== 0) {
      return false;
    }
    this.sql.exec(
      "INSERT INTO ticket_nonce (nonce, expires_at_ms) VALUES (?, ?)",
      nonce,
      expiresAtMs,
    );
    return true;
  }

  registerConnection(input: RegisterConnectionInput): boolean {
    const actors = this.sql
      .exec<ActorRow>(
        "SELECT DISTINCT actor_id FROM connection_registry WHERE client_id = ? AND session_expires_at_ms > ?",
        input.clientId,
        input.nowMs,
      )
      .toArray();
    if (
      actors.some((row) => row.actor_id !== input.actorId) ||
      actors.some((row) => typeof row.actor_id !== "string")
    ) {
      return false;
    }
    this.sql.exec(
      "INSERT INTO connection_registry (connection_id, actor_id, client_id, session_expires_at_ms) VALUES (?, ?, ?, ?)",
      input.connectionId,
      input.actorId,
      input.clientId,
      input.sessionExpiresAtMs,
    );
    return true;
  }

  listRegisteredConnections(): RegisteredConnection[] {
    return this.sql
      .exec<ConnectionRegistryRow>(
        `SELECT
           connection_id,
           actor_id,
           client_id,
           session_expires_at_ms
         FROM connection_registry
         ORDER BY connection_id ASC`,
      )
      .toArray()
      .map((row) => ({
        connectionId: row.connection_id,
        actorId: row.actor_id,
        clientId: row.client_id,
        sessionExpiresAtMs: row.session_expires_at_ms,
      }));
  }

  matchesRegisteredConnection(
    connection: RegisteredConnection,
  ): boolean {
    const row = firstRow(
      this.sql
        .exec<ConnectionRegistryRow>(
          `SELECT
             connection_id,
             actor_id,
             client_id,
             session_expires_at_ms
           FROM connection_registry
           WHERE connection_id = ?`,
          connection.connectionId,
        )
        .toArray(),
    );
    return (
      row !== null &&
      row.actor_id === connection.actorId &&
      row.client_id === connection.clientId &&
      row.session_expires_at_ms ===
        connection.sessionExpiresAtMs
    );
  }

  reconcileRegisteredConnections(
    liveConnectionIds: ReadonlySet<string>,
    nowMs: number,
    eventExpiresAtMs: number,
  ): StoredRoomEvent[] {
    const stored: StoredRoomEvent[] = [];
    for (const connection of this.listRegisteredConnections()) {
      if (!liveConnectionIds.has(connection.connectionId)) {
        stored.push(
          ...this.cleanupConnectionWithEvents(
            connection.connectionId,
            nowMs,
            eventExpiresAtMs,
          ),
        );
      }
    }
    return stored;
  }

  cleanupConnectionWithEvents(
    connectionId: string,
    nowMs: number,
    eventExpiresAtMs: number,
    expectedIdentity?: {
      readonly actorId: string;
      readonly clientId: string;
    },
  ): StoredRoomEvent[] {
    return this.storage.transactionSync(() => {
      const row = firstRow(
        this.sql
          .exec<ConnectionCleanupRow>(
            `SELECT
               c.actor_id,
               c.client_id,
               EXISTS(
                 SELECT 1
                 FROM presence_state p
                 WHERE p.connection_id = c.connection_id
               ) AS had_presence
             FROM connection_registry c
             WHERE c.connection_id = ?`,
            connectionId,
          )
          .toArray(),
      );
      if (
        row === null ||
        (expectedIdentity !== undefined &&
          (row.actor_id !== expectedIdentity.actorId ||
            row.client_id !== expectedIdentity.clientId))
      ) {
        return [];
      }

      this.sql.exec(
        "DELETE FROM presence_state WHERE connection_id = ?",
        connectionId,
      );
      this.sql.exec(
        "DELETE FROM connection_registry WHERE connection_id = ?",
        connectionId,
      );

      const events: StoredRoomEvent[] = [];
      if (row.had_presence === 1) {
        events.push(
          this.appendSystemEvent({
            idempotencyKey: crypto.randomUUID(),
            actorId: row.actor_id,
            clientId: row.client_id,
            connectionId,
            channel: "presence",
            serverAtMs: nowMs,
            eventExpiresAtMs,
            payload: { kind: "presence.leave" },
          }),
        );
      }

      if (
        this.countClientConnections(
          row.actor_id,
          row.client_id,
          nowMs,
        ) !== 0
      ) {
        return events;
      }
      for (const share of this.listOwnedShares(
        row.actor_id,
        row.client_id,
      )) {
        this.endShare(share.share_id, nowMs);
        events.push(
          this.appendSystemEvent({
            idempotencyKey: crypto.randomUUID(),
            actorId: share.owner_actor_id,
            clientId: share.owner_client_id,
            connectionId: share.owner_connection_id,
            channel: "screen-signaling",
            serverAtMs: nowMs,
            eventExpiresAtMs,
            payload: {
              kind: "signal.stop",
              shareId: share.share_id,
            },
          }),
        );
      }
      return events;
    });
  }

  unregisterConnection(connectionId: string): ConnectionCleanupClaim | null {
    const row = firstRow(
      this.sql
        .exec<ConnectionCleanupRow>(
          `SELECT
             c.actor_id,
             c.client_id,
             EXISTS(
               SELECT 1
               FROM presence_state p
               WHERE p.connection_id = c.connection_id
             ) AS had_presence
           FROM connection_registry c
           WHERE c.connection_id = ?`,
          connectionId,
        )
        .toArray(),
    );
    if (row === null) {
      return null;
    }
    this.sql.exec(
      "DELETE FROM presence_state WHERE connection_id = ?",
      connectionId,
    );
    this.sql.exec(
      "DELETE FROM connection_registry WHERE connection_id = ?",
      connectionId,
    );
    return {
      actorId: row.actor_id,
      clientId: row.client_id,
      hadPresence: row.had_presence === 1,
    };
  }

  countClientConnections(
    actorId: string,
    clientId: string,
    nowMs: number,
  ): number {
    const row = firstRow(
      this.sql
        .exec<CountRow>(
          "SELECT COUNT(*) AS count FROM connection_registry WHERE actor_id = ? AND client_id = ? AND session_expires_at_ms > ?",
          actorId,
          clientId,
          nowMs,
        )
        .toArray(),
    );
    return row !== null && Number.isSafeInteger(row.count) ? row.count : 0;
  }

  resolveActiveClientActor(
    clientId: string,
    nowMs: number,
  ): string | null {
    const actors = this.sql
      .exec<ActorRow>(
        "SELECT DISTINCT actor_id FROM connection_registry WHERE client_id = ? AND session_expires_at_ms > ?",
        clientId,
        nowMs,
      )
      .toArray();
    if (actors.length === 0) {
      return null;
    }
    if (
      actors.length !== 1 ||
      typeof actors[0].actor_id !== "string"
    ) {
      throw new Error("Realtime client identity is ambiguous");
    }
    return actors[0].actor_id;
  }

  updatePresence(
    connectionId: string,
    actorId: string,
    clientId: string,
    payload: PresenceUpdatePayload | PresenceCursorPayload,
    nowMs: number,
  ): void {
    if (payload.kind === "presence.update") {
      this.sql.exec(
        `INSERT INTO presence_state
          (connection_id, actor_id, client_id, update_json, cursor_json, updated_at_ms)
         VALUES (?, ?, ?, ?, NULL, ?)
         ON CONFLICT(connection_id) DO UPDATE SET
           actor_id = excluded.actor_id,
           client_id = excluded.client_id,
           update_json = excluded.update_json,
           updated_at_ms = excluded.updated_at_ms`,
        connectionId,
        actorId,
        clientId,
        JSON.stringify(payload),
        nowMs,
      );
      return;
    }
    const { points: _points, ...snapshotCursor } = payload;
    this.sql.exec(
      `INSERT INTO presence_state
        (connection_id, actor_id, client_id, update_json, cursor_json, updated_at_ms)
       VALUES (?, ?, ?, NULL, ?, ?)
       ON CONFLICT(connection_id) DO UPDATE SET
         actor_id = excluded.actor_id,
         client_id = excluded.client_id,
         cursor_json = excluded.cursor_json,
         updated_at_ms = excluded.updated_at_ms`,
      connectionId,
      actorId,
      clientId,
      JSON.stringify(snapshotCursor),
      nowMs,
    );
  }

  clearPresence(connectionId: string): void {
    this.sql.exec(
      "DELETE FROM presence_state WHERE connection_id = ?",
      connectionId,
    );
  }

  countClientPresence(actorId: string, clientId: string): number {
    const row = firstRow(
      this.sql
        .exec<CountRow>(
          "SELECT COUNT(*) AS count FROM presence_state WHERE actor_id = ? AND client_id = ?",
          actorId,
          clientId,
        )
        .toArray(),
    );
    return row !== null && Number.isSafeInteger(row.count) ? row.count : 0;
  }

  listPresenceSnapshot(nowMs: number): PresenceSnapshotEntry[] {
    return this.sql
      .exec<PresenceRow>(
        `SELECT
           p.connection_id,
           p.actor_id,
           p.client_id,
           p.update_json,
           p.cursor_json
         FROM presence_state p
         INNER JOIN connection_registry c
           ON c.connection_id = p.connection_id
         WHERE c.session_expires_at_ms > ?
         ORDER BY p.connection_id ASC`,
        nowMs,
      )
      .toArray()
      .map((row) => ({
        connectionId: row.connection_id,
        actorId: row.actor_id,
        clientId: row.client_id,
        update: parsePresencePayload<PresenceUpdatePayload>(
          row.update_json,
          "presence.update",
        ),
        cursor: parsePresencePayload<PresenceCursorPayload>(
          row.cursor_json,
          "presence.cursor",
        ),
      }));
  }

  consumeRateBudget(
    actorId: string,
    channel: RealtimeChannel,
    nowMs: number,
    frameBytes: number,
    windowMs: number,
    limit: RealtimeChannelRateLimit,
  ): RealtimeRateAdmission {
    const row = firstRow(
      this.sql
        .exec<RateBudgetRow>(
          "SELECT window_started_at_ms, event_count, byte_count FROM rate_budget WHERE actor_id = ? AND channel = ?",
          actorId,
          channel,
        )
        .toArray(),
    );
    const previous: RealtimeRateBudgetState | null =
      row === null
        ? null
        : {
            windowStartedAtMs: row.window_started_at_ms,
            eventCount: row.event_count,
            byteCount: row.byte_count,
          };
    const evaluated = evaluateRateBudget(
      previous,
      nowMs,
      frameBytes,
      windowMs,
      limit,
    );
    if (!evaluated.ok) {
      return { ok: false, retryAtMs: evaluated.retryAtMs };
    }
    this.sql.exec(
      `INSERT INTO rate_budget
        (actor_id, channel, window_started_at_ms, event_count, byte_count, expires_at_ms)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(actor_id, channel) DO UPDATE SET
         window_started_at_ms = excluded.window_started_at_ms,
         event_count = excluded.event_count,
         byte_count = excluded.byte_count,
         expires_at_ms = excluded.expires_at_ms`,
      actorId,
      channel,
      evaluated.state.windowStartedAtMs,
      evaluated.state.eventCount,
      evaluated.state.byteCount,
      evaluated.expiresAtMs,
    );
    return { ok: true, retryAtMs: evaluated.expiresAtMs };
  }

  findReceipt(idempotencyKey: string): StoredRoomEvent | null {
    return (
      this.findReceiptInTable(
        "idempotency_receipt",
        idempotencyKey,
      ) ??
      this.findReceiptInTable(
        "teardown_idempotency_receipt",
        idempotencyKey,
      )
    );
  }

  findTeardownAck(
    idempotencyFingerprint: string,
  ): TeardownAckReceipt | null {
    const row = firstRow(
      this.sql
        .exec<TeardownAckRow>(
          `SELECT
             request_fingerprint,
             sequence,
             predecessor_token
           FROM teardown_ack_tombstone
           WHERE idempotency_fingerprint = ?`,
          idempotencyFingerprint,
        )
        .toArray(),
    );
    if (row === null) {
      return null;
    }
    if (
      typeof row.request_fingerprint !== "string" ||
      !Number.isSafeInteger(row.sequence) ||
      row.sequence <= 0 ||
      typeof row.predecessor_token !== "string"
    ) {
      throw new Error("Realtime teardown ACK tombstone is invalid");
    }
    return {
      requestFingerprint: row.request_fingerprint,
      sequence: row.sequence,
      predecessorToken: row.predecessor_token,
    };
  }

  private findReceiptInTable(
    table:
      | "idempotency_receipt"
      | "teardown_idempotency_receipt",
    idempotencyKey: string,
  ): StoredRoomEvent | null {
    const row = firstRow(
      this.sql
        .exec<ReceiptRow>(
          `SELECT
             channel,
             sequence,
             envelope_json,
             target_actor_id,
             target_client_id,
             actor_id,
             client_id
           FROM ${table}
           WHERE idempotency_key = ?`,
          idempotencyKey,
        )
        .toArray(),
    );
    if (row === null) {
      return null;
    }
    const stored = parseEventRow(row);
    if (
      stored.event.actorId !== row.actor_id ||
      stored.event.clientId !== row.client_id
    ) {
      throw new Error("Realtime idempotency receipt is invalid");
    }
    return stored;
  }

  getReceiptUsage(): RealtimeReceiptUsage {
    return this.readReceiptUsage("receipt_usage");
  }

  private readReceiptUsage(
    table: "receipt_usage",
  ): RealtimeReceiptUsage {
    const row = firstRow(
      this.sql
        .exec<ReceiptUsageRow>(
          `SELECT receipt_count, receipt_bytes FROM ${table} WHERE singleton = 1`,
        )
        .toArray(),
    );
    if (
      row === null ||
      !Number.isSafeInteger(row.receipt_count) ||
      row.receipt_count < 0 ||
      !Number.isSafeInteger(row.receipt_bytes) ||
      row.receipt_bytes < 0
    ) {
      throw new Error("Realtime idempotency receipt usage is invalid");
    }
    return {
      count: row.receipt_count,
      bytes: row.receipt_bytes,
    };
  }

  canAppendReceipt(
    input: AppendRoomEventInput,
    budget: RealtimeReceiptBudget,
  ): boolean {
    const prepared = this.prepareEvent(input);
    const usage = this.getReceiptUsage();
    return (
      usage.count + 1 <= budget.maximumCount &&
      usage.bytes + prepared.receiptBytes <= budget.maximumBytes
    );
  }

  appendEvent(
    input: AppendRoomEventInput,
    budget: RealtimeReceiptBudget,
  ): StoredRoomEvent {
    const prepared = this.prepareEvent(input);
    const usage = this.getReceiptUsage();
    if (
      usage.count + 1 > budget.maximumCount ||
      usage.bytes + prepared.receiptBytes > budget.maximumBytes
    ) {
      throw new RealtimeReceiptBudgetExceededError();
    }

    // Consecutive synchronous SQLite writes are coalesced atomically by a
    // SQLite-backed Durable Object. Do not insert an await between admission
    // and these writes.
    this.insertEventLog(input, prepared);
    this.sql.exec(
      `INSERT INTO idempotency_receipt
        (idempotency_key, actor_id, client_id, channel, sequence, envelope_json,
         target_actor_id, target_client_id, storage_bytes, expires_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.idempotencyKey,
      input.actorId,
      input.clientId,
      input.channel,
      prepared.nextSequence,
      prepared.envelopeJson,
      prepared.stored.targetActorId,
      prepared.stored.targetClientId,
      prepared.receiptBytes,
      input.receiptExpiresAtMs,
    );
    this.sql.exec(
      `UPDATE receipt_usage
       SET receipt_count = receipt_count + 1,
           receipt_bytes = receipt_bytes + ?
       WHERE singleton = 1`,
      prepared.receiptBytes,
    );
    this.advanceChannelSequence(input.channel, prepared.nextSequence);
    return prepared.stored;
  }

  appendSystemEvent(input: AppendSystemRoomEventInput): StoredRoomEvent {
    const prepared = this.prepareEvent(input);
    this.insertEventLog(input, prepared);
    this.advanceChannelSequence(input.channel, prepared.nextSequence);
    return prepared.stored;
  }

  appendAuthorizedScreenSignal(
    input: AppendScreenSignalEventInput,
    actor: ScreenSignalActor,
    nowMs: number,
    ordinaryBudget: RealtimeReceiptBudget,
    fingerprints: PublishReceiptFingerprints,
  ): ScreenSignalPublication {
    return this.storage.transactionSync(() => {
      const authorization = this.authorizeScreenSignal(
        input.payload,
        actor,
        nowMs,
      );
      if (!authorization.ok) {
        return { ok: false };
      }
      const teardown = isScreenSignalTeardown(input.payload);
      const targetedInput = {
        ...input,
        targetActorId:
          authorization.targetActorId ?? undefined,
        targetClientId:
          authorization.targetClientId ?? undefined,
      };
      const stored = teardown
        ? this.appendTeardownEvent(
            targetedInput,
            fingerprints,
            authorization.consumedPredecessorToken,
          )
        : this.appendEvent(targetedInput, ordinaryBudget);
      return { ok: true, stored };
    });
  }

  private appendTeardownEvent(
    input: AppendRoomEventInput,
    fingerprints: PublishReceiptFingerprints,
    predecessorToken: string | undefined,
  ): StoredRoomEvent {
    if (predecessorToken === undefined) {
      throw new Error(
        "Realtime teardown predecessor token is unavailable",
      );
    }
    const prepared = this.prepareEvent(input);
    this.insertEventLog(input, prepared);
    this.sql.exec(
      `INSERT INTO teardown_ack_tombstone
        (idempotency_fingerprint, request_fingerprint,
         predecessor_token, sequence, expires_at_ms)
       VALUES (?, ?, ?, ?, ?)`,
      fingerprints.idempotencyFingerprint,
      fingerprints.requestFingerprint,
      predecessorToken,
      prepared.nextSequence,
      input.receiptExpiresAtMs,
    );
    this.advanceChannelSequence(input.channel, prepared.nextSequence);
    return prepared.stored;
  }

  private prepareEvent(input: AppendSystemRoomEventInput): {
    readonly nextSequence: number;
    readonly envelopeJson: string;
    readonly receiptBytes: number;
    readonly stored: StoredRoomEvent;
  } {
    const state = this.getSequenceState(input.channel);
    const nextSequence = state.currentSequence + 1;
    if (!Number.isSafeInteger(nextSequence)) {
      throw new Error("Realtime channel sequence is exhausted");
    }
    const event: ServerEventMessage = {
      version: "toonspectrum.realtime.v1",
      type: "event",
      sequence: nextSequence,
      idempotencyKey: input.idempotencyKey,
      actorId: input.actorId,
      clientId: input.clientId,
      connectionId: input.connectionId,
      channel: input.channel,
      serverAtMs: input.serverAtMs,
      payload: input.payload,
    };
    const envelopeJson = serializeRealtimeServerMessage(event);
    const targetActorId = input.targetActorId ?? null;
    const targetClientId = input.targetClientId ?? null;
    return {
      nextSequence,
      envelopeJson,
      receiptBytes: receiptStorageBytes(
        input,
        envelopeJson,
      ),
      stored: { event, targetActorId, targetClientId },
    };
  }

  private insertEventLog(
    input: AppendSystemRoomEventInput,
    prepared: {
      readonly nextSequence: number;
      readonly envelopeJson: string;
      readonly stored: StoredRoomEvent;
    },
  ): void {
    this.sql.exec(
      `INSERT INTO event_log
        (channel, sequence, expires_at_ms, envelope_json, target_actor_id, target_client_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      input.channel,
      prepared.nextSequence,
      input.eventExpiresAtMs,
      prepared.envelopeJson,
      prepared.stored.targetActorId,
      prepared.stored.targetClientId,
    );
  }

  private advanceChannelSequence(
    channel: RealtimeChannel,
    nextSequence: number,
  ): void {
    this.sql.exec(
      "UPDATE channel_state SET current_sequence = ? WHERE channel = ?",
      nextSequence,
      channel,
    );
  }

  readEventsAfter(
    channel: RealtimeChannel,
    afterSequence: number,
    limit: number,
  ): StoredRoomEvent[] {
    return this.sql
      .exec<EventRow>(
        `SELECT
           channel,
           sequence,
           envelope_json,
           target_actor_id,
           target_client_id
         FROM event_log
         WHERE channel = ? AND sequence > ?
         ORDER BY sequence ASC
         LIMIT ?`,
        channel,
        afterSequence,
        limit,
      )
      .toArray()
      .map(parseEventRow);
  }

  authorizeScreenSignal(
    payload: ScreenSignalingPayload,
    actor: ScreenSignalActor,
    nowMs: number,
  ): ScreenSignalAuthorization {
    if (payload.kind === "signal.announce") {
      const existing = this.findShare(payload.shareId);
      if (
        existing !== null &&
        existing.active === 1 &&
        existing.expires_at_ms > nowMs &&
        (existing.owner_actor_id !== actor.actorId ||
          existing.owner_client_id !== actor.clientId)
      ) {
        return { ok: false };
      }
      if (
        existing !== null &&
        (existing.active !== 1 || existing.expires_at_ms <= nowMs)
      ) {
        this.sql.exec(
          "DELETE FROM screen_peer WHERE session_id = ?",
          payload.shareId,
        );
        this.sql.exec(
          "DELETE FROM screen_session_member WHERE session_id = ?",
          payload.shareId,
        );
      }
      this.sql.exec(
        `INSERT INTO screen_share
          (share_id, owner_actor_id, owner_client_id, owner_connection_id,
           label, active, expires_at_ms, updated_at_ms)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(share_id) DO UPDATE SET
           owner_actor_id = excluded.owner_actor_id,
           owner_client_id = excluded.owner_client_id,
           owner_connection_id = excluded.owner_connection_id,
           label = excluded.label,
           active = 1,
           expires_at_ms = excluded.expires_at_ms,
           updated_at_ms = excluded.updated_at_ms`,
        payload.shareId,
        actor.actorId,
        actor.clientId,
        actor.connectionId,
        payload.label,
        actor.sessionExpiresAtMs,
        nowMs,
      );
      this.upsertScreenMember(
        payload.shareId,
        payload.shareId,
        actor.actorId,
        actor.clientId,
        "owner",
        "approved",
        actor.sessionExpiresAtMs,
      );
      this.rotateShareTeardownPredecessor(payload.shareId);
      return {
        ok: true,
        targetActorId: null,
        targetClientId: null,
      };
    }

    if (payload.kind === "signal.stop") {
      const share = this.findActiveShare(payload.shareId, nowMs);
      if (
        share === null ||
        share.owner_actor_id !== actor.actorId ||
        share.owner_client_id !== actor.clientId
      ) {
        return { ok: false };
      }
      const predecessorToken =
        this.findShareTeardownPredecessor(payload.shareId);
      if (predecessorToken === null) {
        return { ok: false };
      }
      this.endShare(payload.shareId, nowMs);
      return {
        ok: true,
        targetActorId: null,
        targetClientId: null,
        consumedPredecessorToken: predecessorToken,
      };
    }

    const share = this.findActiveShare(payload.sessionId, nowMs);
    if (share === null) {
      return { ok: false };
    }
    if (payload.kind === "signal.request") {
      if (
        payload.shareId !== share.share_id ||
        payload.targetClientId !== share.owner_client_id ||
        (actor.actorId === share.owner_actor_id &&
          actor.clientId === share.owner_client_id)
      ) {
        return { ok: false };
      }
      this.upsertScreenMember(
        payload.sessionId,
        payload.shareId,
        actor.actorId,
        actor.clientId,
        "viewer",
        "pending",
        Math.min(actor.sessionExpiresAtMs, share.expires_at_ms),
      );
      this.rotateMemberTeardownPredecessor(
        payload.sessionId,
        actor.actorId,
        actor.clientId,
      );
      return {
        ok: true,
        targetActorId: share.owner_actor_id,
        targetClientId: share.owner_client_id,
      };
    }

    if (payload.kind === "signal.access") {
      if (payload.shareId !== share.share_id) {
        return { ok: false };
      }
      const actorIsOwner =
        actor.actorId === share.owner_actor_id &&
        actor.clientId === share.owner_client_id;
      if (!actorIsOwner && payload.decision !== "ended") {
        return { ok: false };
      }
      if (!actorIsOwner) {
        const viewer = this.findScreenMember(
          payload.sessionId,
          actor.actorId,
          actor.clientId,
        );
        if (
          viewer === null ||
          viewer.role !== "viewer" ||
          viewer.expires_at_ms <= nowMs ||
          (viewer.status !== "pending" &&
            viewer.status !== "approved") ||
          payload.targetClientId !== share.owner_client_id
        ) {
          return { ok: false };
        }
        const predecessorToken =
          this.findMemberTeardownPredecessor(
            payload.sessionId,
            viewer.actor_id,
            viewer.client_id,
          );
        if (predecessorToken === null) {
          return { ok: false };
        }
        this.sql.exec(
          "DELETE FROM screen_session_member WHERE session_id = ? AND actor_id = ? AND client_id = ?",
          payload.sessionId,
          viewer.actor_id,
          viewer.client_id,
        );
        this.sql.exec(
          "DELETE FROM screen_peer WHERE session_id = ? AND viewer_actor_id = ? AND viewer_client_id = ?",
          payload.sessionId,
          viewer.actor_id,
          viewer.client_id,
        );
        return {
          ok: true,
          targetActorId: share.owner_actor_id,
          targetClientId: share.owner_client_id,
          consumedPredecessorToken: predecessorToken,
        };
      }
      const viewer = this.findScreenMemberByClient(
        payload.sessionId,
        payload.targetClientId,
        "viewer",
      );
      if (
        viewer === null ||
        viewer.expires_at_ms <= nowMs ||
        (viewer.status !== "pending" &&
          viewer.status !== "approved")
      ) {
        return { ok: false };
      }
      if (payload.decision === "ended") {
        const predecessorToken =
          this.findMemberTeardownPredecessor(
            payload.sessionId,
            viewer.actor_id,
            viewer.client_id,
          );
        if (predecessorToken === null) {
          return { ok: false };
        }
        this.sql.exec(
          "DELETE FROM screen_session_member WHERE session_id = ? AND actor_id = ? AND client_id = ?",
          payload.sessionId,
          viewer.actor_id,
          viewer.client_id,
        );
        this.sql.exec(
          "DELETE FROM screen_peer WHERE session_id = ? AND viewer_actor_id = ? AND viewer_client_id = ?",
          payload.sessionId,
          viewer.actor_id,
          viewer.client_id,
        );
        return {
          ok: true,
          targetActorId: viewer.actor_id,
          targetClientId: viewer.client_id,
          consumedPredecessorToken: predecessorToken,
        };
      }
      this.sql.exec(
        "UPDATE screen_session_member SET status = ? WHERE session_id = ? AND actor_id = ? AND client_id = ?",
        payload.decision,
        payload.sessionId,
        viewer.actor_id,
        viewer.client_id,
      );
      if (payload.decision !== "approved") {
        this.sql.exec(
          "DELETE FROM screen_peer WHERE session_id = ? AND viewer_actor_id = ? AND viewer_client_id = ?",
          payload.sessionId,
          viewer.actor_id,
          viewer.client_id,
        );
        this.sql.exec(
          "DELETE FROM screen_member_teardown_predecessor WHERE session_id = ? AND actor_id = ? AND client_id = ?",
          payload.sessionId,
          viewer.actor_id,
          viewer.client_id,
        );
      }
      return {
        ok: true,
        targetActorId: viewer.actor_id,
        targetClientId: viewer.client_id,
      };
    }

    const sender = this.findScreenMember(
      payload.sessionId,
      actor.actorId,
      actor.clientId,
    );
    const target = this.findScreenMemberByClient(
      payload.sessionId,
      payload.targetClientId,
    );
    if (
      !isApprovedMember(sender) ||
      !isApprovedMember(target) ||
      sender.expires_at_ms <= nowMs ||
      target.expires_at_ms <= nowMs ||
      sender.role === target.role ||
      !(
        (sender.role === "owner" && target.role === "viewer") ||
        (sender.role === "viewer" && target.role === "owner")
      )
    ) {
      return { ok: false };
    }
    const owner = sender.role === "owner" ? sender : target;
    const viewer = sender.role === "viewer" ? sender : target;
    if (payload.kind === "signal.offer") {
      const peer = this.findScreenPeer(
        payload.sessionId,
        payload.peerConnectionId,
        nowMs,
      );
      if (
        peer !== null &&
        !this.peerMatchesMembers(peer, owner, viewer)
      ) {
        return { ok: false };
      }
      if (peer === null) {
        this.sql.exec(
          `INSERT INTO screen_peer
            (session_id, peer_connection_id, owner_actor_id, owner_client_id,
             viewer_actor_id, viewer_client_id, expires_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          payload.sessionId,
          payload.peerConnectionId,
          owner.actor_id,
          owner.client_id,
          viewer.actor_id,
          viewer.client_id,
          Math.min(owner.expires_at_ms, viewer.expires_at_ms),
        );
      }
    } else {
      const peer = this.findScreenPeer(
        payload.sessionId,
        payload.peerConnectionId,
        nowMs,
      );
      if (
        peer === null ||
        !this.peerMatchesMembers(peer, owner, viewer)
      ) {
        return { ok: false };
      }
    }
    return {
      ok: true,
      targetActorId: target.actor_id,
      targetClientId: target.client_id,
    };
  }

  endOwnedShares(
    actorId: string,
    clientId: string,
    nowMs: number,
  ): EndedScreenShare[] {
    const shares = this.listOwnedShares(actorId, clientId);
    for (const share of shares) {
      this.endShare(share.share_id, nowMs);
    }
    return shares.map((share) => ({
      shareId: share.share_id,
      ownerActorId: share.owner_actor_id,
      ownerClientId: share.owner_client_id,
      ownerConnectionId: share.owner_connection_id,
      expiresAtMs: share.expires_at_ms,
    }));
  }

  cleanupExpiredSharesWithEvents(
    nowMs: number,
    eventExpiresAtMs: number,
  ): StoredRoomEvent[] {
    return this.storage.transactionSync(() => {
      const shares = this.listExpiredShares(nowMs);
      const events: StoredRoomEvent[] = [];
      for (const share of shares) {
        this.endShare(share.share_id, nowMs);
        events.push(
          this.appendSystemEvent({
            idempotencyKey: crypto.randomUUID(),
            actorId: share.owner_actor_id,
            clientId: share.owner_client_id,
            connectionId: share.owner_connection_id,
            channel: "screen-signaling",
            serverAtMs: nowMs,
            eventExpiresAtMs,
            payload: {
              kind: "signal.stop",
              shareId: share.share_id,
            },
          }),
        );
      }
      return events;
    });
  }

  endExpiredShares(nowMs: number): EndedScreenShare[] {
    const shares = this.listExpiredShares(nowMs);
    for (const share of shares) {
      this.endShare(share.share_id, nowMs);
    }
    return shares.map((share) => ({
      shareId: share.share_id,
      ownerActorId: share.owner_actor_id,
      ownerClientId: share.owner_client_id,
      ownerConnectionId: share.owner_connection_id,
      expiresAtMs: share.expires_at_ms,
    }));
  }

  prune(nowMs: number, maximumReplayEvents: number): void {
    for (const channel of REALTIME_CHANNELS) {
      const state = this.getSequenceState(channel);
      const expired = firstRow(
        this.sql
          .exec<MaximumSequenceRow>(
            "SELECT MAX(sequence) AS maximum_sequence FROM event_log WHERE channel = ? AND expires_at_ms <= ?",
            channel,
            nowMs,
          )
          .toArray(),
      );
      const expiredCutoff =
        expired !== null && typeof expired.maximum_sequence === "number"
          ? expired.maximum_sequence
          : 0;
      const cutoff = computeReplayPrefixCutoff(
        state.currentSequence,
        maximumReplayEvents,
        expiredCutoff,
      );
      if (cutoff > 0) {
        this.sql.exec(
          "DELETE FROM event_log WHERE channel = ? AND sequence <= ?",
          channel,
          cutoff,
        );
        this.sql.exec(
          "UPDATE channel_state SET replay_floor_sequence = MAX(replay_floor_sequence, ?) WHERE channel = ?",
          cutoff + 1,
          channel,
        );
      }
    }
    this.sql.exec(
      "DELETE FROM ticket_nonce WHERE expires_at_ms <= ?",
      nowMs,
    );
    this.sql.exec(
      "DELETE FROM idempotency_receipt WHERE expires_at_ms <= ?",
      nowMs,
    );
    this.sql.exec(
      "DELETE FROM teardown_idempotency_receipt WHERE expires_at_ms <= ?",
      nowMs,
    );
    this.sql.exec(
      "DELETE FROM teardown_ack_tombstone WHERE expires_at_ms <= ?",
      nowMs,
    );
    this.synchronizeReceiptUsage();
    this.synchronizeTeardownReceiptUsage();
    this.sql.exec(
      "DELETE FROM rate_budget WHERE expires_at_ms <= ?",
      nowMs,
    );
    this.sql.exec(
      "DELETE FROM presence_state WHERE connection_id NOT IN (SELECT connection_id FROM connection_registry)",
    );
    this.sql.exec(
      `DELETE FROM screen_peer
       WHERE expires_at_ms <= ?
          OR session_id NOT IN (
            SELECT share_id FROM screen_share WHERE active = 1
          )`,
      nowMs,
    );
    this.sql.exec(
      `DELETE FROM screen_session_member
       WHERE expires_at_ms <= ?
          OR share_id NOT IN (
            SELECT share_id FROM screen_share WHERE active = 1
          )`,
      nowMs,
    );
    this.sql.exec("DELETE FROM screen_share WHERE active <> 1");
  }

  hasExpiringRows(): boolean {
    const row = firstRow(
      this.sql
        .exec<CountRow>(
          `SELECT
             (SELECT COUNT(*) FROM event_log) +
             (SELECT COUNT(*) FROM idempotency_receipt) +
             (SELECT COUNT(*) FROM teardown_idempotency_receipt) +
             (SELECT COUNT(*) FROM teardown_ack_tombstone) +
             (SELECT COUNT(*) FROM ticket_nonce) +
             (SELECT COUNT(*) FROM connection_registry) +
             (SELECT COUNT(*) FROM rate_budget) +
             (SELECT COUNT(*) FROM screen_share) +
             (SELECT COUNT(*) FROM screen_session_member) +
             (SELECT COUNT(*) FROM screen_peer) AS count`,
        )
        .toArray(),
    );
    return row !== null && row.count > 0;
  }

  private rotateShareTeardownPredecessor(shareId: string): void {
    this.sql.exec(
      `INSERT INTO screen_share_teardown_predecessor
        (share_id, predecessor_token)
       VALUES (?, ?)
       ON CONFLICT(share_id) DO UPDATE SET
         predecessor_token = excluded.predecessor_token`,
      shareId,
      createTeardownPredecessorToken(),
    );
  }

  private findShareTeardownPredecessor(
    shareId: string,
  ): string | null {
    const row = firstRow(
      this.sql
        .exec<TeardownPredecessorRow>(
          `SELECT predecessor_token
           FROM screen_share_teardown_predecessor
           WHERE share_id = ?`,
          shareId,
        )
        .toArray(),
    );
    return row === null ? null : row.predecessor_token;
  }

  private rotateMemberTeardownPredecessor(
    sessionId: string,
    actorId: string,
    clientId: string,
  ): void {
    this.sql.exec(
      `INSERT INTO screen_member_teardown_predecessor
        (session_id, actor_id, client_id, predecessor_token)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(session_id, actor_id, client_id) DO UPDATE SET
         predecessor_token = excluded.predecessor_token`,
      sessionId,
      actorId,
      clientId,
      createTeardownPredecessorToken(),
    );
  }

  private findMemberTeardownPredecessor(
    sessionId: string,
    actorId: string,
    clientId: string,
  ): string | null {
    const row = firstRow(
      this.sql
        .exec<TeardownPredecessorRow>(
          `SELECT predecessor_token
           FROM screen_member_teardown_predecessor
           WHERE session_id = ?
             AND actor_id = ?
             AND client_id = ?`,
          sessionId,
          actorId,
          clientId,
        )
        .toArray(),
    );
    return row === null ? null : row.predecessor_token;
  }

  private listOwnedShares(
    actorId: string,
    clientId: string,
  ): ScreenShareRow[] {
    return this.sql
      .exec<ScreenShareRow>(
        `SELECT
           share_id,
           owner_actor_id,
           owner_client_id,
           owner_connection_id,
           active,
           expires_at_ms
         FROM screen_share
         WHERE owner_actor_id = ?
           AND owner_client_id = ?
           AND active = 1
         ORDER BY share_id ASC`,
        actorId,
        clientId,
      )
      .toArray();
  }

  private listExpiredShares(nowMs: number): ScreenShareRow[] {
    return this.sql
      .exec<ScreenShareRow>(
        `SELECT
           share_id,
           owner_actor_id,
           owner_client_id,
           owner_connection_id,
           active,
           expires_at_ms
         FROM screen_share
         WHERE active = 1 AND expires_at_ms <= ?
         ORDER BY share_id ASC`,
        nowMs,
      )
      .toArray();
  }

  private findShare(shareId: string): ScreenShareRow | null {
    return firstRow(
      this.sql
        .exec<ScreenShareRow>(
          `SELECT
             share_id,
             owner_actor_id,
             owner_client_id,
             owner_connection_id,
             active,
             expires_at_ms
           FROM screen_share
           WHERE share_id = ?`,
          shareId,
        )
        .toArray(),
    );
  }

  private findActiveShare(
    shareId: string,
    nowMs: number,
  ): ScreenShareRow | null {
    const share = this.findShare(shareId);
    return share !== null &&
      share.active === 1 &&
      share.expires_at_ms > nowMs
      ? share
      : null;
  }

  private upsertScreenMember(
    sessionId: string,
    shareId: string,
    actorId: string,
    clientId: string,
    role: "owner" | "viewer",
    status: "approved" | "pending",
    expiresAtMs: number,
  ): void {
    this.sql.exec(
      `INSERT INTO screen_session_member
        (session_id, share_id, actor_id, client_id, role, status, expires_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id, actor_id, client_id) DO UPDATE SET
         share_id = excluded.share_id,
         role = excluded.role,
         status = CASE
           WHEN screen_session_member.status = 'approved' THEN 'approved'
           ELSE excluded.status
         END,
         expires_at_ms = excluded.expires_at_ms`,
      sessionId,
      shareId,
      actorId,
      clientId,
      role,
      status,
      expiresAtMs,
    );
  }

  private findScreenMember(
    sessionId: string,
    actorId: string,
    clientId: string,
  ): ScreenMemberRow | null {
    return firstRow(
      this.sql
        .exec<ScreenMemberRow>(
          `SELECT
             session_id,
             share_id,
             actor_id,
             client_id,
             role,
             status,
             expires_at_ms
           FROM screen_session_member
           WHERE session_id = ? AND actor_id = ? AND client_id = ?`,
          sessionId,
          actorId,
          clientId,
        )
        .toArray(),
    );
  }

  private findScreenMemberByClient(
    sessionId: string,
    clientId: string,
    role?: "owner" | "viewer",
  ): ScreenMemberRow | null {
    const rows = this.sql
      .exec<ScreenMemberRow>(
        `SELECT
           session_id,
           share_id,
           actor_id,
           client_id,
           role,
           status,
           expires_at_ms
         FROM screen_session_member
         WHERE session_id = ? AND client_id = ?
         ORDER BY actor_id ASC`,
        sessionId,
        clientId,
      )
      .toArray()
      .filter((row) => role === undefined || row.role === role);
    if (rows.length > 1) {
      throw new Error("Realtime screen member identity is ambiguous");
    }
    return rows.length === 1 ? rows[0] : null;
  }

  private findScreenPeer(
    sessionId: string,
    peerConnectionId: string,
    nowMs: number,
  ): ScreenPeerRow | null {
    return firstRow(
      this.sql
        .exec<ScreenPeerRow>(
          `SELECT
             session_id,
             peer_connection_id,
             owner_actor_id,
             owner_client_id,
             viewer_actor_id,
             viewer_client_id,
             expires_at_ms
           FROM screen_peer
           WHERE session_id = ? AND peer_connection_id = ? AND expires_at_ms > ?`,
          sessionId,
          peerConnectionId,
          nowMs,
        )
        .toArray(),
    );
  }

  private peerMatchesMembers(
    peer: ScreenPeerRow,
    owner: ScreenMemberRow,
    viewer: ScreenMemberRow,
  ): boolean {
    return (
      peer.owner_actor_id === owner.actor_id &&
      peer.owner_client_id === owner.client_id &&
      peer.viewer_actor_id === viewer.actor_id &&
      peer.viewer_client_id === viewer.client_id
    );
  }

  private endShare(shareId: string, nowMs: number): void {
    void nowMs;
    this.sql.exec(
      "DELETE FROM screen_peer WHERE session_id = ?",
      shareId,
    );
    this.sql.exec(
      "DELETE FROM screen_session_member WHERE share_id = ?",
      shareId,
    );
    this.sql.exec(
      "DELETE FROM screen_share WHERE share_id = ?",
      shareId,
    );
  }

  private synchronizeReceiptUsage(): void {
    this.synchronizeReceiptLaneUsage(
      "idempotency_receipt",
      "receipt_usage",
    );
  }

  private synchronizeTeardownReceiptUsage(): void {
    this.synchronizeReceiptLaneUsage(
      "teardown_idempotency_receipt",
      "teardown_receipt_usage",
    );
  }

  private synchronizeReceiptLaneUsage(
    receiptTable:
      | "idempotency_receipt"
      | "teardown_idempotency_receipt",
    usageTable: "receipt_usage" | "teardown_receipt_usage",
  ): void {
    const usage = firstRow(
      this.sql
        .exec<ReceiptUsageRow>(
          `SELECT
             COUNT(*) AS receipt_count,
             COALESCE(SUM(storage_bytes), 0) AS receipt_bytes
           FROM ${receiptTable}`,
        )
        .toArray(),
    );
    if (usage === null) {
      throw new Error("Realtime idempotency receipt usage is unavailable");
    }
    this.sql.exec(
      `UPDATE ${usageTable}
       SET receipt_count = ?, receipt_bytes = ?
       WHERE singleton = 1`,
      usage.receipt_count,
      usage.receipt_bytes,
    );
  }
}
