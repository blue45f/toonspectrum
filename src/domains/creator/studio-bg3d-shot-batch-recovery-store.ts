/**
 * Browser-durable, shot-atomic recovery for Studio 3D batch renders.
 *
 * IndexedDB transactions are the authority. BroadcastChannel/Web Locks may be added as latency
 * optimizations later, but correctness comes from a fencing lease plus state-revision CAS in the
 * same transaction that commits a shot's artifact bundle and global byte ledger.
 */

import {
  STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES,
  type StudioBg3dShotBatchImage,
  type StudioBg3dShotBatchLayeredPsd,
  type StudioBg3dShotBatchPsdFallback,
  type StudioBg3dShotBatchSkippedArtifact,
} from "./studio-bg3d-shot-batch";
import {
  reverifyStudioBg3dShotBatchShotArtifacts,
  verifyStudioBg3dShotBatchShotArtifacts,
  type StudioBg3dShotBatchShotArtifacts,
  type StudioBg3dVerifiedShotBatchShotArtifacts,
} from "./studio-bg3d-shot-batch-artifact-integrity";
import {
  hydrateStudioBg3dShotBatchPlan,
  verifyStudioBg3dShotBatchSourceRevision,
  type StudioBg3dShotBatchPlan,
} from "./studio-bg3d-shot-batch-plan";
import {
  createStudioBg3dShotBatchQueue,
  failStudioBg3dShotBatchQueueItem,
  retryStudioBg3dShotBatchQueue,
  STUDIO_BG3D_SHOT_BATCH_MAX_ATTEMPTS,
  startStudioBg3dShotBatchQueueItem,
  succeedStudioBg3dShotBatchQueueItem,
  type StudioBg3dShotBatchFailureCode,
  type StudioBg3dShotBatchQueue,
} from "./studio-bg3d-shot-batch-queue";
import { compareStudioValidationStrings } from "./studio-validation-string-order";

export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_DATABASE_NAME =
  "toonspectrum-studio-bg3d-shot-batch-recovery";
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_DATABASE_VERSION = 1;
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_JOB_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_DOWNLOAD_TTL_MS = 24 * 60 * 60 * 1_000;
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_LEASE_MS = 30_000;
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_HEARTBEAT_MS = 10_000;
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES = 512 * 1024 * 1024;
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_RESERVE_BYTES = 64 * 1024 * 1024;
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_JOBS = 64;
/**
 * A recent server decision can fence a client-only IndexedDB commit, but cannot make remote ACL
 * state and local storage one distributed transaction. Keep the reusable window bounded and
 * re-authorize every quota retry; large Blob staging may consume most of this window.
 */
export const STUDIO_BG3D_SHOT_BATCH_RECOVERY_AUTHORIZATION_RECEIPT_MAX_TTL_MS = 30_000;

const STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_JOB_STORAGE_BYTES = 8 * 1024 * 1024;
const STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_ARTIFACT_STORAGE_BYTES = 512 * 1024;
const STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_SOURCE_BYTES = 320 * 1024;
const STUDIO_BG3D_SHOT_BATCH_RECOVERY_JOB_BASE_BYTES = 4 * 1024;
const STUDIO_BG3D_SHOT_BATCH_RECOVERY_JOB_SHOT_RESERVE_BYTES = 1_024;
const STUDIO_BG3D_SHOT_BATCH_RECOVERY_JOB_FILE_RESERVE_BYTES = 512;
const STUDIO_BG3D_SHOT_BATCH_RECOVERY_ARTIFACT_BASE_BYTES = 2 * 1024;

const JOBS_STORE = "jobs";
const ARTIFACTS_STORE = "artifacts";
const LEASES_STORE = "leases";
const META_STORE = "meta";
const META_KEY = "usage:v1";
const STORE_NAMES = [JOBS_STORE, ARTIFACTS_STORE, LEASES_STORE, META_STORE] as const;
const RECOVERY_KEY_PATTERN = /^bg3d-batch-v2-[0-9a-f]{64}$/u;
const FAILURE_CODES = new Set<StudioBg3dShotBatchFailureCode>([
  "scene-restore-failed",
  "view-timeout",
  "capture-failed",
  "raster-failed",
  "encode-failed",
  "artifact-budget-exceeded",
  "visibility-interrupted",
  "unknown",
]);

export type StudioBg3dShotBatchRecoveryMode = "durable" | "memory";
export type StudioBg3dShotBatchRecoveryPersistence = "granted" | "not-granted" | "unknown";
export type StudioBg3dShotBatchRecoveryErrorCode =
  | "busy"
  | "lease-lost"
  | "cas-conflict"
  | "corrupt"
  | "budget-exceeded"
  | "access-denied"
  | "storage-unavailable";

export class StudioBg3dShotBatchRecoveryError extends Error {
  readonly code: StudioBg3dShotBatchRecoveryErrorCode;

  constructor(code: StudioBg3dShotBatchRecoveryErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StudioBg3dShotBatchRecoveryError";
    this.code = code;
  }
}

export interface StudioBg3dShotBatchRunToken {
  readonly shotId: string;
  readonly runId: string;
  readonly fence: number;
  readonly revision: number;
}

export interface StudioBg3dShotBatchRecoveryAcquireOptions {
  readonly signal?: AbortSignal;
}

export interface StudioBg3dShotBatchRecoveryCommitOptions {
  readonly signal?: AbortSignal;
  /**
   * Called after expensive integrity hashing for every durable attempt. The receipt supplies a
   * recent server decision plus a synchronous local-epoch fence that is checked throughout the
   * short IndexedDB commit. Remote ACL and client IndexedDB cannot be globally atomic.
   */
  readonly authorizeBeforeCommit?: (
    signal: AbortSignal | undefined,
  ) => StudioBg3dShotBatchRecoveryAuthorizationReceipt | null |
    Promise<StudioBg3dShotBatchRecoveryAuthorizationReceipt | null>;
}

export interface StudioBg3dShotBatchRecoveryAuthorizationReceipt {
  readonly authorizedAt: number;
  readonly expiresAt: number;
  readonly isLocallyCurrent: () => boolean;
}

interface ActiveRun {
  readonly shotId: string;
  readonly runId: string;
  readonly fence: number;
}

export interface StudioBg3dShotBatchRecoverySession {
  readonly plan: StudioBg3dShotBatchPlan;
  readonly sourceRevision: string;
  readonly ownerId: string;
  mode: StudioBg3dShotBatchRecoveryMode;
  persistence: StudioBg3dShotBatchRecoveryPersistence;
  degradedReason: string | null;
  queue: StudioBg3dShotBatchQueue;
  revision: number;
  fence: number;
  leaseToken: string;
  totalArtifactBytes: number;
  artifactCount: number;
  jobStorageBytes: number;
  artifactStorageBytes: number;
  activeRun: ActiveRun | null;
  images: StudioBg3dShotBatchImage[];
  skippedArtifacts: StudioBg3dShotBatchSkippedArtifact[];
  layeredPsds: StudioBg3dShotBatchLayeredPsd[];
  psdFallbacks: StudioBg3dShotBatchPsdFallback[];
  /** Verified receipts retained so a quota failure can degrade without losing prior shots. */
  shotArtifacts: Map<string, StudioBg3dVerifiedShotBatchShotArtifacts>;
  released: boolean;
}

interface JobRecord {
  readonly kind: "toonspectrum-bg3d-shot-batch-job";
  readonly version: 1;
  readonly recoveryKey: string;
  readonly plan: StudioBg3dShotBatchPlan;
  readonly sourceRevision: string;
  readonly queue: StudioBg3dShotBatchQueue;
  readonly revision: number;
  readonly activeRun: ActiveRun | null;
  readonly artifactKeys: readonly string[];
  readonly totalArtifactBytes: number;
  readonly artifactCount: number;
  /** Immutable conservative reservation for the Job, Plan, source snapshot, and bounded queues. */
  readonly jobStorageBytes: number;
  /** Sum of conservative non-Blob storage reservations for referenced artifact envelopes. */
  readonly artifactStorageBytes: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly expiresAt: number;
  readonly downloadRequestedAt: number | null;
}

interface ArtifactRecord {
  readonly kind: "toonspectrum-bg3d-shot-batch-shot-artifacts";
  readonly version: 1;
  readonly artifactKey: string;
  readonly recoveryKey: string;
  readonly shotId: string;
  readonly artifacts: StudioBg3dVerifiedShotBatchShotArtifacts;
  /** Conservative structured-clone/index reservation; Blob payload bytes are accounted separately. */
  readonly storageBytes: number;
  readonly createdAt: number;
}

interface LeaseRecord {
  readonly kind: "toonspectrum-bg3d-shot-batch-lease";
  readonly version: 1;
  readonly recoveryKey: string;
  readonly ownerId: string;
  readonly leaseToken: string;
  readonly fence: number;
  readonly acquiredAt: number;
  readonly heartbeatAt: number;
  readonly expiresAt: number;
}

interface UsageRecord {
  readonly kind: "toonspectrum-bg3d-shot-batch-usage";
  readonly version: 1;
  readonly key: typeof META_KEY;
  readonly revision: number;
  readonly artifactBytes: number;
  readonly artifactCount: number;
  readonly structuredBytes: number;
  readonly jobCount: number;
  readonly updatedAt: number;
}

interface MemoryRecord {
  job: JobRecord;
  lease: LeaseRecord | null;
  readonly artifacts: Map<string, ArtifactRecord>;
}

export interface StudioBg3dShotBatchRecoveryStoreOptions {
  readonly indexedDB?: IDBFactory | null;
  readonly now?: () => number;
  readonly ownerId?: string;
  /** Tests can disable timers while still exercising all lease/CAS transitions explicitly. */
  readonly heartbeat?: boolean;
  readonly storageManager?: Pick<StorageManager, "estimate" | "persist"> | null;
}

const memoryRecords = new Map<string, MemoryRecord>();

function purgeExpiredMemoryRecords(now: number): void {
  for (const [key, record] of memoryRecords) {
    if (record.job.expiresAt <= now && (!record.lease || record.lease.expiresAt <= now)) {
      memoryRecords.delete(key);
    }
  }
}

function memoryStorageBytesExcluding(recoveryKey: string): number {
  let total = 0;
  for (const [key, record] of memoryRecords) {
    if (key !== recoveryKey) {
      total += record.job.totalArtifactBytes + record.job.jobStorageBytes +
        record.job.artifactStorageBytes;
    }
  }
  return total;
}

function memoryJobCountExcluding(recoveryKey: string): number {
  let count = 0;
  for (const key of memoryRecords.keys()) {
    if (key !== recoveryKey) count += 1;
  }
  return count;
}

