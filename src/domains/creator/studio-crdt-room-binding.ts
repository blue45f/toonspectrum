import {
  createStudioCrdtOutbox,
  type StudioCrdtOutbox,
} from "./studio-crdt-outbox";
import {
  STUDIO_CRDT_ORIGIN_REMOTE,
  STUDIO_CRDT_ORIGIN_SYNC,
  STUDIO_CRDT_PROTOCOL_VERSION,
  decodeStudioCrdtStateVector,
  decodeStudioCrdtUpdate,
  encodeStudioCrdtStateVector,
  encodeStudioCrdtSyncChunks,
  encodeStudioCrdtUpdate,
  type StudioCrdtSyncRequest,
  type StudioCrdtUpdateRequest,
} from "./studio-crdt-protocol";

import type {
  StudioCrdtBatchSubscription,
  StudioCrdtDocument,
} from "./studio-crdt-document";
import type {
  StudioLiveCrdtRoomEvent,
  StudioLiveRoom,
  StudioLiveRoomEvent,
} from "./studio-live-collaboration-room";

export type StudioCrdtBindingStatus =
  | { state: "idle"; message: string }
  | { state: "syncing"; message: string }
  | { state: "ready"; message: string }
  | { state: "retrying"; message: string }
  | { state: "error"; message: string; durabilityAtRisk?: boolean };

export interface StudioCrdtRoomBindingOptions {
  document: StudioCrdtDocument;
  room: StudioLiveRoom;
  /** Viewers still receive the durable document, but never enqueue local mutations. */
  canEdit?: boolean;
  /** Stable authenticated-user scope for browser-durable unsent updates. */
  outboxScope?: string | null;
  outbox?: StudioCrdtOutbox;
  randomId?: () => string;
  onStatus?: (status: StudioCrdtBindingStatus) => void;
  /** Bounds a wedged IndexedDB call before the authoritative server fallback is attempted. */
  persistenceTimeoutMs?: number;
  setTimeout?: (handler: () => void, delay: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

interface PendingUpdate {
  request: StudioCrdtUpdateRequest;
  attempts: number;
  persistenceState: "pending" | "ready" | "failed";
  /** Resolves false on a surfaced durability failure; it never creates an unhandled rejection. */
  persisted: Promise<boolean>;
}

const EMPTY_UPDATE_BYTE_LENGTH = 2;
const RETRY_MIN_MS = 300;
const RETRY_MAX_MS = 5_000;
const BACKGROUND_SYNC_MS = 10_000;
const DEFAULT_PERSISTENCE_TIMEOUT_MS = 750;

function defaultRandomId(): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("안전한 CRDT 업데이트 식별자를 만들 수 없습니다.");
  }
  return crypto.randomUUID();
}

function defaultSetTimeout(handler: () => void, delay: number): unknown {
  return globalThis.setTimeout(handler, delay);
}

function defaultClearTimeout(handle: unknown): void {
  globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  return left.every((value, index) => value === right[index]);
}

/**
 * Binds a Yjs document to the room's durable channel. Presence/WebRTC never enters this path.
 * Local mutations are merged for 40ms, acknowledged with stable update ids and retried in order;
 * state-vector sync repairs missed updates after reconnect before new edits continue publishing.
 */
export class StudioCrdtRoomBinding {
  private readonly document: StudioCrdtDocument;
  private readonly room: StudioLiveRoom;
  private readonly canEdit: boolean;
  private readonly outboxScope: string | null;
  private readonly outbox: StudioCrdtOutbox;
  private readonly randomId: () => string;
  private readonly onStatus?: (status: StudioCrdtBindingStatus) => void;
  private readonly persistenceTimeoutMs: number;
  private readonly scheduleTimeout: (handler: () => void, delay: number) => unknown;
  private readonly cancelTimeout: (handle: unknown) => void;
  private readonly pending = new Map<string, PendingUpdate>();
  private batchSubscription: StudioCrdtBatchSubscription | null = null;
  private unsubscribeCrdt: (() => void) | null = null;
  private unsubscribeRoom: (() => void) | null = null;
  private retryTimer: unknown = null;
  private syncRetryTimer: unknown = null;
  private backgroundSyncTimer: unknown = null;
  private drainPromise: Promise<void> | null = null;
  private syncPromise: Promise<void> | null = null;
  private activeSyncRequestId: string | null = null;
  private clientSequence = 0;
  private localServerSequence = 0;
  private started = false;
  private closed = false;

