/**
 * Non-destructive smart-filter / adjustment stack (Photopea-style), pure model.
 *
 * Entries map onto existing Studio filter engines (curves, levels, blur, …).
 * Can live on image elements as `smartFilters` or on a dedicated adjustment layer record.
 */

import type {
  StudioClouds,
  StudioConvolution,
  StudioExposureAdjustment,
  StudioMorphology,
  StudioPixelOffset,
  StudioUnsharpMask,
} from "./studio-advanced-pixel-filters";
import type { ChannelMixer } from "./studio-channel-mixer";
import type { ColorBalance } from "./studio-color-balance";
import type { CurvePoint } from "./studio-curves";
import type { GradientMap } from "./studio-gradient-map";

export const STUDIO_ADJUSTMENT_STACK_VERSION = 1 as const;
export const STUDIO_ADJUSTMENT_STACK_MAX_ENTRIES = 24;

export const STUDIO_ADJUSTMENT_ENGINE_IDS = [
  "curves",
  "levels",
  "brightness-contrast",
  "hue-saturation",
  "color-balance",
  "channel-mixer",
  "gradient-map",
  "blur",
  /** Blur gallery engines (map onto blurFx). */
  "gaussian-blur",
  "motion-blur",
  "sharpen",
  "noise",
  "invert",
  "exposure",
  "unsharp-mask",
  "morphology",
  "offset",
  "custom-convolution",
  "clouds",
] as const;

export type StudioAdjustmentEngineId = (typeof STUDIO_ADJUSTMENT_ENGINE_IDS)[number];

/** Every recognized engine is discoverable; legacy stacks and the add catalog cannot drift. */
export const STUDIO_ADJUSTMENT_ADDABLE_ENGINE_IDS = STUDIO_ADJUSTMENT_ENGINE_IDS;

/** All catalog engines now project into the shared Konva/Worker filter chain. */
export function studioAdjustmentEngineHasLivePreview(engine: StudioAdjustmentEngineId): boolean {
  return STUDIO_ADJUSTMENT_ENGINE_IDS.includes(engine);
}

/** Defaults used only for newly added entries; old empty entries remain visual no-ops. */
export function studioAdjustmentDefaultParams(
  engine: StudioAdjustmentEngineId,
): Record<string, number | string | boolean> {
  switch (engine) {
    case "curves":
      return { preset: "soft-contrast" };
    case "color-balance":
      return { preset: "cinematic" };
    case "channel-mixer":
      return { preset: "mono-balanced" };
    case "gradient-map":
      return { preset: "teal-orange" };
    case "blur":
      return { radius: 2 };
    case "gaussian-blur":
      return { radius: 8, strength: 70 };
    case "motion-blur":
      return { radius: 18, strength: 85, angle: 0 };
    case "brightness-contrast":
      return { brightness: 0.12, contrast: 10 };
    case "hue-saturation":
      return { hue: 0, saturation: 0.2 };
    case "levels":
      return { black: 0, white: 255, gamma: 1, outBlack: 0, outWhite: 255 };
    case "sharpen":
      return { amount: 0.3 };
    case "noise":
      return { amount: 15, seed: 1_337 };
    case "invert":
      return {};
    case "exposure":
      return { exposure: 0.5, gamma: 1, offset: 0 };
    case "unsharp-mask":
      return { amount: 0.8, radius: 2, threshold: 8 };
    case "morphology":
      return { mode: "erode", radius: 1 };
    case "offset":
      return { x: 12, y: 12, edge: "transparent" };
    case "custom-convolution":
      return {
        k0: 0, k1: -1, k2: 0,
        k3: -1, k4: 5, k5: -1,
        k6: 0, k7: -1, k8: 0,
        divisor: 1,
        bias: 0,
      };
    case "clouds":
      return { amount: 0.35, scale: 96, seed: 1_337, mode: "overlay" };
  }
}

export interface StudioAdjustmentEntry {
  id: string;
  engine: StudioAdjustmentEngineId;
  enabled: boolean;
  /** Engine-specific params; normalized loosely (finite numbers only). */
  params: Record<string, number | string | boolean>;
}

/** Clone-safe, ordered operation sent to the Konva/Worker compositor. */
export type StudioAdjustmentFilterOperation = Readonly<StudioAdjustmentEntry>;

export interface StudioAdjustmentStack {
  version: typeof STUDIO_ADJUSTMENT_STACK_VERSION;
  entries: readonly StudioAdjustmentEntry[];
}

