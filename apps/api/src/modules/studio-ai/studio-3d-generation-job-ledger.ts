import { createHash } from "node:crypto";

export const STUDIO_3D_GENERATION_JOB_VERSION = 1 as const;

export type Studio3dGenerationJobState =
  | "queued"
  | "uploading"
  | "generating-geometry"
  | "generating-texture"
  | "downloading"
  | "validating"
  | "importing"
  | "ready"
  | "failed"
  | "cancelled"
  | "expired";

export type Studio3dGenerationMode =
  | "text-to-3d"
  | "image-to-3d"
  | "multiview-to-3d"
  | "texture-only";

export interface Studio3dGenerationJobRequestSummary {
  readonly mode: Studio3dGenerationMode;
  readonly promptHash?: string;
  readonly inputContentHashes: readonly string[];
  readonly sourceAssetRevisionId?: string;
  readonly provider: string;
  readonly model: string;
  readonly tier: string;
  readonly meshMode?: string;
  readonly targetFaceCount?: number;
  readonly material?: string;
  readonly textureMode?: string;
  readonly textureResolution?: number;
  readonly seed?: number;
  readonly symmetry?: boolean;
  readonly pose?: string;
  readonly transport: "server" | "byok";
}

export interface Studio3dGenerationArtifactRevision {
  readonly id: string;
  readonly modelId: string;
  readonly contentHashSha256: string;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly objectKey: string;
  readonly validationVersion: string;
  readonly createdAtMs: number;
  readonly sourceJobId: string;
}

export interface Studio3dGenerationJobRecord {
  readonly version: typeof STUDIO_3D_GENERATION_JOB_VERSION;
  readonly id: string;
  readonly userId: string;
  readonly idempotencyKeyHash: string;
  readonly requestHash: string;
  readonly request: Studio3dGenerationJobRequestSummary;
  readonly state: Studio3dGenerationJobState;
  readonly generation: number;
  readonly providerSubscriptionKeyHash?: string;
  readonly providerTaskId?: string;
  readonly providerRequestIdHash?: string;
  readonly estimatedCredits: number;
  readonly actualCredits?: number;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly deadlineAtMs: number;
  readonly cancellationRequestedAtMs?: number;
  readonly terminalReason?: string;
  readonly artifactRevision?: Studio3dGenerationArtifactRevision;
}

export interface Studio3dGenerationQuota {
  readonly maxConcurrentJobs: number;
  readonly dailyCreditBudget: number;
  readonly monthlyCreditBudget: number;
}

export interface Studio3dGenerationUsageSnapshot {
  readonly concurrentJobs: number;
  readonly dailyCredits: number;
  readonly monthlyCredits: number;
}

export interface Studio3dGenerationJobStore {
  withUserLock<T>(userId: string, operation: () => Promise<T>): Promise<T>;
  getById(jobId: string): Promise<Studio3dGenerationJobRecord | undefined>;
  getByIdempotencyHash(userId: string, hash: string): Promise<Studio3dGenerationJobRecord | undefined>;
  put(record: Studio3dGenerationJobRecord): Promise<void>;
  listByUser(userId: string): Promise<readonly Studio3dGenerationJobRecord[]>;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableObject(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("3D job request contains a non-finite number.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== "object") throw new TypeError("3D job request contains an unsupported value.");
  const object = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(object).sort()) {
    if (object[key] !== undefined) output[key] = stableObject(object[key]);
  }
  return output;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableObject(value));
}

function boundedString(value: string, field: string, max = 240): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new TypeError(`${field} is invalid.`);
  return normalized;
}

function boundedCredits(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) {
    throw new RangeError(`${field} is outside the supported range.`);
  }
  return Math.round(value * 1_000) / 1_000;
}

const NON_TERMINAL = new Set<Studio3dGenerationJobState>([
  "queued",
  "uploading",
  "generating-geometry",
  "generating-texture",
  "downloading",
  "validating",
  "importing",
]);

function transitionSet(
  ...states: Studio3dGenerationJobState[]
): ReadonlySet<Studio3dGenerationJobState> {
  return new Set(states);
}

const TRANSITIONS: Readonly<
  Record<Studio3dGenerationJobState, ReadonlySet<Studio3dGenerationJobState>>
