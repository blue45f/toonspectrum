import {
  parseStudioCrdtUpdateRequest,
  type StudioCrdtUpdateRequest,
} from "./studio-crdt-protocol";

const DATABASE_NAME = "toonspectrum-studio-crdt-outbox";
const DATABASE_VERSION = 1;
const STORE_NAME = "pending-updates";
const SCOPE_WORK_INDEX = "scope-work";
const DEFAULT_OPERATION_TIMEOUT_MS = 1_500;
const CIRCUIT_BREAKER_COOLDOWN_MS = 5_000;
const memoryRows = new Map<string, StoredStudioCrdtUpdate>();
const operationTails = new Map<string, Promise<void>>();
const unhealthyUntil = new Map<string, number>();
const indexedDbAcknowledgedUpdates = new Set<string>();
const indexedDbActivePuts = new Map<string, number>();

interface StoredStudioCrdtUpdate {
  kind?: "update";
  key: string;
  scope: string;
  workId: string;
  updateId: string;
  clientSequence: number;
  request: StudioCrdtUpdateRequest;
  createdAt: number;
  /** Same-page only; IndexedDB rows are authoritative regardless of this advisory flag. */
  durable?: boolean;
}

interface StoredStudioCrdtTombstone {
  kind: "tombstone";
  key: string;
  scope: string;
  workId: string;
  updateId: string;
  createdAt: number;
}

type StoredStudioCrdtRow = StoredStudioCrdtUpdate | StoredStudioCrdtTombstone;

interface StudioCrdtOutboxPersistenceAdapter {
  list(scope: string, workId: string): Promise<unknown[]>;
  put(row: StoredStudioCrdtRow): Promise<void>;
  delete(keys: readonly string[]): Promise<void>;
}

export interface StudioCrdtOutboxStatus {
  state: "durable" | "degraded";
  message: string;
}

export interface StudioCrdtOutbox {
  list(scope: string, workId: string): Promise<StudioCrdtUpdateRequest[]>;
  /** Same-tab recovery path used when IndexedDB itself is unavailable or wedged. */
  listEmergency?(scope: string, workId: string): StudioCrdtUpdateRequest[];
  putEmergency?(scope: string, request: StudioCrdtUpdateRequest): void;
  put(scope: string, request: StudioCrdtUpdateRequest): Promise<void>;
  removeEmergency?(scope: string, workId: string, updateId: string): void;
  remove(scope: string, workId: string, updateId: string): Promise<void>;
  /** Lets the binding keep a persistent, user-visible durability warning after a fallback. */
  getStatus?(): StudioCrdtOutboxStatus;
}

interface SerializedDelegateState {
  acknowledgedUpdates: Set<string>;
  activePuts: Map<string, number>;
}

const serializedDelegateStates = new WeakMap<StudioCrdtOutbox, SerializedDelegateState>();

function serializedDelegateState(delegate: StudioCrdtOutbox): SerializedDelegateState {
  const existing = serializedDelegateStates.get(delegate);
  if (existing) return existing;
  const created: SerializedDelegateState = {
    acknowledgedUpdates: new Set(),
    activePuts: new Map(),
  };
  serializedDelegateStates.set(delegate, created);
  return created;
}

export class StudioCrdtOutboxUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudioCrdtOutboxUnavailableError";
  }
}

export class StudioCrdtOutboxTimeoutError extends StudioCrdtOutboxUnavailableError {
  constructor() {
    super("CRDT outbox 작업 시간이 초과됐습니다.");
    this.name = "StudioCrdtOutboxTimeoutError";
  }
}

function outboxKey(scope: string, workId: string, updateId: string): string {
  return JSON.stringify([scope, workId, updateId]);
}

function scopeWorkKey(scope: string, workId: string): string {
  return JSON.stringify([scope, workId]);
}

function isCircuitOpen(key: string): boolean {
  const until = unhealthyUntil.get(key) ?? 0;
  if (until > Date.now()) return true;
  if (until > 0) unhealthyUntil.delete(key);
  return false;
}

