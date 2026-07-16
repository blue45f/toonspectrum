/**
 * Studio Application Settings — Magma-class editor prefs (IA only; no brand clone).
 *
 * Magma Application Settings tabs (public help):
 * General · Shortcuts · Mouse · Touch · Toolbar · Grids · Other
 * https://help.magma.com/en/articles/11325963-magma-application-settings
 * https://help.magma.com/en/articles/8398468-custom-toolbar
 *
 * Pure model + localStorage; React UI lives in StudioAppSettingsPanel.
 */

import { normalizeStudioUiDensityMode } from "./studio-ui-density";

import type { StudioUiDensityMode } from "./studio-ui-density";

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

/** Left tool-rail ids that users can reorder/hide (Magma Toolbar tab). */
export const STUDIO_RAIL_TOOL_CATALOG = [
  { id: "select", label: "선택", defaultShortcut: "V" },
  { id: "hand", label: "핸드(팬)", defaultShortcut: "H" },
  { id: "pen", label: "펜", defaultShortcut: "B" },
  { id: "pixel-pencil", label: "픽셀 펜", defaultShortcut: "P" },
  { id: "eraser", label: "지우개", defaultShortcut: "E" },
  { id: "blend", label: "혼합(스머지)", defaultShortcut: "" },
  { id: "liquify", label: "리퀴파이", defaultShortcut: "" },
  { id: "fill", label: "페인트 버킷", defaultShortcut: "G" },
  { id: "lasso-fill", label: "라쏘 필", defaultShortcut: "" },
  { id: "eyedropper", label: "스포이드", defaultShortcut: "I" },
  { id: "marquee-rect", label: "사각 선택", defaultShortcut: "M" },
  { id: "marquee-circle", label: "원형 선택", defaultShortcut: "" },
  { id: "lasso", label: "올가미 선택", defaultShortcut: "L" },
  { id: "transform", label: "변형", defaultShortcut: "Shift+T" },
  { id: "smart-shape", label: "스마트 도형", defaultShortcut: "" },
  { id: "shape-rect", label: "사각형 도형", defaultShortcut: "" },
  { id: "shape-ellipse", label: "타원 도형", defaultShortcut: "" },
  { id: "text", label: "텍스트", defaultShortcut: "T" },
  { id: "bubble", label: "말풍선", defaultShortcut: "" },
  { id: "image", label: "이미지", defaultShortcut: "" },
  { id: "comment", label: "댓글", defaultShortcut: "" },
  { id: "perspective", label: "투시도", defaultShortcut: "" },
  { id: "zoom-fit", label: "화면 맞춤", defaultShortcut: "Mod+0" },
  { id: "rotate-view", label: "캔버스 반전", defaultShortcut: "" },
  { id: "frame-anim", label: "프레임 애니", defaultShortcut: "" },
  { id: "reference", label: "참고 이미지", defaultShortcut: "" },
] as const;

export type StudioRailToolId = (typeof STUDIO_RAIL_TOOL_CATALOG)[number]["id"];

export const DEFAULT_STUDIO_RAIL_TOOL_ORDER: StudioRailToolId[] = STUDIO_RAIL_TOOL_CATALOG.map(
  (t) => t.id
);

