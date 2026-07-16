import {
  parseStudioCrdtUpdateRequest,
  type StudioCrdtUpdateRequest,
} from "./studio-crdt-protocol";

const DATABASE_NAME = "toonspectrum-studio-crdt-recovery-vault";
const DATABASE_VERSION = 1;
const STORE_NAME = "rejected-frontiers";
const SCOPE_WORK_INDEX = "scope-work";
const LEGACY_MAX_FRONTIER_UPDATES = 4_096;
const RECOVERY_CHUNK_MAX_UPDATES = 128;
const RECOVERY_CHUNK_MAX_JSON_CHARS = 2 * 1024 * 1024;
const REJECTION_MARKER_STORAGE_PREFIX =
  "toonspectrum:studio-crdt:permanent-rejection:v1:";

export const STUDIO_CRDT_RECOVERY_BUNDLE_VERSION = 1 as const;

export type StudioCrdtRecoveryVaultStatus = "pending-export" | "exported";

export interface StudioCrdtRecoveryVaultEntry {
  vaultId: string;
  scope: string;
  workId: string;
  status: StudioCrdtRecoveryVaultStatus;
  failureCode: string;
  failureMessage: string;
  rejectedUpdateId: string;
  updates: StudioCrdtUpdateRequest[];
  createdAt: number;
  exportedAt: number | null;
}

export interface PreserveStudioCrdtRecoveryFrontierInput {
  scope: string;
  workId: string;
  failureCode: string;
  failureMessage: string;
  rejectedUpdateId: string;
  updates: readonly StudioCrdtUpdateRequest[];
}

/**
 * Small fail-closed guard written before the complete rejected frontier. It contains no document
 * bytes; its only job is to prevent an existing resend outbox from becoming publishable again
 * when the larger recovery-vault transaction fails.
 */
export interface StudioCrdtPermanentRejectionMarker {
  scope: string;
  workId: string;
  failureCode: string;
  failureMessage: string;
  rejectedUpdateId: string;
  recoveryUpdateCount: number;
  createdAt: number;
}

export interface PreserveStudioCrdtRejectionMarkerInput {
  scope: string;
  workId: string;
  failureCode: string;
  failureMessage: string;
  rejectedUpdateId: string;
  recoveryUpdateCount: number;
}

export interface StudioCrdtRejectionMarkerFallback {
  /** Returns true only when the marker also survived beyond the current page lifetime. */
  preserve(marker: StudioCrdtPermanentRejectionMarker): boolean;
  list(scope: string, workId: string): unknown[];
}

export interface StudioCrdtRecoveryVault {
  preserveRejectionMarker(
    input: PreserveStudioCrdtRejectionMarkerInput
  ): Promise<StudioCrdtPermanentRejectionMarker>;
  listRejectionMarkers(
    scope: string,
    workId: string
  ): Promise<StudioCrdtPermanentRejectionMarker[]>;
  preserve(input: PreserveStudioCrdtRecoveryFrontierInput): Promise<StudioCrdtRecoveryVaultEntry>;
  list(scope: string, workId: string): Promise<StudioCrdtRecoveryVaultEntry[]>;
  markExported(scope: string, workId: string, vaultId: string): Promise<void>;
}

interface StoredStudioCrdtRecoveryVaultEntry extends StudioCrdtRecoveryVaultEntry {
  key: string;
}

interface StoredStudioCrdtPermanentRejectionMarker
  extends StudioCrdtPermanentRejectionMarker {
  kind: "permanent-rejection";
  key: string;
}

interface StoredStudioCrdtRecoveryManifest {
  kind: "frontier-manifest";
  key: string;
  vaultId: string;
  scope: string;
  workId: string;
  status: StudioCrdtRecoveryVaultStatus;
  failureCode: string;
  failureMessage: string;
  rejectedUpdateId: string;
  chunkCount: number;
  updateCount: number;
  createdAt: number;
  exportedAt: number | null;
}