function openCircuit(key: string): void {
  unhealthyUntil.set(key, Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS);
}

function filterAcknowledged(
  acknowledgedUpdates: ReadonlySet<string>,
  scope: string,
  workId: string,
  requests: readonly StudioCrdtUpdateRequest[]
): StudioCrdtUpdateRequest[] {
  return requests.filter(
    (request) => !acknowledgedUpdates.has(outboxKey(scope, workId, request.updateId))
  );
}

function scopedMemoryRows(scope: string, workId: string): StoredStudioCrdtUpdate[] {
  return [...memoryRows.values()].filter(
    (row) => row.scope === scope && row.workId === workId
  );
}

function serializeOutboxOperation<T>(
  scope: string,
  workId: string,
  operation: () => Promise<T>,
  timeoutMs: number,
  scheduleTimeout: (handler: () => void, delay: number) => unknown,
  cancelTimeout: (handle: unknown) => void,
  allowWhileCircuitOpen = false
): Promise<T> {
  const key = scopeWorkKey(scope, workId);
  const previous = operationTails.get(key) ?? Promise.resolve();
  const result = previous.then(() => {
    if (!allowWhileCircuitOpen && isCircuitOpen(key)) {
      throw new StudioCrdtOutboxUnavailableError("CRDT outbox가 복구 대기 중입니다.");
    }
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let timeoutHandle: unknown = null;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        if (timeoutHandle !== null) cancelTimeout(timeoutHandle);
        callback();
      };
      timeoutHandle = scheduleTimeout(
        () => finish(() => {
          openCircuit(key);
          reject(new StudioCrdtOutboxTimeoutError());
        }),
        timeoutMs
      );
      void Promise.resolve().then(operation).then(
        (value) => finish(() => {
          unhealthyUntil.delete(key);
          resolve(value);
        }),
        (error: unknown) => finish(() => {
          openCircuit(key);
          reject(error);
        })
      );
    });
  });
  const tail = result.then(
    () => undefined,
    () => undefined
  );
  operationTails.set(key, tail);
  void tail.then(() => {
    if (operationTails.get(key) === tail) operationTails.delete(key);
  });
  return result;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 요청이 실패했습니다."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB 작업이 취소되었습니다."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB 작업이 실패했습니다."));
  });
}

let databasePromise: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (databasePromise) return databasePromise;
  const factory = globalThis.indexedDB;
  if (!factory) return Promise.resolve(null);
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? request.transaction?.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: "key" });
      if (store && !store.indexNames.contains(SCOPE_WORK_INDEX)) {
        store.createIndex(SCOPE_WORK_INDEX, ["scope", "workId"], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("CRDT outbox를 열지 못했습니다."));
    request.onblocked = () => reject(new Error("CRDT outbox 업그레이드가 다른 탭에 의해 차단됐습니다."));
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

function isStoredUpdate(value: unknown): value is StoredStudioCrdtUpdate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Partial<StoredStudioCrdtUpdate>;
  if (!(
    (row.kind === undefined || row.kind === "update") &&
    typeof row.key === "string" &&
    typeof row.scope === "string" &&
    typeof row.workId === "string" &&
    typeof row.updateId === "string" &&
    typeof row.clientSequence === "number" &&
    Number.isSafeInteger(row.clientSequence) &&
    typeof row.createdAt === "number" &&
    Number.isFinite(row.createdAt)
  )) return false;
  const parsed = parseStudioCrdtUpdateRequest(row.request, { expectedWorkId: row.workId });
  return (
    parsed !== null &&
    parsed.updateId === row.updateId &&
    parsed.clientSequence === row.clientSequence &&
    row.key === outboxKey(row.scope, row.workId, row.updateId)
  );
}

function isStoredTombstone(value: unknown): value is StoredStudioCrdtTombstone {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Partial<StoredStudioCrdtTombstone>;
  return (
    row.kind === "tombstone" &&
    typeof row.key === "string" &&
    typeof row.scope === "string" &&
    typeof row.workId === "string" &&
    typeof row.updateId === "string" &&
    typeof row.createdAt === "number" &&
    Number.isFinite(row.createdAt) &&
    row.key === outboxKey(row.scope, row.workId, row.updateId)
  );
}