/** Customizable shortcut action ids (subset wired in StudioPage). */
export const STUDIO_SHORTCUT_ACTIONS = [
  { id: "tool-select", label: "선택 도구", defaultKeys: "V" },
  { id: "tool-hand", label: "핸드(팬)", defaultKeys: "Space" },
  { id: "tool-pen", label: "펜", defaultKeys: "B" },
  { id: "tool-pixel", label: "픽셀 펜", defaultKeys: "P" },
  { id: "tool-eraser", label: "지우개", defaultKeys: "E" },
  { id: "tool-fill", label: "페인트 버킷", defaultKeys: "G" },
  { id: "tool-eyedropper", label: "스포이드", defaultKeys: "I" },
  { id: "tool-lasso", label: "올가미 선택", defaultKeys: "L" },
  { id: "tool-marquee", label: "사각 선택", defaultKeys: "M" },
  { id: "tool-transform", label: "변형", defaultKeys: "Shift+T" },
  { id: "undo", label: "실행취소", defaultKeys: "Mod+Z" },
  { id: "redo", label: "다시실행", defaultKeys: "Mod+Shift+Z" },
  { id: "deselect-pixels", label: "픽셀 선택 해제", defaultKeys: "Mod+D" },
  { id: "invert-pixels", label: "픽셀 선택 반전", defaultKeys: "Mod+Shift+I" },
  { id: "toggle-chrome", label: "캔버스만 보기", defaultKeys: "`" },
  { id: "swap-colors", label: "주·보조 색 교체", defaultKeys: "X" },
  { id: "brush-smaller", label: "브러시 작게", defaultKeys: "[" },
  { id: "brush-larger", label: "브러시 크게", defaultKeys: "]" },
  { id: "flip-canvas", label: "캔버스 좌우 반전(보기)", defaultKeys: "H" },
  { id: "shortcuts-help", label: "단축키 도움말", defaultKeys: "?" },
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
    showToolHints: boolean;
    brushCursorStyle: StudioBrushCursorStyle;
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
  };
  toolbar: {
    /** Visible rail tools in order. Hidden tools are catalog ids not in this list. */
    visibleIds: StudioRailToolId[];
  };
  grids: {
    showPixelGrid: boolean;
    pixelGridSize: number;
    snapToPixelGrid: boolean;
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
      densityMode: "full",
      showToolHints: true,
      brushCursorStyle: "outline",
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
    },
    toolbar: {
      visibleIds: [...DEFAULT_STUDIO_RAIL_TOOL_ORDER],
    },
    grids: {
      showPixelGrid: false,
      pixelGridSize: 40,
      snapToPixelGrid: false,
      showIsometricOnDraw: false,
    },
    other: {
      pressureCurve: 1,
      reduceMotion: false,
    },
  };
}

export function isStudioRailToolId(value: unknown): value is StudioRailToolId {
  return typeof value === "string" && STUDIO_RAIL_TOOL_CATALOG.some((t) => t.id === value);
}

export function isStudioShortcutActionId(value: unknown): value is StudioShortcutActionId {
  return typeof value === "string" && STUDIO_SHORTCUT_ACTIONS.some((a) => a.id === value);
}

/** Normalize visible rail order: unique, catalog-only, append missing at end if none hidden. */
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
  // Empty list is invalid — fall back to full default (Magma always keeps some tools).
  // New catalog tools not in the saved list stay "hidden" and surface via More menu.
  if (out.length === 0) return [...DEFAULT_STUDIO_RAIL_TOOL_ORDER];
  return out;
}

export function studioRailHiddenIds(visibleIds: readonly StudioRailToolId[]): StudioRailToolId[] {
  const vis = new Set(visibleIds);
  return DEFAULT_STUDIO_RAIL_TOOL_ORDER.filter((id) => !vis.has(id));
}

export function moveStudioRailTool(
  visibleIds: readonly StudioRailToolId[],
  id: StudioRailToolId,
  direction: -1 | 1
): StudioRailToolId[] {
  const list = normalizeStudioRailVisibleIds(visibleIds);
  const idx = list.indexOf(id);
  if (idx < 0) return list;
  const next = idx + direction;
  if (next < 0 || next >= list.length) return list;
  const copy = [...list];
  const [item] = copy.splice(idx, 1);
  copy.splice(next, 0, item!);
  return copy;
}