interface StoredStudioCrdtRecoveryChunk {
  kind: "frontier-chunk";
  key: string;
  vaultId: string;
  scope: string;
  workId: string;
  chunkIndex: number;
  updates: StudioCrdtUpdateRequest[];
}

type StoredStudioCrdtRecoveryRow =
  | StoredStudioCrdtRecoveryVaultEntry
  | StoredStudioCrdtPermanentRejectionMarker
  | StoredStudioCrdtRecoveryManifest
  | StoredStudioCrdtRecoveryChunk;

export interface StudioCrdtRecoveryVaultPersistence {
  list(scope: string, workId: string): Promise<unknown[]>;
  get(key: string): Promise<unknown | null>;
  put(entry: StoredStudioCrdtRecoveryRow): Promise<void>;
}

export interface StudioCrdtRecoveryBundle {
  format: "toonspectrum-crdt-recovery";
  version: typeof STUDIO_CRDT_RECOVERY_BUNDLE_VERSION;
  workId: string;
  exportedAt: string;
  frontiers: Array<{
    vaultId: string;
    failureCode: string;
    failureMessage: string;
    rejectedUpdateId: string;
    createdAt: string;
    updates: StudioCrdtUpdateRequest[];
  }>;
}

function safeString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function vaultKey(scope: string, workId: string, vaultId: string): string {
  return JSON.stringify([scope, workId, vaultId]);
}

function recoveryChunkKey(
  scope: string,
  workId: string,
  vaultId: string,
  chunkIndex: number
): string {
  return JSON.stringify([scope, workId, vaultId, "chunk", chunkIndex]);
}

function rejectionMarkerKey(scope: string, workId: string, rejectedUpdateId: string): string {
  return JSON.stringify(["permanent-rejection", scope, workId, rejectedUpdateId]);
}

function rejectionMarkerStorageKey(
  scope: string,
  workId: string,
  rejectedUpdateId: string
): string {
  return `${REJECTION_MARKER_STORAGE_PREFIX}${encodeURIComponent(
    rejectionMarkerKey(scope, workId, rejectedUpdateId)
  )}`;
}

function isStoredEntry(value: unknown): value is StoredStudioCrdtRecoveryVaultEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Partial<StoredStudioCrdtRecoveryVaultEntry>;
  if (!(
    safeString(entry.vaultId, 128) &&
    safeString(entry.scope, 256) &&
    safeString(entry.workId, 128) &&
    (entry.status === "pending-export" || entry.status === "exported") &&
    safeString(entry.failureCode, 80) &&
    safeString(entry.failureMessage, 1_000) &&
    safeString(entry.rejectedUpdateId, 128) &&
    Number.isFinite(entry.createdAt) &&
    (entry.exportedAt === null || Number.isFinite(entry.exportedAt)) &&
    Array.isArray(entry.updates) &&
    entry.updates.length > 0 &&
    entry.updates.length <= LEGACY_MAX_FRONTIER_UPDATES &&
    typeof entry.key === "string" &&
    entry.key === vaultKey(entry.scope, entry.workId, entry.vaultId)
  )) return false;

  return entry.updates.every((candidate) =>
    parseStudioCrdtUpdateRequest(candidate, { expectedWorkId: entry.workId }) !== null
  );
}

function isStoredManifest(value: unknown): value is StoredStudioCrdtRecoveryManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const manifest = value as Partial<StoredStudioCrdtRecoveryManifest>;
  return (
    manifest.kind === "frontier-manifest" &&
    safeString(manifest.vaultId, 128) &&
    safeString(manifest.scope, 256) &&
    safeString(manifest.workId, 128) &&
    (manifest.status === "pending-export" || manifest.status === "exported") &&
    safeString(manifest.failureCode, 80) &&
    safeString(manifest.failureMessage, 1_000) &&
    safeString(manifest.rejectedUpdateId, 128) &&
    Number.isSafeInteger(manifest.chunkCount) &&
    (manifest.chunkCount ?? 0) > 0 &&
    Number.isSafeInteger(manifest.updateCount) &&
    (manifest.updateCount ?? 0) > 0 &&
    Number.isFinite(manifest.createdAt) &&
    (manifest.exportedAt === null || Number.isFinite(manifest.exportedAt)) &&
    manifest.key === vaultKey(manifest.scope, manifest.workId, manifest.vaultId)
  );
}