function requestsFromStoredRows(
  rows: Iterable<StoredStudioCrdtUpdate>,
  workId: string
): StudioCrdtUpdateRequest[] {
  return [...rows]
    .sort(
      (left, right) =>
        left.clientSequence - right.clientSequence ||
        left.createdAt - right.createdAt ||
        left.updateId.localeCompare(right.updateId)
    )
    .map((row) => parseStudioCrdtUpdateRequest(row.request, { expectedWorkId: workId }))
    .filter((request): request is StudioCrdtUpdateRequest => request !== null);
}

/**
 * Browser-durable exactly-once retry queue. The server update receipt makes replay safe, while
 * scoping by authenticated user + work prevents a later account on the same device from applying
 * another user's unsent edits. Browsers without IndexedDB retain the online in-memory path.
 */
export class IndexedDbStudioCrdtOutbox implements StudioCrdtOutbox {
  private status: StudioCrdtOutboxStatus = {
    state: "durable",
    message: "오프라인 CRDT 보관함이 정상입니다.",
  };

  constructor(private readonly persistence?: StudioCrdtOutboxPersistenceAdapter) {}

  getStatus(): StudioCrdtOutboxStatus {
    return { ...this.status };
  }

  private markDurable(): void {
    this.status = { state: "durable", message: "오프라인 CRDT 보관함이 정상입니다." };
  }

  private markDegraded(error: unknown): void {
    this.status = {
      state: "degraded",
      message:
        error instanceof Error && error.message.trim()
          ? error.message
          : "오프라인 CRDT 보관함을 사용할 수 없어 같은 탭의 긴급 사본을 사용합니다.",
    };
  }

  private refreshMemoryDurability(scope: string, workId: string): void {
    if (scopedMemoryRows(scope, workId).some((row) => row.durable !== true)) {
      this.markDegraded(
        new StudioCrdtOutboxUnavailableError(
          "일부 오프라인 변경은 아직 같은 탭의 긴급 사본에만 보관되어 있습니다."
        )
      );
    } else {
      this.markDurable();
    }
  }

  listEmergency(scope: string, workId: string): StudioCrdtUpdateRequest[] {
    return filterAcknowledged(
      indexedDbAcknowledgedUpdates,
      scope,
      workId,
      requestsFromStoredRows(scopedMemoryRows(scope, workId), workId)
    );
  }

  putEmergency(scope: string, request: StudioCrdtUpdateRequest): void {
    const key = outboxKey(scope, request.workId, request.updateId);
    if (indexedDbAcknowledgedUpdates.has(key)) return;
    const existing = memoryRows.get(key);
    memoryRows.set(key, {
      kind: "update",
      key,
      scope,
      workId: request.workId,
      updateId: request.updateId,
      clientSequence: request.clientSequence,
      request: { ...request },
      createdAt: existing?.createdAt ?? Date.now(),
      durable: existing?.durable ?? false,
    });
  }

  removeEmergency(scope: string, workId: string, updateId: string): void {
    const key = outboxKey(scope, workId, updateId);
    indexedDbAcknowledgedUpdates.add(key);
    memoryRows.delete(key);
  }

