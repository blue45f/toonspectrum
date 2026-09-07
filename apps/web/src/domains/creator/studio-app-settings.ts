/**
 * Studio Application Settings — commercial-editor-grade prefs (IA only; no brand clone).
 *
 * Settings tabs:
 * General · Shortcuts · Mouse · Touch · Toolbar · Grids · Other
 *
 * Pure model + localStorage; React UI lives in StudioAppSettingsPanel.
 */

import {
  DEFAULT_STUDIO_TOOL_HINT_MODE,
  DEFAULT_STUDIO_TOOL_HINT_TOUCH_HOLD_MS,
  normalizeStudioToolHintMode,
  normalizeStudioToolHintTouchHoldMs,
  type StudioToolHintMode,
} from "./studio-tool-hint-preferences";
import {
  DEFAULT_STUDIO_UI_DENSITY_MODE,
  normalizeStudioUiDensityMode,
  type StudioUiDensityMode,
} from "./studio-ui-density";

export const STUDIO_APP_SETTINGS_STORAGE_KEY = "toonspectrum-studio-app-settings:v1";

export const STUDIO_APP_SETTINGS_TABS = [
  "general",
  "shortcuts",
  "mouse",
  "touch",
  "toolbar",
  "grids",
  "other",
] as const;
export type StudioAppSettingsTab = (typeof STUDIO_APP_SETTINGS_TABS)[number];

/**
 * Left tool-rail catalog — order matches the professional groups in `studio-chrome-ia-map`.
 * Labels prefer plain task language; familiar editor terms remain searchable aliases elsewhere.
 */
export const STUDIO_RAIL_TOOL_CATALOG = [
  { id: "select", label: "선택", labelKey: "studio.settings.tool.select", defaultShortcut: "V" },
  { id: "hand", label: "화면 이동", labelKey: "studio.settings.tool.hand", defaultShortcut: "Space" },
  { id: "pen", label: "펜", labelKey: "studio.settings.tool.pen", defaultShortcut: "B" },
  { id: "pixel-pencil", label: "픽셀 펜", labelKey: "studio.settings.tool.pixelPencil", defaultShortcut: "P" },
  { id: "eraser", label: "지우개", labelKey: "studio.settings.tool.eraser", defaultShortcut: "E" },
  { id: "blend", label: "색 경계 섞기", labelKey: "studio.settings.tool.blend", defaultShortcut: "N" },
  { id: "wet-mix", label: "물감처럼 섞어 칠하기", labelKey: "studio.settings.tool.wetMix", defaultShortcut: "Shift+N" },
  { id: "dodge-burn", label: "밝게·어둡게 칠하기", labelKey: "studio.settings.tool.dodgeBurn", defaultShortcut: "O" },
  { id: "liquify", label: "밀어서 모양 바꾸기", labelKey: "studio.settings.tool.liquify", defaultShortcut: "J" },
  { id: "fill", label: "색 채우기", labelKey: "studio.settings.tool.fill", defaultShortcut: "G" },
  { id: "lasso-fill", label: "올가미 채우기", labelKey: "studio.settings.tool.lassoFill", defaultShortcut: "" },
  { id: "eyedropper", label: "색 가져오기", labelKey: "studio.settings.tool.eyedropper", defaultShortcut: "I" },
  { id: "marquee-rect", label: "사각 선택", labelKey: "studio.settings.tool.marqueeRect", defaultShortcut: "M" },
  { id: "marquee-circle", label: "원형 선택", labelKey: "studio.settings.tool.marqueeCircle", defaultShortcut: "Shift+M" },
  { id: "lasso", label: "올가미 선택", labelKey: "studio.settings.tool.lasso", defaultShortcut: "L" },
  { id: "transform", label: "크기·회전 바꾸기", labelKey: "studio.settings.tool.transform", defaultShortcut: "Shift+T" },
  { id: "crop", label: "자르기", labelKey: "studio.settings.tool.crop", defaultShortcut: "C" },
  { id: "smart-shape", label: "스마트 도형", labelKey: "studio.settings.tool.smartShape", defaultShortcut: "" },
  { id: "shape-rect", label: "사각형 도형", labelKey: "studio.settings.tool.shapeRect", defaultShortcut: "" },
  { id: "shape-ellipse", label: "타원 도형", labelKey: "studio.settings.tool.shapeEllipse", defaultShortcut: "" },
  { id: "text", label: "텍스트", labelKey: "studio.settings.tool.text", defaultShortcut: "T" },
  { id: "bubble", label: "말풍선", labelKey: "studio.settings.tool.bubble", defaultShortcut: "T" },
  { id: "image", label: "이미지·소재", labelKey: "studio.settings.tool.image", defaultShortcut: "" },
  { id: "comment", label: "위치 댓글", labelKey: "studio.settings.tool.comment", defaultShortcut: "Alt+C" },
  { id: "perspective", label: "투시 가이드", labelKey: "studio.settings.tool.perspective", defaultShortcut: "" },
  { id: "frame-anim", label: "프레임 애니메이션", labelKey: "studio.settings.tool.frameAnim", defaultShortcut: "" },
  { id: "mannequin3d", label: "3D 데생 인형", labelKey: "studio.settings.tool.mannequin", defaultShortcut: "" },
  { id: "vrm3d", label: "3D 캐릭터", labelKey: "studio.settings.tool.vrm3d", defaultShortcut: "" },
  { id: "character-shaper", label: "3D 캐릭터 만들기", labelKey: "studio.settings.tool.characterShaper", defaultShortcut: "" },
  { id: "bg3d", label: "3D 배경", labelKey: "studio.settings.tool.bg3d", defaultShortcut: "" },
  { id: "hybrid-dcc", label: "외부 3D 편집 연결", labelKey: "studio.settings.tool.hybridDcc", defaultShortcut: "" },
  { id: "reference", label: "참고 이미지", labelKey: "studio.settings.tool.reference", defaultShortcut: "" },
  { id: "zoom", label: "화면 확대·축소", labelKey: "studio.settings.tool.zoom", defaultShortcut: "Z" },
  { id: "zoom-fit", label: "화면 맞춤", labelKey: "studio.settings.tool.zoomFit", defaultShortcut: "Home" },
  { id: "rotate-view", label: "화면 회전", labelKey: "studio.settings.tool.rotateView", defaultShortcut: "R" },
] as const;

