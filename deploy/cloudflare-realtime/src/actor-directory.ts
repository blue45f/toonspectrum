import { DurableObject } from "cloudflare:workers";

import {
  REALTIME_CONTROL_MAX_AGE_MS,
  parseRealtimeControlEvent,
  type RealtimeControlEvent,
} from "./control";
import { isRealtimeId } from "./protocol";
import { normalizeRealtimeRoomObjectName } from "./security";

import type {
  DurableObjectStateLike,
  RealtimeWorkerEnv,
} from "./runtime-types";

export const REALTIME_ACTOR_REGISTER_PATH = "/internal/actor/register";
export const REALTIME_ACTOR_REVOKE_PATH = "/internal/actor/revoke";
export const REALTIME_INTERNAL_CONTROL_HEADER =
  "X-ToonSpectrum-Realtime-Internal-Control";
export const REALTIME_INTERNAL_CONTROL_VALUE = "v1";

const MAX_CONTROL_ROOMS_PER_REQUEST = 32;
const MAX_INTERNAL_BODY_BYTES = 4_096;
const REVOCATION_FENCE_RETENTION_MS = 10 * 60_000;
const CONTROL_NONCE_RETENTION_MS = 2 * REALTIME_CONTROL_MAX_AGE_MS;

interface ActorConnectionRegistration {
  readonly connectionId: string;
  readonly workId: string;
  readonly roomId: string;
  readonly roomObjectName: string;
  readonly sessionVersion: number;
  readonly authorizationEpochMs: number;
  readonly sessionExpiresAtMs: number;
}

interface DirectoryRoomRow extends Record<string, unknown> {
  readonly room_object_name: string;
  readonly work_id: string;
  readonly room_id: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  const expectedSet = new Set(expected);
  return (
    keys.length === expected.length &&
    keys.every((key) => expectedSet.has(key)) &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function parseRegistration(value: unknown): ActorConnectionRegistration | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "connectionId",
      "workId",
      "roomId",
      "roomObjectName",
      "sessionVersion",
      "authorizationEpochMs",
      "sessionExpiresAtMs",
    ]) ||
    !isRealtimeId(value.connectionId) ||
    !isRealtimeId(value.workId) ||
    !isRealtimeId(value.roomId) ||
    typeof value.roomObjectName !== "string" ||
    value.roomObjectName !==
      normalizeRealtimeRoomObjectName({
        workId: value.workId,
        roomId: value.roomId,
      }) ||
    !isPositiveSafeInteger(value.sessionVersion) ||
    !isPositiveSafeInteger(value.authorizationEpochMs) ||
    !isPositiveSafeInteger(value.sessionExpiresAtMs)
  ) {
    return null;
  }
  return value as unknown as ActorConnectionRegistration;
}

