/**
 * Pro drawing prefs shared across CSP / Procreate / Ibis / Krita / SAI workflows.
 *
 * - Size / opacity lock: keep brush size & opacity when switching tools (Procreate / CSP)
 * - Recent built-in brush ids (Ibis / Procreate Recent)
 * - Favorite built-in brush ids (Ibis / CSP material pin lite)
 *
 * Pure preference transforms plus an injected pre-V12 storage codec; no React.
 * Product code uses studio-pro-draw-preferences-sqlite.ts and never opens this legacy key.
 */

import { BRUSH_PRESETS } from "./studio-brush";
import {
  STUDIO_BRUSH_PACK_CATALOG_IDS,
  isStudioBrushPackCatalogId,
} from "./studio-brush-pack-id";

export const STUDIO_PRO_DRAW_PREFS_KEY = "toonspectrum-studio-pro-draw-prefs:v1";
export const STUDIO_RECENT_BRUSH_LIMIT = 6;
/**
 * A professional brush catalogue must not silently stop accepting favorites after a single
 * compact shelf is full. The shelf still projects only the first few entries; persistence keeps
 * the complete artist-curated collection. Deriving the bound from both append-only catalogues
 * makes every currently selectable brush favoriteable without turning malformed storage into an
 * unbounded list.
 */
export const STUDIO_FAVORITE_BRUSH_LIMIT =
  BRUSH_PRESETS.length + STUDIO_BRUSH_PACK_CATALOG_IDS.length;

export interface StudioProDrawPrefsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StudioProDrawPrefs {
  sizeLocked: boolean;
  opacityLocked: boolean;
  /** Core or procedural catalogue ids, newest first. */
  recentBrushIds: string[];
  /** Core or procedural catalogue ids, artist-defined pin order. */
  favoriteBrushIds: string[];
}

export const DEFAULT_STUDIO_PRO_DRAW_PREFS: StudioProDrawPrefs = {
  sizeLocked: false,
  opacityLocked: false,
  recentBrushIds: [],
  favoriteBrushIds: [],
};

const KNOWN_BRUSH_IDS = new Set(BRUSH_PRESETS.map((preset) => preset.id));

function isKnownCatalogBrushId(value: string): boolean {
  return KNOWN_BRUSH_IDS.has(value) || isStudioBrushPackCatalogId(value);
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizeBrushIdList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || !isKnownCatalogBrushId(entry) || seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}

export function normalizeStudioProDrawPrefs(value: unknown): StudioProDrawPrefs {
  if (!value || typeof value !== "object") return { ...DEFAULT_STUDIO_PRO_DRAW_PREFS };
  const record = value as Record<string, unknown>;
  return {
    sizeLocked: asBool(record.sizeLocked, false),
    opacityLocked: asBool(record.opacityLocked, false),
    recentBrushIds: sanitizeBrushIdList(record.recentBrushIds, STUDIO_RECENT_BRUSH_LIMIT),
    favoriteBrushIds: sanitizeBrushIdList(record.favoriteBrushIds, STUDIO_FAVORITE_BRUSH_LIMIT),
  };
}

export function loadStudioProDrawPrefs(
  storage: StudioProDrawPrefsStorage | null | undefined
): StudioProDrawPrefs {
  if (!storage) return { ...DEFAULT_STUDIO_PRO_DRAW_PREFS };
  try {
    const raw = storage.getItem(STUDIO_PRO_DRAW_PREFS_KEY);
    if (!raw) return { ...DEFAULT_STUDIO_PRO_DRAW_PREFS };
    return normalizeStudioProDrawPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STUDIO_PRO_DRAW_PREFS };
  }
}

export function saveStudioProDrawPrefs(
  storage: StudioProDrawPrefsStorage | null | undefined,
  prefs: StudioProDrawPrefs
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STUDIO_PRO_DRAW_PREFS_KEY, JSON.stringify(normalizeStudioProDrawPrefs(prefs)));
    return true;
  } catch {
    return false;
  }
}

export interface StudioProDrawPrefsMutationResult {
  prefs: StudioProDrawPrefs;
  persisted: boolean;
}

export interface StudioProDrawPrefsMutationOptions {
  /**
   * Preserve an in-memory snapshot whose previous write failed, while still retrying persistence.
   * Without this fence, a readable-but-full storage area would resurrect its stale payload.
   */
  preferCurrent?: boolean;
}

