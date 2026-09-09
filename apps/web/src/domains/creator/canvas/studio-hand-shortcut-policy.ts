import type { StudioAppSettings } from "../studio-app-settings";

export const STUDIO_HAND_SHORTCUT = "H";
export const STUDIO_TEMPORARY_HAND_SHORTCUT = "Space";
export const STUDIO_CANVAS_FLIP_FALLBACK_SHORTCUT = "Alt+H";

export interface StudioHandShortcutMigration {
  readonly handShortcut: string;
  readonly canvasFlipShortcut: string;
}

export interface StudioHandShortcutBoundaryInput {
  readonly defaultPrevented: boolean;
  readonly isComposing: boolean;
  readonly keyCode: number;
  readonly repeat: boolean;
  readonly typing: boolean;
  readonly insideShortcutBoundary: boolean;
  readonly openModal: boolean;
}

function normalizedShortcut(value: string) {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

/**
 * Migrates the shipped conflict in which `Space` was registered as a normal
 * tool shortcut even though it is already the temporary-hand modifier, while
 * `H` was simultaneously advertised for Hand and assigned to canvas flip.
 * Custom user mappings are never rewritten.
 */
export function planStudioHandShortcutMigration(
  shortcuts: StudioAppSettings["shortcuts"]
): StudioHandShortcutMigration | null {
  const handShortcut = normalizedShortcut(shortcuts["tool-hand"]);
  const canvasFlipShortcut = normalizedShortcut(shortcuts["flip-canvas"]);
  if (handShortcut !== "space" || canvasFlipShortcut !== "h") return null;

  return {
    handShortcut: STUDIO_HAND_SHORTCUT,
    canvasFlipShortcut: STUDIO_CANVAS_FLIP_FALLBACK_SHORTCUT,
  };
}

export function isStudioPersistentHandShortcut(shortcut: string) {
  const normalized = normalizedShortcut(shortcut);
  return normalized.length > 0 && normalized !== "space";
}

/** Shared safety gate for a Studio-global tool shortcut. */
export function shouldDispatchStudioHandShortcut(
  input: StudioHandShortcutBoundaryInput
) {
  return !(
    input.defaultPrevented ||
    input.isComposing ||
    input.keyCode === 229 ||
    input.repeat ||
    input.typing ||
    input.insideShortcutBoundary ||
    input.openModal
  );
}
