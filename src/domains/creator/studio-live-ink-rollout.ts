import {
  resolveStudioLiveInkBackendPreference,
  type StudioLiveInkBackendPreference,
} from "./studio-live-ink-backend";

/**
 * A cohort is a local percentile bucket, not a user or device identifier. It is never sent to the
 * server and deliberately contains too little information to identify a browser installation.
 */
export const STUDIO_LIVE_INK_ROLLOUT_BUCKET_COUNT = 10_000;
export const STUDIO_LIVE_INK_ROLLOUT_BUCKET_STORAGE_KEY =
  "toonspectrum:studio:live-ink-rollout-bucket:v1";

export interface StudioLiveInkRolloutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StudioLiveInkRolloutRandom {
  getRandomValues(array: Uint32Array<ArrayBuffer>): Uint32Array<ArrayBuffer>;
}

export type StudioLiveInkRolloutReason =
  | "canvas2d-forced"
  | "webgpu-explicit"
  | "rollout-disabled"
  | "webgpu-api-unavailable"
  | "cohort-included"
  | "cohort-excluded"
  | "cohort-unavailable";

export interface StudioLiveInkRolloutDecision {
  readonly preference: Exclude<StudioLiveInkBackendPreference, "auto">;
  readonly reason: StudioLiveInkRolloutReason;
  readonly rolloutPercent: number;
  /** Null for forced/off decisions that do not need to create or read a local cohort. */
  readonly bucket: number | null;
}

export interface StudioLiveInkRolloutInput {
  readonly backendPreference?: unknown;
  readonly rolloutPercent?: unknown;
  /** A synchronous API check only. Adapter/device readiness remains the stroke-level hard gate. */
  readonly webgpuApiAvailable: boolean;
  readonly storage?: StudioLiveInkRolloutStorage | null;
  readonly random?: StudioLiveInkRolloutRandom | null;
}

interface StudioLiveInkRolloutGlobals {
  readonly navigator?: { readonly gpu?: unknown };
  readonly localStorage?: Storage;
  readonly crypto?: Crypto;
}

function parseRolloutPercent(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value !== "number" && typeof value !== "string") return 0;
  const parsed = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return 0;
  return parsed;
}

function validBucket(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= 0 && value < STUDIO_LIVE_INK_ROLLOUT_BUCKET_COUNT ? value : null;
}

function readStoredBucket(storage: StudioLiveInkRolloutStorage): number | null {
  try {
    const raw = storage.getItem(STUDIO_LIVE_INK_ROLLOUT_BUCKET_STORAGE_KEY);
    if (raw === null || !/^(?:0|[1-9]\d{0,3})$/u.test(raw)) return null;
    return validBucket(Number(raw));
  } catch {
    return null;
  }
}

function createStoredBucket(
  storage: StudioLiveInkRolloutStorage,
  random: StudioLiveInkRolloutRandom,
): number | null {
  try {
    const word = new Uint32Array(new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT));
    random.getRandomValues(word);
    const bucket = (word[0] ?? 0) % STUDIO_LIVE_INK_ROLLOUT_BUCKET_COUNT;
    storage.setItem(STUDIO_LIVE_INK_ROLLOUT_BUCKET_STORAGE_KEY, String(bucket));
    return bucket;
  } catch {
    // Private browsing, quota policy, a sandboxed frame, or unavailable Web Crypto must never
    // silently promote a browser into an experimental renderer cohort.
    return null;
  }
}

function resolveCohortBucket(input: StudioLiveInkRolloutInput): number | null {
  const storage = input.storage;
  const random = input.random;
  if (!storage || !random) return null;
  return readStoredBucket(storage) ?? createStoredBucket(storage, random);
}

/**
 * Resolves the fleet-level preference only. The existing stroke-scoped backend policy still
 * requires an initialized WebGPU device, a compatible brush contract, an exact first-frame
 * receipt, and a recoverable immutable source journal before a GPU surface can become visible.
 */
export function resolveStudioLiveInkRollout(
  input: StudioLiveInkRolloutInput,
): StudioLiveInkRolloutDecision {
  const configuredPreference = resolveStudioLiveInkBackendPreference(input.backendPreference);
  const rolloutPercent = parseRolloutPercent(input.rolloutPercent);

  if (configuredPreference === "canvas2d") {
    return {
      preference: "canvas2d",
      reason: "canvas2d-forced",
      rolloutPercent,
      bucket: null,
    };
  }
  if (configuredPreference === "webgpu") {
    return {
      preference: "webgpu",
      reason: "webgpu-explicit",
      rolloutPercent,
      bucket: null,
    };
  }
  if (rolloutPercent <= 0) {
    return {
      preference: "canvas2d",
      reason: "rollout-disabled",
      rolloutPercent,
      bucket: null,
    };
  }
  if (!input.webgpuApiAvailable) {
    return {
      preference: "canvas2d",
      reason: "webgpu-api-unavailable",
      rolloutPercent,
      bucket: null,
    };
  }
  if (rolloutPercent >= 100) {
    return {
      preference: "webgpu",
      reason: "cohort-included",
      rolloutPercent,
      bucket: null,
    };
  }

  const bucket = resolveCohortBucket(input);
  if (bucket === null) {
    return {
      preference: "canvas2d",
      reason: "cohort-unavailable",
      rolloutPercent,
      bucket: null,
    };
  }
  const threshold = Math.floor(
    rolloutPercent * STUDIO_LIVE_INK_ROLLOUT_BUCKET_COUNT / 100,
  );
  return bucket < threshold
    ? { preference: "webgpu", reason: "cohort-included", rolloutPercent, bucket }
    : { preference: "canvas2d", reason: "cohort-excluded", rolloutPercent, bucket };
}

function safely<Value>(read: () => Value, fallback: Value): Value {
  try {
    return read();
  } catch {
    return fallback;
  }
}

/** Browser adapter kept separate so the policy above remains deterministic and unit-testable. */
export function studioLiveInkRolloutInputFromGlobals(
  backendPreference: unknown,
  rolloutPercent: unknown,
  globals: StudioLiveInkRolloutGlobals = globalThis as StudioLiveInkRolloutGlobals,
): StudioLiveInkRolloutInput {
  const navigatorLike = safely(() => globals.navigator ?? null, null);
  const storage = safely<Storage | null>(() => globals.localStorage ?? null, null);
  const random = safely<Crypto | null>(() => globals.crypto ?? null, null);
  const webgpuApiAvailable = safely(
    () => typeof (navigatorLike?.gpu as { readonly requestAdapter?: unknown } | null | undefined)
      ?.requestAdapter === "function",
    false,
  );
  return {
    backendPreference,
    rolloutPercent,
    webgpuApiAvailable,
    storage,
    random,
  };
}