async function readJsonBody(request: Request): Promise<unknown | null> {
  const declaredLength = request.headers.get("Content-Length");
  if (
    declaredLength !== null &&
    (!/^(?:0|[1-9]\d*)$/u.test(declaredLength) ||
      Number(declaredLength) > MAX_INTERNAL_BODY_BYTES)
  ) {
    return null;
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_INTERNAL_BODY_BYTES) {
    return null;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

function jsonResponse(
  status: number,
  body: Readonly<Record<string, unknown>>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export class RealtimeActorDirectory extends DurableObject<RealtimeWorkerEnv> {
  private readonly ready: Promise<void>;

  constructor(
    private readonly actorState: DurableObjectStateLike,
    private readonly runtimeEnv: RealtimeWorkerEnv,
  ) {
    super(actorState, runtimeEnv);
    this.ready = actorState.blockConcurrencyWhile(async () => {
      actorState.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS actor_connection (
          connection_id TEXT PRIMARY KEY,
          room_object_name TEXT NOT NULL,
          work_id TEXT NOT NULL,
          room_id TEXT NOT NULL,
          session_version INTEGER NOT NULL,
          authorization_epoch_ms INTEGER NOT NULL,
          session_expires_at_ms INTEGER NOT NULL
        ) STRICT
      `);
      actorState.storage.sql.exec(`
        CREATE INDEX IF NOT EXISTS actor_connection_room_idx
        ON actor_connection(work_id, room_id, room_object_name)
      `);
      actorState.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS session_revocation_fence (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          minimum_session_version INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL
        ) STRICT
      `);
      actorState.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS room_authorization_fence (
          work_id TEXT NOT NULL,
          room_id TEXT NOT NULL,
          minimum_authorization_epoch_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL,
          PRIMARY KEY(work_id, room_id)
        ) STRICT
      `);
      actorState.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS control_nonce (
          nonce TEXT PRIMARY KEY,
          expires_at_ms INTEGER NOT NULL
        ) STRICT
      `);
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    if (
      request.method !== "POST" ||
      url.search !== "" ||
      request.headers.get(REALTIME_INTERNAL_CONTROL_HEADER) !==
        REALTIME_INTERNAL_CONTROL_VALUE
    ) {
      return jsonResponse(404, { ok: false, code: "not-found" });
    }
    if (url.pathname === REALTIME_ACTOR_REGISTER_PATH) {
      return await this.registerConnection(request);
    }
    if (url.pathname === REALTIME_ACTOR_REVOKE_PATH) {
      return await this.revokeConnections(request);
    }
    return jsonResponse(404, { ok: false, code: "not-found" });
  }

  private async registerConnection(request: Request): Promise<Response> {
    const registration = parseRegistration(await readJsonBody(request));
    if (registration === null) {
      return jsonResponse(400, { ok: false, code: "invalid-registration" });
    }
    const nowMs = Date.now();
    this.prune(nowMs);
    if (registration.sessionExpiresAtMs <= nowMs) {
      return jsonResponse(409, { ok: false, code: "credential-expired" });
    }
    const sessionFence = this.actorState.storage.sql
      .exec<{ minimum_session_version: number }>(
        `SELECT minimum_session_version
         FROM session_revocation_fence
         WHERE singleton = 1`,
      )
      .toArray()[0];
    if (
      sessionFence !== undefined &&
      registration.sessionVersion < sessionFence.minimum_session_version
    ) {
      return jsonResponse(409, { ok: false, code: "session-revoked" });
    }
    const authorizationFence = this.actorState.storage.sql
      .exec<{ minimum_authorization_epoch_ms: number }>(
        `SELECT minimum_authorization_epoch_ms
         FROM room_authorization_fence
         WHERE work_id = ? AND room_id = ?`,
        registration.workId,
        registration.roomId,
      )
      .toArray()[0];
    if (
      authorizationFence !== undefined &&
      registration.authorizationEpochMs <=
        authorizationFence.minimum_authorization_epoch_ms
    ) {
      return jsonResponse(409, {
        ok: false,
        code: "room-authorization-revoked",
      });
    }
    this.actorState.storage.sql.exec(
      `INSERT INTO actor_connection(
         connection_id,
         room_object_name,
         work_id,
         room_id,
         session_version,
         authorization_epoch_ms,
         session_expires_at_ms
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(connection_id) DO UPDATE SET
         room_object_name = excluded.room_object_name,
         work_id = excluded.work_id,
         room_id = excluded.room_id,
         session_version = excluded.session_version,
         authorization_epoch_ms = excluded.authorization_epoch_ms,
         session_expires_at_ms = excluded.session_expires_at_ms`,
      registration.connectionId,
      registration.roomObjectName,
      registration.workId,
      registration.roomId,
      registration.sessionVersion,
      registration.authorizationEpochMs,
      registration.sessionExpiresAtMs,
    );
    return new Response(null, { status: 204 });
  }

  private async revokeConnections(request: Request): Promise<Response> {
    const event = parseRealtimeControlEvent(await readJsonBody(request));
    if (event === null) {
      return jsonResponse(400, { ok: false, code: "invalid-control-event" });
    }
    const nowMs = Date.now();
    this.prune(nowMs);
    const inserted = this.actorState.storage.sql
      .exec<{ changed: number }>(
        `INSERT OR IGNORE INTO control_nonce(nonce, expires_at_ms)
         VALUES (?, ?)
         RETURNING 1 AS changed`,
        event.nonce,
        event.issuedAtMs + CONTROL_NONCE_RETENTION_MS,
      )
      .toArray()[0];
    if (inserted === undefined) {
      return jsonResponse(409, { ok: false, code: "control-replayed" });
    }
    this.persistFence(event, nowMs);
    const matchingRooms = this.findMatchingRooms(
      event,
      MAX_CONTROL_ROOMS_PER_REQUEST + 1,
    );
    const selectedRooms = matchingRooms.slice(
      0,
      MAX_CONTROL_ROOMS_PER_REQUEST,
    );
    let connectionsRevoked = 0;
    for (const room of selectedRooms) {
      const roomId = this.runtimeEnv.REALTIME_ROOMS.idFromName(
        room.room_object_name,
      );
      let response: Response;
      try {
        response = await this.runtimeEnv.REALTIME_ROOMS.get(roomId).fetch(
          new Request("https://internal.invalid/internal/room/revoke", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [REALTIME_INTERNAL_CONTROL_HEADER]:
                REALTIME_INTERNAL_CONTROL_VALUE,
            },
            body: JSON.stringify(event),
          }),
        );
      } catch {
        return jsonResponse(503, {
          ok: false,
          code: "room-revocation-unavailable",
        });
      }
      if (!response.ok) {
        return jsonResponse(503, {
          ok: false,
          code: "room-revocation-unavailable",
        });
      }
      const result = (await response.json()) as unknown;
      if (
        !isRecord(result) ||
        result.ok !== true ||
        !Number.isSafeInteger(result.connectionsRevoked) ||
        Number(result.connectionsRevoked) < 0
      ) {
        return jsonResponse(503, {
          ok: false,
          code: "room-revocation-unavailable",
        });
      }
      connectionsRevoked += Number(result.connectionsRevoked);
      this.deleteMatchingRoomConnections(event, room);
    }
    return jsonResponse(
      matchingRooms.length > MAX_CONTROL_ROOMS_PER_REQUEST ? 202 : 200,
      {
        ok: true,
        complete: matchingRooms.length <= MAX_CONTROL_ROOMS_PER_REQUEST,
        roomsRevoked: selectedRooms.length,
        connectionsRevoked,
      },
    );
  }

  private persistFence(event: RealtimeControlEvent, nowMs: number): void {
    if (event.kind === "session-version") {
      this.actorState.storage.sql.exec(
        `INSERT INTO session_revocation_fence(
           singleton,
           minimum_session_version,
           updated_at_ms
         ) VALUES (1, ?, ?)
         ON CONFLICT(singleton) DO UPDATE SET
           minimum_session_version = MAX(
             session_revocation_fence.minimum_session_version,
             excluded.minimum_session_version
           ),
           updated_at_ms = MAX(
             session_revocation_fence.updated_at_ms,
             excluded.updated_at_ms
           )`,
        event.minimumSessionVersion,
        nowMs,
      );
      return;
    }
    this.actorState.storage.sql.exec(
      `INSERT INTO room_authorization_fence(
         work_id,
         room_id,
         minimum_authorization_epoch_ms,
         updated_at_ms
       ) VALUES (?, ?, ?, ?)
       ON CONFLICT(work_id, room_id) DO UPDATE SET
         minimum_authorization_epoch_ms = MAX(
           room_authorization_fence.minimum_authorization_epoch_ms,
           excluded.minimum_authorization_epoch_ms
         ),
         updated_at_ms = MAX(
           room_authorization_fence.updated_at_ms,
           excluded.updated_at_ms
         )`,
      event.workId,
      event.roomId,
      event.minimumAuthorizationEpochMs,
      nowMs,
    );
  }

  private findMatchingRooms(
    event: RealtimeControlEvent,
    limit: number,
  ): DirectoryRoomRow[] {
    if (event.kind === "session-version") {
      return this.actorState.storage.sql
        .exec<DirectoryRoomRow>(
          `SELECT DISTINCT room_object_name, work_id, room_id
           FROM actor_connection
           WHERE session_version < ?
           ORDER BY room_object_name
           LIMIT ?`,
          event.minimumSessionVersion,
          limit,
        )
        .toArray();
    }
    return this.actorState.storage.sql
      .exec<DirectoryRoomRow>(
        `SELECT DISTINCT room_object_name, work_id, room_id
         FROM actor_connection
         WHERE work_id = ?
           AND room_id = ?
           AND authorization_epoch_ms <= ?
         ORDER BY room_object_name
         LIMIT ?`,
        event.workId,
        event.roomId,
        event.minimumAuthorizationEpochMs,
        limit,
      )
      .toArray();
  }

  private deleteMatchingRoomConnections(
    event: RealtimeControlEvent,
    room: DirectoryRoomRow,
  ): void {
    if (event.kind === "session-version") {
      this.actorState.storage.sql.exec(
        `DELETE FROM actor_connection
         WHERE room_object_name = ? AND session_version < ?`,
        room.room_object_name,
        event.minimumSessionVersion,
      );
      return;
    }
    this.actorState.storage.sql.exec(
      `DELETE FROM actor_connection
       WHERE room_object_name = ?
         AND work_id = ?
         AND room_id = ?
         AND authorization_epoch_ms <= ?`,
      room.room_object_name,
      event.workId,
      event.roomId,
      event.minimumAuthorizationEpochMs,
    );
  }

  private prune(nowMs: number): void {
    this.actorState.storage.sql.exec(
      "DELETE FROM actor_connection WHERE session_expires_at_ms <= ?",
      nowMs,
    );
    this.actorState.storage.sql.exec(
      "DELETE FROM control_nonce WHERE expires_at_ms <= ?",
      nowMs,
    );
    this.actorState.storage.sql.exec(
      `DELETE FROM room_authorization_fence
       WHERE updated_at_ms <= ?`,
      nowMs - REVOCATION_FENCE_RETENTION_MS,
    );
    this.actorState.storage.sql.exec(
      `DELETE FROM session_revocation_fence
       WHERE updated_at_ms <= ?`,
      nowMs - REVOCATION_FENCE_RETENTION_MS,
    );
  }
}
