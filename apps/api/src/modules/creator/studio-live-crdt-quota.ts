const STUDIO_CRDT_SYNC_LIMIT = 30;
const STUDIO_CRDT_SYNC_WINDOW_MS = 60_000;
const STUDIO_CRDT_OPERATION_BURST = 120;
const STUDIO_CRDT_OPERATIONS_PER_SECOND = 40;
const STUDIO_CRDT_BYTE_BURST = 2 * 1_024 * 1_024;
const STUDIO_CRDT_BYTES_PER_SECOND = 1 * 1_024 * 1_024;
const STUDIO_CRDT_QUOTA_BUCKET_LIMIT = 4_096;
const STUDIO_CRDT_QUOTA_CLEANUP_INTERVAL_MS = 30_000;
const STUDIO_CRDT_QUOTA_IDLE_TTL_MS = 10 * 60_000;

export interface StudioLiveCrdtQuotaScope {
  readonly userId: string;
  readonly workId: string;
}

export interface StudioLiveCrdtQuotaLimiterOptions {
  readonly now?: () => number;
  readonly syncLimit?: number;
  readonly syncWindowMs?: number;
  readonly operationBurst?: number;
  readonly operationsPerSecond?: number;
  readonly byteBurst?: number;
  readonly bytesPerSecond?: number;
  readonly bucketLimit?: number;
  readonly cleanupIntervalMs?: number;
  readonly idleTtlMs?: number;
}

interface StudioLiveCrdtSyncBucket {
  count: number;
  resetsAt: number;
  updatedAt: number;
}

interface StudioLiveCrdtTokenBucket {
  operationTokens: number;
  byteTokens: number;
  updatedAt: number;
}

/**
 * Keeps the in-process CRDT admission budget independent from Socket.IO connection identity.
 * A user therefore shares one budget for a work across tabs, parallel sockets, and reconnects.
 */
export class StudioLiveCrdtQuotaLimiter {
  private readonly now: () => number;
  private readonly syncLimit: number;
  private readonly syncWindowMs: number;
  private readonly operationBurst: number;
  private readonly operationsPerSecond: number;
  private readonly byteBurst: number;
  private readonly bytesPerSecond: number;
  private readonly bucketLimit: number;
  private readonly cleanupIntervalMs: number;
  private readonly idleTtlMs: number;
  private readonly syncBuckets = new Map<string, StudioLiveCrdtSyncBucket>();
  private readonly tokenBuckets = new Map<string, StudioLiveCrdtTokenBucket>();
  private lastCleanupAt: number | null = null;

  constructor(options: StudioLiveCrdtQuotaLimiterOptions = {}) {
    this.now = options.now ?? Date.now;
    this.syncLimit = options.syncLimit ?? STUDIO_CRDT_SYNC_LIMIT;
    this.syncWindowMs = options.syncWindowMs ?? STUDIO_CRDT_SYNC_WINDOW_MS;
    this.operationBurst = options.operationBurst ?? STUDIO_CRDT_OPERATION_BURST;
    this.operationsPerSecond =
      options.operationsPerSecond ?? STUDIO_CRDT_OPERATIONS_PER_SECOND;
    this.byteBurst = options.byteBurst ?? STUDIO_CRDT_BYTE_BURST;
    this.bytesPerSecond = options.bytesPerSecond ?? STUDIO_CRDT_BYTES_PER_SECOND;
    this.bucketLimit = options.bucketLimit ?? STUDIO_CRDT_QUOTA_BUCKET_LIMIT;
    this.cleanupIntervalMs =
      options.cleanupIntervalMs ?? STUDIO_CRDT_QUOTA_CLEANUP_INTERVAL_MS;
    this.idleTtlMs = options.idleTtlMs ?? STUDIO_CRDT_QUOTA_IDLE_TTL_MS;
  }

  consumeSync(scope: StudioLiveCrdtQuotaScope): boolean {
    const now = this.now();
    const key = quotaKey(scope);
    this.cleanup(now);
    if (!this.hasCapacity(this.syncBuckets, key)) return false;

    const bucket = this.syncBuckets.get(key);
    if (!bucket || bucket.resetsAt <= now) {
      this.syncBuckets.set(key, {
        count: 1,
        resetsAt: now + this.syncWindowMs,
        updatedAt: now,
      });
      return true;
    }
    bucket.updatedAt = now;
    if (bucket.count >= this.syncLimit) return false;
    bucket.count += 1;
    return true;
  }

  consumeUpdate(scope: StudioLiveCrdtQuotaScope, decodedBytes: number): boolean {
    if (!Number.isFinite(decodedBytes) || decodedBytes < 0) return false;

    const now = this.now();
    const key = quotaKey(scope);
    this.cleanup(now);
    if (!this.hasCapacity(this.tokenBuckets, key)) return false;

    const existing = this.tokenBuckets.get(key);
    const elapsedSeconds = existing
      ? Math.max(0, now - existing.updatedAt) / 1_000
      : 0;
    const operationTokens = existing
      ? Math.min(
          this.operationBurst,
          existing.operationTokens + elapsedSeconds * this.operationsPerSecond
        )
      : this.operationBurst;
    const byteTokens = existing
      ? Math.min(
          this.byteBurst,
          existing.byteTokens + elapsedSeconds * this.bytesPerSecond
        )
      : this.byteBurst;
    const accepted = operationTokens >= 1 && byteTokens >= decodedBytes;

    this.tokenBuckets.set(key, {
      operationTokens: accepted ? operationTokens - 1 : operationTokens,
      byteTokens: accepted ? byteTokens - decodedBytes : byteTokens,
      updatedAt: now,
    });
    return accepted;
  }

  clear(): void {
    this.syncBuckets.clear();
    this.tokenBuckets.clear();
    this.lastCleanupAt = null;
  }

  private cleanup(now: number): void {
    if (
      this.lastCleanupAt !== null &&
      now >= this.lastCleanupAt &&
      now - this.lastCleanupAt < this.cleanupIntervalMs
    ) {
      return;
    }
    this.lastCleanupAt = now;
    for (const [key, bucket] of this.syncBuckets) {
      if (bucket.resetsAt <= now) this.syncBuckets.delete(key);
    }
    for (const [key, bucket] of this.tokenBuckets) {
      if (now - bucket.updatedAt >= this.idleTtlMs) {
        this.tokenBuckets.delete(key);
      }
    }
  }

  private hasCapacity<T>(buckets: Map<string, T>, incomingKey: string): boolean {
    // Fail closed instead of evicting a live scope: eviction would let a reconnecting client
    // regain a fresh budget by churning enough authenticated user/work pairs.
    return buckets.has(incomingKey) || buckets.size < this.bucketLimit;
  }
}

function quotaKey(scope: StudioLiveCrdtQuotaScope): string {
  // A serialized tuple cannot collide when either identifier contains a delimiter.
  return JSON.stringify([scope.userId, scope.workId]);
}