export type StudioRailToolId = (typeof STUDIO_RAIL_TOOL_CATALOG)[number]["id"];

/** Complete professional order used by the toolbar customizer and the “all tools” surface. */
export const DEFAULT_STUDIO_RAIL_TOOL_ORDER: StudioRailToolId[] = STUDIO_RAIL_TOOL_CATALOG.map(
  (tool) => tool.id
);

/**
 * Predictable first-run rail: one clear path for select → draw → colour → text/assets → fit.
 * Persisted users keep their own `visibleIds`; this list is only the fallback for new/invalid state.
 */
export const DEFAULT_STUDIO_RAIL_VISIBLE_IDS = [
  "select",
  "pen",
  "eraser",
  "fill",
  "eyedropper",
  "text",
  "bubble",
  "image",
  "zoom-fit",
] as const satisfies readonly StudioRailToolId[];

/** Customizable shortcut action ids (subset wired in StudioPage). */
export const STUDIO_SHORTCUT_ACTIONS = [
  { id: "tool-select", label: "선택", labelKey: "studio.settings.shortcut.toolSelect", defaultKeys: "V" },
  { id: "tool-hand", label: "화면 이동", labelKey: "studio.settings.shortcut.toolHand", defaultKeys: "Space" },
  { id: "tool-pen", label: "펜", labelKey: "studio.settings.shortcut.toolPen", defaultKeys: "B" },
  { id: "tool-pixel", label: "픽셀 펜", labelKey: "studio.settings.shortcut.toolPixel", defaultKeys: "P" },
  { id: "tool-eraser", label: "지우개", labelKey: "studio.settings.shortcut.toolEraser", defaultKeys: "E" },
  { id: "tool-fill", label: "색 채우기", labelKey: "studio.settings.shortcut.toolFill", defaultKeys: "G" },
  { id: "tool-eyedropper", label: "색 가져오기", labelKey: "studio.settings.shortcut.toolEyedropper", defaultKeys: "I" },
  { id: "tool-lasso", label: "올가미 선택", labelKey: "studio.settings.shortcut.toolLasso", defaultKeys: "L" },
  { id: "tool-marquee", label: "사각 선택", labelKey: "studio.settings.shortcut.toolMarqueeRect", defaultKeys: "M" },
  { id: "tool-marquee-circle", label: "원형 선택", labelKey: "studio.settings.shortcut.toolMarqueeCircle", defaultKeys: "Shift+M" },
  { id: "tool-transform", label: "크기·회전 바꾸기", labelKey: "studio.settings.shortcut.toolTransform", defaultKeys: "Shift+T" },
  { id: "tool-crop", label: "자르기", labelKey: "studio.settings.shortcut.toolCrop", defaultKeys: "C" },
  { id: "tool-comment", label: "위치 댓글", labelKey: "studio.settings.shortcut.toolComment", defaultKeys: "Alt+C" },
  { id: "tool-blend", label: "색 경계 섞기", labelKey: "studio.settings.shortcut.toolBlend", defaultKeys: "N" },
  { id: "tool-wet-mix", label: "물감처럼 섞어 칠하기", labelKey: "studio.settings.shortcut.toolWetMix", defaultKeys: "Shift+N" },
  { id: "tool-dodge-burn", label: "밝게·어둡게 칠하기", labelKey: "studio.settings.shortcut.toolDodgeBurn", defaultKeys: "O" },
  { id: "tool-liquify", label: "밀어서 모양 바꾸기", labelKey: "studio.settings.shortcut.toolLiquify", defaultKeys: "J" },
  { id: "tool-lettering", label: "글자·말풍선", labelKey: "studio.settings.shortcut.toolLettering", defaultKeys: "T" },
  { id: "tool-zoom", label: "화면 확대·축소", labelKey: "studio.settings.tool.zoom", defaultKeys: "Z" },
  { id: "tool-rotate-view", label: "화면 회전", labelKey: "studio.settings.tool.rotateView", defaultKeys: "R" },
  { id: "undo", label: "실행취소", labelKey: "studio.settings.shortcut.undo", defaultKeys: "Mod+Z" },
  { id: "redo", label: "다시실행", labelKey: "studio.settings.shortcut.redo", defaultKeys: "Mod+Shift+Z" },
  { id: "deselect-pixels", label: "선택 해제", labelKey: "studio.settings.shortcut.deselectPixels", defaultKeys: "Mod+D" },
  { id: "invert-pixels", label: "픽셀 선택 반전", labelKey: "studio.settings.shortcut.invertPixels", defaultKeys: "Mod+Shift+I" },
  { id: "toggle-chrome", label: "캔버스만 보기", labelKey: "studio.settings.shortcut.toggleCanvas", defaultKeys: "`" },
  { id: "swap-colors", label: "주·보조 색 교체", labelKey: "studio.settings.shortcut.swapColors", defaultKeys: "X" },
  { id: "brush-smaller", label: "브러시 작게", labelKey: "studio.settings.shortcut.brushSmaller", defaultKeys: "[" },
  { id: "brush-larger", label: "브러시 크게", labelKey: "studio.settings.shortcut.brushLarger", defaultKeys: "]" },
  { id: "flip-canvas", label: "캔버스 좌우 반전(보기)", labelKey: "studio.settings.shortcut.flipCanvas", defaultKeys: "H" },
  { id: "reset-view", label: "화면 리셋(줌·위치·반전)", labelKey: "studio.settings.shortcut.resetView", defaultKeys: "Shift+0" },
  { id: "zoom-to-selection", label: "선택 영역으로 확대", labelKey: "studio.settings.shortcut.zoomToSelection", defaultKeys: "Shift+F" },
  { id: "flip-selection-h", label: "선택 좌우 반전", labelKey: "studio.settings.shortcut.flipSelectionH", defaultKeys: "Shift+H" },
  { id: "flip-selection-v", label: "선택 상하 반전", labelKey: "studio.settings.shortcut.flipSelectionV", defaultKeys: "Shift+V" },
  { id: "shortcuts-help", label: "단축키 도움말", labelKey: "studio.settings.shortcut.help", defaultKeys: "?" },
  { id: "toggle-transparent-color", label: "투명색으로 그리기", labelKey: "studio.settings.shortcut.toggleTransparentColor", defaultKeys: "Shift+C" },
  { id: "new-layer", label: "새 픽셀 레이어", labelKey: "studio.settings.shortcut.newLayer", defaultKeys: "Mod+Shift+N" },
  { id: "merge-layer-down", label: "아래 레이어와 합치기", labelKey: "studio.settings.shortcut.mergeLayerDown", defaultKeys: "Mod+E" },
  { id: "duplicate-layer", label: "레이어 복제", labelKey: "studio.settings.shortcut.duplicateLayer", defaultKeys: "Mod+J" },
  { id: "group-layers", label: "선택 레이어 그룹화", labelKey: "studio.settings.shortcut.groupLayers", defaultKeys: "Mod+G" },
  { id: "fit-view", label: "화면 크기에 맞춤", labelKey: "studio.settings.shortcut.fitView", defaultKeys: "Mod+0" },
  { id: "actual-size-view", label: "100% 원본 보기", labelKey: "studio.settings.shortcut.actualSizeView", defaultKeys: "Mod+1" },
] as const;