function isStoredChunk(value: unknown): value is StoredStudioCrdtRecoveryChunk {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const chunk = value as Partial<StoredStudioCrdtRecoveryChunk>;
  if (!(
    chunk.kind === "frontier-chunk" &&
    safeString(chunk.vaultId, 128) &&
    safeString(chunk.scope, 256) &&
    safeString(chunk.workId, 128) &&
    typeof chunk.chunkIndex === "number" &&
    Number.isSafeInteger(chunk.chunkIndex) &&
    chunk.chunkIndex >= 0 &&
    Array.isArray(chunk.updates) &&
    chunk.updates.length > 0 &&
    chunk.updates.length <= RECOVERY_CHUNK_MAX_UPDATES &&
    chunk.key === recoveryChunkKey(
      chunk.scope,
      chunk.workId,
      chunk.vaultId,
      chunk.chunkIndex
    )
  )) return false;
  return chunk.updates.every((candidate) =>
    parseStudioCrdtUpdateRequest(candidate, { expectedWorkId: chunk.workId }) !== null
  );
}

function isStoredRejectionMarker(
  value: unknown
): value is StoredStudioCrdtPermanentRejectionMarker {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const marker = value as Partial<StoredStudioCrdtPermanentRejectionMarker>;
  return (
    marker.kind === "permanent-rejection" &&
    safeString(marker.scope, 256) &&
    safeString(marker.workId, 128) &&
    safeString(marker.failureCode, 80) &&
    safeString(marker.failureMessage, 1_000) &&
    safeString(marker.rejectedUpdateId, 128) &&
    Number.isSafeInteger(marker.recoveryUpdateCount) &&
    (marker.recoveryUpdateCount ?? 0) > 0 &&
    Number.isFinite(marker.createdAt) &&
    marker.key === rejectionMarkerKey(
      marker.scope,
      marker.workId,
      marker.rejectedUpdateId
    )
  );
}

function isKnownStoredRow(value: unknown): value is StoredStudioCrdtRecoveryRow {
  return isStoredEntry(value) || isStoredRejectionMarker(value) ||
    isStoredManifest(value) || isStoredChunk(value);
}