const ENGINE_SET = new Set<string>(STUDIO_ADJUSTMENT_ENGINE_IDS);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeParams(value: unknown): Record<string, number | string | boolean> {
  const source = asRecord(value);
  if (!source) return {};
  const out: Record<string, number | string | boolean> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (key.length > 48) continue;
    if (typeof raw === "number" && Number.isFinite(raw)) out[key] = raw;
    else if (typeof raw === "boolean") out[key] = raw;
    else if (typeof raw === "string" && raw.length <= 128) out[key] = raw;
  }
  return out;
}

function normalizeEntry(value: unknown, index: number): StudioAdjustmentEntry | null {
  const source = asRecord(value);
  if (!source) return null;
  const engine = typeof source.engine === "string" && ENGINE_SET.has(source.engine)
    ? (source.engine as StudioAdjustmentEngineId)
    : null;
  if (!engine) return null;
  const id = typeof source.id === "string" && source.id.trim().length > 0
    ? source.id.trim().slice(0, 80)
    : `adj-${index + 1}`;
  return {
    id,
    engine,
    enabled: source.enabled !== false,
    params: normalizeParams(source.params),
  };
}

export function createEmptyStudioAdjustmentStack(): StudioAdjustmentStack {
  return { version: STUDIO_ADJUSTMENT_STACK_VERSION, entries: [] };
}

export function normalizeStudioAdjustmentStack(value?: unknown): StudioAdjustmentStack {
  const source = asRecord(value);
  if (!source) return createEmptyStudioAdjustmentStack();
  const list = Array.isArray(source.entries) ? source.entries : Array.isArray(value) ? value : [];
  const entries: StudioAdjustmentEntry[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < list.length && entries.length < STUDIO_ADJUSTMENT_STACK_MAX_ENTRIES; index += 1) {
    const entry = normalizeEntry(list[index], index);
    if (!entry) continue;
    let id = entry.id;
    if (seen.has(id)) id = `${id}-${index}`;
    seen.add(id);
    entries.push({ ...entry, id });
  }
  return { version: STUDIO_ADJUSTMENT_STACK_VERSION, entries };
}

export function studioAdjustmentStackEqual(left?: unknown, right?: unknown): boolean {
  return JSON.stringify(normalizeStudioAdjustmentStack(left))
    === JSON.stringify(normalizeStudioAdjustmentStack(right));
}

export function appendStudioAdjustmentEntry(
  stack: unknown,
  entry: Partial<StudioAdjustmentEntry> & { engine: StudioAdjustmentEngineId }
): StudioAdjustmentStack {
  const current = normalizeStudioAdjustmentStack(stack);
  if (current.entries.length >= STUDIO_ADJUSTMENT_STACK_MAX_ENTRIES) return current;
  const next = normalizeEntry(
    {
      id: entry.id,
      engine: entry.engine,
      enabled: entry.enabled,
      params: entry.params,
    },
    current.entries.length
  );
  if (!next) return current;
  return normalizeStudioAdjustmentStack({
    entries: [...current.entries, next],
  });
}

export function reorderStudioAdjustmentEntry(
  stack: unknown,
  fromIndex: number,
  toIndex: number
): StudioAdjustmentStack {
  const current = normalizeStudioAdjustmentStack(stack);
  const from = Math.trunc(finiteNumber(fromIndex, -1));
  const to = Math.trunc(finiteNumber(toIndex, -1));
  if (from < 0 || to < 0 || from >= current.entries.length || to >= current.entries.length) {
    return current;
  }
  if (from === to) return current;
  const entries = [...current.entries];
  const [moved] = entries.splice(from, 1);
  if (!moved) return current;
  entries.splice(to, 0, moved);
  return { version: STUDIO_ADJUSTMENT_STACK_VERSION, entries };
}

export function setStudioAdjustmentEntryEnabled(
  stack: unknown,
  entryId: string,
  enabled: boolean
): StudioAdjustmentStack {
  const current = normalizeStudioAdjustmentStack(stack);
  return {
    version: STUDIO_ADJUSTMENT_STACK_VERSION,
    entries: current.entries.map((entry) =>
      entry.id === entryId ? { ...entry, enabled: Boolean(enabled) } : entry
    ),
  };
}

export function removeStudioAdjustmentEntry(stack: unknown, entryId: string): StudioAdjustmentStack {
  const current = normalizeStudioAdjustmentStack(stack);
  return {
    version: STUDIO_ADJUSTMENT_STACK_VERSION,
    entries: current.entries.filter((entry) => entry.id !== entryId),
  };
}