export type StudioShortcutActionId = (typeof STUDIO_SHORTCUT_ACTIONS)[number]["id"];

export type StudioMouseWheelAction = "zoom" | "pan" | "brush-size";
export type StudioMouseButtonAction = "pan" | "zoom" | "eyedropper" | "context" | "none";
export type StudioTouchOneFinger = "draw" | "pan" | "none";
export type StudioTouchTwoFinger = "pan-zoom" | "undo-redo";
export type StudioTouchThreeFinger = "undo" | "toggle-ui" | "none";
export type StudioBrushCursorStyle = "outline" | "dot" | "none";

export type StudioAppSettings = {
  general: {
    densityMode: StudioUiDensityMode;
    toolHintMode: StudioToolHintMode;
    brushCursorStyle: StudioBrushCursorStyle;
    /** Show the transient pointer-to-ink tether while an input stabilizer is visibly trailing. */
    showStrokeGuide: boolean;
    confirmBeforeClearLayer: boolean;
  };
  /** actionId → key chord string (e.g. "Mod+Shift+Z", "B"). Empty = unbound. */
  shortcuts: Record<StudioShortcutActionId, string>;
  mouse: {
    wheel: StudioMouseWheelAction;
    reverseWheel: boolean;
    middleButton: StudioMouseButtonAction;
    rightButton: StudioMouseButtonAction;
  };
  touch: {
    oneFingerDrag: StudioTouchOneFinger;
    twoFinger: StudioTouchTwoFinger;
    threeFinger: StudioTouchThreeFinger;
    palmRejection: boolean;
    toolHintHoldMs: number;
  };
  toolbar: {
    /** Visible rail tools in order. Hidden tools are catalog ids not in this list. */
    visibleIds: StudioRailToolId[];
  };
  grids: {
    showCanvasRulers: boolean;
    showPixelGrid: boolean;
    pixelGridSize: number;
    snapToPixelGrid: boolean;
    showAlignmentGuides: boolean;
    showIsometricOnDraw: boolean;
  };
  other: {
    pressureCurve: number;
    reduceMotion: boolean;
  };
};