function chunkRecoveryRequests(
  updates: readonly StudioCrdtUpdateRequest[]
): StudioCrdtUpdateRequest[][] {
  const chunks: StudioCrdtUpdateRequest[][] = [];
  let current: StudioCrdtUpdateRequest[] = [];
  let currentCharacters = 2;
  for (const request of updates) {
    const requestCharacters = JSON.stringify(request).length + (current.length > 0 ? 1 : 0);
    if (
      current.length > 0 &&
      (current.length >= RECOVERY_CHUNK_MAX_UPDATES ||
        currentCharacters + requestCharacters > RECOVERY_CHUNK_MAX_JSON_CHARS)
    ) {
      chunks.push(current);
      current = [];
      currentCharacters = 2;
    }
    current.push(request);
    currentCharacters += requestCharacters;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function publicRejectionMarker(
  marker: StoredStudioCrdtPermanentRejectionMarker
): StudioCrdtPermanentRejectionMarker {
  return {
    scope: marker.scope,
    workId: marker.workId,
    failureCode: marker.failureCode,
    failureMessage: marker.failureMessage,
    rejectedUpdateId: marker.rejectedUpdateId,
    recoveryUpdateCount: marker.recoveryUpdateCount,
    createdAt: marker.createdAt,
  };
}

const samePageRejectionMarkers = new Map<
  string,
  StoredStudioCrdtPermanentRejectionMarker
>();

class BrowserStudioCrdtRejectionMarkerFallback
implements StudioCrdtRejectionMarkerFallback {
  preserve(marker: StudioCrdtPermanentRejectionMarker): boolean {
    const stored: StoredStudioCrdtPermanentRejectionMarker = {
      ...marker,
      kind: "permanent-rejection",
      key: rejectionMarkerKey(marker.scope, marker.workId, marker.rejectedUpdateId),
    };
    samePageRejectionMarkers.set(stored.key, stored);
    try {
      if (!globalThis.localStorage) return false;
      globalThis.localStorage.setItem(
        rejectionMarkerStorageKey(marker.scope, marker.workId, marker.rejectedUpdateId),
        JSON.stringify(stored)
      );
      return true;
    } catch {
      // The module-level copy still locks replacement bindings in this page. The caller receives
      // false so it can surface that reload durability is at risk when IndexedDB also fails.
      return false;
    }
  }

  list(scope: string, workId: string): unknown[] {
    const markers = new Map<string, unknown>();
    for (const [key, marker] of samePageRejectionMarkers) {
      if (marker.scope === scope && marker.workId === workId) markers.set(key, marker);
    }
    try {
      const storage = globalThis.localStorage;
      if (!storage) return [...markers.values()];
      for (let index = 0; index < storage.length; index += 1) {
        const storageKey = storage.key(index);
        if (!storageKey?.startsWith(REJECTION_MARKER_STORAGE_PREFIX)) continue;
        let logicalKey: unknown;
        try {
          logicalKey = JSON.parse(decodeURIComponent(
            storageKey.slice(REJECTION_MARKER_STORAGE_PREFIX.length)
          ));
        } catch {
          continue;
        }
        if (!(
          Array.isArray(logicalKey) &&
          logicalKey[0] === "permanent-rejection" &&
          logicalKey[1] === scope &&
          logicalKey[2] === workId
        )) continue;
        const serialized = storage.getItem(storageKey);
        let candidate: unknown = null;
        try {
          candidate = serialized === null ? null : JSON.parse(serialized);
        } catch {
          candidate = null;
        }
        // Retain an invalid scoped value so listRejectionMarkers fails closed instead of silently
        // forgetting a guard whose localStorage value was damaged.
        markers.set(JSON.stringify(logicalKey), candidate);
      }
    } catch {
      // Access can be denied in hardened browsing modes. Same-page markers still apply.
    }
    return [...markers.values()];
  }
}

function publicEntry(entry: StoredStudioCrdtRecoveryVaultEntry): StudioCrdtRecoveryVaultEntry {
  return {
    vaultId: entry.vaultId,
    scope: entry.scope,
    workId: entry.workId,
    status: entry.status,
    failureCode: entry.failureCode,
    failureMessage: entry.failureMessage,
    rejectedUpdateId: entry.rejectedUpdateId,
    updates: entry.updates.map((request) => ({ ...request })),
    createdAt: entry.createdAt,
    exportedAt: entry.exportedAt,
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("CRDT 복구 저장소 요청이 실패했습니다."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(
      transaction.error ?? new Error("CRDT 복구 저장소 작업이 취소되었습니다.")
    );
    transaction.onerror = () => reject(
      transaction.error ?? new Error("CRDT 복구 저장소 작업이 실패했습니다.")
    );
  });
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error("이 브라우저에서 영구 CRDT 복구 저장소를 사용할 수 없습니다."));
  }
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
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
    request.onerror = () => reject(
      request.error ?? new Error("CRDT 복구 저장소를 열지 못했습니다.")
    );
    request.onblocked = () => reject(
      new Error("다른 탭이 CRDT 복구 저장소 갱신을 차단했습니다.")
    );
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

function indexedDbPersistence(): StudioCrdtRecoveryVaultPersistence {
  return {
    async list(scope, workId) {
      const database = await openDatabase();
      const transaction = database.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index(SCOPE_WORK_INDEX);
      const rows = await requestResult(index.getAll(IDBKeyRange.only([scope, workId])));
      await transactionDone(transaction);
      return rows;
    },
    async get(key) {
      const database = await openDatabase();
      const transaction = database.transaction(STORE_NAME, "readonly");
      const value = await requestResult(transaction.objectStore(STORE_NAME).get(key));
      await transactionDone(transaction);
      return value ?? null;
    },
    async put(entry) {
      const database = await openDatabase();
      const transaction = database.transaction(STORE_NAME, "readwrite", { durability: "strict" });
      transaction.objectStore(STORE_NAME).put(entry);
      await transactionDone(transaction);
    },
  };
}

function randomVaultId(): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("안전한 CRDT 복구 저장소 식별자를 만들 수 없습니다.");
  }
  return crypto.randomUUID();
}

