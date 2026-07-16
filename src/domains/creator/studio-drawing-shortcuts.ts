import {
  BRUSH_OPACITY_RANGE,
  BRUSH_STROKE_WIDTH_RANGE,
} from "./studio-brush-library";

export type StudioDrawingShortcut =
  | { type: "select-pen" }
  | { type: "toggle-eraser" }
  | { type: "adjust-width"; delta: number }
  | { type: "adjust-opacity"; delta: number }
  /** Magma-style recent brush slot recall (0–5). */
  | { type: "recall-brush-slot"; index: number }
  /** Toggle canvas-first chrome (Backquote; Tab stays native browser navigation). */
  | { type: "toggle-chrome" }
  /** CSP / Photoshop: swap primary ↔ secondary color (X). */
  | { type: "swap-colors" }
  /** CSP / Photoshop: reset to ink black / paper white (D). */
  | { type: "default-colors" }
  /** SAI / CSP: cycle stabilizer strength. */
  | { type: "cycle-stabilizer" }
  /** Procreate / CSP: flip canvas horizontally. */
  | { type: "toggle-canvas-flip-h" }
  /** Procreate: toggle size lock when switching brushes. */
  | { type: "toggle-size-lock" }
  /** Procreate: toggle opacity lock when switching brushes. */
  | { type: "toggle-opacity-lock" };

export interface StudioDrawingShortcutEvent {
  code?: string;
  key?: string;
  keyCode?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
}

export interface StudioShortcutFocusContext {
  tagName?: string;
  role?: string | null;
  tabIndex?: number;
  isContentEditable?: boolean;
  canvasViewportFocused?: boolean;
}

/**
 * Keep browser focus navigation intact. The chrome shortcut is allowed only
 * while the explicit canvas viewport owns focus; Tab itself never resolves to
 * this action, so both forward and reverse traversal can always leave canvas.
 */
export function shouldPreserveStudioTabNavigation(
  context: StudioShortcutFocusContext
): boolean {
  return !context.canvasViewportFocused;
}

function physicalCode(event: StudioDrawingShortcutEvent): string {
  if (event.code) {
    if (event.code === "b" || event.code === "B") return "KeyB";
    if (event.code === "e" || event.code === "E") return "KeyE";
    if (event.code === "x" || event.code === "X") return "KeyX";
    if (event.code === "d" || event.code === "D") return "KeyD";
    if (event.code === "s" || event.code === "S") return "KeyS";
    if (event.code === "f" || event.code === "F") return "KeyF";
    if (event.code === "[" || event.code === "{") return "BracketLeft";
    if (event.code === "]" || event.code === "}") return "BracketRight";
    return event.code;
  }
  const key = event.key?.toLowerCase();
  if (key === "b") return "KeyB";
  if (key === "e") return "KeyE";
  if (key === "x") return "KeyX";
  if (key === "d") return "KeyD";
  if (key === "s") return "KeyS";
  if (key === "f") return "KeyF";
  if (key === "[") return "BracketLeft";
  if (key === "]") return "BracketRight";
  if (key === "`" || key === "~") return "Backquote";
  return "";
}

/**
 * 물리 키 기준 드로잉 단축키 해석. Cmd/Ctrl 조합은 기존 레이어·줌 명령이 우선하도록 전부 넘긴다.
 * Shift/Option에서 event.key가 `{`, 특수 따옴표 등으로 바뀌어도 event.code로 브래킷을 인식한다.
 */
export function resolveStudioDrawingShortcut(
  event: StudioDrawingShortcutEvent
): StudioDrawingShortcut | null {
  if (event.isComposing || event.keyCode === 229 || event.metaKey || event.ctrlKey) return null;
  const code = physicalCode(event);

  if (code === "KeyB" && !event.altKey && !event.repeat) return { type: "select-pen" };
  if (code === "KeyE" && !event.altKey && !event.repeat) return { type: "toggle-eraser" };

  // Digit1–6 → recent brush slots (no modifiers). Shift+Digit assigns is handled by caller.
  if (!event.altKey && !event.shiftKey && !event.repeat) {
    const digitMatch = /^Digit([1-6])$/.exec(code);
    if (digitMatch) {
      return { type: "recall-brush-slot", index: Number(digitMatch[1]) - 1 };
    }
  }

  // Backquote toggles canvas chrome. Tab must remain native focus navigation.
  if (code === "Backquote" && !event.altKey && !event.shiftKey && !event.repeat) {
    return { type: "toggle-chrome" };
  }

  // CSP / Photoshop color keys (no modifiers — Cmd+D remains duplicate).
  if (code === "KeyX" && !event.altKey && !event.shiftKey && !event.repeat) {
    return { type: "swap-colors" };
  }
  if (code === "KeyD" && !event.altKey && !event.shiftKey && !event.repeat) {
    return { type: "default-colors" };
  }
  // SAI / CSP stabilizer cycle; Shift+S = size lock, Alt+S = opacity lock (Procreate-adjacent).
  if (code === "KeyS" && !event.repeat) {
    if (event.shiftKey && !event.altKey) return { type: "toggle-size-lock" };
    if (event.altKey && !event.shiftKey) return { type: "toggle-opacity-lock" };
    if (!event.altKey && !event.shiftKey) return { type: "cycle-stabilizer" };
  }
  if (code === "KeyF" && !event.altKey && !event.shiftKey && !event.repeat) {
    return { type: "toggle-canvas-flip-h" };
  }

  if (code === "BracketLeft" || code === "BracketRight") {
    const direction = code === "BracketLeft" ? -1 : 1;
    if (event.altKey) return { type: "adjust-opacity", delta: direction * 0.05 };
    return { type: "adjust-width", delta: direction * (event.shiftKey ? 5 : 1) };
  }
  return null;
}

export function adjustStudioBrushWidth(current: number, delta: number): number {
  const safeCurrent = Number.isFinite(current) ? current : BRUSH_STROKE_WIDTH_RANGE[0];
  const safeDelta = Number.isFinite(delta) ? delta : 0;
  return Math.min(
    BRUSH_STROKE_WIDTH_RANGE[1],
    Math.max(BRUSH_STROKE_WIDTH_RANGE[0], Math.round(safeCurrent + safeDelta))
  );
}

export function adjustStudioBrushOpacity(current: number, delta: number): number {
  const safeCurrent = Number.isFinite(current) ? current : BRUSH_OPACITY_RANGE[1];
  const safeDelta = Number.isFinite(delta) ? delta : 0;
  const rounded = Math.round((safeCurrent + safeDelta) * 100) / 100;
  return Math.min(BRUSH_OPACITY_RANGE[1], Math.max(BRUSH_OPACITY_RANGE[0], rounded));
}
