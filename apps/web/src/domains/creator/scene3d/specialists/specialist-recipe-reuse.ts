import {
  parseSpecialistRequest,
  parseSpecialistResult,
  SpecialistError,
} from "./specialist-contract";
import type {
  SpecialistRequest,
  SpecialistResult,
} from "./specialist-contract";

/** Ephemeral optimization only. Never a document, library, history or persistence authority. */
// A cold production page has a new module instance. Bump this when the recipe/worker contract
// changes; the development HMR hook below also discards results from older code.
export const SPECIALIST_RECIPE_RUNTIME_REVISION =
  "scene3d-specialist-recipe-runtime-v2-navigation";
export interface SpecialistRecipeReuseLimits {
  readonly maxEntries: number;
  readonly maxBytes: number;
  readonly maxEntryBytes: number;
  readonly maxSourceBytes: number;
  readonly maxMetadataBytes: number;
  readonly ttlMs: number;
}
export const SPECIALIST_RECIPE_REUSE_LIMITS: SpecialistRecipeReuseLimits =
  Object.freeze({
    maxEntries: 3,
    maxBytes: 48 * 1024 * 1024,
    maxEntryBytes: 16 * 1024 * 1024,
    maxSourceBytes: 32 * 1024 * 1024,
    maxMetadataBytes: 128 * 1024,
    ttlMs: 5 * 60 * 1000,
  });
export interface SpecialistRecipeIdentity {
  readonly key: string;
  readonly sourceSha256: string;
  readonly secondarySha256: string | null;
  readonly revision: string;
}
type Digest = (bytes: Uint8Array<ArrayBuffer>) => Promise<string>;
interface CacheEntry {
  readonly result: SpecialistResult;
  readonly bytes: number;
  readonly created: number;
  readonly expires: number;
}
function abortIfRequested(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new SpecialistError("cancelled", "Processing was cancelled.");
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
async function platformDigest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  if (!globalThis.crypto?.subtle)
    throw new Error("Web Crypto is not available.");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return (
    "sha256:" +
    Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("")
  );
}
async function checkedDigest(
  digest: Digest,
  bytes: Uint8Array<ArrayBuffer>,
  signal?: AbortSignal,
): Promise<string> {
  abortIfRequested(signal);
  // Web Crypto cannot abort an already submitted native digest. Retain the job reservation
  // until it settles, then observe cancellation before a Worker or cache mutation can start.
  const value = await digest(bytes);
  abortIfRequested(signal);
  if (!/^sha256:[a-f0-9]{64}$/.test(value))
    throw new Error("Invalid SHA-256 result.");
  return value;
}
export async function createSpecialistRecipeIdentity(
  input: SpecialistRequest,
  options: {
    readonly digest?: Digest;
    readonly revision?: string;
    readonly signal?: AbortSignal;
  } = {},
): Promise<SpecialistRecipeIdentity> {
  const request = parseSpecialistRequest(input);
  const revision = options.revision ?? SPECIALIST_RECIPE_RUNTIME_REVISION;
  if (!/^[a-z0-9][a-z0-9._-]{0,159}$/.test(revision))
    throw new TypeError("Invalid recipe runtime revision.");
  const digest = options.digest ?? platformDigest;
  const sourceSha256 = await checkedDigest(
    digest,
    new Uint8Array(request.source),
    options.signal,
  );
  const secondarySha256 = request.secondary
    ? await checkedDigest(
        digest,
        new Uint8Array(request.secondary),
        options.signal,
      )
    : null;
  const identity = {
    version: 1,
    revision,
    sourceSha256,
    secondarySha256,
    options: canonical(request.options),
  };
  const key = await checkedDigest(
    digest,
    new TextEncoder().encode(JSON.stringify(identity)),
    options.signal,
  );
  return Object.freeze({ key, sourceSha256, secondarySha256, revision });
}
function resultWeight(result: SpecialistResult): {
  readonly total: number;
  readonly metadata: number;
} {
  const metadata = new TextEncoder().encode(
    JSON.stringify({
      ...result,
      artifacts: result.artifacts.map(({ bytes, ...artifact }) => ({
        ...artifact,
        byteLength: bytes.byteLength,
      })),
    }),
  ).byteLength;
  return {
    total:
      metadata +
      result.artifacts.reduce((sum, item) => sum + item.bytes.byteLength, 0),
    metadata,
  };
}

