/**
 * Device-level stylus pressure conditioning for Studio.
 *
 * The profile is intentionally applied before brush-family pressure, artist gamma and minimum-size
 * rules. Draw elements keep only the resulting canonical pressure samples, so replay, collaboration
 * and export do not depend on the browser that authored the stroke or on a later settings change.
 */

export const STUDIO_STYLUS_PRESSURE_PROFILE_VERSION = 1 as const;
export const STUDIO_STYLUS_PRESSURE_PROFILE_STORAGE_KEY =
  "toonstudio:stylus-pressure-profile:v1" as const;
export const STUDIO_STYLUS_PRESSURE_PROFILE_POINT_LIMIT = 8 as const;

export interface StudioStylusPressurePoint {
  readonly input: number;
  readonly output: number;
}

export interface StudioStylusPressureProfile {
  readonly version: typeof STUDIO_STYLUS_PRESSURE_PROFILE_VERSION;
  readonly enabled: boolean;
  /** Raw hardware pressure at or below this value maps to zero. */
  readonly deadZone: number;
  /** Raw hardware pressure at or above this value maps to one. */
  readonly saturation: number;
  /** Monotone response after dead-zone/saturation normalization. Endpoints are always 0/0 and 1/1. */
  readonly points: readonly StudioStylusPressurePoint[];
}

export type StudioStylusPressurePresetId =
  | "linear"
  | "light-touch"
  | "firm-touch"
  | "inking";

const MIN_POINT_DISTANCE = 0.015;
const MIN_ACTIVE_PRESSURE_RANGE = 0.08;
const DEFAULT_POINTS = Object.freeze([
  Object.freeze({ input: 0, output: 0 }),
  Object.freeze({ input: 1, output: 1 }),
] as const);

export const DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE: StudioStylusPressureProfile =
  Object.freeze({
    version: STUDIO_STYLUS_PRESSURE_PROFILE_VERSION,
    enabled: true,
    deadZone: 0,
    saturation: 1,
    points: DEFAULT_POINTS,
  });

const PRESET_PROFILES: Readonly<Record<StudioStylusPressurePresetId, StudioStylusPressureProfile>> =
  Object.freeze({
    linear: DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE,
    "light-touch": Object.freeze({
      version: STUDIO_STYLUS_PRESSURE_PROFILE_VERSION,
      enabled: true,
      deadZone: 0.01,
      saturation: 0.94,
      points: Object.freeze([
        Object.freeze({ input: 0, output: 0 }),
        Object.freeze({ input: 0.12, output: 0.3 }),
        Object.freeze({ input: 0.42, output: 0.7 }),
        Object.freeze({ input: 0.78, output: 0.93 }),
        Object.freeze({ input: 1, output: 1 }),
      ]),
    }),
    "firm-touch": Object.freeze({
      version: STUDIO_STYLUS_PRESSURE_PROFILE_VERSION,
      enabled: true,
      deadZone: 0.025,
      saturation: 0.995,
      points: Object.freeze([
        Object.freeze({ input: 0, output: 0 }),
        Object.freeze({ input: 0.22, output: 0.07 }),
        Object.freeze({ input: 0.52, output: 0.34 }),
        Object.freeze({ input: 0.8, output: 0.74 }),
        Object.freeze({ input: 1, output: 1 }),
      ]),
    }),
    inking: Object.freeze({
      version: STUDIO_STYLUS_PRESSURE_PROFILE_VERSION,
      enabled: true,
      deadZone: 0.012,
      saturation: 0.965,
      points: Object.freeze([
        Object.freeze({ input: 0, output: 0 }),
        Object.freeze({ input: 0.08, output: 0.04 }),
        Object.freeze({ input: 0.24, output: 0.34 }),
        Object.freeze({ input: 0.55, output: 0.75 }),
        Object.freeze({ input: 0.86, output: 0.95 }),
        Object.freeze({ input: 1, output: 1 }),
      ]),
    }),
  });

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clamp01(value: unknown, fallback = 0): number {
  return clamp(finiteOr(value, fallback), 0, 1);
}

