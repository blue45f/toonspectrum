/** Pure material schema shared by browser replay and authoritative collaboration admission. */
export const STUDIO_BRUSH_ENGINE_PROGRAM_STROKE_VERSION = 6 as const;

export type StudioBrushMaterialLicenseProfile =
  | "permissive-only"
  | "source-available"
  | "noncommercial-full";
export type StudioBrushMaterialProviderRights =
  | "internal"
  | "permissive"
  | "copyleft"
  | "noncommercial"
  | "private-grant";
export type StudioBrushMaterialProviderExecution = "native" | "compatibility-adapter";

export interface StudioBrushMaterialProviderBindingContract {
  readonly providerId: string;
  readonly version: string;
  readonly license: string;
  readonly rights: StudioBrushMaterialProviderRights;
  readonly execution: StudioBrushMaterialProviderExecution;
  readonly nodeIds: readonly string[];
}

export interface StudioBrushMaterialRuntimeContract {
  readonly version: 1;
  readonly fallbackPolicy: "none";
  readonly licenseProfile: StudioBrushMaterialLicenseProfile;
  readonly bindings: readonly StudioBrushMaterialProviderBindingContract[];
}

export interface StudioBrushMaterialProgramContract {
  readonly version: 1 | 2;
  readonly seed: number;
  readonly tuning: Readonly<Record<string, number | string>>;
  readonly slots: Readonly<Record<string, string | readonly string[]>>;
  readonly input: Readonly<Record<string, string | number | boolean>>;
  readonly runtime?: StudioBrushMaterialRuntimeContract;
}

function wireRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? value as Record<string, unknown>
    : null;
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
    && Object.entries(expected).every(([key, entry]) =>
      Object.hasOwn(actual, key) && sameCanonicalValue(actual[key], entry));
}

const ID_RE = /^[a-z0-9][a-z0-9.-]{0,127}$/u;
const NODE_ID_RE = /^[a-z][a-z0-9-]{0,79}$/u;
const RIGHTS = new Set<StudioBrushMaterialProviderRights>([
  "internal", "permissive", "copyleft", "noncommercial", "private-grant",
]);
const EXECUTIONS = new Set<StudioBrushMaterialProviderExecution>([
  "native", "compatibility-adapter",
]);
const LICENSE_PROFILES = new Set<StudioBrushMaterialLicenseProfile>([
  "permissive-only", "source-available", "noncommercial-full",
]);

function normalizeProviderBinding(
  raw: unknown,
): StudioBrushMaterialProviderBindingContract | null {
  const source = wireRecord(raw);
  if (!source || Object.keys(source).some((key) => ![
    "providerId", "version", "license", "rights", "execution", "nodeIds",
  ].includes(key))) return null;
  if (typeof source.providerId !== "string" || !ID_RE.test(source.providerId)) return null;
  if (typeof source.version !== "string" || !source.version.trim() || source.version.length > 128) return null;
  if (typeof source.license !== "string" || !source.license.trim() || source.license.length > 192) return null;
  if (typeof source.rights !== "string" || !RIGHTS.has(source.rights as StudioBrushMaterialProviderRights)) return null;
  if (typeof source.execution !== "string" || !EXECUTIONS.has(source.execution as StudioBrushMaterialProviderExecution)) return null;
  if (!Array.isArray(source.nodeIds) || source.nodeIds.length === 0 || source.nodeIds.length > 64) return null;
  if (!source.nodeIds.every((id): id is string => typeof id === "string" && NODE_ID_RE.test(id))) return null;
  if (new Set(source.nodeIds).size !== source.nodeIds.length) return null;
  return Object.freeze({
    providerId: source.providerId,
    version: source.version,
    license: source.license,
    rights: source.rights as StudioBrushMaterialProviderRights,
    execution: source.execution as StudioBrushMaterialProviderExecution,
    nodeIds: Object.freeze([...source.nodeIds]),
  });
}