export type StudioAppSettingsStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

const PIXEL_GRID_SIZES = [10, 20, 30, 40, 50, 60, 80, 100] as const;

export const DEFAULT_STUDIO_SNAP_TO_PIXEL_GRID = false;
export const DEFAULT_STUDIO_SHOW_ALIGNMENT_GUIDES = false;

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function asNum(v: unknown, fallback: number, lo: number, hi: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
}

function asEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function defaultStudioShortcuts(): Record<StudioShortcutActionId, string> {
  const out = {} as Record<StudioShortcutActionId, string>;
  for (const action of STUDIO_SHORTCUT_ACTIONS) {
    out[action.id] = action.defaultKeys;
  }
  return out;
}

export function defaultStudioAppSettings(): StudioAppSettings {
  return {
    general: {
      densityMode: DEFAULT_STUDIO_UI_DENSITY_MODE,
      toolHintMode: DEFAULT_STUDIO_TOOL_HINT_MODE,
      brushCursorStyle: "outline",
      // Keep the latency-critical surface opt-in. Artists who use strong stabilization can enable
      // the guide explicitly; zero-cost drawing remains the default on mouse, pen and mobile.
      showStrokeGuide: false,
      confirmBeforeClearLayer: true,
    },
    shortcuts: defaultStudioShortcuts(),
    mouse: {
      wheel: "zoom",
      reverseWheel: false,
      middleButton: "pan",
      rightButton: "context",
    },
    touch: {
      oneFingerDrag: "draw",
      twoFinger: "pan-zoom",
      threeFinger: "undo",
      palmRejection: true,
      toolHintHoldMs: DEFAULT_STUDIO_TOOL_HINT_TOUCH_HOLD_MS,
    },
    toolbar: {
      visibleIds: [...DEFAULT_STUDIO_RAIL_VISIBLE_IDS],
    },
    grids: {
      // Precision chrome should never reduce the first-open canvas.
      // Alignment assist behaviors are intentionally OFF by default to avoid
      // unintended snap artifacts, and are enabled only when the user opts in.
      showCanvasRulers: false,
      showPixelGrid: false,
      pixelGridSize: 40,
      snapToPixelGrid: DEFAULT_STUDIO_SNAP_TO_PIXEL_GRID,
      showAlignmentGuides: DEFAULT_STUDIO_SHOW_ALIGNMENT_GUIDES,
      showIsometricOnDraw: false,
    },
    other: {
      pressureCurve: 1,
      reduceMotion: false,
    },
  };
}