function readonlyPoint(input: number, output: number): StudioStylusPressurePoint {
  return Object.freeze({ input, output });
}

function normalizePressurePoints(value: unknown): readonly StudioStylusPressurePoint[] {
  const incoming = Array.isArray(value) ? value : [];
  const interior = incoming
    .map((candidate) => {
      if (!candidate || typeof candidate !== "object") return null;
      const point = candidate as Partial<StudioStylusPressurePoint>;
      const input = clamp01(point.input, Number.NaN);
      const output = clamp01(point.output, Number.NaN);
      if (!Number.isFinite(input) || !Number.isFinite(output)) return null;
      if (input <= MIN_POINT_DISTANCE || input >= 1 - MIN_POINT_DISTANCE) return null;
      return { input, output };
    })
    .filter((point): point is { input: number; output: number } => point !== null)
    .sort((left, right) => left.input - right.input);

  const deduplicated: Array<{ input: number; output: number }> = [];
  for (const point of interior) {
    const previous = deduplicated.at(-1);
    if (previous && point.input - previous.input < MIN_POINT_DISTANCE) {
      // The most recently authored value wins while retaining a safe horizontal separation.
      previous.input = point.input;
      previous.output = point.output;
    } else {
      deduplicated.push({ ...point });
    }
  }

  const maximumInteriorCount = STUDIO_STYLUS_PRESSURE_PROFILE_POINT_LIMIT - 2;
  const bounded = deduplicated.length <= maximumInteriorCount
    ? deduplicated
    : Array.from({ length: maximumInteriorCount }, (_, index) => {
        const sourceIndex = Math.round(
          (index / Math.max(1, maximumInteriorCount - 1)) * (deduplicated.length - 1),
        );
        return deduplicated[sourceIndex]!;
      });

  let minimumOutput = 0;
  const monotone = bounded.map((point) => {
    minimumOutput = Math.max(minimumOutput, point.output);
    return readonlyPoint(point.input, minimumOutput);
  });
  return Object.freeze([
    readonlyPoint(0, 0),
    ...monotone,
    readonlyPoint(1, 1),
  ]);
}

/** Converts untrusted local-storage/UI data into a finite monotone profile. */
export function normalizeStudioStylusPressureProfile(
  value: unknown,
): StudioStylusPressureProfile {
  const source = value && typeof value === "object"
    ? value as Partial<StudioStylusPressureProfile>
    : {};
  const deadZone = clamp(clamp01(source.deadZone, 0), 0, 0.4);
  const saturation = clamp(
    clamp01(source.saturation, 1),
    deadZone + MIN_ACTIVE_PRESSURE_RANGE,
    1,
  );
  return Object.freeze({
    version: STUDIO_STYLUS_PRESSURE_PROFILE_VERSION,
    enabled: source.enabled !== false,
    deadZone,
    saturation,
    points: normalizePressurePoints(source.points),
  });
}

export function studioStylusPressurePreset(
  presetId: StudioStylusPressurePresetId,
): StudioStylusPressureProfile {
  return PRESET_PROFILES[presetId] ?? DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE;
}

function monotoneTangents(points: readonly StudioStylusPressurePoint[]): readonly number[] {
  if (points.length <= 2) {
    const slope = points.length === 2
      ? (points[1]!.output - points[0]!.output) / (points[1]!.input - points[0]!.input)
      : 1;
    return [slope, slope];
  }
  const spans: number[] = [];
  const slopes: number[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const span = points[index + 1]!.input - points[index]!.input;
    spans.push(span);
    slopes.push((points[index + 1]!.output - points[index]!.output) / span);
  }
  const tangents = new Array<number>(points.length).fill(0);
  tangents[0] = slopes[0] ?? 0;
  tangents[tangents.length - 1] = slopes.at(-1) ?? 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previousSlope = slopes[index - 1] ?? 0;
    const nextSlope = slopes[index] ?? 0;
    if (previousSlope <= 0 || nextSlope <= 0) {
      tangents[index] = 0;
      continue;
    }
    const previousSpan = spans[index - 1] ?? 1;
    const nextSpan = spans[index] ?? 1;
    const leftWeight = 2 * nextSpan + previousSpan;
    const rightWeight = nextSpan + 2 * previousSpan;
    tangents[index] = (leftWeight + rightWeight) /
      (leftWeight / previousSlope + rightWeight / nextSlope);
  }
  return tangents;
}