export function hideStudioRailTool(
  visibleIds: readonly StudioRailToolId[],
  id: StudioRailToolId
): StudioRailToolId[] {
  const list = normalizeStudioRailVisibleIds(visibleIds).filter((x) => x !== id);
  return list.length === 0 ? [...DEFAULT_STUDIO_RAIL_TOOL_ORDER] : list;
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
    .map((p) => p.trim())
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
  if (parsed.key.length === 1) {
    return key.toUpperCase() === parsed.key.toUpperCase();
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

export function normalizeStudioAppSettings(value?: unknown): StudioAppSettings {
  const d = defaultStudioAppSettings();
  if (!value || typeof value !== "object") return d;
  const r = value as Record<string, unknown>;
  const g = (r.general && typeof r.general === "object" ? r.general : {}) as Record<string, unknown>;
  const m = (r.mouse && typeof r.mouse === "object" ? r.mouse : {}) as Record<string, unknown>;
  const t = (r.touch && typeof r.touch === "object" ? r.touch : {}) as Record<string, unknown>;
  const tb = (r.toolbar && typeof r.toolbar === "object" ? r.toolbar : {}) as Record<string, unknown>;
  const gr = (r.grids && typeof r.grids === "object" ? r.grids : {}) as Record<string, unknown>;
  const o = (r.other && typeof r.other === "object" ? r.other : {}) as Record<string, unknown>;

  const pixelSize = asNum(gr.pixelGridSize, d.grids.pixelGridSize, 10, 200);
  const nearest = PIXEL_GRID_SIZES.reduce((best, sz) =>
    Math.abs(sz - pixelSize) < Math.abs(best - pixelSize) ? sz : best
  );

  return {
    general: {
      densityMode: normalizeStudioUiDensityMode(g.densityMode ?? d.general.densityMode),
      showToolHints: asBool(g.showToolHints, d.general.showToolHints),
      brushCursorStyle: asEnum(
        g.brushCursorStyle,
        ["outline", "dot", "none"] as const,
        d.general.brushCursorStyle
      ),
      confirmBeforeClearLayer: asBool(g.confirmBeforeClearLayer, d.general.confirmBeforeClearLayer),
    },
    shortcuts: normalizeStudioShortcuts(r.shortcuts),
    mouse: {
      wheel: asEnum(m.wheel, ["zoom", "pan", "brush-size"] as const, d.mouse.wheel),
      reverseWheel: asBool(m.reverseWheel, d.mouse.reverseWheel),
      middleButton: asEnum(
        m.middleButton,
        ["pan", "zoom", "eyedropper", "context", "none"] as const,
        d.mouse.middleButton
      ),
      rightButton: asEnum(
        m.rightButton,
        ["pan", "zoom", "eyedropper", "context", "none"] as const,
        d.mouse.rightButton
      ),
    },
    touch: {
      oneFingerDrag: asEnum(t.oneFingerDrag, ["draw", "pan", "none"] as const, d.touch.oneFingerDrag),
      twoFinger: asEnum(t.twoFinger, ["pan-zoom", "undo-redo"] as const, d.touch.twoFinger),
      threeFinger: asEnum(t.threeFinger, ["undo", "toggle-ui", "none"] as const, d.touch.threeFinger),
      palmRejection: asBool(t.palmRejection, d.touch.palmRejection),
    },
    toolbar: {
      visibleIds: normalizeStudioRailVisibleIds(tb.visibleIds),
    },
    grids: {
      showPixelGrid: asBool(gr.showPixelGrid, d.grids.showPixelGrid),
      pixelGridSize: nearest,
      snapToPixelGrid: asBool(gr.snapToPixelGrid, d.grids.snapToPixelGrid),
      showIsometricOnDraw: asBool(gr.showIsometricOnDraw, d.grids.showIsometricOnDraw),
    },
    other: {
      pressureCurve: asNum(o.pressureCurve, d.other.pressureCurve, 0.35, 2.5),
      reduceMotion: asBool(o.reduceMotion, d.other.reduceMotion),
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

export function studioAppSettingsTabLabel(tab: StudioAppSettingsTab): string {
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

export function studioRailToolLabel(id: StudioRailToolId): string {
  return STUDIO_RAIL_TOOL_CATALOG.find((t) => t.id === id)?.label ?? id;
}

export const STUDIO_PIXEL_GRID_SIZE_OPTIONS = PIXEL_GRID_SIZES;