/**
 * Durable, non-retrying storage for optimistic Yjs frontiers rejected by the authoritative server.
 * Entries remain separate from the resend outbox so opening the work cannot silently replay them.
 */
export class IndexedDbStudioCrdtRecoveryVault implements StudioCrdtRecoveryVault {
  constructor(
    private readonly persistence: StudioCrdtRecoveryVaultPersistence = indexedDbPersistence(),
    private readonly now: () => number = Date.now,
    private readonly randomId: () => string = randomVaultId,
    private readonly markerFallback: StudioCrdtRejectionMarkerFallback =
      new BrowserStudioCrdtRejectionMarkerFallback()
  ) {}

  async preserveRejectionMarker(
    input: PreserveStudioCrdtRejectionMarkerInput
  ): Promise<StudioCrdtPermanentRejectionMarker> {
    const scope = input.scope.trim();
    const workId = input.workId.trim();
    if (!(
      scope && workId &&
      safeString(input.failureCode, 80) &&
      safeString(input.failureMessage, 1_000) &&
      safeString(input.rejectedUpdateId, 128) &&
      Number.isSafeInteger(input.recoveryUpdateCount) &&
      input.recoveryUpdateCount > 0
    )) {
      throw new Error("보존할 CRDT 영구 거절 표식이 잘못되었습니다.");
    }
    const marker: StudioCrdtPermanentRejectionMarker = {
      scope,
      workId,
      failureCode: input.failureCode,
      failureMessage: input.failureMessage,
      rejectedUpdateId: input.rejectedUpdateId,
      recoveryUpdateCount: input.recoveryUpdateCount,
      createdAt: this.now(),
    };
    const fallbackDurable = this.markerFallback.preserve(marker);
    const stored: StoredStudioCrdtPermanentRejectionMarker = {
      ...marker,
      kind: "permanent-rejection",
      key: rejectionMarkerKey(scope, workId, input.rejectedUpdateId),
    };
    try {
      await this.persistence.put(stored);
    } catch (error) {
      if (!fallbackDurable) throw error;
    }
    return { ...marker };
  }

  async listRejectionMarkers(
    scope: string,
    workId: string
  ): Promise<StudioCrdtPermanentRejectionMarker[]> {
    const rows = [
      ...(await this.persistence.list(scope, workId)),
      ...this.markerFallback.list(scope, workId),
    ];
    if (rows.some((row) => !isKnownStoredRow(row))) {
      throw new Error("CRDT 복구 저장소의 영구 거절 표식이 손상되었습니다.");
    }
    const markers = new Map<string, StoredStudioCrdtPermanentRejectionMarker>();
    for (const row of rows) {
      if (isStoredRejectionMarker(row)) markers.set(row.key, row);
    }
    return [...markers.values()]
      .sort((left, right) =>
        left.createdAt - right.createdAt ||
        left.rejectedUpdateId.localeCompare(right.rejectedUpdateId)
      )
      .map(publicRejectionMarker);
  }