function interpolateMonotonePressure(
  normalizedInput: number,
  points: readonly StudioStylusPressurePoint[],
): number {
  if (normalizedInput <= 0) return 0;
  if (normalizedInput >= 1) return 1;
  let segment = 0;
  while (
    segment < points.length - 2
    && normalizedInput > points[segment + 1]!.input
  ) {
    segment += 1;
  }
  const left = points[segment]!;
  const right = points[segment + 1]!;
  const span = right.input - left.input;
  if (!(span > 0)) return right.output;
  const tangents = monotoneTangents(points);
  const progress = clamp01((normalizedInput - left.input) / span);
  const progress2 = progress * progress;
  const progress3 = progress2 * progress;
  const h00 = 2 * progress3 - 3 * progress2 + 1;
  const h10 = progress3 - 2 * progress2 + progress;
  const h01 = -2 * progress3 + 3 * progress2;
  const h11 = progress3 - progress2;
  const value = h00 * left.output
    + h10 * span * (tangents[segment] ?? 0)
    + h01 * right.output
    + h11 * span * (tangents[segment + 1] ?? 0);
  return clamp(value, left.output, right.output);
}

/** Maps one valid raw hardware pressure through dead-zone, saturation and a monotone cubic LUT. */
export function studioStylusPressureProfileMap(
  rawPressure: unknown,
  profile: StudioStylusPressureProfile = getStudioStylusPressureProfileSnapshot(),
): number {
  const raw = clamp01(rawPressure, 0);
  if (!profile.enabled) return raw;
  const normalized = clamp01(
    (raw - profile.deadZone) / Math.max(MIN_ACTIVE_PRESSURE_RANGE, profile.saturation - profile.deadZone),
  );
  return interpolateMonotonePressure(normalized, profile.points);
}

/**
 * Preserves malformed/non-hardware samples for the existing pressure validator. Only real pen or
 * force-capable touch pressure is conditioned; mouse and conventional fixed-0.5 touch stay intact.
 */
export function resolveStudioStylusPressureInput(
  pointerType: unknown,
  rawPressure: unknown,
  profile: StudioStylusPressureProfile = getStudioStylusPressureProfileSnapshot(),
): unknown {
  if (
    typeof rawPressure !== "number"
    || !Number.isFinite(rawPressure)
    || rawPressure < 0
    || rawPressure > 1
  ) {
    return rawPressure;
  }
  const normalizedType = typeof pointerType === "string" ? pointerType.toLowerCase() : "";
  const hasHardwarePressure = normalizedType === "pen"
    || (normalizedType === "touch" && rawPressure !== 0.5);
  return hasHardwarePressure
    ? studioStylusPressureProfileMap(rawPressure, profile)
    : rawPressure;
}

function quantile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  const index = clamp01(ratio) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const mix = index - lower;
  return (sorted[lower] ?? 0) * (1 - mix) + (sorted[upper] ?? 0) * mix;
}

