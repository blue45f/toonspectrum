/**
 * Recent brush slots (1–6).
 * Stores brush id + stroke width + opacity for quick recall.
 * Pure model + localStorage helpers.
 */

import { BRUSH_PRESETS } from "./studio-brush";
import { BRUSH_OPACITY_RANGE, BRUSH_STROKE_WIDTH_RANGE } from "./studio-brush-library";

export const STUDIO_BRUSH_SLOT_COUNT = 6;
export const STUDIO_BRUSH_SLOTS_STORAGE_KEY = "toonspectrum-studio-brush-slots:v1";

export interface StudioBrushSlot {
  brushId: string;
  strokeWidth: number;
  brushOpacity: number;
}

export interface StudioBrushSlotsState {
  slots: (StudioBrushSlot | null)[];
}

export interface StudioBrushSlotsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function clampWidth(n: number): number {
  if (!Number.isFinite(n)) return BRUSH_STROKE_WIDTH_RANGE[0];
  return Math.min(BRUSH_STROKE_WIDTH_RANGE[1], Math.max(BRUSH_STROKE_WIDTH_RANGE[0], Math.round(n)));
}

function clampOpacity(n: number): number {
  if (!Number.isFinite(n)) return BRUSH_OPACITY_RANGE[1];
  return Math.min(BRUSH_OPACITY_RANGE[1], Math.max(BRUSH_OPACITY_RANGE[0], Math.round(n * 100) / 100));
}

function knownBrushId(id: string): boolean {
  return BRUSH_PRESETS.some((p) => p.id === id);
}

export function emptyStudioBrushSlots(): StudioBrushSlotsState {
  return { slots: Array.from({ length: STUDIO_BRUSH_SLOT_COUNT }, () => null) };
}

export function normalizeStudioBrushSlot(value: unknown): StudioBrushSlot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.brushId !== "string" || !knownBrushId(record.brushId)) return null;
  return {
    brushId: record.brushId,
    strokeWidth: clampWidth(Number(record.strokeWidth)),
    brushOpacity: clampOpacity(Number(record.brushOpacity)),
  };
}

export function normalizeStudioBrushSlotsState(value?: unknown): StudioBrushSlotsState {
  const empty = emptyStudioBrushSlots();
  if (!value || typeof value !== "object") return empty;
  const record = value as Record<string, unknown>;
  const raw = Array.isArray(record.slots) ? record.slots : Array.isArray(value) ? value : [];
  const slots = empty.slots.map((_, index) => normalizeStudioBrushSlot(raw[index]));
  return { slots };
}

export function loadStudioBrushSlotsState(
  storage: StudioBrushSlotsStorage | null | undefined
): StudioBrushSlotsState {
  if (!storage) return emptyStudioBrushSlots();
  try {
    const raw = storage.getItem(STUDIO_BRUSH_SLOTS_STORAGE_KEY);
    if (!raw) return emptyStudioBrushSlots();
    return normalizeStudioBrushSlotsState(JSON.parse(raw));
  } catch {
    return emptyStudioBrushSlots();
  }
}

export function saveStudioBrushSlotsState(
  storage: StudioBrushSlotsStorage | null | undefined,
  state: StudioBrushSlotsState
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      STUDIO_BRUSH_SLOTS_STORAGE_KEY,
      JSON.stringify(normalizeStudioBrushSlotsState(state))
    );
    return true;
  } catch {
    return false;
  }
}

/** Push current brush to the front of recent slots (quick recall). */
export function rememberStudioBrushSlot(
  state: StudioBrushSlotsState,
  next: StudioBrushSlot
): StudioBrushSlotsState {
  const slot = normalizeStudioBrushSlot(next);
  if (!slot) return normalizeStudioBrushSlotsState(state);
  const rest = state.slots.filter(
    (item) =>
      item &&
      !(
        item.brushId === slot.brushId &&
        item.strokeWidth === slot.strokeWidth &&
        item.brushOpacity === slot.brushOpacity
      )
  );
  return normalizeStudioBrushSlotsState({
    slots: [slot, ...rest].slice(0, STUDIO_BRUSH_SLOT_COUNT),
  });
}

/** Assign current brush into a numbered slot (1–6). */
export function assignStudioBrushSlot(
  state: StudioBrushSlotsState,
  index: number,
  next: StudioBrushSlot
): StudioBrushSlotsState {
  if (!Number.isInteger(index) || index < 0 || index >= STUDIO_BRUSH_SLOT_COUNT) {
    return normalizeStudioBrushSlotsState(state);
  }
  const slot = normalizeStudioBrushSlot(next);
  const slots = [...normalizeStudioBrushSlotsState(state).slots];
  slots[index] = slot;
  return { slots };
}

export function studioBrushSlotAt(
  state: StudioBrushSlotsState,
  index: number
): StudioBrushSlot | null {
  if (!Number.isInteger(index) || index < 0 || index >= STUDIO_BRUSH_SLOT_COUNT) return null;
  return normalizeStudioBrushSlotsState(state).slots[index] ?? null;
}
