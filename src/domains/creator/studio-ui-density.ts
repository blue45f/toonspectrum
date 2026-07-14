/**
 * Studio UI density modes — Magma Simple / Full / Focus style, mapped onto ToonSpectrum chrome.
 * Pure prefs model; StudioPage applies visibility matrix to toolbar clusters and panels.
 */

export const STUDIO_UI_DENSITY_MODES = ["simple", "full", "focus"] as const;
export type StudioUiDensityMode = (typeof STUDIO_UI_DENSITY_MODES)[number];

export const STUDIO_UI_DENSITY_STORAGE_KEY = "toonspectrum-studio-ui-density:v1";
export const DEFAULT_STUDIO_UI_DENSITY_MODE: StudioUiDensityMode = "full";

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
  | "status-rail";

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

/** Visibility matrix — false means hide the chrome region. */
export function studioUiDensityAllows(
  mode: StudioUiDensityMode,
  region: StudioUiChromeRegion
): boolean {
  const normalized = normalizeStudioUiDensityMode(mode);
  if (normalized === "full") return true;
  if (normalized === "focus") {
    return (
      region === "toolbar-draw"
      || region === "toolbar-insert"
      || region === "status-rail"
    );
  }
  // simple: hide advanced AI/3D-heavy chrome, keep core webtoon tools
  if (region === "toolbar-ai" || region === "toolbar-reference") return false;
  return true;
}

export function studioUiDensityLabel(mode: StudioUiDensityMode): string {
  if (mode === "simple") return "심플";
  if (mode === "focus") return "집중";
  return "전체";
}

export function studioUiDensityDescription(mode: StudioUiDensityMode): string {
  if (mode === "simple") return "핵심 컷·펜 도구만 보여 입문 작가에게 맞춥니다.";
  if (mode === "focus") return "캔버스와 그리기 도구 위주 — 모바일 집중 모드와 같은 밀도입니다.";
  return "모든 메뉴·패널을 표시합니다.";
}

/** Map existing mobile immersive flag into density for unified consumers. */
export function studioUiDensityFromImmersive(mobileImmersive: boolean): StudioUiDensityMode {
  return mobileImmersive ? "focus" : "full";
}
