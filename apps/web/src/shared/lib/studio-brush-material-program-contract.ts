/** Pure material schema shared by the browser renderer and authoritative collaboration admission. */
export const STUDIO_BRUSH_ENGINE_PROGRAM_STROKE_VERSION = 6 as const;

export interface StudioBrushMaterialProgramContract {
  readonly version: 1;
  readonly seed: number;
  readonly tuning: Readonly<Record<string, number | string>>;
  readonly slots: Readonly<Record<string, string | readonly string[]>>;
  readonly input: Readonly<Record<string, string | number | boolean>>;
}

function wireRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : null;
}

function sameCanonicalValue(value: unknown, canonical: unknown): boolean {
  if (Object.is(value, canonical)) return true;
  if (Array.isArray(canonical)) {
    return Array.isArray(value) && value.length === canonical.length
      && canonical.every((entry, index) => sameCanonicalValue(value[index], entry));
  }
  const expected = wireRecord(canonical);
  const actual = wireRecord(value);
  return expected !== null && actual !== null
    && Object.keys(actual).length === Object.keys(expected).length
    && Object.entries(expected).every(([key, entry]) => Object.hasOwn(actual, key) && sameCanonicalValue(actual[key], entry));
}

/** Wire values must already be canonical: admission never silently drops an unknown material. */
export function isStudioBrushEngineProgramWireValue(value: unknown): boolean {
  const source = wireRecord(value);
  if (!source || source.version !== 1
    || Object.keys(source).some((key) => !["version", "material", "oil", "watercolor", "composition"].includes(key))) return false;
  if (Object.hasOwn(source, "material")) {
    const material = normalizeStudioBrushMaterialProgramContract(source.material);
    if (!material || !sameCanonicalValue(source.material, material)) return false;
  }
  if (Object.hasOwn(source, "oil")) {
    const oil = wireRecord(source.oil);
    const keys = ["bristlePhysics", "bristleLoadDynamics", "impastoRelief"];
    if (!oil || Object.keys(oil).length !== keys.length || !keys.every((key) => typeof oil[key] === "boolean")) return false;
  }
  for (const key of ["watercolor", "composition"] as const) {
    if (!Object.hasOwn(source, key)) continue;
    const record = wireRecord(source[key]);
    const allowed = key === "watercolor"
      ? ["wetEdgeBloomProgramId", "livingInkBakeProgramId"]
      : ["motion", "carrier", "tip", "surface", "deposition", "pigment", "pickup", "physics", "pattern", "feedback", "output"];
    if (!record || Object.keys(record).length === 0 || Object.entries(record).some(([name, id]) =>
      !allowed.includes(name) || typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(id))) return false;
  }
  return true;
}

/** v6 fails closed on old peers; older payloads must never smuggle renderer overrides. */
export function hasValidStudioBrushEngineProgramExtension(version: unknown, programs: unknown): boolean {
  return programs === undefined
    ? version !== STUDIO_BRUSH_ENGINE_PROGRAM_STROKE_VERSION
    : version === STUDIO_BRUSH_ENGINE_PROGRAM_STROKE_VERSION && isStudioBrushEngineProgramWireValue(programs);
}

/** Validate persisted contacts without importing the workbench's graph registry. */
export function normalizeStudioBrushMaterialProgramContract(raw: unknown): StudioBrushMaterialProgramContract | null {
  const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const source = object(raw);
  if (!source || typeof source.seed !== "number" || !Number.isFinite(source.seed) || source.version !== undefined && source.version !== 1 || source.schemaVersion !== undefined && source.schemaVersion !== 6) return null;
  const sourceTuning = object(source.tuning);
  const sourceSlots = object(source.slots);
  const sourceInput = object(source.input);
  if (!sourceTuning || !sourceSlots || !sourceInput) return null;
  const tuning: Record<string, number | string> = {};
  const ranges: Readonly<Record<string, readonly [number, number]>> = { size: [1, 240], opacity: [0, 1], flow: [0, 1], spacing: [0.01, 4], stabilization: [0, 1], surfaceTooth: [0, 1], friction: [0, 1], absorbency: [0, 1], granulation: [0, 1], edgeDarkening: [0, 1], pickup: [0, 1], reservoir: [0, 1], wetness: [0, 1], diffusion: [0, 1], advection: [0, 1], evaporation: [0, 1], viscosity: [0, 1], plasticity: [0, 1], gravity: [-1, 1], bristleStrands: [8, 256], bristleIterations: [1, 12], particleCount: [16, 4096], reactionRate: [0, 1], patternDensity: [0, 1], patternScale: [0.1, 4], patternJitter: [0, 1], relief: [0, 1], gloss: [0, 1] };
  for (const [key, range] of Object.entries(ranges)) {
    const value = sourceTuning[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    tuning[key] = Math.min(range[1], Math.max(range[0], value));
  }
  for (const key of ["primaryColor", "secondaryColor"]) {
    const value = sourceTuning[key];
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/iu.test(value)) return null;
    tuning[key] = value.toLowerCase();
  }
  const slots: Record<string, string | readonly string[]> = {};
  for (const key of ["input", "motion", "carrier", "tip", "surface", "deposition", "pickup", "pigment", "pattern", "output"]) {
    const value = sourceSlots[key];
    if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,79}$/u.test(value)) return null;
    slots[key] = value;
  }
  for (const key of ["physics", "finish"]) {
    const value = sourceSlots[key];
    if (!Array.isArray(value) || value.length > 16 || !value.every((entry): entry is string => typeof entry === "string" && /^[a-z][a-z0-9-]{0,79}$/u.test(entry))) return null;
    slots[key] = Object.freeze([...new Set(value)]);
  }
  const input: Record<string, string | number | boolean> = {};
  for (const key of ["predictionPreviewOnly", "palmRejection", "hoverPreview", "tiltEnabled", "audioFeedback", "hapticFeedback"]) {
    if (typeof sourceInput[key] !== "boolean") return null;
    input[key] = sourceInput[key];
  }
  const inputRanges: Readonly<Record<string, readonly [number, number]>> = { pressureOnset: [0, 0.4], pressureSaturation: [0.5, 1], pressureGamma: [0.2, 3], pressureHysteresis: [0, 0.2], tiltDeadZoneDeg: [0, 20], tiltSmoothing: [0, 1], twistSmoothing: [0, 1] };
  for (const [key, range] of Object.entries(inputRanges)) {
    const value = sourceInput[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    input[key] = Math.min(range[1], Math.max(range[0], value));
  }
  const inputOptions: Readonly<Record<string, readonly string[]>> = { transport: ["auto", "raw-coalesced", "move-coalesced", "move-basic"], touchPolicy: ["pen-only", "pen-draw-finger-pan", "pen-draw-two-finger-gesture", "pen-ink-finger-water", "touch-draw"], film: ["glass", "matte", "paperlike-fine", "paperlike-rough"] };
  for (const [key, values] of Object.entries(inputOptions)) {
    const value = sourceInput[key];
    if (typeof value !== "string" || !values.includes(value)) return null;
    input[key] = value;
  }
  return Object.freeze({ version: 1, seed: Math.round(Math.min(2147483647, Math.max(1, source.seed))), tuning: Object.freeze(tuning), slots: Object.freeze(slots), input: Object.freeze(input) }) as unknown as StudioBrushMaterialProgramContract;
}