function normalizeRuntime(raw: unknown): StudioBrushMaterialRuntimeContract | null {
  const source = wireRecord(raw);
  if (!source || Object.keys(source).some((key) => ![
    "version", "fallbackPolicy", "licenseProfile", "bindings",
  ].includes(key))) return null;
  if (source.version !== 1 || source.fallbackPolicy !== "none") return null;
  if (typeof source.licenseProfile !== "string"
    || !LICENSE_PROFILES.has(source.licenseProfile as StudioBrushMaterialLicenseProfile)) return null;
  if (!Array.isArray(source.bindings) || source.bindings.length === 0 || source.bindings.length > 64) return null;
  const bindings: StudioBrushMaterialProviderBindingContract[] = [];
  const bindingKeys = new Set<string>();
  const nodeOwners = new Set<string>();
  for (const candidate of source.bindings) {
    const binding = normalizeProviderBinding(candidate);
    if (!binding) return null;
    const bindingKey = `${binding.providerId}:${binding.execution}`;
    if (bindingKeys.has(bindingKey)) return null;
    bindingKeys.add(bindingKey);
    for (const nodeId of binding.nodeIds) {
      if (nodeOwners.has(nodeId)) return null;
      nodeOwners.add(nodeId);
    }
    bindings.push(binding);
  }
  return Object.freeze({
    version: 1,
    fallbackPolicy: "none",
    licenseProfile: source.licenseProfile as StudioBrushMaterialLicenseProfile,
    bindings: Object.freeze(bindings),
  });
}

/** Wire values must already be canonical: admission never silently drops an unknown material. */
export function isStudioBrushEngineProgramWireValue(value: unknown): boolean {
  const source = wireRecord(value);
  if (!source || source.version !== 1
    || Object.keys(source).some((key) => ![
      "version", "material", "oil", "watercolor", "composition",
    ].includes(key))) return false;
  if (Object.hasOwn(source, "material")) {
    const material = normalizeStudioBrushMaterialProgramContract(source.material);
    if (!material || !sameCanonicalValue(source.material, material)) return false;
  }
  if (Object.hasOwn(source, "oil")) {
    const oil = wireRecord(source.oil);
    const keys = ["bristlePhysics", "bristleLoadDynamics", "impastoRelief"];
    if (!oil || Object.keys(oil).length !== keys.length
      || !keys.every((key) => typeof oil[key] === "boolean")) return false;
  }
  for (const key of ["watercolor", "composition"] as const) {
    if (!Object.hasOwn(source, key)) continue;
    const record = wireRecord(source[key]);
    const allowed = key === "watercolor"
      ? ["wetEdgeBloomProgramId", "livingInkBakeProgramId"]
      : ["motion", "carrier", "tip", "surface", "deposition", "pigment", "pickup", "physics", "pattern", "feedback", "output"];
    if (!record || Object.keys(record).length === 0 || Object.entries(record).some(([name, id]) =>
      !allowed.includes(name) || typeof id !== "string"
      || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(id))) return false;
  }
  return true;
}

