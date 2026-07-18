/**
 * Pro drawing prefs shared across CSP / Procreate / Ibis / Krita / SAI workflows.
 *
 * - Size / opacity lock: keep brush size & opacity when switching tools (Procreate / CSP)
 * - Recent built-in brush ids (Ibis / Procreate Recent)
 * - Favorite built-in brush ids (Ibis / CSP material pin lite)
 *
 * Pure + localStorage injectable; no React.
 */

import { BRUSH_PRESETS } from "./studio-brush";

export const STUDIO_PRO_DRAW_PREFS_KEY = "toonspectrum-studio-pro-draw-prefs:v1";
export const STUDIO_RECENT_BRUSH_LIMIT = 6;
export const STUDIO_FAVORITE_BRUSH_LIMIT = 12;

export interface StudioProDrawPrefsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StudioProDrawPrefs {
  sizeLocked: boolean;
  opacityLocked: boolean;
  /** Built-in BRUSH_PRESETS ids, newest first. */
  recentBrushIds: string[];
  /** Built-in BRUSH_PRESETS ids, pin order. */
  favoriteBrushIds: string[];
}

export const DEFAULT_STUDIO_PRO_DRAW_PREFS: StudioProDrawPrefs = {
  sizeLocked: false,
  opacityLocked: false,
  recentBrushIds: [],
  favoriteBrushIds: [],
};

const KNOWN_BRUSH_IDS = new Set(BRUSH_PRESETS.map((preset) => preset.id));

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizeBrushIdList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || !KNOWN_BRUSH_IDS.has(entry) || seen.has(entry)) continue;
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

/** Procreate-style: switching brushes never overwrites the artist's active color. */
export function applyBrushPresetWithLocks(
  preset: { id: string; defaultWidth: number; defaultOpacity: number; defaultColor?: string },
  locks: Pick<StudioProDrawPrefs, "sizeLocked" | "opacityLocked">,
  current: { strokeWidth: number; brushOpacity: number; color: string }
): { brushId: string; strokeWidth: number; brushOpacity: number; color: string } {
  return {
    brushId: preset.id,
    strokeWidth: locks.sizeLocked ? current.strokeWidth : preset.defaultWidth,
    brushOpacity: locks.opacityLocked ? current.brushOpacity : preset.defaultOpacity,
    // Preset colors are catalogue-preview hints, not drawing-state mutations. Keeping the
    // active color avoids the especially confusing white-on-white stroke after Star Dust.
    color: current.color,
  };
}

export function rememberRecentBrushId(
  prefs: StudioProDrawPrefs,
  brushId: string
): StudioProDrawPrefs {
  if (!KNOWN_BRUSH_IDS.has(brushId)) return prefs;
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
  if (!KNOWN_BRUSH_IDS.has(brushId)) return prefs;
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

/** SAI/CSP-like stabilizer step cycle: 0 → 3 → 6 → 10 → 0 */
export function cycleStudioStabilizerStrength(current: number): number {
  const steps = [0, 3, 6, 10] as const;
  const safe = Number.isFinite(current) ? Math.max(0, Math.min(10, Math.round(current))) : 0;
  const idx = steps.findIndex((step) => step >= safe);
  if (idx === -1) return steps[0];
  if (steps[idx] === safe) return steps[(idx + 1) % steps.length]!;
  return steps[idx]!;
}

export function studioProDrawStorage(): StudioProDrawPrefsStorage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}