> = Object.freeze({
  queued: transitionSet("uploading", "cancelled", "failed", "expired"),
  uploading: transitionSet(
    "generating-geometry",
    "cancelled",
    "failed",
    "expired",
  ),
  "generating-geometry": transitionSet(
    "generating-texture",
    "downloading",
    "cancelled",
    "failed",
    "expired",
  ),
  "generating-texture": transitionSet(
    "downloading",
    "cancelled",
    "failed",
    "expired",
  ),
  downloading: transitionSet("validating", "cancelled", "failed", "expired"),
  validating: transitionSet("importing", "failed", "cancelled", "expired"),
  importing: transitionSet("ready", "failed", "cancelled", "expired"),
  ready: transitionSet(),
  failed: transitionSet(),
  cancelled: transitionSet(),
  expired: transitionSet(),
});

function validateRequest(request: Studio3dGenerationJobRequestSummary): Studio3dGenerationJobRequestSummary {
  if (!request.inputContentHashes.every((hash) => /^[a-f0-9]{16,128}$/u.test(hash))) {
    throw new TypeError("3D generation input hashes are invalid.");
  }
  if (request.mode === "text-to-3d" && !request.promptHash) {
    throw new TypeError("text-to-3D requires a prompt hash.");
  }
  if (request.mode === "image-to-3d" && request.inputContentHashes.length !== 1) {
    throw new TypeError("image-to-3D requires exactly one image hash.");
  }
  if (request.mode === "multiview-to-3d" && (request.inputContentHashes.length < 2 || request.inputContentHashes.length > 5)) {
    throw new TypeError("multiview-to-3D requires two to five image hashes.");
  }
  if (request.mode === "texture-only" && (request.inputContentHashes.length !== 1 || !request.sourceAssetRevisionId)) {
    throw new TypeError("texture-only generation requires one reference image and a source asset revision.");
  }
  if (request.seed !== undefined && (!Number.isSafeInteger(request.seed) || request.seed < 0 || request.seed > 65_535)) {
    throw new RangeError("3D generation seed must be 0-65535.");
  }
  if (request.targetFaceCount !== undefined && (!Number.isSafeInteger(request.targetFaceCount) || request.targetFaceCount < 500 || request.targetFaceCount > 2_000_000)) {
    throw new RangeError("3D generation face count is outside the supported range.");
  }
  return Object.freeze({
    ...request,
    provider: boundedString(request.provider, "provider"),
    model: boundedString(request.model, "model"),
    tier: boundedString(request.tier, "tier"),
    inputContentHashes: Object.freeze([...request.inputContentHashes]),
  });
}

function utcDayKey(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function utcMonthKey(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 7);
}

export class InMemoryStudio3dGenerationJobStore implements Studio3dGenerationJobStore {
  readonly #records = new Map<string, Studio3dGenerationJobRecord>();
  readonly #locks = new Map<string, Promise<void>>();