export function isStudioRailToolId(value: unknown): value is StudioRailToolId {
  return typeof value === "string" && STUDIO_RAIL_TOOL_CATALOG.some((tool) => tool.id === value);
}

export function isStudioShortcutActionId(value: unknown): value is StudioShortcutActionId {
  return typeof value === "string" && STUDIO_SHORTCUT_ACTIONS.some((action) => action.id === value);
}

/** Normalize visible rail order: unique and catalog-only; invalid empty state gets the guided rail. */
export function normalizeStudioRailVisibleIds(value: unknown): StudioRailToolId[] {
  const catalog = new Set(DEFAULT_STUDIO_RAIL_TOOL_ORDER);
  const seen = new Set<StudioRailToolId>();
  const out: StudioRailToolId[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!isStudioRailToolId(entry) || seen.has(entry) || !catalog.has(entry)) continue;
      seen.add(entry);
      out.push(entry);
    }
  }
  // New/invalid state gets a compact, predictable creation path. All other tools stay in More.
  if (out.length === 0) return [...DEFAULT_STUDIO_RAIL_VISIBLE_IDS];
  return out;
}

export function studioRailHiddenIds(visibleIds: readonly StudioRailToolId[]): StudioRailToolId[] {
  const visible = new Set(visibleIds);
  return DEFAULT_STUDIO_RAIL_TOOL_ORDER.filter((id) => !visible.has(id));
}

export function moveStudioRailTool(
  visibleIds: readonly StudioRailToolId[],
  id: StudioRailToolId,
  direction: -1 | 1
): StudioRailToolId[] {
  const list = normalizeStudioRailVisibleIds(visibleIds);
  const index = list.indexOf(id);
  if (index < 0) return list;
  const next = index + direction;
  if (next < 0 || next >= list.length) return list;
  const copy = [...list];
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item!);
  return copy;
}

export function hideStudioRailTool(
  visibleIds: readonly StudioRailToolId[],
  id: StudioRailToolId
): StudioRailToolId[] {
  const list = normalizeStudioRailVisibleIds(visibleIds).filter((toolId) => toolId !== id);
  return list.length === 0 ? [...DEFAULT_STUDIO_RAIL_VISIBLE_IDS] : list;
}

export function showStudioRailTool(
  visibleIds: readonly StudioRailToolId[],
  id: StudioRailToolId
): StudioRailToolId[] {
  const list = normalizeStudioRailVisibleIds(visibleIds);
  if (list.includes(id)) return list;
  return [...list, id];
}