/** v6 fails closed on old peers; older payloads must never smuggle renderer overrides. */
export function hasValidStudioBrushEngineProgramExtension(
  version: unknown,
  programs: unknown,
): boolean {
  return programs === undefined
    ? version !== STUDIO_BRUSH_ENGINE_PROGRAM_STROKE_VERSION
    : version === STUDIO_BRUSH_ENGINE_PROGRAM_STROKE_VERSION
      && isStudioBrushEngineProgramWireValue(programs);
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
const TUNING_RANGES: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  size: [1, 240], opacity: [0, 1], flow: [0, 1], spacing: [0.01, 4],
  stabilization: [0, 1], surfaceTooth: [0, 1], friction: [0, 1],
  absorbency: [0, 1], granulation: [0, 1], edgeDarkening: [0, 1],
  pickup: [0, 1], reservoir: [0, 1], wetness: [0, 1], diffusion: [0, 1],
  advection: [0, 1], evaporation: [0, 1], viscosity: [0, 1], plasticity: [0, 1],
  gravity: [-1, 1], bristleStrands: [8, 256], bristleIterations: [1, 12],
  particleCount: [16, 4096], reactionRate: [0, 1], patternDensity: [0, 1],
  patternScale: [0.1, 4], patternJitter: [0, 1], relief: [0, 1], gloss: [0, 1],
});
const INPUT_RANGES: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  pressureOnset: [0, 0.4], pressureSaturation: [0.5, 1], pressureGamma: [0.2, 3],
  pressureHysteresis: [0, 0.2], tiltDeadZoneDeg: [0, 20], tiltSmoothing: [0, 1],
  twistSmoothing: [0, 1],
});
const INPUT_OPTIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  transport: ["auto", "raw-coalesced", "move-coalesced", "move-basic"],
  touchPolicy: ["pen-only", "pen-draw-finger-pan", "pen-draw-two-finger-gesture", "pen-ink-finger-water", "touch-draw"],
  film: ["glass", "matte", "paperlike-fine", "paperlike-rough"],
});

/** Validate persisted contacts without importing the workbench graph registry. */
export function normalizeStudioBrushMaterialProgramContract(
  raw: unknown,
): StudioBrushMaterialProgramContract | null {
  const source = object(raw);
  if (!source || typeof source.seed !== "number" || !Number.isFinite(source.seed)) return null;
  const version = source.version === undefined ? 1 : source.version;
  if (version !== 1 && version !== 2) return null;
  if (source.schemaVersion !== undefined && source.schemaVersion !== 6) return null;
  const sourceTuning = object(source.tuning);
  const sourceSlots = object(source.slots);
  const sourceInput = object(source.input);
  if (!sourceTuning || !sourceSlots || !sourceInput) return null;
  const tuning: Record<string, number | string> = {};
  for (const [key, range] of Object.entries(TUNING_RANGES)) {
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
  for (const key of [
    "input", "motion", "carrier", "tip", "surface", "deposition",
    "pickup", "pigment", "pattern", "output",
  ]) {
    const value = sourceSlots[key];
    if (typeof value !== "string" || !NODE_ID_RE.test(value)) return null;
    slots[key] = value;
  }
  for (const key of ["physics", "finish"]) {
    const value = sourceSlots[key];
    if (!Array.isArray(value) || value.length > 16
      || !value.every((entry): entry is string =>
        typeof entry === "string" && NODE_ID_RE.test(entry))) return null;
    slots[key] = Object.freeze([...new Set(value)]);
  }

  const input: Record<string, string | number | boolean> = {};
  for (const key of [
    "predictionPreviewOnly", "palmRejection", "hoverPreview", "tiltEnabled",
    "audioFeedback", "hapticFeedback",
  ]) {
    if (typeof sourceInput[key] !== "boolean") return null;
    input[key] = sourceInput[key];
  }
  for (const [key, range] of Object.entries(INPUT_RANGES)) {
    const value = sourceInput[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    input[key] = Math.min(range[1], Math.max(range[0], value));
  }
  for (const [key, values] of Object.entries(INPUT_OPTIONS)) {
    const value = sourceInput[key];
    if (typeof value !== "string" || !values.includes(value)) return null;
    input[key] = value;
  }

  const runtime = version === 2 ? normalizeRuntime(source.runtime) : undefined;
  if (version === 2 && !runtime) return null;
  if (version === 1 && source.runtime !== undefined) return null;

  return Object.freeze({
    version,
    seed: Math.round(Math.min(2_147_483_647, Math.max(1, source.seed))),
    tuning: Object.freeze(tuning),
    slots: Object.freeze(slots),
    input: Object.freeze(input),
    ...(runtime ? { runtime } : {}),
  });
}