/** Builds a robust five-node profile from a light-to-firm calibration stroke. */
export function fitStudioStylusPressureProfile(
  samples: readonly unknown[],
): StudioStylusPressureProfile | null {
  const sorted = samples
    .filter((sample): sample is number => (
      typeof sample === "number"
      && Number.isFinite(sample)
      && sample > 0
      && sample <= 1
    ))
    .sort((left, right) => left - right);
  if (sorted.length < 12) return null;
  const low = quantile(sorted, 0.05);
  const high = quantile(sorted, 0.95);
  if (high - low < 0.12) return null;
  const deadZone = clamp(low * 0.45, 0, 0.12);
  const saturation = clamp(quantile(sorted, 0.985) + 0.015, 0.7, 1);
  const normalizeInput = (raw: number) => clamp01(
    (raw - deadZone) / Math.max(MIN_ACTIVE_PRESSURE_RANGE, saturation - deadZone),
  );
  return normalizeStudioStylusPressureProfile({
    enabled: true,
    deadZone,
    saturation,
    points: [
      { input: 0, output: 0 },
      { input: normalizeInput(quantile(sorted, 0.12)), output: 0.1 },
      { input: normalizeInput(quantile(sorted, 0.5)), output: 0.5 },
      { input: normalizeInput(quantile(sorted, 0.88)), output: 0.9 },
      { input: 1, output: 1 },
    ],
  });
}

let activeProfile: StudioStylusPressureProfile = DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE;
let storageHydrated = false;
let storageListenerInstalled = false;
const profileListeners = new Set<() => void>();

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function hydrateProfileFromStorage(): void {
  if (storageHydrated) return;
  storageHydrated = true;
  const storage = browserStorage();
  if (!storage) return;
  try {
    const serialized = storage.getItem(STUDIO_STYLUS_PRESSURE_PROFILE_STORAGE_KEY);
    if (serialized) activeProfile = normalizeStudioStylusPressureProfile(JSON.parse(serialized));
  } catch {
    // Corrupt/private-mode storage fails closed to the identity profile.
    activeProfile = DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE;
  }
}

function publishProfile(profile: StudioStylusPressureProfile): void {
  activeProfile = profile;
  for (const listener of profileListeners) listener();
}

/** Stable snapshot used by React and by the pointer hot path. */
export function getStudioStylusPressureProfileSnapshot(): StudioStylusPressureProfile {
  hydrateProfileFromStorage();
  return activeProfile;
}

/** Browser-local persistence: documents store calibrated samples, never this device preference. */
export function setStudioStylusPressureProfile(
  value: unknown,
  options: Readonly<{ persist?: boolean }> = {},
): StudioStylusPressureProfile {
  const profile = normalizeStudioStylusPressureProfile(value);
  if (options.persist !== false) {
    const storage = browserStorage();
    if (storage) {
      try {
        storage.setItem(STUDIO_STYLUS_PRESSURE_PROFILE_STORAGE_KEY, JSON.stringify(profile));
      } catch {
        // Drawing remains functional when storage is unavailable or full.
      }
    }
  }
  storageHydrated = true;
  publishProfile(profile);
  return profile;
}

export function resetStudioStylusPressureProfile(
  options: Readonly<{ persist?: boolean }> = {},
): StudioStylusPressureProfile {
  if (options.persist !== false) {
    const storage = browserStorage();
    if (storage) {
      try {
        storage.removeItem(STUDIO_STYLUS_PRESSURE_PROFILE_STORAGE_KEY);
      } catch {
        // Ignore unavailable storage; the in-memory identity reset still applies.
      }
    }
  }
  storageHydrated = true;
  publishProfile(DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE);
  return activeProfile;
}

export function subscribeStudioStylusPressureProfile(listener: () => void): () => void {
  profileListeners.add(listener);
  if (!storageListenerInstalled && typeof window !== "undefined") {
    storageListenerInstalled = true;
    window.addEventListener("storage", (event) => {
      if (event.key !== STUDIO_STYLUS_PRESSURE_PROFILE_STORAGE_KEY) return;
      try {
        publishProfile(event.newValue
          ? normalizeStudioStylusPressureProfile(JSON.parse(event.newValue))
          : DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE);
      } catch {
        publishProfile(DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE);
      }
    });
  }
  return () => profileListeners.delete(listener);
}