/** Enabled engines in paint order (bottom → top). */
export function listEnabledStudioAdjustmentEngines(
  stack: unknown
): readonly StudioAdjustmentEngineId[] {
  return normalizeStudioAdjustmentStack(stack).entries
    .filter((entry) => entry.enabled)
    .map((entry) => entry.engine);
}

/** Enabled entries in exact paint order. Duplicates are intentionally retained. */
export function listEnabledStudioAdjustmentOperations(
  stack: unknown
): readonly StudioAdjustmentFilterOperation[] {
  return normalizeStudioAdjustmentStack(stack).entries
    .filter((entry) => entry.enabled)
    .map((entry) => ({ ...entry, params: { ...entry.params } }));
}

/** Runtime boundary for a Worker-projected operation array. */
export function normalizeStudioAdjustmentFilterOperations(
  value: unknown
): readonly StudioAdjustmentFilterOperation[] {
  return listEnabledStudioAdjustmentOperations({
    version: STUDIO_ADJUSTMENT_STACK_VERSION,
    entries: Array.isArray(value) ? value : [],
  });
}

export function studioAdjustmentEngineLabel(engine: StudioAdjustmentEngineId): string {
  switch (engine) {
    case "curves":
      return "곡선";
    case "levels":
      return "레벨";
    case "brightness-contrast":
      return "밝기/대비";
    case "hue-saturation":
      return "색조/채도";
    case "color-balance":
      return "색 균형";
    case "channel-mixer":
      return "채널 믹서";
    case "gradient-map":
      return "그라디언트 맵";
    case "blur":
      return "빠른 블러";
    case "gaussian-blur":
      return "가우시안 블러";
    case "motion-blur":
      return "모션 블러";
    case "sharpen":
      return "샤픈";
    case "noise":
      return "노이즈";
    case "invert":
      return "반전";
    case "exposure":
      return "노출 / 감마 / 오프셋";
    case "unsharp-mask":
      return "언샤프 마스크";
    case "morphology":
      return "팽창 / 침식";
    case "offset":
      return "픽셀 오프셋";
    case "custom-convolution":
      return "사용자 컨볼루션";
    case "clouds":
      return "구름 텍스처";
    default:
      return engine;
  }
}

export type StudioAdjustmentEntryFilterFields = {
  blur?: number;
  brightness?: number;
  contrast?: number;
  hue?: number;
  saturation?: number;
  levelsBlack?: number;
  levelsWhite?: number;
  levelsGamma?: number;
  levelsOutBlack?: number;
  levelsOutWhite?: number;
  sharpen?: number;
  noise?: number;
  noiseSeed?: number;
  invert?: boolean;
  /** Gaussian/motion blur gallery — applied via studio-blur Konva filter. */
  blurFx?: {
    type: "gaussian" | "motion" | "spin" | "zoom";
    strength: number;
    radius: number;
    angle: number;
  };
  curve?: CurvePoint[];
  colorBalance?: ColorBalance;
  channelMixer?: ChannelMixer;
  gradientMap?: GradientMap;
  exposureAdjustment?: StudioExposureAdjustment;
  unsharpMask?: StudioUnsharpMask;
  morphology?: StudioMorphology;
  pixelOffset?: StudioPixelOffset;
  convolution?: StudioConvolution;
  clouds?: StudioClouds;
};

/** Projection spread onto an image element without flattening away order or duplicate engines. */
export type StudioAdjustmentFilterFields = StudioAdjustmentEntryFilterFields & {
  smartFilterOperations?: readonly StudioAdjustmentFilterOperation[];
};

function stringParam(
  value: string | number | boolean | undefined,
  allowed: readonly string[],
): string | null {
  return typeof value === "string" && allowed.includes(value) ? value : null;
}

function curvePreset(preset: string | null): CurvePoint[] | undefined {
  switch (preset) {
    case "soft-contrast":
      return [{ x: 0, y: 0 }, { x: 64, y: 52 }, { x: 192, y: 206 }, { x: 255, y: 255 }];
    case "matte":
      return [{ x: 0, y: 20 }, { x: 72, y: 68 }, { x: 190, y: 195 }, { x: 255, y: 240 }];
    case "fade":
      return [{ x: 0, y: 30 }, { x: 128, y: 136 }, { x: 255, y: 235 }];
    default:
      return undefined;
  }
}