  constructor(options: StudioCrdtRoomBindingOptions) {
    this.document = options.document;
    this.room = options.room;
    this.canEdit = options.canEdit ?? true;
    this.outboxScope = options.outboxScope?.trim() || null;
    this.outbox = options.outbox ?? createStudioCrdtOutbox();
    this.randomId = options.randomId ?? defaultRandomId;
    this.onStatus = options.onStatus;
    this.persistenceTimeoutMs = Math.max(
      100,
      Math.min(10_000, options.persistenceTimeoutMs ?? DEFAULT_PERSISTENCE_TIMEOUT_MS)
    );
    this.scheduleTimeout = options.setTimeout ?? defaultSetTimeout;
    this.cancelTimeout = options.clearTimeout ?? defaultClearTimeout;
  }

  async start(): Promise<void> {
    if (this.closed) throw new Error("이미 닫힌 CRDT 바인딩입니다.");
    if (this.started) return this.syncNow();
    if (!this.room.ready) throw new Error("실시간 작업실 연결이 준비되지 않았습니다.");
    this.started = true;
    if (this.canEdit && this.outboxScope) await this.restoreOutbox();
    if (this.closed) return;
    this.unsubscribeCrdt = this.room.subscribeCrdt((event) => this.onCrdtEvent(event));
    this.unsubscribeRoom = this.room.subscribe((event) => this.onRoomEvent(event));
    if (this.canEdit) {
      this.batchSubscription = this.document.subscribeBatchedUpdates(({ update }) => {
        this.enqueueUpdate(update);
      });
    }
    await this.syncNow();
  }

  syncNow(): Promise<void> {
    if (this.closed) return Promise.reject(new Error("이미 닫힌 CRDT 바인딩입니다."));
    if (this.syncPromise) return this.syncPromise;
    const run = this.synchronize().finally(() => {
      if (this.syncPromise === run) this.syncPromise = null;
    });
    this.syncPromise = run;
    return run;
  }

  flush(): void {
    this.batchSubscription?.flush();
    void this.drainPending();
  }

  async closeGracefully(timeoutMs = 750): Promise<void> {
    if (this.closed) return;
    this.batchSubscription?.flush();
    const deadline = Date.now() + Math.max(0, Math.min(2_000, timeoutMs));
    // The final sub-frame batch must reach IndexedDB even when the socket is already offline.
    // A later binding's scoped outbox list is serialized behind this write, so a work switch
    // cannot overtake the pending commit and strand the user's final stroke.
    await this.persistPendingBeforeClose(deadline);
    while (this.pending.size > 0 && this.room.ready && Date.now() < deadline) {
      if (this.retryTimer !== null) {
        this.cancelTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      const remainingBeforeDrain = deadline - Date.now();
      if (remainingBeforeDrain <= 0) break;
      const drainedBeforeDeadline = await this.settlesBeforeDeadline(
        this.drainPending(),
        deadline
      );
      if (!drainedBeforeDeadline) break;
      if (this.pending.size === 0) break;
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise<void>((resolve) => {
        this.scheduleTimeout(resolve, Math.min(100, remaining));
      });
    }
    this.close();
  }

  close(): void {
    if (this.closed) return;
    this.batchSubscription?.flush();
    this.batchSubscription?.unsubscribe();
    this.batchSubscription = null;
    this.closed = true;
    this.activeSyncRequestId = null;
    this.unsubscribeCrdt?.();
    this.unsubscribeCrdt = null;
    this.unsubscribeRoom?.();
    this.unsubscribeRoom = null;
    if (this.retryTimer !== null) this.cancelTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.syncRetryTimer !== null) this.cancelTimeout(this.syncRetryTimer);
    this.syncRetryTimer = null;
    if (this.backgroundSyncTimer !== null) this.cancelTimeout(this.backgroundSyncTimer);
    this.backgroundSyncTimer = null;
    this.pending.clear();
    this.emitStatus({ state: "idle", message: "실시간 원고 동기화를 종료했습니다." });
  }