export function normalizeStudioShortcuts(
  value: unknown
): Record<StudioShortcutActionId, string> {
  const base = defaultStudioShortcuts();
  if (!value || typeof value !== "object") return base;
  const record = value as Record<string, unknown>;
  for (const action of STUDIO_SHORTCUT_ACTIONS) {
    const raw = record[action.id];
    if (typeof raw === "string") {
      base[action.id] = raw.trim().slice(0, 48);
    }
  }
  // Browser editors must never turn Tab into an in-canvas trap. Migrate the
  // former desktop-app-style binding while preserving an explicitly unbound key.
  if (base["toggle-chrome"].toLocaleLowerCase() === "tab") base["toggle-chrome"] = "`";
  // Migrate the shipped C/C collision. Keep crop on the familiar key and move transparent ink.
  if (base["tool-crop"].toUpperCase() === "C" && base["toggle-transparent-color"].toUpperCase() === "C") {
    base["toggle-transparent-color"] = "Shift+C";
  }
  return base;
}

/** Parse a chord like "Mod+Shift+Z" or "B" into match flags. */
export function parseStudioShortcutChord(chord: string): {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
} | null {
  const parts = chord
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  let mod = false;
  let shift = false;
  let alt = false;
  let key = "";
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "mod" || lower === "cmd" || lower === "meta" || lower === "ctrl" || lower === "control") {
      mod = true;
      continue;
    }
    if (lower === "shift") {
      shift = true;
      continue;
    }
    if (lower === "alt" || lower === "option" || lower === "opt") {
      alt = true;
      continue;
    }
    key = part.length === 1 ? part.toUpperCase() : part;
  }
  if (!key) return null;
  return { key, mod, shift, alt };
}

export function matchStudioShortcut(
  chord: string,
  event: {
    key?: string;
    code?: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  }
): boolean {
  const parsed = parseStudioShortcutChord(chord);
  if (!parsed) return false;
  const eventMod = !!(event.metaKey || event.ctrlKey);
  if (parsed.mod !== eventMod) return false;
  if (parsed.shift !== !!event.shiftKey) return false;
  if (parsed.alt !== !!event.altKey) return false;
  const key = (event.key ?? "").length === 1 ? (event.key ?? "").toUpperCase() : (event.key ?? "");
  const code = event.code ?? "";
  if (parsed.key === "[" || parsed.key === "BracketLeft") {
    return key === "[" || code === "BracketLeft";
  }
  if (parsed.key === "]" || parsed.key === "BracketRight") {
    return key === "]" || code === "BracketRight";
  }
  if (parsed.key === "?") return key === "?" || (!!event.shiftKey && (key === "/" || code === "Slash"));
  if (parsed.key === "Tab") return code === "Tab" || key === "Tab";
  if (parsed.key === "`" || parsed.key === "Backquote") {
    return key === "`" || code === "Backquote";
  }
  if (parsed.key === " " || parsed.key === "Space" || parsed.key === "Spacebar") {
    return key === " " || key === "Spacebar" || code === "Space";
  }
  if (parsed.key.length === 1) {
    const expected = parsed.key.toUpperCase();
    const physicalCode = /^[A-Z]$/u.test(expected)
      ? `Key${expected}`
      : /^[0-9]$/u.test(expected)
        ? `Digit${expected}`
        : null;
    // Option/Alt can transform printable `event.key` values (`Alt+C` → `ç` on macOS).
    // Limit the physical-key fallback to Alt chords so other shortcuts stay layout-aware.
    return key.toUpperCase() === expected
      || (parsed.alt && physicalCode !== null && code === physicalCode);
  }
  return key === parsed.key || code === parsed.key;
}

export function formatStudioShortcutChord(chord: string): string {
  if (!chord) return "없음";
  return chord
    .replace(/Mod/gi, "⌘")
    .replace(/Shift/gi, "⇧")
    .replace(/Alt|Option/gi, "⌥")
    .replace(/\+/g, "·");
}

/**
 * Canonical chord key for conflict detection (empty / unparseable → null).
 * Collapses Mod synonyms, case, and BracketLeft/Right aliases.
 */
export function normalizeStudioShortcutChordKey(chord: string): string | null {
  const parsed = parseStudioShortcutChord(chord.trim());
  if (!parsed) return null;
  let key = parsed.key;
  if (key === "BracketLeft") key = "[";
  else if (key === "BracketRight") key = "]";
  else if (key === "Backquote") key = "`";
  else if (key.length === 1) key = key.toUpperCase();
  const parts: string[] = [];
  if (parsed.mod) parts.push("Mod");
  if (parsed.shift) parts.push("Shift");
  if (parsed.alt) parts.push("Alt");
  parts.push(key);
  return parts.join("+");
}

