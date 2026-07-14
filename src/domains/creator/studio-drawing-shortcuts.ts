import {
  BRUSH_OPACITY_RANGE,
  BRUSH_STROKE_WIDTH_RANGE,
} from "./studio-brush-library";

export type StudioDrawingShortcut =
  | { type: "select-pen" }
  | { type: "toggle-eraser" }
  | { type: "adjust-width"; delta: number }
  | { type: "adjust-opacity"; delta: number };

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

function physicalCode(event: StudioDrawingShortcutEvent): string {
  if (event.code) {
    if (event.code === "b" || event.code === "B") return "KeyB";
    if (event.code === "e" || event.code === "E") return "KeyE";
    if (event.code === "[" || event.code === "{") return "BracketLeft";
    if (event.code === "]" || event.code === "}") return "BracketRight";
    return event.code;
  }
  const key = event.key?.toLowerCase();
  if (key === "b") return "KeyB";
  if (key === "e") return "KeyE";
  if (key === "[") return "BracketLeft";
  if (key === "]") return "BracketRight";
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