  private async synchronize(): Promise<void> {
    if (!this.room.ready) throw new Error("CRDT 동기화 채널이 준비되지 않았습니다.");
    this.emitStatus({ state: "syncing", message: "팀 원고의 누락된 획을 맞추는 중입니다." });
    const request: StudioCrdtSyncRequest = {
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: this.room.workId,
      requestId: this.randomId(),
      stateVector: this.document.getStateVectorBase64(),
    };
    this.activeSyncRequestId = request.requestId;
    const response = await this.room.requestCrdtSync(request);
    if (this.closed) return;
    if (response) {
      this.document.applySyncResponse(response);
      const serverVector = decodeStudioCrdtStateVector(response.serverStateVector);
      const localVector = this.document.encodeStateVector();
      // Pending operations already represent the client's unsent frontier. Adding a second
      // aggregate diff on reconnect would persist the same Yjs structs under a fresh updateId.
      if (this.canEdit && this.pending.size === 0 && !sameBytes(serverVector, localVector)) {
        const missingOnServer = this.document.encodeStateAsUpdate(serverVector);
        if (missingOnServer.byteLength > EMPTY_UPDATE_BYTE_LENGTH) this.enqueueUpdate(missingOnServer);
      }
    }
    if (this.syncRetryTimer !== null) this.cancelTimeout(this.syncRetryTimer);
    this.syncRetryTimer = null;
    if (this.backgroundSyncTimer !== null) this.cancelTimeout(this.backgroundSyncTimer);
    this.backgroundSyncTimer = null;
    this.scheduleBackgroundSync();
    this.emitStatus({ state: "ready", message: "팀 원고가 실시간으로 동기화됩니다." });
    await this.drainPending();
  }

  private enqueueUpdate(update: Uint8Array): void {
    if (this.closed || update.byteLength <= EMPTY_UPDATE_BYTE_LENGTH) return;
    let encoded: string;
    try {
      encoded = encodeStudioCrdtUpdate(update);
    } catch (error) {
      this.emitStatus({
        state: "error",
        message: messageFrom(error, "실시간 획 묶음이 전송 한도를 초과했습니다."),
      });
      return;
    }
    const updateId = this.randomId();
    const request: StudioCrdtUpdateRequest = {
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: this.room.workId,
      updateId,
      clientSequence: ++this.clientSequence,
      update: encoded,
    };
    const pending: PendingUpdate = {
      request,
      attempts: 0,
      persistenceState: this.outboxScope ? "pending" : "ready",
      persisted: Promise.resolve(true),
    };
    this.pending.set(updateId, pending);
    if (this.outboxScope) this.beginPendingPersistence(pending);
    void this.drainPending();
  }

  private beginPendingPersistence(pending: PendingUpdate): Promise<boolean> {
    const scope = this.outboxScope;
    if (!scope) {
      pending.persistenceState = "ready";
      pending.persisted = Promise.resolve(true);
      return pending.persisted;
    }
    pending.persistenceState = "pending";
    const operation = Promise.resolve().then(() => this.outbox.put(scope, pending.request));
    const persisted = this.withPersistenceTimeout(operation).then(
      () => {
        if (pending.persisted === persisted) pending.persistenceState = "ready";
        return true;
      },
      (error: unknown) => {
        if (pending.persisted === persisted) pending.persistenceState = "failed";
        if (!this.closed) {
          this.emitStatus({
            state: "error",
            message: messageFrom(error, "오프라인 CRDT 보관함에 획을 저장하지 못했습니다."),
            durabilityAtRisk: true,
          });
        }
        return false;
      }
    );
    pending.persisted = persisted;
    return persisted;
  }