/**
 * Chords bound to more than one action → Map of canonical chord → action ids.
 * Empty / unbound chords are skipped.
 */
export function listStudioShortcutConflicts(
  shortcuts: Partial<Record<StudioShortcutActionId, string>> | Record<string, string>
): Map<string, StudioShortcutActionId[]> {
  const byChord = new Map<string, StudioShortcutActionId[]>();
  for (const action of STUDIO_SHORTCUT_ACTIONS) {
    const raw = shortcuts[action.id];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = normalizeStudioShortcutChordKey(trimmed);
    if (!key) continue;
    const list = byChord.get(key);
    if (list) list.push(action.id);
    else byChord.set(key, [action.id]);
  }
  const conflicts = new Map<string, StudioShortcutActionId[]>();
  for (const [chord, actionIds] of byChord) {
    if (actionIds.length > 1) conflicts.set(chord, actionIds);
  }
  return conflicts;
}

export function normalizeStudioAppSettings(value?: unknown): StudioAppSettings {
  const defaults = defaultStudioAppSettings();
  if (!value || typeof value !== "object") return defaults;
  const record = value as Record<string, unknown>;
  const general = (record.general && typeof record.general === "object" ? record.general : {}) as Record<string, unknown>;
  const mouse = (record.mouse && typeof record.mouse === "object" ? record.mouse : {}) as Record<string, unknown>;
  const touch = (record.touch && typeof record.touch === "object" ? record.touch : {}) as Record<string, unknown>;
  const toolbar = (record.toolbar && typeof record.toolbar === "object" ? record.toolbar : {}) as Record<string, unknown>;
  const grids = (record.grids && typeof record.grids === "object" ? record.grids : {}) as Record<string, unknown>;
  const other = (record.other && typeof record.other === "object" ? record.other : {}) as Record<string, unknown>;

  const pixelSize = asNum(grids.pixelGridSize, defaults.grids.pixelGridSize, 10, 200);
  const nearest = PIXEL_GRID_SIZES.reduce((best, size) =>
    Math.abs(size - pixelSize) < Math.abs(best - pixelSize) ? size : best
  );

  return {
    general: {
      densityMode: normalizeStudioUiDensityMode(general.densityMode ?? defaults.general.densityMode),
      toolHintMode: normalizeStudioToolHintMode(general.toolHintMode, general.showToolHints),
      brushCursorStyle: asEnum(
        general.brushCursorStyle,
        ["outline", "dot", "none"] as const,
        defaults.general.brushCursorStyle
      ),
      showStrokeGuide: asBool(general.showStrokeGuide, defaults.general.showStrokeGuide),
      confirmBeforeClearLayer: asBool(
        general.confirmBeforeClearLayer,
        defaults.general.confirmBeforeClearLayer
      ),
    },
    shortcuts: normalizeStudioShortcuts(record.shortcuts),
    mouse: {
      wheel: asEnum(mouse.wheel, ["zoom", "pan", "brush-size"] as const, defaults.mouse.wheel),
      reverseWheel: asBool(mouse.reverseWheel, defaults.mouse.reverseWheel),
      middleButton: asEnum(
        mouse.middleButton,
        ["pan", "zoom", "eyedropper", "context", "none"] as const,
        defaults.mouse.middleButton
      ),
      rightButton: asEnum(
        mouse.rightButton,
        ["pan", "zoom", "eyedropper", "context", "none"] as const,
        defaults.mouse.rightButton
      ),
    },
    touch: {
      oneFingerDrag: asEnum(touch.oneFingerDrag, ["draw", "pan", "none"] as const, defaults.touch.oneFingerDrag),
      twoFinger: asEnum(touch.twoFinger, ["pan-zoom", "undo-redo"] as const, defaults.touch.twoFinger),
      threeFinger: asEnum(touch.threeFinger, ["undo", "toggle-ui", "none"] as const, defaults.touch.threeFinger),
      palmRejection: asBool(touch.palmRejection, defaults.touch.palmRejection),
      toolHintHoldMs: normalizeStudioToolHintTouchHoldMs(touch.toolHintHoldMs),
    },
    toolbar: {
      visibleIds: normalizeStudioRailVisibleIds(toolbar.visibleIds),
    },
    grids: {
      showCanvasRulers: asBool(grids.showCanvasRulers, defaults.grids.showCanvasRulers),
      showPixelGrid: asBool(grids.showPixelGrid, defaults.grids.showPixelGrid),
      pixelGridSize: nearest,
      snapToPixelGrid: asBool(grids.snapToPixelGrid, DEFAULT_STUDIO_SNAP_TO_PIXEL_GRID),
      showAlignmentGuides: asBool(grids.showAlignmentGuides, DEFAULT_STUDIO_SHOW_ALIGNMENT_GUIDES),
      showIsometricOnDraw: asBool(grids.showIsometricOnDraw, defaults.grids.showIsometricOnDraw),
    },
    other: {
      pressureCurve: asNum(other.pressureCurve, defaults.other.pressureCurve, 0.35, 2.5),
      reduceMotion: asBool(other.reduceMotion, defaults.other.reduceMotion),
    },
  };
}