/**
 * Applies one preference intent against the freshest persisted snapshot.
 *
 * Studio may be open in a reference monitor, a pen display, and a mobile companion at once.
 * Re-reading immediately before a normal mutation prevents a sequential stale-tab overwrite.
 * The localStorage read/write pair is not a cross-document transaction, so simultaneous writers
 * still follow the browser's last-writer-wins semantics.
 */
export function mutateStudioProDrawPrefs(
  storage: StudioProDrawPrefsStorage | null | undefined,
  current: StudioProDrawPrefs,
  mutate: (latest: StudioProDrawPrefs) => StudioProDrawPrefs,
  options: StudioProDrawPrefsMutationOptions = {},
): StudioProDrawPrefsMutationResult {
  let latest = normalizeStudioProDrawPrefs(current);
  if (storage && options.preferCurrent !== true) {
    try {
      const raw = storage.getItem(STUDIO_PRO_DRAW_PREFS_KEY);
      if (raw) latest = normalizeStudioProDrawPrefs(JSON.parse(raw));
    } catch {
      // Keep the in-memory snapshot usable when storage access or one legacy payload is broken.
    }
  }
  const prefs = normalizeStudioProDrawPrefs(mutate(latest));
  return {
    prefs,
    persisted: saveStudioProDrawPrefs(storage, prefs),
  };
}

/** Procreate-style: switching brushes never overwrites the artist's active color. */
export function applyBrushPresetWithLocks(
  preset: { id: string; defaultWidth: number; defaultOpacity: number; defaultColor?: string },
  locks: Pick<StudioProDrawPrefs, "sizeLocked" | "opacityLocked">,
  current: { strokeWidth: number; brushOpacity: number; color: string },
  options: { operation?: "paint" | "erase" } = {},
): { brushId: string; strokeWidth: number; brushOpacity: number; color: string } {
  return {
    brushId: preset.id,
    strokeWidth: locks.sizeLocked ? current.strokeWidth : preset.defaultWidth,
    // A named eraser's opacity is its destructive strength, not merely a paint-style appearance
    // preference. Preserving 38% while selecting the standard eraser would silently turn its
    // promised full removal into a partial lift, so operation identity takes precedence here.
    brushOpacity:
      locks.opacityLocked && options.operation !== "erase"
        ? current.brushOpacity
        : preset.defaultOpacity,
    // Preset colors are catalogue-preview hints, not drawing-state mutations. Keeping the
    // active color avoids the especially confusing white-on-white stroke after Star Dust.
    color: current.color,
  };
}

export function rememberRecentBrushId(
  prefs: StudioProDrawPrefs,
  brushId: string
): StudioProDrawPrefs {
  if (!isKnownCatalogBrushId(brushId)) return prefs;
  const next = [brushId, ...prefs.recentBrushIds.filter((id) => id !== brushId)].slice(
    0,
    STUDIO_RECENT_BRUSH_LIMIT
  );
  return { ...prefs, recentBrushIds: next };
}

export function toggleFavoriteBrushId(
  prefs: StudioProDrawPrefs,
  brushId: string
): StudioProDrawPrefs {
  if (!isKnownCatalogBrushId(brushId)) return prefs;
  const has = prefs.favoriteBrushIds.includes(brushId);
  if (has) {
    return {
      ...prefs,
      favoriteBrushIds: prefs.favoriteBrushIds.filter((id) => id !== brushId),
    };
  }
  if (prefs.favoriteBrushIds.length >= STUDIO_FAVORITE_BRUSH_LIMIT) return prefs;
  return {
    ...prefs,
    favoriteBrushIds: [...prefs.favoriteBrushIds, brushId],
  };
}

/** Low-latency stabilizer step cycle: 0 → 1 → 2 → 3 → 0. */
export function cycleStudioStabilizerStrength(current: number): number {
  const steps = [0, 1, 2, 3] as const;
  const safe = Number.isFinite(current) ? Math.max(0, Math.min(10, Math.round(current))) : 0;
  const idx = steps.findIndex((step) => step >= safe);
  if (idx === -1) return steps[0];
  if (steps[idx] === safe) return steps[(idx + 1) % steps.length]!;
  return steps[idx]!;
}