  private withPersistenceTimeout(operation: Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeoutHandle: unknown = null;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        if (timeoutHandle !== null) this.cancelTimeout(timeoutHandle);
        callback();
      };
      timeoutHandle = this.scheduleTimeout(
        () => finish(() => reject(new Error("오프라인 CRDT 보관함 응답 시간이 초과됐습니다."))),
        this.persistenceTimeoutMs
      );
      void operation.then(
        () => finish(resolve),
        (error: unknown) => finish(() => reject(error))
      );
    });
  }

  private ensurePendingPersistence(pending: PendingUpdate): Promise<boolean> {
    return pending.persistenceState === "failed"
      ? this.beginPendingPersistence(pending)
      : pending.persisted;
  }

  private async settlesBeforeDeadline(
    promise: Promise<unknown>,
    deadline: number
  ): Promise<boolean> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    return new Promise<boolean>((resolve) => {
      let settled = false;
      let timeoutHandle: unknown = null;
      const finish = (completed: boolean) => {
        if (settled) return;
        settled = true;
        if (timeoutHandle !== null) this.cancelTimeout(timeoutHandle);
        resolve(completed);
      };
      timeoutHandle = this.scheduleTimeout(() => finish(false), remaining);
      void promise.then(
        () => finish(true),
        () => finish(true)
      );
    });
  }

  private async persistPendingBeforeClose(deadline: number): Promise<void> {
    if (!this.outboxScope || this.pending.size === 0) return;
    for (let attempt = 0; attempt < 3 && Date.now() < deadline; attempt += 1) {
      const entries = [...this.pending.values()];
      const completed = await this.settlesBeforeDeadline(
        Promise.all(entries.map((pending) => this.ensurePendingPersistence(pending))),
        deadline
      );
      if (!completed) return;
      if (entries.every((pending) => pending.persistenceState === "ready")) return;
      const remaining = deadline - Date.now();
      if (remaining <= 0) return;
      const pause = new Promise<void>((resolve) => {
        this.scheduleTimeout(resolve, Math.min(50, remaining));
      });
      if (!(await this.settlesBeforeDeadline(pause, deadline))) return;
    }
  }

  private drainPending(): Promise<void> {
    if (this.closed || this.drainPromise) return this.drainPromise ?? Promise.resolve();
    const run = this.runDrain().finally(() => {
      if (this.drainPromise === run) this.drainPromise = null;
    });
    this.drainPromise = run;
    return run;
  }

  private async runDrain(): Promise<void> {
    if (!this.room.ready) {
      for (const pending of this.pending.values()) {
        if (this.closed) return;
        const persisted = await this.ensurePendingPersistence(pending);
        if (!persisted) {
          pending.attempts += 1;
          this.scheduleRetry(pending.attempts);
          return;
        }
      }
      this.scheduleRetry();
      return;
    }
    for (const [updateId, pending] of this.pending) {
      if (this.closed) return;
      const persisted = await this.ensurePendingPersistence(pending);
      if (this.closed) return;
      if (!persisted) {
        // If the server is reachable it can still be the durable sink. We only remove the
        // same-page emergency copy after the authoritative ACK succeeds.
        this.emitStatus({
          state: "retrying",
          message: "로컬 보관함을 복구하는 동안 서버에 획을 직접 보존합니다.",
        });
      }
      try {
        await this.room.publishCrdtUpdate(pending.request);
        this.pending.delete(updateId);
        if (this.outboxScope) {
          void this.outbox
            .remove(this.outboxScope, pending.request.workId, updateId)
            .catch((error) => {
              this.emitStatus({
                state: "error",
                message: messageFrom(error, "전송 완료된 CRDT 보관 항목을 정리하지 못했습니다."),
              });
            });
        }
      } catch (error) {
        pending.attempts += 1;
        this.emitStatus({
          state: "retrying",
          message: messageFrom(error, "실시간 획 전송을 다시 시도합니다."),
        });
        this.scheduleRetry(pending.attempts);
        return;
      }
    }
    if (this.started && !this.closed) {
      this.emitStatus({ state: "ready", message: "팀 원고가 실시간으로 동기화됩니다." });
    }
  }

  private scheduleRetry(attempt = 1): void {
    if (this.closed || this.retryTimer !== null) return;
    const delay = Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** Math.min(5, attempt - 1));
    this.retryTimer = this.scheduleTimeout(() => {
      this.retryTimer = null;
      void this.drainPending();
    }, delay);
  }

  private scheduleSyncRetry(attempt = 1): void {
    if (this.closed || this.syncRetryTimer !== null) return;
    const delay = Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** Math.min(5, attempt - 1));
    this.syncRetryTimer = this.scheduleTimeout(() => {
      this.syncRetryTimer = null;
      if (this.closed) return;
      if (!this.room.ready) {
        this.scheduleSyncRetry(attempt + 1);
        return;
      }
      void this.syncNow().catch((error) => {
        this.emitStatus({
          state: "retrying",
          message: messageFrom(error, "재연결 후 원고를 다시 동기화하지 못했습니다."),
        });
        this.scheduleSyncRetry(attempt + 1);
      });
    }, delay);
  }

  private scheduleBackgroundSync(): void {
    if (this.closed || this.backgroundSyncTimer !== null) return;
    this.backgroundSyncTimer = this.scheduleTimeout(() => {
      this.backgroundSyncTimer = null;
      if (this.closed || !this.room.ready) return;
      void this.syncNow().catch((error) => {
        this.emitStatus({
          state: "retrying",
          message: messageFrom(error, "백그라운드 원고 수렴을 다시 시도합니다."),
        });
        this.scheduleSyncRetry();
      });
    }, BACKGROUND_SYNC_MS);
  }

  private onRoomEvent(event: StudioLiveRoomEvent): void {
    if (event.type !== "transport-status" || event.status.state !== "ready" || this.closed) return;
    void this.syncNow().catch((error) => {
      this.emitStatus({
        state: "retrying",
        message: messageFrom(error, "재연결 후 원고를 다시 동기화하지 못했습니다."),
      });
      this.scheduleSyncRetry();
    });
  }

  private onCrdtEvent(event: StudioLiveCrdtRoomEvent): void {
    if (this.closed) return;
    if (event.type === "update") {
      try {
        this.document.applyUpdateBase64(event.update.update, STUDIO_CRDT_ORIGIN_REMOTE);
      } catch (error) {
        this.emitStatus({
          state: "error",
          message: messageFrom(error, "팀원의 획 업데이트가 손상되어 적용하지 못했습니다."),
        });
      }
      return;
    }
    if (event.type === "sync-response") {
      // requestCrdtSync resolves this exact response. Socket transports may also emit it as a
      // notification, so applying here would process the same transfer twice.
      return;
    }
    if (event.type === "sync-request") {
      this.respondToPeerSync(event.request, event.senderSessionId);
      return;
    }
    if (event.type === "error") {
      this.emitStatus({ state: "retrying", message: event.message });
    }
  }

  private respondToPeerSync(request: StudioCrdtSyncRequest, senderSessionId: string): void {
    try {
      const diff = this.document.encodeStateAsUpdate(
        decodeStudioCrdtStateVector(request.stateVector)
      );
      const chunks = encodeStudioCrdtSyncChunks(diff);
      this.localServerSequence += 1;
      this.room.respondCrdtSync(
        {
          protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
          workId: this.room.workId,
          requestId: request.requestId,
          transferId: this.randomId(),
          chunks,
          chunkCount: chunks.length,
          totalBytes: diff.byteLength,
          serverStateVector: encodeStudioCrdtStateVector(this.document.encodeStateVector()),
          serverSequence: String(this.localServerSequence),
        },
        senderSessionId
      );
    } catch (error) {
      this.emitStatus({
        state: "error",
        message: messageFrom(error, "로컬 탭에 원고 상태를 전달하지 못했습니다."),
      });
    }
  }

  private async restoreOutbox(): Promise<void> {
    const scope = this.outboxScope;
    if (!scope) return;
    let requests: StudioCrdtUpdateRequest[];
    try {
      requests = await this.outbox.list(scope, this.room.workId);
    } catch (error) {
      if (this.closed) return;
      this.emitStatus({
        state: "error",
        message: messageFrom(error, "오프라인 CRDT 보관함을 불러오지 못했습니다."),
      });
      return;
    }
    if (this.closed) return;
    for (const request of requests) {
      if (this.pending.has(request.updateId)) continue;
      try {
        this.document.applyUpdate(decodeStudioCrdtUpdate(request.update), STUDIO_CRDT_ORIGIN_SYNC);
      } catch (error) {
        this.emitStatus({
          state: "error",
          message: messageFrom(error, "보관된 CRDT 업데이트가 손상되어 복원하지 못했습니다."),
        });
        continue;
      }
      this.clientSequence = Math.max(this.clientSequence, request.clientSequence);
      this.pending.set(request.updateId, {
        request,
        attempts: 0,
        persistenceState: "ready",
        persisted: Promise.resolve(true),
      });
    }
  }

  private emitStatus(status: StudioCrdtBindingStatus): void {
    this.onStatus?.(status);
  }
}
