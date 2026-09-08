import {
  countActiveStudioLayerFilters,
  normalizeStudioLayerNavigatorFilters,
  type StudioLayerNavigatorFilters,
} from "./studio-layer-navigator";

export const STUDIO_LAYER_FILTER_PRESET_STORAGE_KEY = "toonspectrum-studio-layer-filter-presets:v1";
export const STUDIO_LAYER_FILTER_PRESET_LIMIT = 8;

export interface StudioLayerFilterPreset {
  id: string;
  name: string;
  filters: StudioLayerNavigatorFilters;
  createdAt: number;
  updatedAt: number;
}

interface StudioLayerFilterPresetPayload {
  version: 1;
  presets: readonly StudioLayerFilterPreset[];
}

let fallbackPresetSequence = 0;

function normalizePresetName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 40);
}

function normalizePresetId(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 96);
}

function normalizeTimestamp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

export function cloneStudioLayerNavigatorFilters(
  filters: StudioLayerNavigatorFilters
): StudioLayerNavigatorFilters {
  const normalized = normalizeStudioLayerNavigatorFilters(filters);
  return {
    ...normalized,
    flags: [...normalized.flags],
  };
}

export function normalizeStudioLayerFilterPreset(
  value: unknown,
  fallbackTimestamp = 0
): StudioLayerFilterPreset | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StudioLayerFilterPreset>;
  const id = normalizePresetId(candidate.id);
  const name = normalizePresetName(candidate.name);
  if (!id || !name || !candidate.filters || typeof candidate.filters !== "object") return null;
  const filters = cloneStudioLayerNavigatorFilters(candidate.filters);
  if (countActiveStudioLayerFilters(filters) === 0) return null;
  const createdAt = normalizeTimestamp(candidate.createdAt, fallbackTimestamp);
  const updatedAt = normalizeTimestamp(candidate.updatedAt, createdAt);
  return {
    id,
    name,
    filters,
    createdAt,
    updatedAt: Math.max(createdAt, updatedAt),
  };
}

export function normalizeStudioLayerFilterPresets(
  value: unknown,
  maximum = STUDIO_LAYER_FILTER_PRESET_LIMIT
): readonly StudioLayerFilterPreset[] {
  let source: readonly unknown[] = [];
  if (Array.isArray(value)) {
    source = value;
  } else if (value && typeof value === "object") {
    const payload = value as Partial<StudioLayerFilterPresetPayload>;
    if (payload.version !== 1 || !Array.isArray(payload.presets)) return [];
    source = payload.presets;
  }
  const limit = Math.max(1, Math.floor(maximum));
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const result: StudioLayerFilterPreset[] = [];
  for (const entry of source) {
    const preset = normalizeStudioLayerFilterPreset(entry);
    if (!preset) continue;
    const nameKey = preset.name.toLocaleLowerCase("ko-KR");
    if (seenIds.has(preset.id) || seenNames.has(nameKey)) continue;
    seenIds.add(preset.id);
    seenNames.add(nameKey);
    result.push(preset);
    if (result.length >= limit) break;
  }
  return result;
}

export function parseStudioLayerFilterPresets(serialized: string | null | undefined): readonly StudioLayerFilterPreset[] {
  if (!serialized || serialized.length > 64 * 1024) return [];
  try {
    return normalizeStudioLayerFilterPresets(JSON.parse(serialized) as unknown);
  } catch {
    return [];
  }
}

export function serializeStudioLayerFilterPresets(presets: readonly StudioLayerFilterPreset[]): string {
  const payload: StudioLayerFilterPresetPayload = {
    version: 1,
    presets: normalizeStudioLayerFilterPresets(presets),
  };
  return JSON.stringify(payload);
}

function createPresetId(now: number): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;
  fallbackPresetSequence += 1;
  return `layer-filter-${now.toString(36)}-${fallbackPresetSequence.toString(36)}`;
}

export function saveStudioLayerFilterPreset(
  current: readonly StudioLayerFilterPreset[],
  input: {
    name: string;
    filters: StudioLayerNavigatorFilters;
    now?: number;
    id?: string;
  }
): readonly StudioLayerFilterPreset[] {
  const name = normalizePresetName(input.name);
  const filters = cloneStudioLayerNavigatorFilters(input.filters);
  if (!name || countActiveStudioLayerFilters(filters) === 0) return normalizeStudioLayerFilterPresets(current);
  const now = normalizeTimestamp(input.now, Date.now());
  const normalizedCurrent = normalizeStudioLayerFilterPresets(current);
  const nameKey = name.toLocaleLowerCase("ko-KR");
  const existing = normalizedCurrent.find((preset) => preset.name.toLocaleLowerCase("ko-KR") === nameKey);
  const next: StudioLayerFilterPreset = {
    id: existing?.id ?? (normalizePresetId(input.id) || createPresetId(now)),
    name,
    filters,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return [next, ...normalizedCurrent.filter((preset) => preset.id !== next.id)]
    .slice(0, STUDIO_LAYER_FILTER_PRESET_LIMIT);
}

export function removeStudioLayerFilterPreset(
  current: readonly StudioLayerFilterPreset[],
  id: string
): readonly StudioLayerFilterPreset[] {
  const normalizedId = normalizePresetId(id);
  return normalizeStudioLayerFilterPresets(current).filter((preset) => preset.id !== normalizedId);
}