  async withUserLock<T>(userId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#locks.get(userId) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#locks.set(userId, previous.then(() => current));
    await previous;
    try {
      return await operation();
    } finally {
      release?.();
      if (this.#locks.get(userId) === current) this.#locks.delete(userId);
    }
  }

  async getById(jobId: string): Promise<Studio3dGenerationJobRecord | undefined> {
    return this.#records.get(jobId);
  }

  async getByIdempotencyHash(userId: string, hash: string): Promise<Studio3dGenerationJobRecord | undefined> {
    return [...this.#records.values()].find(
      (record) => record.userId === userId && record.idempotencyKeyHash === hash,
    );
  }

  async put(record: Studio3dGenerationJobRecord): Promise<void> {
    this.#records.set(record.id, record);
  }

  async listByUser(userId: string): Promise<readonly Studio3dGenerationJobRecord[]> {
    return [...this.#records.values()]
      .filter((record) => record.userId === userId)
      .sort((left, right) => right.createdAtMs - left.createdAtMs);
  }
}

export class Studio3dGenerationJobLedger {
  constructor(
    private readonly store: Studio3dGenerationJobStore,
    private readonly quotaForUser: (userId: string) => Promise<Studio3dGenerationQuota>,
    private readonly now: () => number = Date.now,
  ) {}

  async usage(userId: string): Promise<Studio3dGenerationUsageSnapshot> {
    const now = this.now();
    const records = await this.store.listByUser(userId);
    return Object.freeze({
      concurrentJobs: records.filter((record) => NON_TERMINAL.has(record.state)).length,
      dailyCredits: records
        .filter((record) => utcDayKey(record.createdAtMs) === utcDayKey(now))
        .reduce((sum, record) => sum + (record.actualCredits ?? record.estimatedCredits), 0),
      monthlyCredits: records
        .filter((record) => utcMonthKey(record.createdAtMs) === utcMonthKey(now))
        .reduce((sum, record) => sum + (record.actualCredits ?? record.estimatedCredits), 0),
    });
  }

  async create(input: {
    readonly userId: string;
    readonly idempotencyKey: string;
    readonly request: Studio3dGenerationJobRequestSummary;
    readonly estimatedCredits: number;
    readonly deadlineMs?: number;
  }): Promise<{ readonly record: Studio3dGenerationJobRecord; readonly duplicate: boolean }> {
    const userId = boundedString(input.userId, "userId");
    const key = boundedString(input.idempotencyKey, "idempotencyKey", 200);
    const request = validateRequest(input.request);
    const requestHash = sha256(stableJson(request));
    const idempotencyKeyHash = sha256(`${userId}\u0000${key}`);
    const estimatedCredits = boundedCredits(input.estimatedCredits, "estimatedCredits");
    return this.store.withUserLock(userId, async () => {
      const existing = await this.store.getByIdempotencyHash(userId, idempotencyKeyHash);
      if (existing) {
        if (existing.requestHash !== requestHash) throw new Error("idempotency key was reused for a different 3D request.");
        return Object.freeze({ record: existing, duplicate: true });
      }
      const quota = await this.quotaForUser(userId);
      const usage = await this.usage(userId);
      if (usage.concurrentJobs >= quota.maxConcurrentJobs) throw new Error("3D generation concurrency limit reached.");
      if (usage.dailyCredits + estimatedCredits > quota.dailyCreditBudget) throw new Error("daily 3D generation credit budget exceeded.");
      if (usage.monthlyCredits + estimatedCredits > quota.monthlyCreditBudget) throw new Error("monthly 3D generation credit budget exceeded.");
      const now = this.now();
      const id = `3djob_${sha256(`${userId}\u0000${idempotencyKeyHash}\u0000${requestHash}`).slice(0, 24)}`;
      const record: Studio3dGenerationJobRecord = Object.freeze({
        version: STUDIO_3D_GENERATION_JOB_VERSION,
        id,
        userId,
        idempotencyKeyHash,
        requestHash,
        request,
        state: "queued",
        generation: 0,
        estimatedCredits,
        createdAtMs: now,
        updatedAtMs: now,
        deadlineAtMs: now + Math.max(60_000, Math.min(input.deadlineMs ?? 20 * 60_000, 60 * 60_000)),
      });
      await this.store.put(record);
      return Object.freeze({ record, duplicate: false });
    });
  }

  async transition(input: {
    readonly jobId: string;
    readonly expectedGeneration: number;
    readonly state: Studio3dGenerationJobState;
    readonly terminalReason?: string;
  }): Promise<Studio3dGenerationJobRecord> {
    const current = await this.require(input.jobId);
    return this.store.withUserLock(current.userId, async () => {
      const record = await this.require(input.jobId);
      if (record.generation !== input.expectedGeneration) throw new Error("stale 3D generation job update.");
      if (!TRANSITIONS[record.state].has(input.state)) throw new Error(`invalid 3D generation transition: ${record.state} -> ${input.state}`);
      if (record.cancellationRequestedAtMs !== undefined && input.state !== "cancelled" && input.state !== "failed") {
        throw new Error("cancelled 3D generation job cannot advance.");
      }
      const now = this.now();
      const next = Object.freeze({
        ...record,
        state: input.state,
        generation: record.generation + 1,
        updatedAtMs: now,
        ...(input.terminalReason ? { terminalReason: input.terminalReason.slice(0, 240) } : {}),
      });
      await this.store.put(next);
      return next;
    });
  }

  async recordProviderIdentity(input: {
    readonly jobId: string;
    readonly expectedGeneration: number;
    readonly subscriptionKey: string;
    readonly taskId: string;
    readonly requestId?: string;
  }): Promise<Studio3dGenerationJobRecord> {
    const current = await this.require(input.jobId);
    return this.store.withUserLock(current.userId, async () => {
      const record = await this.require(input.jobId);
      if (record.generation !== input.expectedGeneration || record.state === "cancelled") {
        throw new Error("stale provider identity update.");
      }
      const next = Object.freeze({
        ...record,
        generation: record.generation + 1,
        updatedAtMs: this.now(),
        providerSubscriptionKeyHash: sha256(input.subscriptionKey),
        providerTaskId: boundedString(input.taskId, "taskId"),
        ...(input.requestId ? { providerRequestIdHash: sha256(input.requestId) } : {}),
      });
      await this.store.put(next);
      return next;
    });
  }

  async requestCancellation(jobId: string): Promise<Studio3dGenerationJobRecord> {
    const current = await this.require(jobId);
    return this.store.withUserLock(current.userId, async () => {
      const record = await this.require(jobId);
      if (!NON_TERMINAL.has(record.state)) return record;
      const next = Object.freeze({
        ...record,
        generation: record.generation + 1,
        cancellationRequestedAtMs: this.now(),
        updatedAtMs: this.now(),
      });
      await this.store.put(next);
      return next;
    });
  }

  async internalizeArtifact(input: {
    readonly jobId: string;
    readonly expectedGeneration: number;
    readonly bytes: Uint8Array;
    readonly mimeType: string;
    readonly objectKey: string;
    readonly validationVersion: string;
    readonly modelId: string;
    readonly actualCredits: number;
    readonly persistArtifact?: (artifact: {
      readonly revision: Studio3dGenerationArtifactRevision;
      readonly bytes: Uint8Array;
    }) => Promise<void>;
  }): Promise<Studio3dGenerationJobRecord> {
    const current = await this.require(input.jobId);
    return this.store.withUserLock(current.userId, async () => {
      const record = await this.require(input.jobId);
      if (record.generation !== input.expectedGeneration) throw new Error("stale 3D artifact result.");
      if (record.cancellationRequestedAtMs !== undefined || record.state === "cancelled") {
        throw new Error("late 3D artifact cannot be attached after cancellation.");
      }
      if (record.state !== "importing") throw new Error("3D artifact can be internalized only during importing.");
      if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength < 20 || input.bytes.byteLength > 500 * 1024 * 1024) {
        throw new RangeError("3D artifact byte length is invalid.");
      }
      const mimeType = boundedString(input.mimeType, "mimeType", 120).toLowerCase();
      if (!mimeType.includes("gltf") && !mimeType.includes("model") && mimeType !== "application/octet-stream") {
        throw new TypeError("3D artifact MIME type is unsupported.");
      }
      const contentHashSha256 = sha256(input.bytes);
      const createdAtMs = this.now();
      const artifactRevision = Object.freeze({
        id: `3drev_${contentHashSha256.slice(0, 24)}`,
        modelId: boundedString(input.modelId, "modelId"),
        contentHashSha256,
        byteLength: input.bytes.byteLength,
        mimeType,
        objectKey: boundedString(input.objectKey, "objectKey", 1_024),
        validationVersion: boundedString(input.validationVersion, "validationVersion", 120),
        createdAtMs,
        sourceJobId: record.id,
      });
      const storedArtifact = Object.freeze({
        revision: artifactRevision,
        bytes: new Uint8Array(input.bytes),
      });
      await input.persistArtifact?.(storedArtifact);
      const next = Object.freeze({
        ...record,
        state: "ready" as const,
        generation: record.generation + 1,
        updatedAtMs: createdAtMs,
        actualCredits: boundedCredits(input.actualCredits, "actualCredits"),
        artifactRevision,
      });
      await this.store.put(next);
      return next;
    });
  }

  async expireOverdueJobs(userId: string): Promise<readonly Studio3dGenerationJobRecord[]> {
    const now = this.now();
    return this.store.withUserLock(userId, async () => {
      const records = await this.store.listByUser(userId);
      const expired: Studio3dGenerationJobRecord[] = [];
      for (const record of records) {
        if (!NON_TERMINAL.has(record.state) || record.deadlineAtMs > now) continue;
        const next = Object.freeze({
          ...record,
          state: "expired" as const,
          generation: record.generation + 1,
          updatedAtMs: now,
          terminalReason: "deadline-exceeded",
        });
        await this.store.put(next);
        expired.push(next);
      }
      return Object.freeze(expired);
    });
  }

  async require(jobId: string): Promise<Studio3dGenerationJobRecord> {
    const record = await this.store.getById(boundedString(jobId, "jobId"));
    if (!record) throw new Error("3D generation job was not found.");
    return record;
  }

  async list(userId: string): Promise<readonly Studio3dGenerationJobRecord[]> {
    return this.store.listByUser(boundedString(userId, "userId"));
  }
}