  async list(scope: string, workId: string): Promise<StudioCrdtUpdateRequest[]> {
    let storedRows: unknown[];
    try {
      storedRows = await this.listStoredRows(scope, workId);
      this.refreshMemoryDurability(scope, workId);
    } catch (error) {
      this.markDegraded(error);
      return this.listEmergency(scope, workId);
    }
    // Keep a same-page emergency copy until the server ACK removes it. It covers browsers without
    // IndexedDB and lets a replacement binding recover a write whose IDB transaction failed.
    const mergedRows = new Map<string, StoredStudioCrdtUpdate>();
    const tombstoneKeys = new Set(
      storedRows.filter(isStoredTombstone).map((row) => row.key)
    );
    for (const row of storedRows) {
      if (isStoredUpdate(row) && !tombstoneKeys.has(row.key)) mergedRows.set(row.key, row);
    }
    const staleTombstoneKeys = [...tombstoneKeys].filter(
      (key) => !indexedDbActivePuts.has(key)
    );
    if (staleTombstoneKeys.length > 0) {
      try {
        await this.deleteStoredRows(staleTombstoneKeys);
        for (const key of staleTombstoneKeys) indexedDbAcknowledgedUpdates.delete(key);
      } catch (error) {
        this.markDegraded(error);
      }
    }
    for (const row of scopedMemoryRows(scope, workId)) mergedRows.set(row.key, row);
    return filterAcknowledged(
      indexedDbAcknowledgedUpdates,
      scope,
      workId,
      requestsFromStoredRows(mergedRows.values(), workId)
    );
  }

  async put(scope: string, request: StudioCrdtUpdateRequest): Promise<void> {
    this.putEmergency(scope, request);
    const key = outboxKey(scope, request.workId, request.updateId);
    const row = memoryRows.get(key);
    if (!row) throw new Error("CRDT outbox 긴급 사본을 만들지 못했습니다.");
    let persisted = false;
    this.beginPersistentPut(key);
    try {
      await this.putStoredRow(row);
      persisted = true;

      const current = memoryRows.get(key);
      if (current) memoryRows.set(key, { ...current, durable: true });

      // An authoritative ACK may have arrived after this operation started but before a wedged
      // transaction completed. Queue a durable tombstone after the late put so it cannot reappear.
      if (indexedDbAcknowledgedUpdates.has(key)) {
        await this.writeTombstone(scope, request.workId, request.updateId);
      }
      this.refreshMemoryDurability(scope, request.workId);
    } catch (error) {
      this.markDegraded(error);
      throw error;
    } finally {
      this.endPersistentPut(key);
      if (persisted && indexedDbAcknowledgedUpdates.has(key) && !indexedDbActivePuts.has(key)) {
        try {
          await this.deleteStoredRows([key]);
          indexedDbAcknowledgedUpdates.delete(key);
        } catch (error) {
          // Keeping the tombstone is safe and prevents resurrection; a later read can retry.
          this.markDegraded(error);
        }
      }
    }
  }

  async remove(scope: string, workId: string, updateId: string): Promise<void> {
    this.removeEmergency(scope, workId, updateId);
    try {
      await this.writeTombstone(scope, workId, updateId);
      if (!indexedDbActivePuts.has(outboxKey(scope, workId, updateId))) {
        await this.deleteStoredRows([outboxKey(scope, workId, updateId)]);
        indexedDbAcknowledgedUpdates.delete(outboxKey(scope, workId, updateId));
      }
      this.refreshMemoryDurability(scope, workId);
    } catch (error) {
      this.markDegraded(error);
      if (
        error instanceof StudioCrdtOutboxUnavailableError &&
        !indexedDbActivePuts.has(outboxKey(scope, workId, updateId))
      ) {
        indexedDbAcknowledgedUpdates.delete(outboxKey(scope, workId, updateId));
        return;
      }
      throw error;
    }
  }

  private async writeTombstone(
    scope: string,
    workId: string,
    updateId: string
  ): Promise<void> {
    const tombstone: StoredStudioCrdtTombstone = {
      kind: "tombstone",
      key: outboxKey(scope, workId, updateId),
      scope,
      workId,
      updateId,
      createdAt: Date.now(),
    };
    await this.putStoredRow(tombstone);
  }

  private beginPersistentPut(key: string): void {
    indexedDbActivePuts.set(key, (indexedDbActivePuts.get(key) ?? 0) + 1);
  }

  private endPersistentPut(key: string): void {
    const remaining = (indexedDbActivePuts.get(key) ?? 1) - 1;
    if (remaining <= 0) indexedDbActivePuts.delete(key);
    else indexedDbActivePuts.set(key, remaining);
  }

  private async deleteStoredRows(keys: readonly string[]): Promise<void> {
    if (this.persistence) return this.persistence.delete(keys);
    const database = await this.requiredDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    for (const key of keys) store.delete(key);
    await transactionDone(transaction);
  }