function colorBalancePreset(preset: string | null): ColorBalance | undefined {
  switch (preset) {
    case "warm":
      return { shadows: [12, 0, -6], midtones: [8, 3, -6], highlights: [18, 8, -12] };
    case "cool":
      return { shadows: [-10, 0, 18], midtones: [-4, 0, 10], highlights: [-8, -2, 14] };
    case "cinematic":
      return { shadows: [-8, 2, 16], midtones: [4, 0, -4], highlights: [16, 6, -12] };
    case "sunset":
      return { shadows: [14, 2, -6], midtones: [10, 4, -8], highlights: [22, 14, -16] };
    default:
      return undefined;
  }
}

function channelMixerPreset(preset: string | null): ChannelMixer | undefined {
  const identity = {
    red: { r: 1, g: 0, b: 0, constant: 0 },
    green: { r: 0, g: 1, b: 0, constant: 0 },
    blue: { r: 0, g: 0, b: 1, constant: 0 },
  };
  switch (preset) {
    case "mono-balanced":
      return {
        ...identity,
        red: { r: 0.33, g: 0.33, b: 0.33, constant: 0 },
        monochrome: true,
      };
    case "red-boost":
      return { ...identity, red: { r: 1.2, g: 0, b: 0, constant: 0 }, monochrome: false };
    case "swap-gbr":
      return {
        red: { r: 0, g: 1, b: 0, constant: 0 },
        green: { r: 0, g: 0, b: 1, constant: 0 },
        blue: { r: 1, g: 0, b: 0, constant: 0 },
        monochrome: false,
      };
    default:
      return undefined;
  }
}

function gradientMapPreset(preset: string | null): GradientMap | undefined {
  switch (preset) {
    case "mono":
      return { stops: [{ pos: 0, color: "#000000" }, { pos: 1, color: "#ffffff" }] };
    case "sepia":
      return { stops: [{ pos: 0, color: "#1a0f00" }, { pos: 1, color: "#fff1cf" }] };
    case "teal-orange":
      return {
        stops: [
          { pos: 0, color: "#06243a" },
          { pos: 0.5, color: "#3a6b7a" },
          { pos: 1, color: "#ffb066" },
        ],
      };
    case "sunset":
      return {
        stops: [
          { pos: 0, color: "#000000" },
          { pos: 0.35, color: "#5a1a4a" },
          { pos: 0.7, color: "#e0662a" },
          { pos: 1, color: "#ffe07a" },
        ],
      };
    default:
      return undefined;
  }
}

