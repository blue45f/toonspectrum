/**
 * Studio UI density modes — one stable feature set presented at three levels of chrome.
 *
 * Storage keys stay simple | full | focus for compatibility:
 * - focus  = 집중 작업 (canvas-first, minimum chrome)
 * - simple = 표준 작업 (core tools and panels, advanced launchers folded)
 * - full   = 전체 기능 (all professional tools and panels)
 *
 * Pure prefs model; StudioPage applies the visibility matrix to toolbar clusters and panels.
 */

export const STUDIO_UI_DENSITY_MODES = ["focus", "simple", "full"] as const;
export type StudioUiDensityMode = (typeof STUDIO_UI_DENSITY_MODES)[number];

export const STUDIO_UI_DENSITY_STORAGE_KEY = "toonspectrum-studio-ui-density:v1";
/** New users start with the predictable core workflow; persisted users keep their saved mode. */
export const DEFAULT_STUDIO_UI_DENSITY_MODE: StudioUiDensityMode = "simple";

export type StudioUiChromeRegion =
  | "toolbar-assets"
  | "toolbar-cut"
  | "toolbar-draw"
  | "toolbar-reference"
  | "toolbar-scene"
  | "toolbar-style"
  | "toolbar-ai"
  | "toolbar-insert"
  | "left-panel"
  | "right-panel"
  | "page-strip"
  | "status-rail"
  | "tool-rail"
  | "quick-actions";

export interface StudioUiDensityState {
  mode: StudioUiDensityMode;
}

export interface StudioUiDensityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function isStudioUiDensityMode(value: unknown): value is StudioUiDensityMode {
  return value === "simple" || value === "full" || value === "focus";
}

export function normalizeStudioUiDensityMode(value: unknown): StudioUiDensityMode {
  return isStudioUiDensityMode(value) ? value : DEFAULT_STUDIO_UI_DENSITY_MODE;
}

export function normalizeStudioUiDensityState(value?: unknown): StudioUiDensityState {
  if (!value || typeof value !== "object") {
    return { mode: DEFAULT_STUDIO_UI_DENSITY_MODE };
  }
  const record = value as Record<string, unknown>;
  return { mode: normalizeStudioUiDensityMode(record.mode ?? record.density) };
}

export function loadStudioUiDensityState(
  storage: StudioUiDensityStorage | null | undefined
): StudioUiDensityState {
  if (!storage) return normalizeStudioUiDensityState();
  try {
    const raw = storage.getItem(STUDIO_UI_DENSITY_STORAGE_KEY);
    if (!raw) return normalizeStudioUiDensityState();
    return normalizeStudioUiDensityState(JSON.parse(raw));
  } catch {
    return normalizeStudioUiDensityState();
  }
}

export function saveStudioUiDensityState(
  storage: StudioUiDensityStorage | null | undefined,
  state: StudioUiDensityState
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      STUDIO_UI_DENSITY_STORAGE_KEY,
      JSON.stringify(normalizeStudioUiDensityState(state))
    );
    return true;
  } catch {
    return false;
  }
}

/** Visibility matrix — false means hide the chrome region, never remove the command. */
export function studioUiDensityAllows(
  mode: StudioUiDensityMode,
  region: StudioUiChromeRegion
): boolean {
  const normalized = normalizeStudioUiDensityMode(mode);
  if (normalized === "full") return true;

  // 집중 작업: keep the canvas, essential drawing/insertion paths, status and quick actions.
  if (normalized === "focus") {
    return (
      region === "toolbar-draw"
      || region === "toolbar-insert"
      || region === "toolbar-assets"
      || region === "toolbar-cut"
      || region === "tool-rail"
      || region === "quick-actions"
      || region === "status-rail"
    );
  }

  // 표준 작업: keep the complete webtoon workflow and honor tools the user explicitly exposed.
  // AI launch chrome remains folded; reference is visible only when its tool id is in visibleIds.
  if (region === "toolbar-ai") return false;
  return true;
}

/** Short labels describe the work style, not a judgement about the user's skill. */
export function studioUiDensityLabel(
  mode: StudioUiDensityMode,
  t?: (key: string) => string
): string {
  if (t) {
    if (mode === "simple") return t("studio.settings.uiDensityMode.simple");
    if (mode === "focus") return t("studio.settings.uiDensityMode.focus");
    return t("studio.settings.uiDensityMode.full");
  }
  if (mode === "simple") return "표준 작업";
  if (mode === "focus") return "집중 작업";
  return "전체 기능";
}

export function studioUiDensityDescription(
  mode: StudioUiDensityMode,
  t?: (key: string) => string
): string {
  if (t) {
    if (mode === "simple") return t("studio.settings.uiDensityDescription.simple");
    if (mode === "focus") return t("studio.settings.uiDensityDescription.focus");
    return t("studio.settings.uiDensityDescription.full");
  }
  if (mode === "simple") {
    return "표준 작업 — 자주 쓰는 도구와 설정을 보여 주고 고급 실행기는 필요할 때 펼칩니다.";
  }
  if (mode === "focus") {
    return "집중 작업 — 캔버스와 그리기·말풍선·소재 같은 핵심 도구만 남겨 작업에 집중합니다.";
  }
  return "전체 기능 — AI·3D를 포함한 모든 전문 도구와 패널을 표시합니다.";
}

/** Map the existing mobile immersive flag without changing established non-immersive sessions. */
export function studioUiDensityFromImmersive(mobileImmersive: boolean): StudioUiDensityMode {
  return mobileImmersive ? "focus" : "full";
}
