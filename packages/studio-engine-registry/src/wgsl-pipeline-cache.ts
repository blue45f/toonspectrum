import type { ComposedWgslVariant } from "./wgsl-variants";

/**
 * Driver pipeline allocations are intentionally opaque in WebGPU. This value is
 * therefore a conservative retention-accounting overhead, not a claim about
 * physical GPU memory. The exact WGSL UTF-8 byte length is added separately.
 */
export const WGSL_PIPELINE_CACHE_DEFAULT_OVERHEAD_BYTES = 16 * 1024;

const WGSL_PIPELINE_CACHE_STAGE_OVERHEAD_BYTES = 512;

export type WgslPipelineDisposalReason =
  | "evicted"
  | "invalidated"
  | "killed"
  | "disposed"
  | "compile-invalidated";

export interface WgslPipelineCompileContext {
  readonly signal: AbortSignal;
}

export type WgslPipelineCompiler<TPipeline> = (
  variant: ComposedWgslVariant,
  context: WgslPipelineCompileContext,
) => Promise<TPipeline> | TPipeline;

export interface WgslPipelineCacheOptions<TPipeline> {
  /** Hard upper bound on retained pipeline references. */
  readonly maxEntries: number;
  /** Hard upper bound on estimated retained bytes. */
  readonly maxEstimatedBytes: number;
  readonly compile: WgslPipelineCompiler<TPipeline>;
  readonly estimateBytes?: (
    variant: ComposedWgslVariant,
    pipeline: TPipeline,
  ) => number;
  /** Optional owner callback. WebGPU pipelines themselves expose no destroy(). */
  readonly dispose?: (
    pipeline: TPipeline,
    reason: WgslPipelineDisposalReason,
  ) => void;
}

export interface WgslPipelineRemoteControlEntry {
  readonly variantKey: string;
  readonly reason: string;
}

/**
 * A revisioned remote policy. `killed` is an authoritative snapshot and keeps
 * variants blocked until a newer snapshot removes them. `invalidate` is a
 * one-shot cache purge; a subsequent request may compile again immediately.
 */
export interface WgslPipelineRemoteControlPolicy {
  readonly revision: number;
  readonly killed: readonly WgslPipelineRemoteControlEntry[];
  readonly invalidate?: readonly WgslPipelineRemoteControlEntry[];
}

export interface WgslPipelineRemoteControlReceipt {
  readonly applied: boolean;
  readonly revision: number;
  readonly newlyKilled: readonly string[];
  readonly revived: readonly string[];
  readonly invalidated: readonly string[];
}

export interface WgslPipelineCacheStats {
  readonly requests: number;
  readonly hits: number;
  readonly misses: number;
  readonly inFlightHits: number;
  readonly compileAttempts: number;
  readonly compileFailures: number;
  readonly evictions: number;
  readonly invalidations: number;
  readonly oversizedBypasses: number;
  readonly disposalFailures: number;
  readonly entries: number;
  readonly inFlight: number;
  readonly estimatedBytes: number;
  readonly maxEntries: number;
  readonly maxEstimatedBytes: number;
  readonly remoteRevision: number;
  readonly remoteKilled: number;
  readonly manuallyKilled: number;
}

interface CacheEntry<TPipeline> {
  readonly pipeline: TPipeline;
  readonly estimatedBytes: number;
  readonly signature: string;
}

interface InFlightEntry<TPipeline> {
  readonly promise: Promise<TPipeline>;
  readonly controller: AbortController;
  readonly generation: number;
  readonly signature: string;
}

/** Explicit failure when a remotely or locally killed variant is requested. */
export class WgslPipelineKilledError extends Error {
  constructor(
    readonly variantKey: string,
    readonly reason: string,
  ) {
    super(`WGSL pipeline variant "${variantKey}" is killed: ${reason}`);
    this.name = "WgslPipelineKilledError";
  }
}