function stableOperationSeed(id: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/** Convert one operation only. Keeping this unit isolated lets duplicate engines retain attrs. */
export function studioAdjustmentOperationToFilterFields(
  value: StudioAdjustmentFilterOperation,
): StudioAdjustmentEntryFilterFields {
  const entry = normalizeEntry(value, 0);
  if (!entry?.enabled) return {};
  const out: StudioAdjustmentEntryFilterFields = {};
  const p = entry.params;
  switch (entry.engine) {
      case "blur":
        out.blur = finiteNumber(p.radius ?? p.blur, 0);
        break;
      case "gaussian-blur": {
        const radius = finiteNumber(p.radius, 8);
        const strength = finiteNumber(p.strength, 70);
        out.blurFx = {
          type: "gaussian",
          strength: Math.min(100, Math.max(0, strength)),
          radius: Math.min(40, Math.max(1, radius)),
          angle: 0,
        };
        break;
      }
      case "motion-blur": {
        const radius = finiteNumber(p.radius ?? p.distance, 18);
        const strength = finiteNumber(p.strength, 85);
        const angle = finiteNumber(p.angle, 0);
        out.blurFx = {
          type: "motion",
          strength: Math.min(100, Math.max(0, strength)),
          radius: Math.min(40, Math.max(1, radius)),
          angle: ((angle % 360) + 360) % 360,
        };
        break;
      }
      case "brightness-contrast":
        out.brightness = finiteNumber(p.brightness, 0);
        out.contrast = finiteNumber(p.contrast, 0);
        break;
      case "hue-saturation":
        out.hue = finiteNumber(p.hue, 0);
        out.saturation = finiteNumber(p.saturation, 0);
        break;
      case "levels":
        out.levelsBlack = finiteNumber(p.black ?? p.blackPoint, 0);
        out.levelsWhite = finiteNumber(p.white ?? p.whitePoint, 255);
        out.levelsGamma = finiteNumber(p.gamma, 1);
        out.levelsOutBlack = finiteNumber(p.outBlack, 0);
        out.levelsOutWhite = finiteNumber(p.outWhite, 255);
        break;
      case "sharpen":
        out.sharpen = finiteNumber(p.amount ?? p.sharpen, 0);
        break;
      case "noise":
        out.noise = finiteNumber(p.amount ?? p.noise, 0);
        out.noiseSeed = finiteNumber(p.seed, stableOperationSeed(entry.id));
        break;
      case "invert":
        out.invert = p.invert === false ? false : true;
        break;
      case "curves": {
        const curve = curvePreset(stringParam(p.preset, ["soft-contrast", "matte", "fade"]));
        if (curve) out.curve = curve;
        break;
      }
      case "color-balance": {
        const balance = colorBalancePreset(stringParam(p.preset, ["warm", "cool", "cinematic", "sunset"]));
        if (balance) out.colorBalance = balance;
        break;
      }
      case "channel-mixer": {
        const mixer = channelMixerPreset(stringParam(p.preset, ["mono-balanced", "red-boost", "swap-gbr"]));
        if (mixer) out.channelMixer = mixer;
        break;
      }
      case "gradient-map": {
        const map = gradientMapPreset(stringParam(p.preset, ["mono", "sepia", "teal-orange", "sunset"]));
        if (map) out.gradientMap = map;
        break;
      }
      case "exposure":
        out.exposureAdjustment = {
          exposure: finiteNumber(p.exposure, 0),
          gamma: finiteNumber(p.gamma, 1),
          offset: finiteNumber(p.offset, 0),
        };
        break;
      case "unsharp-mask":
        out.unsharpMask = {
          amount: finiteNumber(p.amount, 0),
          radius: finiteNumber(p.radius, 1),
          threshold: finiteNumber(p.threshold, 0),
        };
        break;
      case "morphology":
        out.morphology = {
          mode: p.mode === "erode" ? "erode" : "dilate",
          radius: finiteNumber(p.radius, 0),
        };
        break;
      case "offset":
        out.pixelOffset = {
          x: finiteNumber(p.x, 0),
          y: finiteNumber(p.y, 0),
          edge: p.edge === "wrap" || p.edge === "clamp" ? p.edge : "transparent",
        };
        break;
      case "custom-convolution":
        out.convolution = {
          kernel: Array.from({ length: 9 }, (_, index) => finiteNumber(p[`k${index}`], index === 4 ? 1 : 0)),
          divisor: finiteNumber(p.divisor, 1),
          bias: finiteNumber(p.bias, 0),
        };
        break;
      case "clouds":
        out.clouds = {
          amount: finiteNumber(p.amount, 0),
          scale: finiteNumber(p.scale, 96),
          seed: finiteNumber(p.seed, 1_337),
          mode: p.mode === "multiply" || p.mode === "screen" ? p.mode : "overlay",
        };
        break;
      default:
        break;
  }
  return out;
}

/**
 * Preserve the enabled smart-filter program as an ordered clone-safe operation array. Flattening
 * into one field bag made later duplicate engines overwrite earlier ones and let the fixed Konva
 * category order silently replace the user's stack order.
 */
export function studioAdjustmentStackToFilterFields(
  stack: unknown
): StudioAdjustmentFilterFields {
  const smartFilterOperations = listEnabledStudioAdjustmentOperations(stack);
  if (smartFilterOperations.length === 0) return {};
  const projection: StudioAdjustmentFilterFields = { smartFilterOperations };
  const legacyFlatFields = smartFilterOperations.reduce<StudioAdjustmentEntryFilterFields>(
    (fields, operation) => Object.assign(
      fields,
      studioAdjustmentOperationToFilterFields(operation)
    ),
    {}
  );
  // Old direct API consumers still read `fields.blur`/`fields.brightness`. Keep those getters as
  // non-enumerable compatibility fields: StudioPage spreads this projection onto an image, so
  // enumerating the legacy bag would apply every adjustment twice before the ordered program.
  for (const [key, value] of Object.entries(legacyFlatFields)) {
    Object.defineProperty(projection, key, {
      configurable: false,
      enumerable: false,
      value,
      writable: false,
    });
  }
  return projection;
}

/** True when the stack has at least one enabled entry that maps to live filter fields. */
export function studioAdjustmentStackHasLivePreview(stack: unknown): boolean {
  return listEnabledStudioAdjustmentEngines(stack).some(studioAdjustmentEngineHasLivePreview);
}