  private async listStoredRows(scope: string, workId: string): Promise<unknown[]> {
    if (this.persistence) return this.persistence.list(scope, workId);
    const database = await this.requiredDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const rows = await requestResult(
      transaction.objectStore(STORE_NAME).index(SCOPE_WORK_INDEX).getAll([scope, workId])
    ) as unknown[];
    await transactionDone(transaction);
    return rows;
  }

  private async putStoredRow(row: StoredStudioCrdtRow): Promise<void> {
    if (this.persistence) return this.persistence.put(row);
    const database = await this.requiredDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(row);
    await transactionDone(transaction);
  }

  private async requiredDatabase(): Promise<IDBDatabase> {
    const database = await openDatabase();
    if (database) return database;
    throw new StudioCrdtOutboxUnavailableError(
      "이 브라우저에서는 IndexedDB를 사용할 수 없어 같은 탭의 긴급 사본만 유지합니다."
    );
  }

}

/**
 * Serializes operations for the same authenticated user + work across binding instances. A newly
 * mounted editor therefore cannot list the outbox before the previous editor's final put settles.
 */
export class SerializedStudioCrdtOutbox implements StudioCrdtOutbox {
  private readonly timeoutMs: number;
  private readonly scheduleTimeout: (handler: () => void, delay: number) => unknown;
  private readonly cancelTimeout: (handle: unknown) => void;
  private readonly delegateState: SerializedDelegateState;
  private status: StudioCrdtOutboxStatus = {
    state: "durable",
    message: "오프라인 CRDT 보관함이 정상입니다.",
  };

  constructor(
    private readonly delegate: StudioCrdtOutbox,
    options: {
      timeoutMs?: number;
      setTimeout?: (handler: () => void, delay: number) => unknown;
      clearTimeout?: (handle: unknown) => void;
    } = {}
  ) {
    this.delegateState = serializedDelegateState(delegate);
    this.timeoutMs = Math.max(100, Math.min(10_000, options.timeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS));
    this.scheduleTimeout = options.setTimeout ?? ((handler, delay) => globalThis.setTimeout(handler, delay));
    this.cancelTimeout = options.clearTimeout ?? ((handle) => {
      globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
    });
  }

  getStatus(): StudioCrdtOutboxStatus {
    const delegated = this.delegate.getStatus?.();
    if (delegated?.state === "degraded") return delegated;
    return { ...this.status };
  }

  private markDurable(): void {
    this.status = { state: "durable", message: "오프라인 CRDT 보관함이 정상입니다." };
  }

  private markDegraded(error: unknown): void {
    this.status = {
      state: "degraded",
      message:
        error instanceof Error && error.message.trim()
          ? error.message
          : "오프라인 CRDT 보관함 대신 같은 탭의 긴급 사본을 사용합니다.",
    };
  }

  list(scope: string, workId: string): Promise<StudioCrdtUpdateRequest[]> {
    const key = scopeWorkKey(scope, workId);
    if (isCircuitOpen(key)) {
      const emergency = this.delegate.listEmergency?.(scope, workId) ?? [];
      this.markDegraded(
        new StudioCrdtOutboxUnavailableError("CRDT outbox가 복구 대기 중입니다.")
      );
      return Promise.resolve(
        filterAcknowledged(this.delegateState.acknowledgedUpdates, scope, workId, emergency)
      );
    }
    return serializeOutboxOperation(
      scope,
      workId,
      () => this.delegate.list(scope, workId),
      this.timeoutMs,
      this.scheduleTimeout,
      this.cancelTimeout
    ).then(
      (requests) => {
        if (this.delegate.getStatus?.().state !== "degraded") this.markDurable();
        return filterAcknowledged(
          this.delegateState.acknowledgedUpdates,
          scope,
          workId,
          requests
        );
      },
      (error: unknown) => {
        this.markDegraded(error);
        const emergency = this.delegate.listEmergency?.(scope, workId) ?? [];
        return filterAcknowledged(
          this.delegateState.acknowledgedUpdates,
          scope,
          workId,
          emergency
        );
      }
    );
  }

