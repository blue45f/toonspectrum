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

interface StoredStudioCrdtUpdate {
  key: string;
  scope: string;
  workId: string;
  updateId: string;
  clientSequence: number;
  request: StudioCrdtUpdateRequest;
  createdAt: number;
}

export interface StudioCrdtOutbox {
  list(scope: string, workId: string): Promise<StudioCrdtUpdateRequest[]>;
  /** Same-tab recovery path used when IndexedDB itself is unavailable or wedged. */
  listEmergency?(scope: string, workId: string): StudioCrdtUpdateRequest[];
  putEmergency?(scope: string, request: StudioCrdtUpdateRequest): void;
  put(scope: string, request: StudioCrdtUpdateRequest): Promise<void>;
  removeEmergency?(scope: string, workId: string, updateId: string): void;
  remove(scope: string, workId: string, updateId: string): Promise<void>;
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
  cancelTimeout: (handle: unknown) => void
): Promise<T> {
  const key = scopeWorkKey(scope, workId);
  const previous = operationTails.get(key) ?? Promise.resolve();
  const result = previous.then(() => {
    if (isCircuitOpen(key)) {
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
  return (
    typeof row.key === "string" &&
    typeof row.scope === "string" &&
    typeof row.workId === "string" &&
    typeof row.updateId === "string" &&
    typeof row.clientSequence === "number" &&
    Number.isSafeInteger(row.clientSequence) &&
    typeof row.createdAt === "number" &&
    Number.isFinite(row.createdAt)
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
  listEmergency(scope: string, workId: string): StudioCrdtUpdateRequest[] {
    return requestsFromStoredRows(scopedMemoryRows(scope, workId), workId);
  }

  putEmergency(scope: string, request: StudioCrdtUpdateRequest): void {
    const key = outboxKey(scope, request.workId, request.updateId);
    const existing = memoryRows.get(key);
    memoryRows.set(key, {
      key,
      scope,
      workId: request.workId,
      updateId: request.updateId,
      clientSequence: request.clientSequence,
      request: { ...request },
      createdAt: existing?.createdAt ?? Date.now(),
    });
  }

  removeEmergency(scope: string, workId: string, updateId: string): void {
    memoryRows.delete(outboxKey(scope, workId, updateId));
  }

  async list(scope: string, workId: string): Promise<StudioCrdtUpdateRequest[]> {
    const database = await openDatabase();
    let storedRows: unknown[] = [];
    if (database) {
      const transaction = database.transaction(STORE_NAME, "readonly");
      storedRows = await requestResult(
        transaction.objectStore(STORE_NAME).index(SCOPE_WORK_INDEX).getAll([scope, workId])
      ) as unknown[];
      await transactionDone(transaction);
    }
    // Keep a same-page emergency copy until the server ACK removes it. It covers browsers without
    // IndexedDB and lets a replacement binding recover a write whose IDB transaction failed.
    const mergedRows = new Map<string, StoredStudioCrdtUpdate>();
    for (const row of storedRows) {
      if (isStoredUpdate(row)) mergedRows.set(row.key, row);
    }
    for (const row of scopedMemoryRows(scope, workId)) mergedRows.set(row.key, row);
    return requestsFromStoredRows(mergedRows.values(), workId);
  }

  async put(scope: string, request: StudioCrdtUpdateRequest): Promise<void> {
    this.putEmergency(scope, request);
    const key = outboxKey(scope, request.workId, request.updateId);
    const row = memoryRows.get(key);
    if (!row) throw new Error("CRDT outbox 긴급 사본을 만들지 못했습니다.");
    const database = await openDatabase();
    if (!database) {
      throw new StudioCrdtOutboxUnavailableError(
        "이 브라우저에서는 IndexedDB를 사용할 수 없어 같은 탭의 긴급 사본만 유지합니다."
      );
    }
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(row);
    await transactionDone(transaction);
  }

  async remove(scope: string, workId: string, updateId: string): Promise<void> {
    this.removeEmergency(scope, workId, updateId);
    const database = await openDatabase();
    if (!database) return;
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(outboxKey(scope, workId, updateId));
    await transactionDone(transaction);
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

  constructor(
    private readonly delegate: StudioCrdtOutbox,
    options: {
      timeoutMs?: number;
      setTimeout?: (handler: () => void, delay: number) => unknown;
      clearTimeout?: (handle: unknown) => void;
    } = {}
  ) {
    this.timeoutMs = Math.max(100, Math.min(10_000, options.timeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS));
    this.scheduleTimeout = options.setTimeout ?? ((handler, delay) => globalThis.setTimeout(handler, delay));
    this.cancelTimeout = options.clearTimeout ?? ((handle) => {
      globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
    });
  }

  list(scope: string, workId: string): Promise<StudioCrdtUpdateRequest[]> {
    const key = scopeWorkKey(scope, workId);
    if (isCircuitOpen(key)) {
      const emergency = this.delegate.listEmergency?.(scope, workId) ?? [];
      return emergency.length > 0
        ? Promise.resolve(emergency)
        : Promise.reject(new StudioCrdtOutboxUnavailableError("CRDT outbox가 복구 대기 중입니다."));
    }
    return serializeOutboxOperation(
      scope,
      workId,
      () => this.delegate.list(scope, workId),
      this.timeoutMs,
      this.scheduleTimeout,
      this.cancelTimeout
    ).catch((error: unknown) => {
      const emergency = this.delegate.listEmergency?.(scope, workId) ?? [];
      if (emergency.length > 0) return emergency;
      throw error;
    });
  }

  listEmergency(scope: string, workId: string): StudioCrdtUpdateRequest[] {
    return this.delegate.listEmergency?.(scope, workId) ?? [];
  }

  put(scope: string, request: StudioCrdtUpdateRequest): Promise<void> {
    this.delegate.putEmergency?.(scope, request);
    if (isCircuitOpen(scopeWorkKey(scope, request.workId))) {
      return Promise.reject(new StudioCrdtOutboxUnavailableError("CRDT outbox가 복구 대기 중입니다."));
    }
    return serializeOutboxOperation(
      scope,
      request.workId,
      () => this.delegate.put(scope, request),
      this.timeoutMs,
      this.scheduleTimeout,
      this.cancelTimeout
    );
  }

  remove(scope: string, workId: string, updateId: string): Promise<void> {
    this.delegate.removeEmergency?.(scope, workId, updateId);
    if (isCircuitOpen(scopeWorkKey(scope, workId))) return Promise.resolve();
    return serializeOutboxOperation(
      scope,
      workId,
      () => this.delegate.remove(scope, workId, updateId),
      this.timeoutMs,
      this.scheduleTimeout,
      this.cancelTimeout
    );
  }
}

export function createStudioCrdtOutbox(): StudioCrdtOutbox {
  return new SerializedStudioCrdtOutbox(new IndexedDbStudioCrdtOutbox());
}
