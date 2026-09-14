import { normalizeHexColor } from "./studio-color-utils";

export interface StudioStrokeVisibilityBackup {
  readonly stroke: string;
  readonly opacity: number;
}

const DEFAULT_STROKE = "#16100c";
const DEFAULT_OPACITY = 1;
const MAX_BACKUPS = 512;
const backups = new Map<string, StudioStrokeVisibilityBackup>();

function normalizeOpacity(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0.1, Math.min(1, value))
    : fallback;
}

/** Returns the last visible stroke values recorded for one stable element id. */
export function readStudioStrokeVisibilityBackup(
  elementId: string,
): StudioStrokeVisibilityBackup | null {
  return backups.get(elementId) ?? null;
}

/**
 * Stores a bounded, element-scoped restoration record so hiding a stroke survives inspector
 * remounts and selection changes without adding transient UI state to the document schema.
 */
export function rememberStudioStrokeVisibilityBackup(
  elementId: string,
  patch: Partial<StudioStrokeVisibilityBackup>,
): StudioStrokeVisibilityBackup {
  const previous = backups.get(elementId) ?? Object.freeze({
    stroke: DEFAULT_STROKE,
    opacity: DEFAULT_OPACITY,
  });
  const next = Object.freeze({
    stroke: (patch.stroke ? normalizeHexColor(patch.stroke) : null) ?? previous.stroke,
    opacity: normalizeOpacity(patch.opacity, previous.opacity),
  });

  backups.delete(elementId);
  backups.set(elementId, next);
  while (backups.size > MAX_BACKUPS) {
    const oldestElementId = backups.keys().next().value;
    if (oldestElementId === undefined) break;
    backups.delete(oldestElementId);
  }
  return next;
}

/** Clears module state between isolated component tests. */
export function resetStudioStrokeVisibilityMemoryForTests(): void {
  backups.clear();
}