/** Explicit failure when a compile finishes after its generation was purged. */
export class WgslPipelineInvalidatedError extends Error {
  constructor(
    readonly variantKey: string,
    readonly reason: string,
  ) {
    super(`WGSL pipeline variant "${variantKey}" was invalidated: ${reason}`);
    this.name = "WgslPipelineInvalidatedError";
  }
}

/** Guards against a corrupt/colliding caller bypassing composeWgslVariant. */
export class WgslPipelineKeyCollisionError extends Error {
  constructor(readonly variantKey: string) {
    super(`WGSL pipeline key collision for "${variantKey}"`);
    this.name = "WgslPipelineKeyCollisionError";
  }
}

export interface WgslShaderCompilationMessageLike {
  readonly type: string;
  readonly message: string;
  readonly lineNum?: number;
  readonly linePos?: number;
}

export interface WgslShaderModuleLike {
  getCompilationInfo?: () => Promise<{
    readonly messages: readonly WgslShaderCompilationMessageLike[];
  }>;
}

export interface WgslComputePipelineDeviceLike<TPipeline> {
  createShaderModule(descriptor: {
    readonly label: string;
    readonly code: string;
  }): WgslShaderModuleLike;
  createComputePipelineAsync?: (descriptor: {
    readonly label: string;
    readonly layout: "auto";
    readonly compute: {
      readonly module: WgslShaderModuleLike;
      readonly entryPoint: string;
    };
  }) => Promise<TPipeline>;
  createComputePipeline?: (descriptor: {
    readonly label: string;
    readonly layout: "auto";
    readonly compute: {
      readonly module: WgslShaderModuleLike;
      readonly entryPoint: string;
    };
  }) => TPipeline;
}

export class WgslPipelineCompileError extends Error {
  constructor(
    readonly variantKey: string,
    readonly diagnostics: readonly WgslShaderCompilationMessageLike[],
  ) {
    const detail = diagnostics
      .map((message) => {
        const location =
          message.lineNum === undefined
            ? ""
            : ` at ${message.lineNum}:${message.linePos ?? 0}`;
        return `${message.type}${location}: ${message.message}`;
      })
      .join("; ");
    super(`WGSL pipeline compile failed for "${variantKey}": ${detail}`);
    this.name = "WgslPipelineCompileError";
  }
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function nonEmpty(value: string, label: string): string {
  if (value.trim().length === 0) throw new TypeError(`${label} must not be empty`);
  return value;
}

function variantSignature(variant: ComposedWgslVariant): string {
  return variant.wgsl;
}

/** Deterministic retention estimate used when a device-specific estimator is absent. */
export function estimateWgslPipelineRetainedBytes(
  variant: ComposedWgslVariant,
): number {
  const sourceBytes = new TextEncoder().encode(variant.wgsl).byteLength;
  return (
    WGSL_PIPELINE_CACHE_DEFAULT_OVERHEAD_BYTES +
    sourceBytes +
    variant.stages.length * WGSL_PIPELINE_CACHE_STAGE_OVERHEAD_BYTES
  );
}

/**
 * Adapts a WebGPU-like device to the cache compiler port. Diagnostics are
 * checked before pipeline creation, and createComputePipelineAsync is preferred
 * so a compile does not synchronously monopolize the UI thread.
 */
export function createWgslWebGpuPipelineCompiler<TPipeline>(
  device: WgslComputePipelineDeviceLike<TPipeline>,
): WgslPipelineCompiler<TPipeline> {
  if (
    typeof device.createComputePipelineAsync !== "function" &&
    typeof device.createComputePipeline !== "function"
  ) {
    throw new TypeError(
      "WebGPU device must expose createComputePipelineAsync or createComputePipeline",
    );
  }
  return async (variant, { signal }) => {
    if (signal.aborted) throw signal.reason;
    const module = device.createShaderModule({
      label: variant.shaderId,
      code: variant.wgsl,
    });
    if (module.getCompilationInfo) {
      const info = await module.getCompilationInfo();
      const errors = info.messages.filter((message) => message.type === "error");
      if (errors.length > 0) {
        throw new WgslPipelineCompileError(variant.variantKey, errors);
      }
    }
    if (signal.aborted) throw signal.reason;
    const descriptor = {
      label: variant.shaderId,
      layout: "auto" as const,
      compute: { module, entryPoint: variant.entryPoint },
    };
    if (device.createComputePipelineAsync) {
      return device.createComputePipelineAsync(descriptor);
    }
    return device.createComputePipeline!(descriptor);
  };
}

/**
 * Bounded, device-local LRU for composed WGSL variants.
 *
 * The cache never generates WGSL and never derives its own key. It consumes the
 * `variantKey` and source emitted by composeWgslVariant. Parameter values live
 * in uniform/LUT buffers, so value-only edits naturally hit the same pipeline.
 */
export class WgslPipelineCache<TPipeline> {
  readonly #maxEntries: number;
  readonly #maxEstimatedBytes: number;
  readonly #compile: WgslPipelineCompiler<TPipeline>;
  readonly #estimateBytes: NonNullable<
    WgslPipelineCacheOptions<TPipeline>["estimateBytes"]
  >;
  readonly #disposeCallback:
    | WgslPipelineCacheOptions<TPipeline>["dispose"]
    | undefined;
  readonly #entries = new Map<string, CacheEntry<TPipeline>>();
  readonly #inFlight = new Map<string, InFlightEntry<TPipeline>>();
  readonly #generations = new Map<string, number>();
  readonly #manualKills = new Map<string, string>();
  #remoteKills = new Map<string, string>();
  #remoteRevision = -1;
  #estimatedBytes = 0;
  #disposed = false;
  #counters = {
    requests: 0,
    hits: 0,
    misses: 0,
    inFlightHits: 0,
    compileAttempts: 0,
    compileFailures: 0,
    evictions: 0,
    invalidations: 0,
    oversizedBypasses: 0,
    disposalFailures: 0,
  };

