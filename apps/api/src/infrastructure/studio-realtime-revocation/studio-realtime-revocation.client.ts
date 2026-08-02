import { randomUUID } from "node:crypto";

import {
  REALTIME_CONTROL_CONTENT_TYPE,
  REALTIME_CONTROL_NONCE_HEADER,
  REALTIME_CONTROL_SIGNATURE_HEADER,
  REALTIME_CONTROL_TIMESTAMP_HEADER,
  REALTIME_CONTROL_VERSION,
  signRealtimeControlEvent,
  type RealtimeControlEvent,
} from "../../../../../deploy/cloudflare-realtime/src/control";

import type { StudioRealtimeRevocationConfiguration } from "./studio-realtime-revocation.configuration";

const MAX_CONTROL_BATCHES = 8;
const MAX_CONTROL_RESPONSE_BYTES = 4_096;

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export interface StudioRealtimeRevocationRuntime {
  readonly nowEpochMs: () => number;
  readonly createNonce: () => string;
  readonly fetch: typeof fetch;
}

export interface StudioRealtimeRevocationResult {
  readonly enabled: boolean;
  readonly roomsRevoked: number;
  readonly connectionsRevoked: number;
}

export class StudioRealtimeRevocationUnavailableError extends Error {
  constructor() {
    super("Studio realtime revocation is unavailable.");
    this.name = "StudioRealtimeRevocationUnavailableError";
  }
}

export class StudioRealtimeRevocationService {
  constructor(
    private readonly configuration: StudioRealtimeRevocationConfiguration,
    private readonly runtime: StudioRealtimeRevocationRuntime = {
      nowEpochMs: Date.now,
      createNonce: randomUUID,
      fetch,
    },
  ) {}

  async revokeSessionVersion(
    actorId: string,
    minimumSessionVersion: number,
  ): Promise<StudioRealtimeRevocationResult> {
    return await this.dispatch((issuedAtMs, nonce) => ({
      version: REALTIME_CONTROL_VERSION,
      kind: "session-version",
      actorId,
      minimumSessionVersion,
      issuedAtMs,
      nonce,
    }));
  }

  async revokeRoomAuthorization(input: {
    readonly actorId: string;
    readonly workId: string;
    readonly roomId: string;
    readonly minimumAuthorizationEpochMs: number;
  }): Promise<StudioRealtimeRevocationResult> {
    return await this.dispatch((issuedAtMs, nonce) => ({
      version: REALTIME_CONTROL_VERSION,
      kind: "room-authorization",
      actorId: input.actorId,
      workId: input.workId,
      roomId: input.roomId,
      minimumAuthorizationEpochMs: input.minimumAuthorizationEpochMs,
      issuedAtMs,
      nonce,
    }));
  }

  private async dispatch(
    createEvent: (issuedAtMs: number, nonce: string) => RealtimeControlEvent,
  ): Promise<StudioRealtimeRevocationResult> {
    if (!this.configuration.enabled) {
      return { enabled: false, roomsRevoked: 0, connectionsRevoked: 0 };
    }
    let roomsRevoked = 0;
    let connectionsRevoked = 0;
    for (let batch = 0; batch < MAX_CONTROL_BATCHES; batch += 1) {
      const event = createEvent(
        Math.trunc(this.runtime.nowEpochMs()),
        this.runtime.createNonce(),
      );
      let signed: Awaited<ReturnType<typeof signRealtimeControlEvent>>;
      try {
        signed = await signRealtimeControlEvent(
          event,
          this.configuration.controlSecret,
        );
      } catch {
        throw new StudioRealtimeRevocationUnavailableError();
      }
      let response: Response;
      try {
        response = await this.runtime.fetch(this.configuration.controlUrl, {
          method: "POST",
          headers: {
            "Cache-Control": "no-store",
            "Content-Type": REALTIME_CONTROL_CONTENT_TYPE,
            [REALTIME_CONTROL_NONCE_HEADER]: signed.headers.nonce,
            [REALTIME_CONTROL_TIMESTAMP_HEADER]: signed.headers.timestamp,
            [REALTIME_CONTROL_SIGNATURE_HEADER]: signed.headers.signature,
          },
          body: copyToArrayBuffer(signed.body),
          redirect: "error",
          signal: AbortSignal.timeout(this.configuration.timeoutMs),
        });
      } catch {
        throw new StudioRealtimeRevocationUnavailableError();
      }
      const responseBytes = new Uint8Array(await response.arrayBuffer());
      if (
        !response.ok ||
        responseBytes.byteLength === 0 ||
        responseBytes.byteLength > MAX_CONTROL_RESPONSE_BYTES
      ) {
        throw new StudioRealtimeRevocationUnavailableError();
      }
      let value: unknown;
      try {
        value = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(responseBytes),
        );
      } catch {
        throw new StudioRealtimeRevocationUnavailableError();
      }
      if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value) ||
        (value as { ok?: unknown }).ok !== true ||
        typeof (value as { complete?: unknown }).complete !== "boolean" ||
        !Number.isSafeInteger((value as { roomsRevoked?: unknown }).roomsRevoked) ||
        Number((value as { roomsRevoked: number }).roomsRevoked) < 0 ||
        !Number.isSafeInteger(
          (value as { connectionsRevoked?: unknown }).connectionsRevoked,
        ) ||
        Number(
          (value as { connectionsRevoked: number }).connectionsRevoked,
        ) < 0
      ) {
        throw new StudioRealtimeRevocationUnavailableError();
      }
      roomsRevoked += Number(
        (value as { roomsRevoked: number }).roomsRevoked,
      );
      connectionsRevoked += Number(
        (value as { connectionsRevoked: number }).connectionsRevoked,
      );
      if ((value as { complete: boolean }).complete) {
        return { enabled: true, roomsRevoked, connectionsRevoked };
      }
    }
    throw new StudioRealtimeRevocationUnavailableError();
  }
}