function randomId(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) {
    throw new StudioBg3dShotBatchRecoveryError(
      "storage-unavailable",
      "보안 난수 생성기를 사용할 수 없어 컷 배치 lease를 만들 수 없습니다.",
    );
  }
  try {
    if (typeof cryptoApi.randomUUID === "function") {
      const uuid = cryptoApi.randomUUID();
      if (uuid) return `${prefix}-${uuid}`;
    }
    if (typeof cryptoApi.getRandomValues !== "function") {
      throw new TypeError("Web Crypto getRandomValues is unavailable");
    }
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${prefix}-${token}`;
  } catch (cause) {
    throw new StudioBg3dShotBatchRecoveryError(
      "storage-unavailable",
      "보안 난수 생성기를 사용할 수 없어 컷 배치 lease를 만들 수 없습니다.",
      { cause },
    );
  }
}

function exactKeys(value: unknown, keys: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort(compareStudioValidationStrings);
  const expected = [...keys].sort(compareStudioValidationStrings);
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function recoveryAbortError(): DOMException {
  return new DOMException("컷 배치 복구 작업이 취소되었습니다.", "AbortError");
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw recoveryAbortError();
}

function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(recoveryAbortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      (cause: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(cause);
      },
    );
  });
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === "AbortError";
}

function jsonUtf8Bytes(value: unknown, replacer?: (key: string, value: unknown) => unknown): number | null {
  try {
    const encoded = JSON.stringify(value, replacer);
    if (typeof encoded !== "string") return null;
    return new TextEncoder().encode(encoded).byteLength;
  } catch {
    return null;
  }
}

function estimateJobStorageBytes(
  plan: unknown,
  sourceRevision: string,
): number | null {
  if (new TextEncoder().encode(sourceRevision).byteLength >
    STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_SOURCE_BYTES) return null;
  if (typeof plan !== "object" || plan === null || Array.isArray(plan)) return null;
  const shots = (plan as Partial<StudioBg3dShotBatchPlan>).shots;
  const files = (plan as Partial<StudioBg3dShotBatchPlan>).files;
  if (!Array.isArray(shots) || !Array.isArray(files)) return null;
  const planBytes = jsonUtf8Bytes(plan);
  const sourceBytes = new TextEncoder().encode(sourceRevision).byteLength;
  if (planBytes === null) return null;
  const estimated = STUDIO_BG3D_SHOT_BATCH_RECOVERY_JOB_BASE_BYTES +
    (planBytes + sourceBytes) * 2 +
    shots.length * STUDIO_BG3D_SHOT_BATCH_RECOVERY_JOB_SHOT_RESERVE_BYTES +
    files.length * STUDIO_BG3D_SHOT_BATCH_RECOVERY_JOB_FILE_RESERVE_BYTES;
  return Number.isSafeInteger(estimated) && estimated >= 1 &&
    estimated <= STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_JOB_STORAGE_BYTES
    ? estimated
    : null;
}

type ArtifactRecordWithoutStorageBytes = Omit<ArtifactRecord, "storageBytes">;

function estimateArtifactStorageBytes(record: ArtifactRecordWithoutStorageBytes): number | null {
  const metadataBytes = jsonUtf8Bytes(record, (_key, value) => value instanceof Blob
    ? { kind: "blob", type: value.type }
    : value);
  if (metadataBytes === null) return null;
  const estimated = STUDIO_BG3D_SHOT_BATCH_RECOVERY_ARTIFACT_BASE_BYTES + metadataBytes * 2;
  return Number.isSafeInteger(estimated) && estimated >= 1 &&
    estimated <= STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_ARTIFACT_STORAGE_BYTES
    ? estimated
    : null;
}

function withArtifactStorageBytes(record: ArtifactRecordWithoutStorageBytes): ArtifactRecord {
  const storageBytes = estimateArtifactStorageBytes(record);
  if (storageBytes === null) {
    throw new StudioBg3dShotBatchRecoveryError(
      "budget-exceeded",
      "컷 artifact 메타데이터가 복구 저장 예산을 벗어났습니다.",
    );
  }
  return { ...record, storageBytes };
}

function artifactKey(recoveryKey: string, shotId: string): string {
  return `${recoveryKey}|${shotId}`;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new DOMException("IndexedDB request failed", "UnknownError"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(
      transaction.error ?? new DOMException("IndexedDB transaction failed", "UnknownError"),
    );
    transaction.onabort = () => reject(
      transaction.error ?? new DOMException("IndexedDB transaction aborted", "AbortError"),
    );
  });
}

function abortTransaction(transaction: IDBTransaction): void {
  try {
    transaction.abort();
  } catch {
    // The transaction may already be committed or aborted. Awaiting transactionDone below remains
    // the authoritative completion boundary.
  }
}

function readwriteTransaction(database: IDBDatabase): IDBTransaction {
  try {
    return database.transaction([...STORE_NAMES], "readwrite", { durability: "strict" });
  } catch {
    return database.transaction([...STORE_NAMES], "readwrite");
  }
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let blocked = false;
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(
        STUDIO_BG3D_SHOT_BATCH_RECOVERY_DATABASE_NAME,
        STUDIO_BG3D_SHOT_BATCH_RECOVERY_DATABASE_VERSION,
      );
    } catch (cause) {
      reject(new StudioBg3dShotBatchRecoveryError(
        "storage-unavailable",
        "컷 배치 IndexedDB를 열 수 없습니다.",
        { cause },
      ));
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(JOBS_STORE)) {
        database.createObjectStore(JOBS_STORE, { keyPath: "recoveryKey" });
      }
      if (!database.objectStoreNames.contains(ARTIFACTS_STORE)) {
        database.createObjectStore(ARTIFACTS_STORE, { keyPath: "artifactKey" });
      }
      if (!database.objectStoreNames.contains(LEASES_STORE)) {
        database.createObjectStore(LEASES_STORE, { keyPath: "recoveryKey" });
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    request.onerror = () => reject(new StudioBg3dShotBatchRecoveryError(
      "storage-unavailable",
      "컷 배치 IndexedDB를 열 수 없습니다.",
      { cause: request.error ?? undefined },
    ));
    request.onblocked = () => {
      blocked = true;
      reject(new StudioBg3dShotBatchRecoveryError(
        "storage-unavailable",
        "다른 탭이 컷 배치 저장소 업그레이드를 막고 있습니다.",
      ));
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

async function withDatabase<T>(factory: IDBFactory, callback: (database: IDBDatabase) => Promise<T>): Promise<T> {
  const database = await openDatabase(factory);
  try {
    return await callback(database);
  } finally {
    database.close();
  }
}

function isQueue(value: unknown, plan: StudioBg3dShotBatchPlan): value is StudioBg3dShotBatchQueue {
  if (!exactKeys(value, ["version", "resumeKey", "items"])) return false;
  const queue = value as StudioBg3dShotBatchQueue;
  return queue.version === 2 && queue.resumeKey === plan.resumeKey &&
    Array.isArray(queue.items) && queue.items.length === plan.shots.length &&
    queue.items.every((item, index) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return false;
      const expectedKeys = item.failureCode === undefined
        ? ["shotId", "status", "attempts"]
        : ["shotId", "status", "attempts", "failureCode"];
      return exactKeys(item, expectedKeys) && item.shotId === plan.shots[index]?.shotId &&
        (["pending", "running", "succeeded", "failed"] as const).includes(item.status) &&
        Number.isSafeInteger(item.attempts) && item.attempts >= 0 &&
        item.attempts <= STUDIO_BG3D_SHOT_BATCH_MAX_ATTEMPTS &&
        (item.status === "failed") === (item.failureCode !== undefined) &&
        (item.failureCode === undefined || FAILURE_CODES.has(item.failureCode));
    }) && queue.items.filter(({ status }) => status === "running").length <= 1;
}

function isActiveRun(value: unknown, plan: StudioBg3dShotBatchPlan): value is ActiveRun {
  if (!exactKeys(value, ["shotId", "runId", "fence"])) return false;
  const run = value as ActiveRun;
  return plan.shots.some(({ shotId }) => shotId === run.shotId) &&
    typeof run.runId === "string" && run.runId.length >= 1 && run.runId.length <= 160 &&
    Number.isSafeInteger(run.fence) && run.fence >= 1;
}

function isJobRecord(value: unknown, plan: StudioBg3dShotBatchPlan): value is JobRecord {
  if (!exactKeys(value, [
    "kind", "version", "recoveryKey", "plan", "sourceRevision", "queue", "revision",
    "activeRun", "artifactKeys", "totalArtifactBytes", "artifactCount", "jobStorageBytes",
    "artifactStorageBytes", "createdAt", "updatedAt", "expiresAt", "downloadRequestedAt",
  ])) return false;
  const job = value as JobRecord;
  const expectedJobStorageBytes = typeof job.sourceRevision === "string"
    ? estimateJobStorageBytes(job.plan, job.sourceRevision)
    : null;
  return job.kind === "toonspectrum-bg3d-shot-batch-job" && job.version === 1 &&
    job.recoveryKey === plan.resumeKey && job.plan?.resumeKey === plan.resumeKey &&
    typeof job.sourceRevision === "string" && isQueue(job.queue, plan) &&
    Number.isSafeInteger(job.revision) && job.revision >= 0 &&
    (job.activeRun === null || isActiveRun(job.activeRun, plan)) &&
    Array.isArray(job.artifactKeys) && job.artifactKeys.length <= plan.shots.length &&
    job.artifactKeys.every((key) => typeof key === "string" && key.startsWith(`${plan.resumeKey}|`)) &&
    new Set(job.artifactKeys).size === job.artifactKeys.length &&
    Number.isSafeInteger(job.totalArtifactBytes) && job.totalArtifactBytes >= 0 &&
    job.totalArtifactBytes <= STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES &&
    Number.isSafeInteger(job.artifactCount) && job.artifactCount >= 0 &&
    expectedJobStorageBytes !== null && job.jobStorageBytes === expectedJobStorageBytes &&
    Number.isSafeInteger(job.artifactStorageBytes) && job.artifactStorageBytes >= 0 &&
    job.artifactStorageBytes <= STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES &&
    job.totalArtifactBytes + job.jobStorageBytes + job.artifactStorageBytes <=
      STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES &&
    [job.createdAt, job.updatedAt, job.expiresAt].every((time) =>
      Number.isSafeInteger(time) && time >= 0
    ) &&
    (job.downloadRequestedAt === null || (
      Number.isSafeInteger(job.downloadRequestedAt) && job.downloadRequestedAt >= 0
    ));
}

function isLeaseRecord(value: unknown, recoveryKey: string): value is LeaseRecord {
  if (!exactKeys(value, [
    "kind", "version", "recoveryKey", "ownerId", "leaseToken", "fence",
    "acquiredAt", "heartbeatAt", "expiresAt",
  ])) return false;
  const lease = value as LeaseRecord;
  return lease.kind === "toonspectrum-bg3d-shot-batch-lease" && lease.version === 1 &&
    lease.recoveryKey === recoveryKey && typeof lease.ownerId === "string" &&
    lease.ownerId.length >= 1 && lease.ownerId.length <= 200 &&
    typeof lease.leaseToken === "string" && lease.leaseToken.length >= 1 &&
    lease.leaseToken.length <= 200 && Number.isSafeInteger(lease.fence) && lease.fence >= 1 &&
    [lease.acquiredAt, lease.heartbeatAt, lease.expiresAt].every((time) =>
      Number.isSafeInteger(time) && time >= 0
    );
}

function isUsageRecord(value: unknown): value is UsageRecord {
  if (!exactKeys(value, [
    "kind", "version", "key", "revision", "artifactBytes", "artifactCount",
    "structuredBytes", "jobCount", "updatedAt",
  ])) return false;
  const usage = value as UsageRecord;
  return usage.kind === "toonspectrum-bg3d-shot-batch-usage" && usage.version === 1 &&
    usage.key === META_KEY && Number.isSafeInteger(usage.revision) && usage.revision >= 0 &&
    Number.isSafeInteger(usage.artifactBytes) && usage.artifactBytes >= 0 &&
    usage.artifactBytes <= STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES &&
    Number.isSafeInteger(usage.artifactCount) && usage.artifactCount >= 0 &&
    Number.isSafeInteger(usage.structuredBytes) && usage.structuredBytes >= 0 &&
    usage.structuredBytes <= STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES &&
    usage.artifactBytes + usage.structuredBytes <=
      STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES &&
    Number.isSafeInteger(usage.jobCount) && usage.jobCount >= 0 &&
    usage.jobCount <= STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_JOBS &&
    Number.isSafeInteger(usage.updatedAt) && usage.updatedAt >= 0;
}

/** Minimal plan-independent parser used only to delete expired, inactive jobs atomically. */
function isGcJobRecord(value: unknown): value is JobRecord {
  if (!exactKeys(value, [
    "kind", "version", "recoveryKey", "plan", "sourceRevision", "queue", "revision",
    "activeRun", "artifactKeys", "totalArtifactBytes", "artifactCount", "jobStorageBytes",
    "artifactStorageBytes", "createdAt", "updatedAt", "expiresAt", "downloadRequestedAt",
  ])) return false;
  const job = value as JobRecord;
  const expectedJobStorageBytes = typeof job.sourceRevision === "string"
    ? estimateJobStorageBytes(job.plan, job.sourceRevision)
    : null;
  return job.kind === "toonspectrum-bg3d-shot-batch-job" && job.version === 1 &&
    typeof job.recoveryKey === "string" && RECOVERY_KEY_PATTERN.test(job.recoveryKey) &&
    typeof job.plan === "object" && job.plan !== null &&
    typeof job.sourceRevision === "string" && Number.isSafeInteger(job.revision) && job.revision >= 0 &&
    Array.isArray(job.artifactKeys) && new Set(job.artifactKeys).size === job.artifactKeys.length &&
    job.artifactKeys.every((key) => typeof key === "string" && key.startsWith(`${job.recoveryKey}|`)) &&
    Number.isSafeInteger(job.totalArtifactBytes) && job.totalArtifactBytes >= 0 &&
    job.totalArtifactBytes <= STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES &&
    Number.isSafeInteger(job.artifactCount) && job.artifactCount >= 0 &&
    expectedJobStorageBytes !== null && job.jobStorageBytes === expectedJobStorageBytes &&
    Number.isSafeInteger(job.artifactStorageBytes) && job.artifactStorageBytes >= 0 &&
    job.artifactStorageBytes <= STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES &&
    [job.createdAt, job.updatedAt, job.expiresAt].every((time) =>
      Number.isSafeInteger(time) && time >= 0
    ) && (job.downloadRequestedAt === null || (
      Number.isSafeInteger(job.downloadRequestedAt) && job.downloadRequestedAt >= 0
    ));
}

function isGcLeaseRecord(value: unknown): value is LeaseRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const recoveryKey = (value as Partial<LeaseRecord>).recoveryKey;
  return typeof recoveryKey === "string" && RECOVERY_KEY_PATTERN.test(recoveryKey) &&
    isLeaseRecord(value, recoveryKey);
}

/**
 * Plan-independent artifact envelope validation used by GC. Blob SHA-256 remains an acquire-time
 * check, but GC must never rebuild the origin ledger from a forged JobRecord total.
 */
function isGcArtifactRecord(value: unknown): value is ArtifactRecord {
  if (!exactKeys(value, [
    "kind", "version", "artifactKey", "recoveryKey", "shotId", "artifacts",
    "storageBytes", "createdAt",
  ])) return false;
  const record = value as ArtifactRecord;
  if (record.kind !== "toonspectrum-bg3d-shot-batch-shot-artifacts" || record.version !== 1 ||
    typeof record.recoveryKey !== "string" || !RECOVERY_KEY_PATTERN.test(record.recoveryKey) ||
    typeof record.shotId !== "string" || record.shotId.length < 1 || record.shotId.length > 160 ||
    record.artifactKey !== artifactKey(record.recoveryKey, record.shotId) ||
    !Number.isSafeInteger(record.createdAt) || record.createdAt < 0 ||
    !Number.isSafeInteger(record.storageBytes) || record.storageBytes < 1 ||
    !exactKeys(record.artifacts, [
      "images", "skippedArtifacts", "layeredPsds", "psdFallbacks",
      "blobs", "totalBytes", "artifactCount",
    ])) return false;
  const artifacts = record.artifacts;
  if (!Array.isArray(artifacts.images) || artifacts.images.length > 16 ||
    !Array.isArray(artifacts.skippedArtifacts) || artifacts.skippedArtifacts.length > 16 ||
    !Array.isArray(artifacts.layeredPsds) || artifacts.layeredPsds.length > 1 ||
    !Array.isArray(artifacts.psdFallbacks) || artifacts.psdFallbacks.length > 1 ||
    !Array.isArray(artifacts.blobs) || artifacts.blobs.length > 17 ||
    !Number.isSafeInteger(artifacts.totalBytes) || artifacts.totalBytes < 0 ||
    artifacts.totalBytes > STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES ||
    !Number.isSafeInteger(artifacts.artifactCount) || artifacts.artifactCount < 0 ||
    artifacts.artifactCount !== artifacts.images.length + artifacts.skippedArtifacts.length +
      artifacts.layeredPsds.length + artifacts.psdFallbacks.length) return false;
  let receiptBytes = 0;
  for (const receipt of artifacts.blobs) {
    if (!exactKeys(receipt, ["kind", "key", "sha256", "byteSize"]) ||
      (receipt.kind !== "png" && receipt.kind !== "psd") ||
      typeof receipt.key !== "string" || typeof receipt.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/u.test(receipt.sha256) || !Number.isSafeInteger(receipt.byteSize) ||
      receipt.byteSize < 1) return false;
    receiptBytes += receipt.byteSize;
  }
  let actualBlobBytes = 0;
  for (const image of artifacts.images) {
    if (typeof image !== "object" || image === null || !(image.png instanceof Blob)) return false;
    actualBlobBytes += image.png.size;
  }
  for (const layered of artifacts.layeredPsds) {
    if (typeof layered !== "object" || layered === null || !(layered.psd instanceof Blob)) return false;
    actualBlobBytes += layered.psd.size;
  }
  const { storageBytes: _storageBytes, ...withoutStorageBytes } = record;
  return artifacts.blobs.length === artifacts.images.length + artifacts.layeredPsds.length &&
    receiptBytes === artifacts.totalBytes && actualBlobBytes === artifacts.totalBytes &&
    estimateArtifactStorageBytes(withoutStorageBytes) === record.storageBytes;
}

function emptyUsage(now: number): UsageRecord {
  return {
    kind: "toonspectrum-bg3d-shot-batch-usage",
    version: 1,
    key: META_KEY,
    revision: 0,
    artifactBytes: 0,
    artifactCount: 0,
    structuredBytes: 0,
    jobCount: 0,
    updatedAt: now,
  };
}

function newJob(
  plan: StudioBg3dShotBatchPlan,
  sourceRevision: string,
  now: number,
): JobRecord {
  const jobStorageBytes = estimateJobStorageBytes(plan, sourceRevision);
  if (jobStorageBytes === null) {
    throw new StudioBg3dShotBatchRecoveryError(
      "budget-exceeded",
      "컷 배치 Job 메타데이터가 복구 저장 예산을 벗어났습니다.",
    );
  }
  return {
    kind: "toonspectrum-bg3d-shot-batch-job",
    version: 1,
    recoveryKey: plan.resumeKey,
    plan,
    sourceRevision,
    queue: createStudioBg3dShotBatchQueue(plan),
    revision: 0,
    activeRun: null,
    artifactKeys: [],
    totalArtifactBytes: 0,
    artifactCount: 0,
    jobStorageBytes,
    artifactStorageBytes: 0,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + STUDIO_BG3D_SHOT_BATCH_RECOVERY_JOB_TTL_MS,
    downloadRequestedAt: null,
  };
}

function copyJob(job: JobRecord, patch: Partial<JobRecord>): JobRecord {
  return { ...job, ...patch };
}

function queueIsComplete(queue: StudioBg3dShotBatchQueue): boolean {
  return queue.items.length > 0 && queue.items.every(({ status }) => status === "succeeded");
}

function recoveryExpiry(queue: StudioBg3dShotBatchQueue, now: number): number {
  return now + (queueIsComplete(queue)
    ? STUDIO_BG3D_SHOT_BATCH_RECOVERY_DOWNLOAD_TTL_MS
    : STUDIO_BG3D_SHOT_BATCH_RECOVERY_JOB_TTL_MS);
}

function storageCauseName(cause: unknown): string | null {
  let current: unknown = cause;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof DOMException) return current.name;
    if (current instanceof Error && "cause" in current) current = current.cause;
    else break;
  }
  return null;
}

function isQuotaError(cause: unknown): boolean {
  return storageCauseName(cause) === "QuotaExceededError";
}

function assertAuthorizationReceipt(
  receipt: StudioBg3dShotBatchRecoveryAuthorizationReceipt,
  now: number,
): void {
  const locallyCurrent = (() => {
    try {
      return receipt.isLocallyCurrent();
    } catch {
      return false;
    }
  })();
  if (
    !Number.isSafeInteger(receipt.authorizedAt) ||
    receipt.authorizedAt < 0 ||
    !Number.isSafeInteger(receipt.expiresAt) ||
    receipt.authorizedAt > now ||
    receipt.expiresAt <= now ||
    receipt.expiresAt - receipt.authorizedAt >
      STUDIO_BG3D_SHOT_BATCH_RECOVERY_AUTHORIZATION_RECEIPT_MAX_TTL_MS ||
    !locallyCurrent
  ) {
    throw new StudioBg3dShotBatchRecoveryError(
      "access-denied",
      "컷 artifact 커밋 권한 영수증이 만료되었거나 현재 편집 범위와 다릅니다.",
    );
  }
}

function assertLeaseAndRevision(
  session: StudioBg3dShotBatchRecoverySession,
  job: JobRecord,
  lease: LeaseRecord,
  now: number,
): void {
  if (
    lease.ownerId !== session.ownerId || lease.leaseToken !== session.leaseToken ||
    lease.fence !== session.fence || lease.expiresAt <= now
  ) {
    throw new StudioBg3dShotBatchRecoveryError(
      "lease-lost",
      "다른 탭이 이 컷 배치 복구 작업을 이어받았습니다.",
    );
  }
  if (job.revision !== session.revision) {
    throw new StudioBg3dShotBatchRecoveryError(
      "cas-conflict",
      "컷 배치 복구 상태가 다른 탭에서 변경되었습니다.",
    );
  }
}

function aggregateArtifacts(records: readonly ArtifactRecord[]): Pick<
  StudioBg3dShotBatchRecoverySession,
  "images" | "skippedArtifacts" | "layeredPsds" | "psdFallbacks"
> {
  return {
    images: records.flatMap(({ artifacts }) => [...artifacts.images]),
    skippedArtifacts: records.flatMap(({ artifacts }) => [...artifacts.skippedArtifacts]),
    layeredPsds: records.flatMap(({ artifacts }) => [...artifacts.layeredPsds]),
    psdFallbacks: records.flatMap(({ artifacts }) => [...artifacts.psdFallbacks]),
  };
}

async function verifyArtifactRecords(
  plan: StudioBg3dShotBatchPlan,
  job: JobRecord,
  values: readonly unknown[],
  signal?: AbortSignal,
): Promise<ArtifactRecord[]> {
  throwIfAborted(signal);
  if (values.length !== job.artifactKeys.length) {
    throw new StudioBg3dShotBatchRecoveryError("corrupt", "컷 배치 artifact 목록이 손상되었습니다.");
  }
  const records: ArtifactRecord[] = [];
  const seenShotIds = new Set<string>();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const expectedKey = job.artifactKeys[index];
    if (!exactKeys(value, [
      "kind", "version", "artifactKey", "recoveryKey", "shotId", "artifacts",
      "storageBytes", "createdAt",
    ])) {
      throw new StudioBg3dShotBatchRecoveryError("corrupt", "컷 배치 artifact 레코드가 손상되었습니다.");
    }
    const record = value as ArtifactRecord;
    if (
      record.kind !== "toonspectrum-bg3d-shot-batch-shot-artifacts" || record.version !== 1 ||
      record.artifactKey !== expectedKey || record.recoveryKey !== plan.resumeKey ||
      !plan.shots.some(({ shotId }) => shotId === record.shotId) ||
      record.artifactKey !== artifactKey(plan.resumeKey, record.shotId) ||
      seenShotIds.has(record.shotId) ||
      !Number.isSafeInteger(record.createdAt) || record.createdAt < 0 ||
      !Number.isSafeInteger(record.storageBytes) || record.storageBytes < 1
    ) {
      throw new StudioBg3dShotBatchRecoveryError("corrupt", "컷 배치 artifact 소유권이 손상되었습니다.");
    }
    seenShotIds.add(record.shotId);
    const { storageBytes: _storageBytes, ...withoutStorageBytes } = record;
    if (estimateArtifactStorageBytes(withoutStorageBytes) !== record.storageBytes) {
      throw new StudioBg3dShotBatchRecoveryError(
        "corrupt",
        "저장된 컷 artifact 메타데이터 원장이 손상되었습니다.",
      );
    }
    throwIfAborted(signal);
    let verified: StudioBg3dVerifiedShotBatchShotArtifacts;
    try {
      verified = await awaitWithAbort(
        reverifyStudioBg3dShotBatchShotArtifacts(
          plan,
          record.shotId,
          record.artifacts,
          signal,
        ),
        signal,
      );
    } catch (cause) {
      if (isAbortError(cause)) throw cause;
      throw new StudioBg3dShotBatchRecoveryError(
        "corrupt",
        "저장된 컷 배치 artifact 무결성 검증에 실패했습니다.",
        { cause },
      );
    }
    throwIfAborted(signal);
    records.push({ ...record, artifacts: verified });
  }
  const bytes = records.reduce((total, record) => total + record.artifacts.totalBytes, 0);
  const count = records.reduce((total, record) => total + record.artifacts.artifactCount, 0);
  const storageBytes = records.reduce((total, record) => total + record.storageBytes, 0);
  if (bytes !== job.totalArtifactBytes || count !== job.artifactCount ||
    storageBytes !== job.artifactStorageBytes) {
    throw new StudioBg3dShotBatchRecoveryError("corrupt", "컷 배치 artifact 사용량 원장이 손상되었습니다.");
  }
  const succeededIds = new Set(job.queue.items
    .filter(({ status }) => status === "succeeded")
    .map(({ shotId }) => shotId));
  if (records.length !== succeededIds.size || records.some(({ shotId }) => !succeededIds.has(shotId))) {
    throw new StudioBg3dShotBatchRecoveryError("corrupt", "완료된 컷과 저장 artifact가 일치하지 않습니다.");
  }
  throwIfAborted(signal);
  return records;
}

async function storagePersistence(
  manager: Pick<StorageManager, "persist"> | null,
): Promise<StudioBg3dShotBatchRecoveryPersistence> {
  if (!manager || typeof manager.persist !== "function") return "unknown";
  try {
    return await manager.persist() ? "granted" : "not-granted";
  } catch {
    return "unknown";
  }
}

export class StudioBg3dShotBatchRecoveryStore {
  private readonly now: () => number;
  private readonly ownerId: string;
  private readonly explicitFactory: IDBFactory | null | undefined;
  private readonly heartbeatEnabled: boolean;
  private readonly storageManager: Pick<StorageManager, "estimate" | "persist"> | null;
  private readonly heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(options: StudioBg3dShotBatchRecoveryStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.ownerId = options.ownerId ?? randomId("bg3d-batch-owner");
    this.explicitFactory = options.indexedDB;
    this.heartbeatEnabled = options.heartbeat ?? true;
    this.storageManager = options.storageManager === undefined
      ? (typeof navigator === "undefined" ? null : navigator.storage ?? null)
      : options.storageManager;
  }

  private factory(): IDBFactory | null {
    return this.explicitFactory === undefined ? globalThis.indexedDB ?? null : this.explicitFactory;
  }

  private async assertStorageEstimateCapacity(additionalBytes: number): Promise<void> {
    if (!this.storageManager || typeof this.storageManager.estimate !== "function") return;
    try {
      const estimate = await this.storageManager.estimate();
      if (typeof estimate.usage !== "number" || !Number.isFinite(estimate.usage) ||
        typeof estimate.quota !== "number" || !Number.isFinite(estimate.quota) ||
        estimate.usage < 0 || estimate.quota <= 0) return;
      const reserve = Math.max(
        STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_RESERVE_BYTES,
        Math.floor(estimate.quota * 0.2),
      );
      if (estimate.quota - estimate.usage < additionalBytes + reserve) {
        throw new DOMException(
          "Studio 3D recovery would consume the browser storage reserve.",
          "QuotaExceededError",
        );
      }
    } catch (cause) {
      if (isQuotaError(cause)) throw cause;
      // StorageManager is advisory. IndexedDB plus the app-level ledger remain authoritative when
      // an estimate cannot be obtained (private mode and older engines commonly reject it).
    }
  }

  private startHeartbeat(session: StudioBg3dShotBatchRecoverySession): void {
    this.stopHeartbeat(session.plan.resumeKey);
    if (!this.heartbeatEnabled) return;
    const timer = setInterval(() => {
      void this.renewLease(session).catch(() => {
        // The next authoritative mutation surfaces lease/storage loss. A heartbeat never mutates
        // queue state or silently switches execution mode behind an in-flight capture.
      });
    }, STUDIO_BG3D_SHOT_BATCH_RECOVERY_HEARTBEAT_MS);
    this.heartbeatTimers.set(session.plan.resumeKey, timer);
  }

  private stopHeartbeat(recoveryKey: string): void {
    const timer = this.heartbeatTimers.get(recoveryKey);
    if (timer !== undefined) clearInterval(timer);
    this.heartbeatTimers.delete(recoveryKey);
  }

  private async collectExpiredDurable(
    factory: IDBFactory,
    protectedRecoveryKey: string | null,
  ): Promise<void> {
    const now = this.now();
    await withDatabase(factory, async (database) => {
      const transaction = readwriteTransaction(database);
      const done = transactionDone(transaction);
      try {
        const jobs = transaction.objectStore(JOBS_STORE);
        const artifacts = transaction.objectStore(ARTIFACTS_STORE);
        const leases = transaction.objectStore(LEASES_STORE);
        const meta = transaction.objectStore(META_STORE);
        const [rawJobs, rawLeases, rawUsage, rawArtifacts] = await Promise.all([
          requestResult<unknown[]>(jobs.getAll()),
          requestResult<unknown[]>(leases.getAll()),
          requestResult<unknown>(meta.get(META_KEY)),
          requestResult<unknown[]>(artifacts.getAll()),
        ]);
        if (rawJobs.some((job) => !isGcJobRecord(job)) ||
          rawLeases.some((lease) => !isGcLeaseRecord(lease)) ||
          rawArtifacts.some((artifact) => !isGcArtifactRecord(artifact)) ||
          (rawUsage !== undefined && !isUsageRecord(rawUsage)) ||
          (rawUsage === undefined && rawJobs.length > 0)) {
          throw new StudioBg3dShotBatchRecoveryError(
            "corrupt",
            "만료된 컷 배치 복구 데이터를 안전하게 정리할 수 없습니다.",
          );
        }
        const parsedJobs = rawJobs as JobRecord[];
        const parsedLeases = rawLeases as LeaseRecord[];
        const parsedArtifacts = rawArtifacts as ArtifactRecord[];
        const activeLeaseKeys = new Set(parsedLeases
          .filter(({ expiresAt }) => expiresAt > now)
          .map(({ recoveryKey }) => recoveryKey));
        const expiredJobs = parsedJobs.filter((job) =>
          job.recoveryKey !== protectedRecoveryKey && job.expiresAt <= now &&
          !activeLeaseKeys.has(job.recoveryKey)
        );
        const expiredJobKeys = new Set(expiredJobs.map(({ recoveryKey }) => recoveryKey));
        const retainedJobs = parsedJobs.filter(({ recoveryKey }) => !expiredJobKeys.has(recoveryKey));
        const retainedJobKeys = new Set(retainedJobs.map(({ recoveryKey }) => recoveryKey));
        // Keep an expired lease row as the monotonic fence counter while its job survives. It no
        // longer grants ownership, but deleting it would reset the next takeover fence to one.
        const expiredLeases = parsedLeases.filter((lease) =>
          lease.recoveryKey !== protectedRecoveryKey && lease.expiresAt <= now &&
          !retainedJobKeys.has(lease.recoveryKey)
        );
        const declaredArtifactKeys = new Set(parsedJobs.flatMap(({ artifactKeys }) => artifactKeys));
        const artifactByKey = new Map(parsedArtifacts.map((record) => [record.artifactKey, record]));
        const actualStringKeys = new Set(artifactByKey.keys());
        if ([...declaredArtifactKeys].some((key) => !actualStringKeys.has(key))) {
          throw new StudioBg3dShotBatchRecoveryError(
            "corrupt",
            "컷 배치 Job이 참조하는 artifact가 저장소에 없습니다.",
          );
        }
        const orphanArtifactKeys = parsedArtifacts
          .filter(({ artifactKey: key }) => !declaredArtifactKeys.has(key))
          .map(({ artifactKey: key }) => key);
        for (const job of retainedJobs) {
          const records = job.artifactKeys.map((key) => artifactByKey.get(key)!);
          const bytes = records.reduce((total, record) => total + record.artifacts.totalBytes, 0);
          const count = records.reduce((total, record) => total + record.artifacts.artifactCount, 0);
          const storageBytes = records.reduce((total, record) => total + record.storageBytes, 0);
          if (records.some(({ recoveryKey }) => recoveryKey !== job.recoveryKey) ||
            bytes !== job.totalArtifactBytes || count !== job.artifactCount ||
            storageBytes !== job.artifactStorageBytes) {
            throw new StudioBg3dShotBatchRecoveryError(
              "corrupt",
              "컷 배치 artifact와 Job 사용량 원장이 일치하지 않습니다.",
            );
          }
        }
        const retainedBytes = retainedJobs.reduce((total, job) => total + job.totalArtifactBytes, 0);
        const retainedCount = retainedJobs.reduce((total, job) => total + job.artifactCount, 0);
        const retainedStructuredBytes = retainedJobs.reduce((total, job) =>
          total + job.jobStorageBytes + job.artifactStorageBytes, 0);
        const retainedJobCount = retainedJobs.length;
        if (retainedBytes + retainedStructuredBytes >
          STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES ||
          retainedJobCount > STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_JOBS) {
          throw new StudioBg3dShotBatchRecoveryError(
            "corrupt",
            "컷 배치 복구 저장소 사용량이 origin 예산을 벗어났습니다.",
          );
        }
        const usage = rawUsage === undefined ? emptyUsage(now) : rawUsage;
        const shouldRewriteUsage = rawUsage === undefined || expiredJobs.length > 0 ||
          orphanArtifactKeys.length > 0 || usage.artifactBytes !== retainedBytes ||
          usage.artifactCount !== retainedCount ||
          usage.structuredBytes !== retainedStructuredBytes ||
          usage.jobCount !== retainedJobCount;
        await Promise.all([
          ...expiredJobs.flatMap((job) => [
            ...job.artifactKeys.map((key) => requestResult(artifacts.delete(key))),
            requestResult(jobs.delete(job.recoveryKey)),
          ]),
          ...orphanArtifactKeys.map((key) => requestResult(artifacts.delete(key))),
          ...expiredLeases.map((lease) => requestResult(leases.delete(lease.recoveryKey))),
          ...(shouldRewriteUsage
            ? [requestResult(meta.put({
                ...usage,
                revision: usage.revision + 1,
                artifactBytes: retainedBytes,
                artifactCount: retainedCount,
                structuredBytes: retainedStructuredBytes,
                jobCount: retainedJobCount,
                updatedAt: now,
              }))]
            : []),
        ]);
        await done;
      } catch (cause) {
        abortTransaction(transaction);
        await done.catch(() => undefined);
        if (cause instanceof StudioBg3dShotBatchRecoveryError) throw cause;
        throw new StudioBg3dShotBatchRecoveryError(
          "storage-unavailable",
          "만료된 컷 배치 복구 데이터를 정리하지 못했습니다.",
          { cause },
        );
      }
    });
  }

  private async releaseExactDurableLease(
    factory: IDBFactory,
    lease: LeaseRecord,
  ): Promise<void> {
    try {
      await withDatabase(factory, async (database) => {
        let transaction: IDBTransaction;
        try {
          transaction = database.transaction([LEASES_STORE], "readwrite", { durability: "strict" });
        } catch {
          transaction = database.transaction([LEASES_STORE], "readwrite");
        }
        const done = transactionDone(transaction);
        try {
          const store = transaction.objectStore(LEASES_STORE);
          const raw = await requestResult<unknown>(store.get(lease.recoveryKey));
          if (isLeaseRecord(raw, lease.recoveryKey) && raw.ownerId === lease.ownerId &&
            raw.leaseToken === lease.leaseToken && raw.fence === lease.fence) {
            await requestResult(store.delete(lease.recoveryKey));
          }
          await done;
        } catch {
          abortTransaction(transaction);
          await done.catch(() => undefined);
        }
      });
    } catch {
      // Best effort. Expiry plus fencing still prevents a stale verifier from committing.
    }
  }

  private async durableAcquire(
    factory: IDBFactory,
    plan: StudioBg3dShotBatchPlan,
    sourceRevision: string,
    signal?: AbortSignal,
  ): Promise<{ job: JobRecord; lease: LeaseRecord; values: unknown[] }> {
    throwIfAborted(signal);
    const now = this.now();
    return withDatabase(factory, async (database) => {
      const transaction = readwriteTransaction(database);
      const done = transactionDone(transaction);
      const onSignalAbort = () => abortTransaction(transaction);
      signal?.addEventListener("abort", onSignalAbort, { once: true });
      try {
        const jobs = transaction.objectStore(JOBS_STORE);
        const artifacts = transaction.objectStore(ARTIFACTS_STORE);
        const leases = transaction.objectStore(LEASES_STORE);
        const meta = transaction.objectStore(META_STORE);
        const [rawJob, rawLease, rawUsage] = await Promise.all([
          requestResult<unknown>(jobs.get(plan.resumeKey)),
          requestResult<unknown>(leases.get(plan.resumeKey)),
          requestResult<unknown>(meta.get(META_KEY)),
        ]);
        throwIfAborted(signal);
        const created = rawJob === undefined;
        let job = created ? newJob(plan, sourceRevision, now) : rawJob as JobRecord;
        if (!isJobRecord(job, plan)) {
          throw new StudioBg3dShotBatchRecoveryError("corrupt", "컷 배치 복구 Job이 손상되었습니다.");
        }
        if (job.sourceRevision !== sourceRevision) {
          throw new StudioBg3dShotBatchRecoveryError("corrupt", "컷 배치 source snapshot이 현재 계획과 다릅니다.");
        }
        const existingLease = rawLease === undefined ? null : rawLease;
        if (existingLease !== null && !isLeaseRecord(existingLease, plan.resumeKey)) {
          throw new StudioBg3dShotBatchRecoveryError("corrupt", "컷 배치 복구 lease가 손상되었습니다.");
        }
        if (existingLease && existingLease.expiresAt > now && existingLease.ownerId !== this.ownerId) {
          throw new StudioBg3dShotBatchRecoveryError(
            "busy",
            "다른 탭에서 같은 컷 배치 작업을 실행 중입니다.",
          );
        }
        if (rawUsage !== undefined && !isUsageRecord(rawUsage)) {
          throw new StudioBg3dShotBatchRecoveryError("corrupt", "컷 배치 저장소 사용량 원장이 손상되었습니다.");
        }
        const usage = rawUsage === undefined ? emptyUsage(now) : rawUsage;
        let nextUsage = usage;
        if (created) {
          if (usage.jobCount + 1 > STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_JOBS ||
            usage.artifactBytes + usage.structuredBytes + job.jobStorageBytes >
              STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES) {
            throw new StudioBg3dShotBatchRecoveryError(
              "budget-exceeded",
              "컷 배치 복구 Job 수 또는 구조체 사용량이 origin 예산을 벗어났습니다.",
            );
          }
          nextUsage = {
            ...usage,
            revision: usage.revision + 1,
            structuredBytes: usage.structuredBytes + job.jobStorageBytes,
            jobCount: usage.jobCount + 1,
            updatedAt: now,
          };
        }
        const fence = (existingLease?.fence ?? 0) + 1;
        const recoveredQueue = retryStudioBg3dShotBatchQueue(job.queue);
        const interrupted = job.activeRun !== null ||
          job.queue.items.some(({ status }) => status === "running" || status === "failed");
        if (interrupted || rawJob === undefined) {
          job = copyJob(job, {
            plan,
            queue: recoveredQueue,
            activeRun: null,
            revision: job.revision + (interrupted ? 1 : 0),
            updatedAt: now,
            expiresAt: recoveryExpiry(recoveredQueue, now),
          });
        }
        const artifactRequests = job.artifactKeys.map((key) =>
          requestResult<unknown>(artifacts.get(key))
        );
        const values = await Promise.all(artifactRequests);
        throwIfAborted(signal);
        const leaseNow = this.now();
        const lease: LeaseRecord = {
          kind: "toonspectrum-bg3d-shot-batch-lease",
          version: 1,
          recoveryKey: plan.resumeKey,
          ownerId: this.ownerId,
          leaseToken: randomId("bg3d-batch-lease"),
          fence,
          acquiredAt: leaseNow,
          heartbeatAt: leaseNow,
          expiresAt: leaseNow + STUDIO_BG3D_SHOT_BATCH_RECOVERY_LEASE_MS,
        };
        await Promise.all([
          requestResult(jobs.put(job)),
          requestResult(leases.put(lease)),
          ...(created || rawUsage === undefined ? [requestResult(meta.put(nextUsage))] : []),
        ]);
        await done;
        return { job, lease, values };
      } catch (cause) {
        abortTransaction(transaction);
        await done.catch(() => undefined);
        if (cause instanceof StudioBg3dShotBatchRecoveryError || isAbortError(cause)) throw cause;
        throw new StudioBg3dShotBatchRecoveryError(
          "storage-unavailable",
          "컷 배치 복구 저장소를 읽을 수 없습니다.",
          { cause },
        );
      } finally {
        signal?.removeEventListener("abort", onSignalAbort);
      }
    });
  }

  private memoryAcquire(
    plan: StudioBg3dShotBatchPlan,
    sourceRevision: string,
    reason: string | null,
  ): StudioBg3dShotBatchRecoverySession {
    const now = this.now();
    purgeExpiredMemoryRecords(now);
    let record = memoryRecords.get(plan.resumeKey);
    if (!record) {
      const job = newJob(plan, sourceRevision, now);
      if (memoryJobCountExcluding(plan.resumeKey) + 1 >
        STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_JOBS ||
        memoryStorageBytesExcluding(plan.resumeKey) + job.jobStorageBytes >
          STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES) {
        throw new StudioBg3dShotBatchRecoveryError(
          "budget-exceeded",
          "현재 탭의 컷 배치 복구 Job 수 또는 구조체 사용량이 origin 예산을 벗어났습니다.",
        );
      }
      record = { job, lease: null, artifacts: new Map() };
      memoryRecords.set(plan.resumeKey, record);
    }
    if (!isJobRecord(record.job, plan) || record.job.sourceRevision !== sourceRevision) {
      throw new StudioBg3dShotBatchRecoveryError("corrupt", "메모리 컷 배치 복구 Job이 손상되었습니다.");
    }
    if (record.lease && record.lease.expiresAt > now && record.lease.ownerId !== this.ownerId) {
      throw new StudioBg3dShotBatchRecoveryError("busy", "같은 탭의 다른 편집기가 컷 배치를 실행 중입니다.");
    }
    const fence = (record.lease?.fence ?? 0) + 1;
    const lease: LeaseRecord = {
      kind: "toonspectrum-bg3d-shot-batch-lease",
      version: 1,
      recoveryKey: plan.resumeKey,
      ownerId: this.ownerId,
      leaseToken: randomId("bg3d-batch-memory-lease"),
      fence,
      acquiredAt: now,
      heartbeatAt: now,
      expiresAt: now + STUDIO_BG3D_SHOT_BATCH_RECOVERY_LEASE_MS,
    };
    const interrupted = record.job.activeRun !== null ||
      record.job.queue.items.some(({ status }) => status === "running" || status === "failed");
    record.job = copyJob(record.job, {
      queue: retryStudioBg3dShotBatchQueue(record.job.queue),
      activeRun: null,
      revision: record.job.revision + (interrupted ? 1 : 0),
      updatedAt: now,
      expiresAt: recoveryExpiry(retryStudioBg3dShotBatchQueue(record.job.queue), now),
    });
    record.lease = lease;
    const aggregate = aggregateArtifacts([...record.artifacts.values()]);
    return {
      plan,
      sourceRevision,
      ownerId: this.ownerId,
      mode: "memory",
      persistence: "unknown",
      degradedReason: reason,
      queue: record.job.queue,
      revision: record.job.revision,
      fence,
      leaseToken: lease.leaseToken,
      totalArtifactBytes: record.job.totalArtifactBytes,
      artifactCount: record.job.artifactCount,
      jobStorageBytes: record.job.jobStorageBytes,
      artifactStorageBytes: record.job.artifactStorageBytes,
      activeRun: null,
      ...aggregate,
      shotArtifacts: new Map([...record.artifacts.values()].map(({ shotId, artifacts }) => [
        shotId,
        artifacts,
      ])),
      released: false,
    };
  }

  async acquire(
    plan: StudioBg3dShotBatchPlan,
    sourceRevision: string,
    options: StudioBg3dShotBatchRecoveryAcquireOptions = {},
  ): Promise<StudioBg3dShotBatchRecoverySession> {
    throwIfAborted(options.signal);
    const verifiedPlan = await awaitWithAbort(
      hydrateStudioBg3dShotBatchPlan(plan),
      options.signal,
    );
    throwIfAborted(options.signal);
    if (!verifiedPlan || !await awaitWithAbort(
      verifyStudioBg3dShotBatchSourceRevision(verifiedPlan, sourceRevision),
      options.signal,
    )) {
      throw new StudioBg3dShotBatchRecoveryError("corrupt", "컷 배치 Plan 또는 source snapshot 검증에 실패했습니다.");
    }
    throwIfAborted(options.signal);
    const factory = this.factory();
    if (verifiedPlan.scope.durability !== "durable" || !factory) {
      const session = this.memoryAcquire(
        verifiedPlan,
        sourceRevision,
        verifiedPlan.scope.durability === "durable"
          ? "IndexedDB를 사용할 수 없어 현재 탭 메모리로 복구 범위를 낮췄습니다."
          : null,
      );
      throwIfAborted(options.signal);
      this.startHeartbeat(session);
      return session;
    }
    let durableLeaseAcquired = false;
    try {
      await this.collectExpiredDurable(factory, null);
      throwIfAborted(options.signal);
      const persistencePromise = storagePersistence(this.storageManager);
      let acquired: { job: JobRecord; lease: LeaseRecord; values: unknown[] };
      try {
        acquired = await this.durableAcquire(factory, verifiedPlan, sourceRevision, options.signal);
      } catch (cause) {
        if (!isQuotaError(cause)) throw cause;
        await this.collectExpiredDurable(factory, verifiedPlan.resumeKey);
        throwIfAborted(options.signal);
        acquired = await this.durableAcquire(factory, verifiedPlan, sourceRevision, options.signal);
      }
      durableLeaseAcquired = true;
      const { job, lease, values } = acquired;
      const session: StudioBg3dShotBatchRecoverySession = {
        plan: verifiedPlan,
        sourceRevision,
        ownerId: this.ownerId,
        mode: "durable",
        persistence: "unknown",
        degradedReason: null,
        queue: job.queue,
        revision: job.revision,
        fence: lease.fence,
        leaseToken: lease.leaseToken,
        totalArtifactBytes: job.totalArtifactBytes,
        artifactCount: job.artifactCount,
        jobStorageBytes: job.jobStorageBytes,
        artifactStorageBytes: job.artifactStorageBytes,
        activeRun: job.activeRun,
        images: [],
        skippedArtifacts: [],
        layeredPsds: [],
        psdFallbacks: [],
        shotArtifacts: new Map(),
        released: false,
      };
      // Rehashing hundreds of MiB can exceed the normal lease window. Heartbeat the exact
      // provisional token while bytes are verified, then assert it once more before returning.
      this.startHeartbeat(session);
      try {
        session.persistence = await awaitWithAbort(persistencePromise, options.signal);
        throwIfAborted(options.signal);
        const storedPlan = await awaitWithAbort(
          hydrateStudioBg3dShotBatchPlan(job.plan),
          options.signal,
        );
        throwIfAborted(options.signal);
        if (!storedPlan || storedPlan.resumeKey !== verifiedPlan.resumeKey ||
          storedPlan.planDigest !== verifiedPlan.planDigest ||
          storedPlan.scopeDigest !== verifiedPlan.scopeDigest ||
          !await awaitWithAbort(
            verifyStudioBg3dShotBatchSourceRevision(storedPlan, job.sourceRevision),
            options.signal,
          )) {
          throw new StudioBg3dShotBatchRecoveryError(
            "corrupt",
            "저장된 컷 배치 Plan 또는 source snapshot digest가 손상되었습니다.",
          );
        }
        throwIfAborted(options.signal);
        const records = await verifyArtifactRecords(verifiedPlan, job, values, options.signal);
        throwIfAborted(options.signal);
        const aggregate = aggregateArtifacts(records);
        session.images = aggregate.images;
        session.skippedArtifacts = aggregate.skippedArtifacts;
        session.layeredPsds = aggregate.layeredPsds;
        session.psdFallbacks = aggregate.psdFallbacks;
        session.shotArtifacts = new Map(records.map(({ shotId, artifacts }) => [shotId, artifacts]));
        await this.renewLease(session);
        throwIfAborted(options.signal);
        return session;
      } catch (cause) {
        this.stopHeartbeat(session.plan.resumeKey);
        if (options.signal?.aborted || isAbortError(cause)) {
          await this.releaseExactDurableLease(factory, lease);
          session.released = true;
          throw recoveryAbortError();
        }
        if (isQuotaError(cause)) {
          this.degradeToMemory(session, cause);
          await this.releaseExactDurableLease(factory, lease);
          if (options.signal?.aborted) {
            await this.release(session);
            throw recoveryAbortError();
          }
          return session;
        }
        await this.releaseExactDurableLease(factory, lease);
        session.released = true;
        throw cause;
      }
    } catch (cause) {
      // A transient/open IndexedDB failure is ambiguous: another tab may still hold durable
      // authority. Only an explicit quota boundary may opt into the documented same-tab mode.
      if (durableLeaseAcquired || isAbortError(cause) || !isQuotaError(cause)) throw cause;
      const session = this.memoryAcquire(
        verifiedPlan,
        sourceRevision,
        "브라우저 저장 용량이 부족해 현재 탭 메모리로 복구 범위를 낮췄습니다.",
      );
      throwIfAborted(options.signal);
      this.startHeartbeat(session);
      return session;
    }
  }

  private memoryRecord(session: StudioBg3dShotBatchRecoverySession): MemoryRecord {
    const record = memoryRecords.get(session.plan.resumeKey);
    if (!record || !record.lease) {
      throw new StudioBg3dShotBatchRecoveryError("lease-lost", "메모리 컷 배치 lease가 없습니다.");
    }
    if (record.lease.ownerId !== session.ownerId ||
      record.lease.leaseToken !== session.leaseToken || record.lease.fence !== session.fence) {
      throw new StudioBg3dShotBatchRecoveryError(
        "lease-lost",
        "같은 탭의 다른 편집기가 메모리 컷 배치를 이어받았습니다.",
      );
    }
    if (record.job.revision !== session.revision) {
      throw new StudioBg3dShotBatchRecoveryError(
        "cas-conflict",
        "메모리 컷 배치 복구 상태가 변경되었습니다.",
      );
    }
    const now = this.now();
    record.lease = {
      ...record.lease,
      heartbeatAt: now,
      expiresAt: now + STUDIO_BG3D_SHOT_BATCH_RECOVERY_LEASE_MS,
    };
    return record;
  }

  private async durableMutate(
    session: StudioBg3dShotBatchRecoverySession,
    mutate: (input: {
      readonly job: JobRecord;
      readonly usage: UsageRecord;
      readonly now: number;
    }) => {
      readonly job: JobRecord;
      readonly usage?: UsageRecord;
      readonly artifactToAdd?: ArtifactRecord;
    },
    signal?: AbortSignal,
    assertAuthorizationReceipt?: () => void,
  ): Promise<JobRecord> {
    throwIfAborted(signal);
    const factory = this.factory();
    if (!factory) {
      throw new StudioBg3dShotBatchRecoveryError("storage-unavailable", "IndexedDB가 사라졌습니다.");
    }
    return withDatabase(factory, async (database) => {
      const transaction = readwriteTransaction(database);
      const done = transactionDone(transaction);
      const onSignalAbort = () => abortTransaction(transaction);
      signal?.addEventListener("abort", onSignalAbort, { once: true });
      try {
        const jobs = transaction.objectStore(JOBS_STORE);
        const artifacts = transaction.objectStore(ARTIFACTS_STORE);
        const leases = transaction.objectStore(LEASES_STORE);
        const meta = transaction.objectStore(META_STORE);
        const [rawJob, rawLease, rawUsage] = await Promise.all([
          requestResult<unknown>(jobs.get(session.plan.resumeKey)),
          requestResult<unknown>(leases.get(session.plan.resumeKey)),
          requestResult<unknown>(meta.get(META_KEY)),
        ]);
        throwIfAborted(signal);
        if (!isJobRecord(rawJob, session.plan) || !isLeaseRecord(rawLease, session.plan.resumeKey) ||
          !isUsageRecord(rawUsage)) {
          throw new StudioBg3dShotBatchRecoveryError("corrupt", "컷 배치 복구 저장소가 손상되었습니다.");
        }
        const now = this.now();
        assertLeaseAndRevision(session, rawJob, rawLease, now);
        assertAuthorizationReceipt?.();
        const result = mutate({ job: rawJob, usage: rawUsage, now });
        if (result.artifactToAdd) {
          // Keep the transaction alive with the Blob add, then timestamp the renewed lease near
          // commit instead of before a potentially long browser storage write.
          await requestResult(artifacts.add(result.artifactToAdd));
          throwIfAborted(signal);
          assertAuthorizationReceipt?.();
        }
        const leaseNow = this.now();
        const refreshedLease: LeaseRecord = {
          ...rawLease,
          heartbeatAt: leaseNow,
          expiresAt: leaseNow + STUDIO_BG3D_SHOT_BATCH_RECOVERY_LEASE_MS,
        };
        assertAuthorizationReceipt?.();
        await Promise.all([
          requestResult(jobs.put(result.job)),
          requestResult(leases.put(refreshedLease)),
          ...(result.usage ? [requestResult(meta.put(result.usage))] : []),
        ]);
        throwIfAborted(signal);
        await done;
        return result.job;
      } catch (cause) {
        abortTransaction(transaction);
        await done.catch(() => undefined);
        if (cause instanceof StudioBg3dShotBatchRecoveryError || isAbortError(cause)) throw cause;
        throw new StudioBg3dShotBatchRecoveryError(
          "storage-unavailable",
          "컷 배치 복구 트랜잭션에 실패했습니다.",
          { cause },
        );
      } finally {
        signal?.removeEventListener("abort", onSignalAbort);
      }
    });
  }

  private applyJob(session: StudioBg3dShotBatchRecoverySession, job: JobRecord): void {
    session.queue = job.queue;
    session.revision = job.revision;
    session.activeRun = job.activeRun;
    session.totalArtifactBytes = job.totalArtifactBytes;
    session.artifactCount = job.artifactCount;
    session.jobStorageBytes = job.jobStorageBytes;
    session.artifactStorageBytes = job.artifactStorageBytes;
  }

  private degradeToMemory(
    session: StudioBg3dShotBatchRecoverySession,
    cause: unknown,
    pendingArtifactBytes = 0,
    pendingArtifactStorageBytes = 0,
  ): void {
    const now = this.now();
    purgeExpiredMemoryRecords(now);
    const existing = memoryRecords.get(session.plan.resumeKey);
    if (existing?.lease && existing.lease.expiresAt > now &&
      (existing.lease.ownerId !== session.ownerId ||
        existing.lease.leaseToken !== session.leaseToken)) {
      throw new StudioBg3dShotBatchRecoveryError(
        "busy",
        "같은 탭의 다른 편집기가 메모리 컷 배치를 실행 중입니다.",
      );
    }
    const records = new Map<string, ArtifactRecord>();
    for (const shot of session.plan.shots) {
      const verified = session.shotArtifacts.get(shot.shotId);
      if (!verified) continue;
      const existingKey = artifactKey(session.plan.resumeKey, shot.shotId);
      records.set(existingKey, withArtifactStorageBytes({
        kind: "toonspectrum-bg3d-shot-batch-shot-artifacts",
        version: 1,
        artifactKey: existingKey,
        recoveryKey: session.plan.resumeKey,
        shotId: shot.shotId,
        artifacts: verified,
        createdAt: now,
      }));
    }
    const artifactStorageBytes = [...records.values()].reduce(
      (total, record) => total + record.storageBytes,
      0,
    );
    if (session.totalArtifactBytes + pendingArtifactBytes > STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES ||
      memoryJobCountExcluding(session.plan.resumeKey) + 1 >
        STUDIO_BG3D_SHOT_BATCH_RECOVERY_MAX_JOBS ||
      memoryStorageBytesExcluding(session.plan.resumeKey) + session.totalArtifactBytes +
        pendingArtifactBytes + session.jobStorageBytes + artifactStorageBytes +
        pendingArtifactStorageBytes > STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES) {
      throw new StudioBg3dShotBatchRecoveryError(
        "budget-exceeded",
        "현재 탭의 컷 배치 복구 메모리가 origin 예산을 벗어났습니다.",
      );
    }
    this.stopHeartbeat(session.plan.resumeKey);
    const lease: LeaseRecord = {
      kind: "toonspectrum-bg3d-shot-batch-lease",
      version: 1,
      recoveryKey: session.plan.resumeKey,
      ownerId: session.ownerId,
      leaseToken: randomId("bg3d-batch-memory-lease"),
      fence: session.fence,
      acquiredAt: now,
      heartbeatAt: now,
      expiresAt: now + STUDIO_BG3D_SHOT_BATCH_RECOVERY_LEASE_MS,
    };
    const job: JobRecord = {
      kind: "toonspectrum-bg3d-shot-batch-job",
      version: 1,
      recoveryKey: session.plan.resumeKey,
      plan: session.plan,
      sourceRevision: session.sourceRevision,
      queue: session.queue,
      revision: session.revision,
      activeRun: session.activeRun,
      artifactKeys: [...records.keys()],
      totalArtifactBytes: session.totalArtifactBytes,
      artifactCount: session.artifactCount,
      jobStorageBytes: session.jobStorageBytes,
      artifactStorageBytes,
      createdAt: now,
      updatedAt: now,
      expiresAt: recoveryExpiry(session.queue, now),
      downloadRequestedAt: null,
    };
    memoryRecords.set(session.plan.resumeKey, { job, lease, artifacts: records });
    session.mode = "memory";
    session.persistence = "unknown";
    session.degradedReason = isQuotaError(cause)
      ? "브라우저 저장 용량이 부족해 현재 탭 메모리로 복구 범위를 낮췄습니다."
      : "IndexedDB 오류로 현재 탭 메모리에서만 복구합니다.";
    session.fence = lease.fence;
    session.leaseToken = lease.leaseToken;
    session.artifactStorageBytes = artifactStorageBytes;
    this.startHeartbeat(session);
  }

  private async mutateWithDegradation(
    session: StudioBg3dShotBatchRecoverySession,
    durable: () => Promise<JobRecord>,
    memory: () => JobRecord | Promise<JobRecord>,
    pendingArtifactBytes = 0,
    pendingArtifactStorageBytes = 0,
  ): Promise<JobRecord> {
    if (session.released) {
      throw new StudioBg3dShotBatchRecoveryError("lease-lost", "이미 해제된 컷 배치 session입니다.");
    }
    if (session.mode === "memory") return await memory();
    try {
      return await durable();
    } catch (cause) {
      let terminalCause = cause;
      if (isQuotaError(cause)) {
        const factory = this.factory();
        if (factory) {
          try {
            await this.collectExpiredDurable(factory, session.plan.resumeKey);
            return await durable();
          } catch (retryCause) {
            terminalCause = retryCause;
          }
        }
      }
      const durableLeaseIdentity: LeaseRecord = {
        kind: "toonspectrum-bg3d-shot-batch-lease",
        version: 1,
        recoveryKey: session.plan.resumeKey,
        ownerId: session.ownerId,
        leaseToken: session.leaseToken,
        fence: session.fence,
        acquiredAt: 0,
        heartbeatAt: 0,
        expiresAt: 0,
      };
      const factory = this.factory();
      if (!isQuotaError(terminalCause)) {
        if (terminalCause instanceof StudioBg3dShotBatchRecoveryError &&
          terminalCause.code === "storage-unavailable") {
          this.stopHeartbeat(session.plan.resumeKey);
          session.released = true;
          if (factory) await this.releaseExactDurableLease(factory, durableLeaseIdentity);
        }
        throw terminalCause;
      }
      this.degradeToMemory(
        session,
        terminalCause,
        pendingArtifactBytes,
        pendingArtifactStorageBytes,
      );
      if (factory) await this.releaseExactDurableLease(factory, durableLeaseIdentity);
      return await memory();
    }
  }

  async startShot(
    session: StudioBg3dShotBatchRecoverySession,
    shotId: string,
  ): Promise<StudioBg3dShotBatchRunToken> {
    const runId = randomId("bg3d-batch-run");
    const nextQueue = startStudioBg3dShotBatchQueueItem(session.queue, shotId);
    if (!nextQueue) throw new StudioBg3dShotBatchRecoveryError("cas-conflict", "컷 시작 전이가 올바르지 않습니다.");
    const activeRun: ActiveRun = { shotId, runId, fence: session.fence };
    const nextJob = await this.mutateWithDegradation(
      session,
      () => this.durableMutate(session, ({ job, now }) => ({
        job: copyJob(job, {
          queue: nextQueue,
          activeRun,
          revision: job.revision + 1,
          updatedAt: now,
          expiresAt: recoveryExpiry(nextQueue, now),
          downloadRequestedAt: null,
        }),
      })),
      () => {
        const record = this.memoryRecord(session);
        record.job = copyJob(record.job, {
          queue: nextQueue,
          activeRun: { ...activeRun, fence: session.fence },
          revision: record.job.revision + 1,
          updatedAt: this.now(),
          expiresAt: recoveryExpiry(nextQueue, this.now()),
          downloadRequestedAt: null,
        });
        return record.job;
      },
    );
    this.applyJob(session, nextJob);
    const actual = session.activeRun!;
    return { shotId, runId, fence: actual.fence, revision: session.revision };
  }

  private assertRun(
    session: StudioBg3dShotBatchRecoverySession,
    token: StudioBg3dShotBatchRunToken,
  ): void {
    if (!session.activeRun || session.activeRun.shotId !== token.shotId ||
      session.activeRun.runId !== token.runId || session.activeRun.fence !== token.fence ||
      session.revision !== token.revision) {
      throw new StudioBg3dShotBatchRecoveryError("cas-conflict", "오래된 컷 실행 결과를 커밋할 수 없습니다.");
    }
  }

  async completeShot(
    session: StudioBg3dShotBatchRecoverySession,
    token: StudioBg3dShotBatchRunToken,
    artifactsInput: StudioBg3dShotBatchShotArtifacts,
    options: StudioBg3dShotBatchRecoveryCommitOptions = {},
  ): Promise<void> {
    throwIfAborted(options.signal);
    this.assertRun(session, token);
    const verified = await awaitWithAbort(
      verifyStudioBg3dShotBatchShotArtifacts(
        session.plan,
        token.shotId,
        artifactsInput,
        options.signal,
      ),
      options.signal,
    );
    throwIfAborted(options.signal);
    this.assertRun(session, token);
    const usedAuthorizationReceipts = new WeakSet<object>();
    const obtainCommitAuthorization = async (): Promise<(() => void) | undefined> => {
      throwIfAborted(options.signal);
      this.assertRun(session, token);
      if (!options.authorizeBeforeCommit) return undefined;
      const receipt = await awaitWithAbort(
        Promise.resolve(options.authorizeBeforeCommit(options.signal)),
        options.signal,
      );
      if (!receipt || typeof receipt !== "object" ||
        typeof receipt.isLocallyCurrent !== "function") {
        throw new StudioBg3dShotBatchRecoveryError(
          "access-denied",
          "현재 작품 접근 권한으로 컷 artifact를 커밋할 수 없습니다.",
        );
      }
      if (usedAuthorizationReceipts.has(receipt)) {
        throw new StudioBg3dShotBatchRecoveryError(
          "access-denied",
          "컷 artifact 커밋 권한 영수증을 다시 사용할 수 없습니다.",
        );
      }
      usedAuthorizationReceipts.add(receipt);
      throwIfAborted(options.signal);
      this.assertRun(session, token);
      const assertCurrent = () => assertAuthorizationReceipt(receipt, this.now());
      assertCurrent();
      return assertCurrent;
    };
    const nextQueue = succeedStudioBg3dShotBatchQueueItem(session.queue, token.shotId);
    if (!nextQueue) throw new StudioBg3dShotBatchRecoveryError("cas-conflict", "컷 완료 전이가 올바르지 않습니다.");
    const key = artifactKey(session.plan.resumeKey, token.shotId);
    const createdAt = this.now();
    const record = withArtifactStorageBytes({
      kind: "toonspectrum-bg3d-shot-batch-shot-artifacts",
      version: 1,
      artifactKey: key,
      recoveryKey: session.plan.resumeKey,
      shotId: token.shotId,
      artifacts: verified,
      createdAt,
    });
    const nextJob = await this.mutateWithDegradation(
      session,
      async () => {
        await this.assertStorageEstimateCapacity(verified.totalBytes + record.storageBytes);
        const assertCurrentAuthorization = await obtainCommitAuthorization();
        return this.durableMutate(session, ({ job, usage, now }) => {
          if (!job.activeRun || job.activeRun.runId !== token.runId ||
            job.activeRun.fence !== token.fence || job.activeRun.shotId !== token.shotId) {
            throw new StudioBg3dShotBatchRecoveryError("cas-conflict", "컷 실행 fence가 변경되었습니다.");
          }
          if (job.artifactKeys.includes(key)) {
            throw new StudioBg3dShotBatchRecoveryError("corrupt", "같은 컷 artifact가 이미 저장되어 있습니다.");
          }
          const totalArtifactBytes = job.totalArtifactBytes + verified.totalBytes;
          const artifactCount = job.artifactCount + verified.artifactCount;
          const artifactStorageBytes = job.artifactStorageBytes + record.storageBytes;
          const originBytes = usage.artifactBytes + verified.totalBytes;
          const originStructuredBytes = usage.structuredBytes + record.storageBytes;
          if (totalArtifactBytes > STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES) {
            throw new StudioBg3dShotBatchRecoveryError(
              "budget-exceeded",
              "현재 컷 배치 artifact가 Job 저장 예산을 벗어났습니다.",
            );
          }
          if (originBytes + originStructuredBytes >
            STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES) {
            // Origin pressure can be relieved by collecting another expired Job, unlike the
            // immutable per-Job limit above. Route it through the bounded GC + one-retry path.
            throw new DOMException(
              "Studio 3D recovery origin ledger is full.",
              "QuotaExceededError",
            );
          }
          return {
            artifactToAdd: record,
            job: copyJob(job, {
              queue: nextQueue,
              activeRun: null,
              artifactKeys: [...job.artifactKeys, key],
              totalArtifactBytes,
              artifactCount,
              artifactStorageBytes,
              revision: job.revision + 1,
              updatedAt: now,
              expiresAt: recoveryExpiry(nextQueue, now),
            }),
            usage: {
              ...usage,
              revision: usage.revision + 1,
              artifactBytes: originBytes,
              artifactCount: usage.artifactCount + verified.artifactCount,
              structuredBytes: originStructuredBytes,
              updatedAt: now,
            },
          };
        }, options.signal, assertCurrentAuthorization);
      },
      async () => {
        const assertCurrentAuthorization = await obtainCommitAuthorization();
        assertCurrentAuthorization?.();
        const memory = this.memoryRecord(session);
        if (memory.job.artifactKeys.includes(key)) {
          throw new StudioBg3dShotBatchRecoveryError("corrupt", "같은 컷 artifact가 이미 저장되어 있습니다.");
        }
        const totalArtifactBytes = memory.job.totalArtifactBytes + verified.totalBytes;
        const artifactStorageBytes = memory.job.artifactStorageBytes + record.storageBytes;
        if (totalArtifactBytes > STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES ||
          memoryStorageBytesExcluding(session.plan.resumeKey) + totalArtifactBytes +
            memory.job.jobStorageBytes + artifactStorageBytes >
            STUDIO_BG3D_SHOT_BATCH_RECOVERY_ORIGIN_MAX_BYTES) {
          throw new StudioBg3dShotBatchRecoveryError("budget-exceeded", "컷 배치 메모리 예산을 벗어났습니다.");
        }
        memory.artifacts.set(key, record);
        memory.job = copyJob(memory.job, {
          queue: nextQueue,
          activeRun: null,
          artifactKeys: [...memory.job.artifactKeys, key],
          totalArtifactBytes,
          artifactCount: memory.job.artifactCount + verified.artifactCount,
          artifactStorageBytes,
          revision: memory.job.revision + 1,
          updatedAt: this.now(),
          expiresAt: recoveryExpiry(nextQueue, this.now()),
        });
        return memory.job;
      },
      verified.totalBytes,
      record.storageBytes,
    );
    this.applyJob(session, nextJob);
    session.images.push(...verified.images);
    session.skippedArtifacts.push(...verified.skippedArtifacts);
    session.layeredPsds.push(...verified.layeredPsds);
    session.psdFallbacks.push(...verified.psdFallbacks);
    session.shotArtifacts.set(token.shotId, verified);
  }

  async failShot(
    session: StudioBg3dShotBatchRecoverySession,
    token: StudioBg3dShotBatchRunToken,
    failureCode: StudioBg3dShotBatchFailureCode,
  ): Promise<void> {
    this.assertRun(session, token);
    const nextQueue = failStudioBg3dShotBatchQueueItem(session.queue, token.shotId, failureCode);
    if (!nextQueue) throw new StudioBg3dShotBatchRecoveryError("cas-conflict", "컷 실패 전이가 올바르지 않습니다.");
    const nextJob = await this.mutateWithDegradation(
      session,
      () => this.durableMutate(session, ({ job, now }) => ({
        job: copyJob(job, {
          queue: nextQueue,
          activeRun: null,
          revision: job.revision + 1,
          updatedAt: now,
          expiresAt: recoveryExpiry(nextQueue, now),
        }),
      })),
      () => {
        const memory = this.memoryRecord(session);
        memory.job = copyJob(memory.job, {
          queue: nextQueue,
          activeRun: null,
          revision: memory.job.revision + 1,
          updatedAt: this.now(),
          expiresAt: recoveryExpiry(nextQueue, this.now()),
        });
        return memory.job;
      },
    );
    this.applyJob(session, nextJob);
  }

  async resetInterrupted(session: StudioBg3dShotBatchRecoverySession): Promise<void> {
    if (!session.activeRun && !session.queue.items.some(({ status }) => status === "running")) return;
    const nextQueue = retryStudioBg3dShotBatchQueue(session.queue);
    const nextJob = await this.mutateWithDegradation(
      session,
      () => this.durableMutate(session, ({ job, now }) => ({
        job: copyJob(job, {
          queue: nextQueue,
          activeRun: null,
          revision: job.revision + 1,
          updatedAt: now,
          expiresAt: recoveryExpiry(nextQueue, now),
        }),
      })),
      () => {
        const memory = this.memoryRecord(session);
        memory.job = copyJob(memory.job, {
          queue: nextQueue,
          activeRun: null,
          revision: memory.job.revision + 1,
          updatedAt: this.now(),
          expiresAt: recoveryExpiry(nextQueue, this.now()),
        });
        return memory.job;
      },
    );
    this.applyJob(session, nextJob);
  }

  async markDownloadRequested(session: StudioBg3dShotBatchRecoverySession): Promise<void> {
    if (!queueIsComplete(session.queue) || session.activeRun !== null) {
      throw new StudioBg3dShotBatchRecoveryError(
        "cas-conflict",
        "모든 컷 artifact가 완료되기 전에는 다운로드 보존 상태로 전환할 수 없습니다.",
      );
    }
    const nextJob = await this.mutateWithDegradation(
      session,
      () => this.durableMutate(session, ({ job, now }) => ({
        job: copyJob(job, {
          revision: job.revision + 1,
          updatedAt: now,
          expiresAt: now + STUDIO_BG3D_SHOT_BATCH_RECOVERY_DOWNLOAD_TTL_MS,
          downloadRequestedAt: now,
        }),
      })),
      () => {
        const memory = this.memoryRecord(session);
        const now = this.now();
        memory.job = copyJob(memory.job, {
          revision: memory.job.revision + 1,
          updatedAt: now,
          expiresAt: now + STUDIO_BG3D_SHOT_BATCH_RECOVERY_DOWNLOAD_TTL_MS,
          downloadRequestedAt: now,
        });
        return memory.job;
      },
    );
    this.applyJob(session, nextJob);
  }

  private async renewLease(session: StudioBg3dShotBatchRecoverySession): Promise<void> {
    if (session.released) return;
    if (session.mode === "memory") {
      this.memoryRecord(session);
      return;
    }
    const factory = this.factory();
    if (!factory) return;
    await withDatabase(factory, async (database) => {
      const transaction = readwriteTransaction(database);
      const done = transactionDone(transaction);
      const store = transaction.objectStore(LEASES_STORE);
      try {
        const raw = await requestResult<unknown>(store.get(session.plan.resumeKey));
        if (!isLeaseRecord(raw, session.plan.resumeKey) || raw.ownerId !== session.ownerId ||
          raw.leaseToken !== session.leaseToken || raw.fence !== session.fence) {
          throw new StudioBg3dShotBatchRecoveryError("lease-lost", "컷 배치 lease를 갱신할 수 없습니다.");
        }
        const now = this.now();
        await requestResult(store.put({
          ...raw,
          heartbeatAt: now,
          expiresAt: now + STUDIO_BG3D_SHOT_BATCH_RECOVERY_LEASE_MS,
        }));
        await done;
      } catch (cause) {
        abortTransaction(transaction);
        await done.catch(() => undefined);
        if (cause instanceof StudioBg3dShotBatchRecoveryError) throw cause;
        throw new StudioBg3dShotBatchRecoveryError(
          "storage-unavailable",
          "컷 배치 lease를 갱신하지 못했습니다.",
          { cause },
        );
      }
    });
  }

  async release(session: StudioBg3dShotBatchRecoverySession): Promise<void> {
    if (session.released) return;
    this.stopHeartbeat(session.plan.resumeKey);
    session.released = true;
    if (session.mode === "memory") {
      const record = memoryRecords.get(session.plan.resumeKey);
      if (record?.lease?.ownerId === session.ownerId &&
        record.lease.leaseToken === session.leaseToken && record.lease.fence === session.fence) {
        record.lease = null;
      }
      return;
    }
    const factory = this.factory();
    if (!factory) return;
    try {
      await withDatabase(factory, async (database) => {
        const transaction = readwriteTransaction(database);
        const done = transactionDone(transaction);
        const leases = transaction.objectStore(LEASES_STORE);
        const raw = await requestResult<unknown>(leases.get(session.plan.resumeKey));
        if (isLeaseRecord(raw, session.plan.resumeKey) && raw.ownerId === session.ownerId &&
          raw.leaseToken === session.leaseToken && raw.fence === session.fence) {
          await requestResult(leases.delete(session.plan.resumeKey));
        }
        await done;
      });
    } catch {
      // Release is best effort; expiry + fencing still prevents a stale owner from committing.
    }
  }

  async discard(session: StudioBg3dShotBatchRecoverySession): Promise<void> {
    if (session.released) return;
    this.stopHeartbeat(session.plan.resumeKey);
    if (session.mode === "memory") {
      this.memoryRecord(session);
      memoryRecords.delete(session.plan.resumeKey);
      session.released = true;
      return;
    }
    const factory = this.factory();
    if (!factory) throw new StudioBg3dShotBatchRecoveryError(
      "storage-unavailable",
      "IndexedDB가 없어 durable 컷 배치 복구 데이터를 삭제할 수 없습니다.",
    );
    await withDatabase(factory, async (database) => {
      const transaction = readwriteTransaction(database);
      const done = transactionDone(transaction);
      try {
        const jobs = transaction.objectStore(JOBS_STORE);
        const artifacts = transaction.objectStore(ARTIFACTS_STORE);
        const leases = transaction.objectStore(LEASES_STORE);
        const meta = transaction.objectStore(META_STORE);
        const [rawJob, rawLease, rawUsage] = await Promise.all([
          requestResult<unknown>(jobs.get(session.plan.resumeKey)),
          requestResult<unknown>(leases.get(session.plan.resumeKey)),
          requestResult<unknown>(meta.get(META_KEY)),
        ]);
        if (!isJobRecord(rawJob, session.plan) || !isLeaseRecord(rawLease, session.plan.resumeKey) ||
          !isUsageRecord(rawUsage)) {
          throw new StudioBg3dShotBatchRecoveryError("corrupt", "삭제할 컷 배치 복구 Job이 손상되었습니다.");
        }
        assertLeaseAndRevision(session, rawJob, rawLease, this.now());
        const structuredBytes = rawJob.jobStorageBytes + rawJob.artifactStorageBytes;
        if (rawUsage.artifactBytes < rawJob.totalArtifactBytes ||
          rawUsage.artifactCount < rawJob.artifactCount ||
          rawUsage.structuredBytes < structuredBytes || rawUsage.jobCount < 1) {
          throw new StudioBg3dShotBatchRecoveryError(
            "corrupt",
            "컷 배치 복구 사용량 원장이 삭제 대상보다 작습니다.",
          );
        }
        await Promise.all([
          ...rawJob.artifactKeys.map((key) => requestResult(artifacts.delete(key))),
          requestResult(jobs.delete(session.plan.resumeKey)),
          requestResult(leases.delete(session.plan.resumeKey)),
          requestResult(meta.put({
            ...rawUsage,
            revision: rawUsage.revision + 1,
            artifactBytes: rawUsage.artifactBytes - rawJob.totalArtifactBytes,
            artifactCount: rawUsage.artifactCount - rawJob.artifactCount,
            structuredBytes: rawUsage.structuredBytes - structuredBytes,
            jobCount: rawUsage.jobCount - 1,
            updatedAt: this.now(),
          })),
        ]);
        await done;
        session.released = true;
        const memory = memoryRecords.get(session.plan.resumeKey);
        if (!memory?.lease || memory.lease.expiresAt <= this.now()) {
          memoryRecords.delete(session.plan.resumeKey);
        }
      } catch (cause) {
        abortTransaction(transaction);
        await done.catch(() => undefined);
        throw cause;
      }
    });
  }
}

export function createStudioBg3dShotBatchRecoveryStore(
  options: StudioBg3dShotBatchRecoveryStoreOptions = {},
): StudioBg3dShotBatchRecoveryStore {
  return new StudioBg3dShotBatchRecoveryStore(options);
}