  listEmergency(scope: string, workId: string): StudioCrdtUpdateRequest[] {
    return filterAcknowledged(
      this.delegateState.acknowledgedUpdates,
      scope,
      workId,
      this.delegate.listEmergency?.(scope, workId) ?? []
    );
  }

  put(scope: string, request: StudioCrdtUpdateRequest): Promise<void> {
    this.delegate.putEmergency?.(scope, request);
    if (isCircuitOpen(scopeWorkKey(scope, request.workId))) {
      const error = new StudioCrdtOutboxUnavailableError("CRDT outbox가 복구 대기 중입니다.");
      this.markDegraded(error);
      return Promise.reject(error);
    }
    return serializeOutboxOperation(
      scope,
      request.workId,
      () => this.runDelegatePut(scope, request),
      this.timeoutMs,
      this.scheduleTimeout,
      this.cancelTimeout
    ).then(
      () => this.markDurable(),
      (error: unknown) => {
        this.markDegraded(error);
        throw error;
      }
    );
  }

  remove(scope: string, workId: string, updateId: string): Promise<void> {
    const key = outboxKey(scope, workId, updateId);
    this.delegateState.acknowledgedUpdates.add(key);
    this.delegate.removeEmergency?.(scope, workId, updateId);
    // ACK cleanup must probe through an open circuit. Otherwise a timed-out put can finish later
    // and leave a durable row that a replacement editor replays forever.
    return serializeOutboxOperation(
      scope,
      workId,
      () => this.runDelegateRemove(scope, workId, updateId, key),
      this.timeoutMs,
      this.scheduleTimeout,
      this.cancelTimeout,
      true
    ).then(
      () => {
        if (!this.delegateState.activePuts.has(key)) {
          this.delegateState.acknowledgedUpdates.delete(key);
        }
        this.markDurable();
      },
      (error: unknown) => {
        this.markDegraded(error);
        throw error;
      }
    );
  }

  private runDelegatePut(
    scope: string,
    request: StudioCrdtUpdateRequest
  ): Promise<void> {
    const key = outboxKey(scope, request.workId, request.updateId);
    this.delegateState.activePuts.set(
      key,
      (this.delegateState.activePuts.get(key) ?? 0) + 1
    );
    const operation = Promise.resolve().then(() => this.delegate.put(scope, request));
    void operation.then(
      () => this.finishDelegatePut(scope, request, key),
      () => this.finishDelegatePut(scope, request, key)
    );
    return operation;
  }

  private runDelegateRemove(
    scope: string,
    workId: string,
    updateId: string,
    key: string
  ): Promise<void> {
    const operation = Promise.resolve().then(
      () => this.delegate.remove(scope, workId, updateId)
    );
    void operation.then(
      () => {
        if (!this.delegateState.activePuts.has(key)) {
          this.delegateState.acknowledgedUpdates.delete(key);
        }
      },
      () => undefined
    );
    return operation;
  }

  private finishDelegatePut(
    scope: string,
    request: StudioCrdtUpdateRequest,
    key: string
  ): void {
    const remaining = (this.delegateState.activePuts.get(key) ?? 1) - 1;
    if (remaining <= 0) this.delegateState.activePuts.delete(key);
    else this.delegateState.activePuts.set(key, remaining);
    if (remaining > 0 || !this.delegateState.acknowledgedUpdates.has(key)) return;

    // The public remove may have completed after the serialized wrapper timed out while the
    // underlying put was still running. Re-run cleanup after that late put settles.
    void Promise.resolve()
      .then(() => this.delegate.remove(scope, request.workId, request.updateId))
      .then(
        () => this.delegateState.acknowledgedUpdates.delete(key),
        (error: unknown) => this.markDegraded(error)
      );
  }
}

export function createStudioCrdtOutbox(): StudioCrdtOutbox {
  return new SerializedStudioCrdtOutbox(new IndexedDbStudioCrdtOutbox());
}