  async preserve(
    input: PreserveStudioCrdtRecoveryFrontierInput
  ): Promise<StudioCrdtRecoveryVaultEntry> {
    const scope = input.scope.trim();
    const workId = input.workId.trim();
    if (!scope || !workId || input.updates.length === 0) {
      throw new Error("보존할 CRDT 복구 frontier가 없습니다.");
    }
    const updates = input.updates.map((request) => {
      const parsed = parseStudioCrdtUpdateRequest(request, { expectedWorkId: workId });
      if (!parsed) throw new Error("CRDT 복구 frontier에 잘못된 업데이트가 있습니다.");
      return parsed;
    });
    const existing = (await this.list(scope, workId)).find((entry) =>
      entry.updates.some(({ updateId }) => updateId === input.rejectedUpdateId)
    );
    if (existing) return existing;

    const vaultId = this.randomId();
    const createdAt = this.now();
    const chunks = chunkRecoveryRequests(updates);
    for (const [chunkIndex, chunkUpdates] of chunks.entries()) {
      await this.persistence.put({
        kind: "frontier-chunk",
        key: recoveryChunkKey(scope, workId, vaultId, chunkIndex),
        vaultId,
        scope,
        workId,
        chunkIndex,
        updates: chunkUpdates,
      });
    }
    // The manifest commits last. A crash during chunk writes therefore cannot expose a partial
    // frontier as exportable; the permanent-rejection marker keeps the resend outbox locked.
    const stored: StoredStudioCrdtRecoveryManifest = {
      kind: "frontier-manifest",
      key: vaultKey(scope, workId, vaultId),
      vaultId,
      scope,
      workId,
      status: "pending-export",
      failureCode: input.failureCode.slice(0, 80),
      failureMessage: input.failureMessage.slice(0, 1_000),
      rejectedUpdateId: input.rejectedUpdateId,
      chunkCount: chunks.length,
      updateCount: updates.length,
      createdAt,
      exportedAt: null,
    };
    await this.persistence.put(stored);
    return {
      vaultId,
      scope,
      workId,
      status: "pending-export",
      failureCode: stored.failureCode,
      failureMessage: stored.failureMessage,
      rejectedUpdateId: stored.rejectedUpdateId,
      updates: updates.map((request) => ({ ...request })),
      createdAt,
      exportedAt: null,
    };
  }

  async list(scope: string, workId: string): Promise<StudioCrdtRecoveryVaultEntry[]> {
    const rows = await this.persistence.list(scope, workId);
    if (rows.some((row) => !isKnownStoredRow(row))) {
      // Silently dropping a damaged recovery record could make its matching resend row eligible
      // again. Treat any scoped corruption as a terminal read failure so the binding fails closed.
      throw new Error("CRDT 복구 저장소에 손상된 frontier가 있어 원고를 안전하게 열 수 없습니다.");
    }
    const entries = rows.filter(isStoredEntry).map(publicEntry);
    const manifests = rows.filter(isStoredManifest);
    const manifestVaultIds = new Set(manifests.map(({ vaultId }) => vaultId));
    if (rows.filter(isStoredChunk).some(({ vaultId }) => !manifestVaultIds.has(vaultId))) {
      throw new Error("CRDT 복구 frontier manifest가 누락되어 원고를 안전하게 열 수 없습니다.");
    }
    const chunksByVault = new Map<string, StoredStudioCrdtRecoveryChunk[]>();
    for (const chunk of rows.filter(isStoredChunk)) {
      const existing = chunksByVault.get(chunk.vaultId) ?? [];
      existing.push(chunk);
      chunksByVault.set(chunk.vaultId, existing);
    }
    for (const manifest of manifests) {
      const chunks = (chunksByVault.get(manifest.vaultId) ?? []).sort(
        (left, right) => left.chunkIndex - right.chunkIndex
      );
      if (
        chunks.length !== manifest.chunkCount ||
        chunks.some((chunk, index) => chunk.chunkIndex !== index) ||
        chunks.reduce((sum, chunk) => sum + chunk.updates.length, 0) !== manifest.updateCount
      ) {
        throw new Error("CRDT 복구 frontier 조각이 누락되어 원고를 안전하게 열 수 없습니다.");
      }
      entries.push({
        vaultId: manifest.vaultId,
        scope: manifest.scope,
        workId: manifest.workId,
        status: manifest.status,
        failureCode: manifest.failureCode,
        failureMessage: manifest.failureMessage,
        rejectedUpdateId: manifest.rejectedUpdateId,
        updates: chunks.flatMap((chunk) =>
          chunk.updates.map((request) => ({ ...request }))
        ),
        createdAt: manifest.createdAt,
        exportedAt: manifest.exportedAt,
      });
    }
    return entries.sort((left, right) =>
      left.createdAt - right.createdAt || left.vaultId.localeCompare(right.vaultId)
    );
  }