  constructor(options: WgslPipelineCacheOptions<TPipeline>) {
    this.#maxEntries = positiveInteger(options.maxEntries, "maxEntries");
    this.#maxEstimatedBytes = positiveInteger(
      options.maxEstimatedBytes,
      "maxEstimatedBytes",
    );
    if (typeof options.compile !== "function") {
      throw new TypeError("compile must be a function");
    }
    this.#compile = options.compile;
    this.#estimateBytes =
      options.estimateBytes ??
      ((variant) => estimateWgslPipelineRetainedBytes(variant));
    this.#disposeCallback = options.dispose;
  }

  async getOrCompile(variant: ComposedWgslVariant): Promise<TPipeline> {
    this.#assertUsable();
    const key = nonEmpty(variant.variantKey, "variant.variantKey");
    const signature = variantSignature(variant);
    this.#counters.requests += 1;
    const blocked = this.#blockedReason(key);
    if (blocked !== null) throw new WgslPipelineKilledError(key, blocked);

    const cached = this.#entries.get(key);
    if (cached) {
      this.#assertSignature(key, cached.signature, signature);
      this.#entries.delete(key);
      this.#entries.set(key, cached);
      this.#counters.hits += 1;
      return cached.pipeline;
    }

    const pending = this.#inFlight.get(key);
    if (pending) {
      this.#assertSignature(key, pending.signature, signature);
      this.#counters.inFlightHits += 1;
      return pending.promise;
    }

    this.#counters.misses += 1;
    this.#counters.compileAttempts += 1;
    const generation = this.#generation(key);
    const controller = new AbortController();
    let compilerCompleted = false;
    const promise = Promise.resolve()
      .then(() => this.#compile(variant, { signal: controller.signal }))
      .then((pipeline) => {
        compilerCompleted = true;
        const killed = this.#blockedReason(key);
        if (killed !== null) {
          this.#safeDispose(pipeline, "killed");
          throw new WgslPipelineKilledError(key, killed);
        }
        if (this.#generation(key) !== generation) {
          this.#safeDispose(pipeline, "compile-invalidated");
          throw new WgslPipelineInvalidatedError(
            key,
            String(controller.signal.reason ?? "generation changed"),
          );
        }
        this.#retain(key, signature, variant, pipeline);
        return pipeline;
      })
      .catch((error: unknown) => {
        if (!compilerCompleted) this.#counters.compileFailures += 1;
        throw error;
      })
      .finally(() => {
        const current = this.#inFlight.get(key);
        if (current?.promise === promise) this.#inFlight.delete(key);
      });
    this.#inFlight.set(key, { promise, controller, generation, signature });
    return promise;
  }

  has(variantKey: string): boolean {
    return this.#entries.has(variantKey);
  }

  isKilled(variantKey: string): boolean {
    return this.#blockedReason(variantKey) !== null;
  }

  kill(variantKey: string, reason: string): void {
    const key = nonEmpty(variantKey, "variantKey");
    this.#manualKills.set(key, nonEmpty(reason, "reason"));
    this.#invalidateKey(key, "killed", `manual kill: ${reason}`, true);
  }

  revive(variantKey: string): boolean {
    return this.#manualKills.delete(variantKey);
  }

  invalidate(variantKey: string, reason = "manual invalidation"): boolean {
    const key = nonEmpty(variantKey, "variantKey");
    return this.#invalidateKey(
      key,
      "invalidated",
      nonEmpty(reason, "reason"),
      true,
    );
  }

  invalidateAll(reason = "cache invalidated"): number {
    nonEmpty(reason, "reason");
    const keys = new Set([...this.#entries.keys(), ...this.#inFlight.keys()]);
    for (const key of keys) {
      this.#invalidateKey(key, "invalidated", reason, true);
    }
    return keys.size;
  }

  applyRemoteControl(
    policy: WgslPipelineRemoteControlPolicy,
  ): WgslPipelineRemoteControlReceipt {
    if (!Number.isSafeInteger(policy.revision) || policy.revision < 0) {
      throw new RangeError("remote policy revision must be a non-negative safe integer");
    }
    if (policy.revision <= this.#remoteRevision) {
      return {
        applied: false,
        revision: this.#remoteRevision,
        newlyKilled: [],
        revived: [],
        invalidated: [],
      };
    }
    const nextKills = this.#normalizeControlEntries(policy.killed, "killed");
    const invalidations = this.#normalizeControlEntries(
      policy.invalidate ?? [],
      "invalidate",
    );
    const newlyKilled = [...nextKills.keys()].filter(
      (key) => !this.#remoteKills.has(key),
    );
    const revived = [...this.#remoteKills.keys()].filter(
      (key) => !nextKills.has(key),
    );
    this.#remoteKills = nextKills;
    this.#remoteRevision = policy.revision;
    for (const key of newlyKilled) {
      this.#invalidateKey(
        key,
        "killed",
        `remote kill r${policy.revision}: ${nextKills.get(key)}`,
        true,
      );
    }
    const invalidated: string[] = [];
    for (const [key, reason] of invalidations) {
      this.#invalidateKey(
        key,
        "invalidated",
        `remote invalidate r${policy.revision}: ${reason}`,
        true,
      );
      invalidated.push(key);
    }
    return {
      applied: true,
      revision: policy.revision,
      newlyKilled,
      revived,
      invalidated,
    };
  }

  stats(): WgslPipelineCacheStats {
    return Object.freeze({
      ...this.#counters,
      entries: this.#entries.size,
      inFlight: this.#inFlight.size,
      estimatedBytes: this.#estimatedBytes,
      maxEntries: this.#maxEntries,
      maxEstimatedBytes: this.#maxEstimatedBytes,
      remoteRevision: this.#remoteRevision,
      remoteKilled: this.#remoteKills.size,
      manuallyKilled: this.#manualKills.size,
    });
  }

  dispose(reason = "cache disposed"): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const [key, pending] of this.#inFlight) {
      this.#generations.set(key, this.#generation(key) + 1);
      pending.controller.abort(reason);
    }
    this.#inFlight.clear();
    for (const entry of this.#entries.values()) {
      this.#safeDispose(entry.pipeline, "disposed");
    }
    this.#entries.clear();
    this.#estimatedBytes = 0;
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("WGSL pipeline cache is disposed");
  }

  #generation(key: string): number {
    return this.#generations.get(key) ?? 0;
  }

  #blockedReason(key: string): string | null {
    return this.#manualKills.get(key) ?? this.#remoteKills.get(key) ?? null;
  }

  #assertSignature(key: string, existing: string, requested: string): void {
    if (existing !== requested) throw new WgslPipelineKeyCollisionError(key);
  }

  #normalizeControlEntries(
    entries: readonly WgslPipelineRemoteControlEntry[],
    label: string,
  ): Map<string, string> {
    const normalized = new Map<string, string>();
    for (const entry of entries) {
      const key = nonEmpty(entry.variantKey, `${label}.variantKey`);
      if (normalized.has(key)) {
        throw new TypeError(`${label} contains duplicate variantKey "${key}"`);
      }
      normalized.set(key, nonEmpty(entry.reason, `${label}.reason`));
    }
    return normalized;
  }

  #retain(
    key: string,
    signature: string,
    variant: ComposedWgslVariant,
    pipeline: TPipeline,
  ): void {
    let rawEstimate: number;
    try {
      rawEstimate = this.#estimateBytes(variant, pipeline);
      if (!Number.isSafeInteger(rawEstimate) || rawEstimate <= 0) {
        throw new RangeError("estimateBytes must return a positive safe integer");
      }
    } catch (error) {
      this.#safeDispose(pipeline, "compile-invalidated");
      throw error;
    }
    if (rawEstimate > this.#maxEstimatedBytes) {
      this.#counters.oversizedBypasses += 1;
      return;
    }
    this.#entries.set(key, {
      pipeline,
      estimatedBytes: rawEstimate,
      signature,
    });
    this.#estimatedBytes += rawEstimate;
    while (
      this.#entries.size > this.#maxEntries ||
      this.#estimatedBytes > this.#maxEstimatedBytes
    ) {
      const oldestKey = this.#entries.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      const oldest = this.#entries.get(oldestKey)!;
      this.#entries.delete(oldestKey);
      this.#estimatedBytes -= oldest.estimatedBytes;
      this.#counters.evictions += 1;
      this.#safeDispose(oldest.pipeline, "evicted");
    }
  }

  #invalidateKey(
    key: string,
    disposalReason: "invalidated" | "killed",
    reason: string,
    count: boolean,
  ): boolean {
    const generation = this.#generation(key) + 1;
    this.#generations.set(key, generation);
    let changed = false;
    const entry = this.#entries.get(key);
    if (entry) {
      this.#entries.delete(key);
      this.#estimatedBytes -= entry.estimatedBytes;
      this.#safeDispose(entry.pipeline, disposalReason);
      changed = true;
    }
    const pending = this.#inFlight.get(key);
    if (pending) {
      pending.controller.abort(reason);
      changed = true;
    }
    if (count) this.#counters.invalidations += 1;
    return changed;
  }

  #safeDispose(
    pipeline: TPipeline,
    reason: WgslPipelineDisposalReason,
  ): void {
    if (!this.#disposeCallback) return;
    try {
      this.#disposeCallback(pipeline, reason);
    } catch {
      this.#counters.disposalFailures += 1;
    }
  }
}

export function createWgslPipelineCache<TPipeline>(
  options: WgslPipelineCacheOptions<TPipeline>,
): WgslPipelineCache<TPipeline> {
  return new WgslPipelineCache(options);
}
