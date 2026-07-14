/**
 * Non-destructive smart-filter / adjustment stack (Photopea-style), pure model.
 *
 * Entries map onto existing Studio filter engines (curves, levels, blur, …).
 * Can live on image elements as `smartFilters` or on a dedicated adjustment layer record.
 */

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
  "sharpen",
  "noise",
  "invert",
] as const;

export type StudioAdjustmentEngineId = (typeof STUDIO_ADJUSTMENT_ENGINE_IDS)[number];

export interface StudioAdjustmentEntry {
  id: string;
  engine: StudioAdjustmentEngineId;
  enabled: boolean;
  /** Engine-specific params; normalized loosely (finite numbers only). */
  params: Record<string, number | string | boolean>;
}

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
      return "블러";
    case "sharpen":
      return "샤픈";
    case "noise":
      return "노이즈";
    case "invert":
      return "반전";
    default:
      return engine;
  }
}

/**
 * Map enabled smart-filter stack entries onto flat ImageFilterFields for the existing
 * Konva filter pipeline. Later entries override earlier ones for the same field.
 * Pure; does not mutate base.
 */
export function studioAdjustmentStackToFilterFields(
  stack: unknown
): Record<string, number | boolean | string | undefined> {
  const out: Record<string, number | boolean | string | undefined> = {};
  const entries = normalizeStudioAdjustmentStack(stack).entries.filter((entry) => entry.enabled);
  for (const entry of entries) {
    const p = entry.params;
    switch (entry.engine) {
      case "blur":
        out.blur = finiteNumber(p.radius ?? p.blur, Number(out.blur) || 0);
        break;
      case "brightness-contrast":
        out.brightness = finiteNumber(p.brightness, Number(out.brightness) || 0);
        out.contrast = finiteNumber(p.contrast, Number(out.contrast) || 0);
        break;
      case "hue-saturation":
        out.hue = finiteNumber(p.hue, Number(out.hue) || 0);
        out.saturation = finiteNumber(p.saturation, Number(out.saturation) || 0);
        break;
      case "levels":
        out.levelsBlack = finiteNumber(p.black ?? p.blackPoint, Number(out.levelsBlack) || 0);
        out.levelsWhite = finiteNumber(p.white ?? p.whitePoint, Number(out.levelsWhite) || 255);
        out.levelsGamma = finiteNumber(p.gamma, Number(out.levelsGamma) || 1);
        out.levelsOutBlack = finiteNumber(p.outBlack, Number(out.levelsOutBlack) || 0);
        out.levelsOutWhite = finiteNumber(p.outWhite, Number(out.levelsOutWhite) || 255);
        break;
      case "sharpen":
        out.sharpen = finiteNumber(p.amount ?? p.sharpen, Number(out.sharpen) || 0);
        break;
      case "noise":
        out.noise = finiteNumber(p.amount ?? p.noise, Number(out.noise) || 0);
        break;
      case "invert":
        out.invert = p.invert === false ? false : true;
        break;
      case "curves":
      case "color-balance":
      case "channel-mixer":
      case "gradient-map":
        // Stored non-destructively on the stack; full object engines stay on smartFilters.
        // Preview uses flat engines only until a dedicated compositor lands.
        break;
      default:
        break;
    }
  }
  return out;
}

/** True when the stack has at least one enabled entry that maps to live filter fields. */
export function studioAdjustmentStackHasLivePreview(stack: unknown): boolean {
  return listEnabledStudioAdjustmentEngines(stack).some(
    (engine) =>
      engine === "blur" ||
      engine === "brightness-contrast" ||
      engine === "hue-saturation" ||
      engine === "levels" ||
      engine === "sharpen" ||
      engine === "noise" ||
      engine === "invert"
  );
}