function copyResult(result: SpecialistResult): SpecialistResult {
  // Structured-cloning a tiny view can copy its entire huge backing ArrayBuffer.
  // Clone metadata without pixel buffers, then copy only each admitted view's bytes.
  const metadata = structuredClone({
    ...result,
    artifacts: result.artifacts.map((artifact) => ({
      name: artifact.name,
      mime: artifact.mime,
      sha256: artifact.sha256,
      ...(artifact.stats ? { stats: artifact.stats } : {}),
    })),
  });
  return {
    ...metadata,
    artifacts: metadata.artifacts.map((item, index) => ({
      ...item,
      bytes: Uint8Array.from(result.artifacts[index]!.bytes),
    })),
  };
}

/** Only the queue passes its private input snapshot here. Exact result ownership is copied. */
export class SpecialistRecipeReuseCache {
  readonly #limits: SpecialistRecipeReuseLimits;
  readonly #digest: Digest;
  readonly #clock: () => number;
  readonly #revision: string;
  readonly #entries = new Map<string, CacheEntry>();
  #bytes = 0;
  #epoch = 0;
  #hits = 0;
  #accepting = true;
  constructor(
    options: {
      readonly limits?: Partial<SpecialistRecipeReuseLimits>;
      readonly digest?: Digest;
      readonly clock?: () => number;
      readonly revision?: string;
    } = {},
  ) {
    const limits = { ...SPECIALIST_RECIPE_REUSE_LIMITS, ...options.limits };
    for (const value of Object.values(limits))
      if (!Number.isSafeInteger(value) || value < 1)
        throw new RangeError("Invalid recipe cache limit.");
    if (limits.maxEntryBytes > limits.maxBytes)
      throw new RangeError("Recipe entry limit exceeds the cache budget.");
    this.#limits = Object.freeze(limits);
    this.#digest = options.digest ?? platformDigest;
    this.#clock = options.clock ?? Date.now;
    this.#revision = options.revision ?? SPECIALIST_RECIPE_RUNTIME_REVISION;
  }
  #remove(key: string): void {
    const entry = this.#entries.get(key);
    if (!entry) return;
    this.#entries.delete(key);
    this.#bytes -= entry.bytes;
  }
  #expire(): void {
    const now = this.#clock();
    for (const [key, entry] of this.#entries) {
      if (!Number.isFinite(now) || now < entry.created || now >= entry.expires)
        this.#remove(key);
    }
  }
  snapshot(): {
    readonly entries: number;
    readonly bytes: number;
    readonly hits: number;
    readonly epoch: number;
  } {
    this.#expire();
    return Object.freeze({
      entries: this.#entries.size,
      bytes: this.#bytes,
      hits: this.#hits,
      epoch: this.#epoch,
    });
  }
  clear(): void {
    this.#epoch++;
    this.#entries.clear();
    this.#bytes = 0;
  }
  /** A hidden/departed page may finish its existing job, but cannot repopulate the cache. */
  suspend(): void { this.#accepting = false; this.clear(); }
  resume(): void { this.#accepting = true; }

  async run(
    request: SpecialistRequest,
    input: {
      readonly signal?: AbortSignal;
      readonly execute: () => Promise<SpecialistResult>;
      readonly onCheck?: () => void;
    },
  ): Promise<{ readonly result: SpecialistResult; readonly reused: boolean }> {
    abortIfRequested(input.signal);
    const normalized = parseSpecialistRequest(request);
    const inputBytes =
      normalized.source.byteLength + (normalized.secondary?.byteLength ?? 0);
    if (!this.#accepting || inputBytes > this.#limits.maxSourceBytes) {
      const result = await input.execute();
      abortIfRequested(input.signal);
      return { result, reused: false };
    }
    const epoch = this.#epoch;
    try {
      input.onCheck?.();
    } catch {
      /* Observers never own execution. */
    }
    let identity: SpecialistRecipeIdentity;
    try {
      identity = await createSpecialistRecipeIdentity(normalized, {
        digest: this.#digest,
        revision: this.#revision,
        signal: input.signal,
      });
    } catch (error) {
      abortIfRequested(input.signal);
      if (error instanceof SpecialistError) throw error;
      // Hashing is an optional acceleration, not a prerequisite for the existing validated Worker.
      const result = await input.execute();
      abortIfRequested(input.signal);
      return { result, reused: false };
    }
    abortIfRequested(input.signal);
    this.#expire();
    const found =
      epoch === this.#epoch ? this.#entries.get(identity.key) : undefined;
    if (found) {
      // Private verified entry cannot be mutated by a caller or a prior returned artifact.
      const result = copyResult(found.result);
      abortIfRequested(input.signal);
      this.#entries.delete(identity.key);
      this.#entries.set(identity.key, found);
      this.#hits++;
      return { result, reused: true };
    }
    const result = await input.execute();
    abortIfRequested(input.signal);
    const validated = parseSpecialistResult(result, normalized.options.kind);
    if (validated.sourceSha256 !== identity.sourceSha256)
      throw new SpecialistError(
        "runtime",
        "The processing result does not belong to this source snapshot.",
      );
    const weight = resultWeight(validated);
    if (
      epoch !== this.#epoch ||
      weight.total > this.#limits.maxEntryBytes ||
      weight.metadata > this.#limits.maxMetadataBytes
    )
      return { result: validated, reused: false };
    // Copy BEFORE asynchronous verification. Worker output may subsequently be changed by its caller.
    const owned = copyResult(validated);
    for (const artifact of owned.artifacts) {
      let digest: string;
      try {
        digest = await checkedDigest(
          this.#digest,
          artifact.bytes,
          input.signal,
        );
      } catch (error) {
        abortIfRequested(input.signal);
        if (error instanceof SpecialistError) throw error;
        return { result: validated, reused: false };
      }
      if (digest !== artifact.sha256)
        throw new SpecialistError(
          "runtime",
          "A processing artifact failed SHA-256 verification; no reusable result was stored.",
        );
    }
    abortIfRequested(input.signal);
    // Clearing while native hashing/processing is pending must not repopulate old work.
    if (epoch === this.#epoch) {
      this.#expire();
      this.#remove(identity.key);
      while (
        this.#entries.size >= this.#limits.maxEntries ||
        this.#bytes + weight.total > this.#limits.maxBytes
      ) {
        const oldest = this.#entries.keys().next().value;
        if (oldest === undefined) break;
        this.#remove(oldest);
      }
      const now = this.#clock();
      if (Number.isFinite(now)) {
        this.#entries.set(identity.key, {
          result: owned,
          bytes: weight.total,
          created: now,
          expires: now + this.#limits.ttlMs,
        });
        this.#bytes += weight.total;
      }
    }
    return { result: validated, reused: false };
  }
}
let productCache: SpecialistRecipeReuseCache | undefined;
export function getProductSpecialistRecipeReuseCache(): SpecialistRecipeReuseCache {
  if (!productCache) {
    productCache = new SpecialistRecipeReuseCache();
    if (typeof window !== "undefined") {
      const resumeVisible = () => {
        if (typeof document === "undefined" || !document.hidden) productCache?.resume();
        else productCache?.suspend();
      };
      // Include BFCache and tab hiding: late/queued work may still settle but must not
      // retain a new private result after the user departs this surface.
      window.addEventListener("pagehide", () => productCache?.suspend());
      window.addEventListener("pageshow", resumeVisible);
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", resumeVisible);
      resumeVisible();
    }
  }
  return productCache;
}
export function clearProductSpecialistRecipeReuseCache(): void {
  productCache?.clear();
}

if (import.meta.hot) {
  import.meta.hot.on(
    "vite:beforeUpdate",
    clearProductSpecialistRecipeReuseCache,
  );
  import.meta.hot.dispose(clearProductSpecialistRecipeReuseCache);
}