  async markExported(scope: string, workId: string, vaultId: string): Promise<void> {
    const key = vaultKey(scope, workId, vaultId);
    const value = await this.persistence.get(key);
    if (
      !(isStoredEntry(value) || isStoredManifest(value)) ||
      value.scope !== scope ||
      value.workId !== workId
    ) {
      throw new Error("내보낼 CRDT 복구 frontier를 찾지 못했습니다.");
    }
    if (value.status === "exported") return;
    await this.persistence.put({
      ...value,
      status: "exported",
      exportedAt: this.now(),
    });
  }
}

export function createStudioCrdtRecoveryVault(): StudioCrdtRecoveryVault {
  return new IndexedDbStudioCrdtRecoveryVault();
}

export function createStudioCrdtRecoveryBundle(
  entries: readonly StudioCrdtRecoveryVaultEntry[],
  exportedAt = Date.now()
): StudioCrdtRecoveryBundle {
  if (entries.length === 0) throw new Error("내보낼 CRDT 복구 frontier가 없습니다.");
  const workId = entries[0]?.workId ?? "";
  if (!workId || entries.some((entry) => entry.workId !== workId)) {
    throw new Error("서로 다른 작품의 CRDT 복구 frontier는 한 파일로 내보낼 수 없습니다.");
  }
  return {
    format: "toonspectrum-crdt-recovery",
    version: STUDIO_CRDT_RECOVERY_BUNDLE_VERSION,
    workId,
    exportedAt: new Date(exportedAt).toISOString(),
    frontiers: entries.map((entry) => ({
      vaultId: entry.vaultId,
      failureCode: entry.failureCode,
      failureMessage: entry.failureMessage,
      rejectedUpdateId: entry.rejectedUpdateId,
      createdAt: new Date(entry.createdAt).toISOString(),
      updates: entry.updates.map((request) => ({ ...request })),
    })),
  };
}

export function studioCrdtRecoveryBundleFileName(workId: string, now = Date.now()): string {
  const date = new Date(now).toISOString().replaceAll(":", "-").replace(".000Z", "Z");
  const safeWorkId = workId.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 64) || "work";
  return `toonspectrum-${safeWorkId}-crdt-recovery-${date}.json`;
}

/**
 * Always export the complete work-scoped recovery archive. Updating each IndexedDB manifest's
 * status is not atomic with the browser download; if one status write fails, selecting only the
 * remaining pending rows on retry could produce a partial archive and then allow a destructive
 * reload. A browser download is also not proof that the user still has the earlier file.
 */
export function selectStudioCrdtRecoveryEntriesForDownload(
  entries: readonly StudioCrdtRecoveryVaultEntry[]
): StudioCrdtRecoveryVaultEntry[] {
  return entries.map((entry) => ({
    ...entry,
    updates: entry.updates.map((request) => ({ ...request })),
  }));
}

export async function downloadStudioCrdtRecoveryBundle(options: {
  vault: StudioCrdtRecoveryVault;
  scope: string;
  workId: string;
}): Promise<{ fileName: string; frontierCount: number; updateCount: number }> {
  const entries = selectStudioCrdtRecoveryEntriesForDownload(
    await options.vault.list(options.scope, options.workId)
  );
  const bundle = createStudioCrdtRecoveryBundle(entries);
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("이 환경에서는 CRDT 복구 파일을 내려받을 수 없습니다.");
  }
  const fileName = studioCrdtRecoveryBundleFileName(options.workId);
  const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json;charset=utf-8",
  }));
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = "noopener";
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
  await Promise.all(entries.map((entry) =>
    options.vault.markExported(options.scope, options.workId, entry.vaultId)
  ));
  return {
    fileName,
    frontierCount: entries.length,
    updateCount: entries.reduce((sum, entry) => sum + entry.updates.length, 0),
  };
}