export function loadStudioAppSettings(
  storage: StudioAppSettingsStorage | null | undefined
): StudioAppSettings {
  if (!storage) return defaultStudioAppSettings();
  try {
    const raw = storage.getItem(STUDIO_APP_SETTINGS_STORAGE_KEY);
    if (!raw) return defaultStudioAppSettings();
    return normalizeStudioAppSettings(JSON.parse(raw));
  } catch {
    return defaultStudioAppSettings();
  }
}

export function saveStudioAppSettings(
  storage: StudioAppSettingsStorage | null | undefined,
  settings: StudioAppSettings
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      STUDIO_APP_SETTINGS_STORAGE_KEY,
      JSON.stringify(normalizeStudioAppSettings(settings))
    );
    return true;
  } catch {
    return false;
  }
}

export function resetStudioAppSettings(
  storage: StudioAppSettingsStorage | null | undefined
): StudioAppSettings {
  const next = defaultStudioAppSettings();
  saveStudioAppSettings(storage, next);
  return next;
}

export function studioAppSettingsStorage(): StudioAppSettingsStorage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

export function studioAppSettingsTabLabel(
  tab: StudioAppSettingsTab,
  t?: (key: string) => string
): string {
  if (t) return t(STUDIO_APP_SETTINGS_TAB_LABEL_KEYS[tab]);
  switch (tab) {
    case "general":
      return "일반";
    case "shortcuts":
      return "단축키";
    case "mouse":
      return "마우스";
    case "touch":
      return "터치";
    case "toolbar":
      return "툴바";
    case "grids":
      return "그리드";
    case "other":
      return "기타";
  }
}

const STUDIO_APP_SETTINGS_TAB_LABEL_KEYS: Record<StudioAppSettingsTab, string> = {
  general: "studio.settings.tabs.general",
  shortcuts: "studio.settings.tabs.shortcuts",
  mouse: "studio.settings.tabs.mouse",
  touch: "studio.settings.tabs.touch",
  toolbar: "studio.settings.tabs.toolbar",
  grids: "studio.settings.tabs.grids",
  other: "studio.settings.tabs.other",
};

export function studioRailToolLabel(
  id: StudioRailToolId,
  t?: (key: string) => string
): string {
  const tool = STUDIO_RAIL_TOOL_CATALOG.find((toolItem) => toolItem.id === id);
  if (!tool) return id;
  if (!t) return tool.label;
  const translated = t(tool.labelKey);
  return translated === tool.labelKey ? tool.label : translated;
}

export function studioShortcutActionLabel(
  actionId: StudioShortcutActionId,
  t?: (key: string) => string
): string {
  const action = STUDIO_SHORTCUT_ACTIONS.find((item) => item.id === actionId);
  if (!action) return actionId;
  if (!t) return action.label;
  const translated = t(action.labelKey);
  return translated === action.labelKey ? action.label : translated;
}

export const STUDIO_PIXEL_GRID_SIZE_OPTIONS = PIXEL_GRID_SIZES;
