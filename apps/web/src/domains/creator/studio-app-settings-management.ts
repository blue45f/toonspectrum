import {
  defaultStudioAppSettings,
  normalizeStudioAppSettings,
  type StudioAppSettings,
  type StudioAppSettingsTab,
} from "./studio-app-settings";

export const STUDIO_APP_SETTINGS_EXPORT_KIND = "toonspectrum.studio-app-settings" as const;
export const STUDIO_APP_SETTINGS_EXPORT_VERSION = 1 as const;
export const STUDIO_APP_SETTINGS_IMPORT_MAX_BYTES = 128 * 1024;

export const STUDIO_APP_SETTINGS_PROFILE_IDS = [
  "balanced",
  "pen-display",
  "touch-first",
  "mouse-keyboard",
  "focus-accessible",
] as const;

export type StudioAppSettingsProfileId = (typeof STUDIO_APP_SETTINGS_PROFILE_IDS)[number];

export interface StudioAppSettingsProfile {
  readonly id: StudioAppSettingsProfileId;
  readonly label: string;
  readonly description: string;
  readonly recommendedFor: string;
}

export const STUDIO_APP_SETTINGS_PROFILES: readonly StudioAppSettingsProfile[] = Object.freeze([
  {
    id: "balanced",
    label: "균형형",
    description: "표준 화면 밀도와 예측 가능한 입력을 사용하는 안전한 기본 구성입니다.",
    recommendedFor: "처음 사용하는 환경 · 노트북",
  },
  {
    id: "pen-display",
    label: "펜 디스플레이",
    description: "손가락은 화면 이동에 쓰고 선 보정 지연과 정밀 가이드를 더 잘 보이게 합니다.",
    recommendedFor: "액정 태블릿 · 스타일러스",
  },
  {
    id: "touch-first",
    label: "터치 우선",
    description: "큰 조작 영역과 멀티터치 탐색을 우선해 실수 입력을 줄입니다.",
    recommendedFor: "태블릿 · 2-in-1",
  },
  {
    id: "mouse-keyboard",
    label: "마우스·키보드",
    description: "휠 확대, 가운데 버튼 이동, 전체 기능 화면을 빠른 단축키 작업에 맞춥니다.",
    recommendedFor: "데스크톱 · 외장 모니터",
  },
  {
    id: "focus-accessible",
    label: "집중·접근성",
    description: "움직임을 줄이고 핵심 도구와 명확한 안내만 남겨 시각적 부담을 낮춥니다.",
    recommendedFor: "집중 작업 · 멀미/주의 분산 완화",
  },
]);

export interface StudioAppSettingsSearchEntry {
  readonly id: string;
  readonly tab: StudioAppSettingsTab;
  readonly label: string;
  readonly description: string;
  readonly keywords: readonly string[];
}

export const STUDIO_APP_SETTINGS_SEARCH_INDEX: readonly StudioAppSettingsSearchEntry[] = Object.freeze([
  { id: "density", tab: "general", label: "화면 구성", description: "집중·표준·전체 기능 화면", keywords: ["밀도", "ui", "layout", "focus", "full"] },
  { id: "hints", tab: "general", label: "도구 설명", description: "짧은 설명과 동작 미리보기", keywords: ["tooltip", "coach", "도움말", "미리보기"] },
  { id: "cursor", tab: "general", label: "브러시 커서", description: "윤곽선·점·숨김", keywords: ["cursor", "outline", "dot", "포인터"] },
  { id: "stroke-guide", tab: "general", label: "선 보정 안내선", description: "포인터와 지연된 잉크 위치 연결", keywords: ["stabilizer", "guide", "latency", "보정"] },
  { id: "clear-confirm", tab: "general", label: "레이어 지우기 확인", description: "파괴적 동작 전에 확인", keywords: ["confirm", "clear", "삭제", "안전"] },
  { id: "shortcuts", tab: "shortcuts", label: "단축키 편집", description: "키 기록·해제·충돌 확인", keywords: ["keyboard", "hotkey", "shortcut", "키보드"] },
  { id: "wheel", tab: "mouse", label: "마우스 휠", description: "확대·이동·브러시 크기", keywords: ["wheel", "zoom", "pan", "mouse"] },
  { id: "mouse-buttons", tab: "mouse", label: "마우스 버튼", description: "가운데·오른쪽 버튼 동작", keywords: ["middle", "right", "context", "eyedropper"] },
  { id: "one-finger", tab: "touch", label: "한 손가락 드래그", description: "그리기·이동·사용 안 함", keywords: ["finger", "touch", "draw", "pan"] },
  { id: "multi-touch", tab: "touch", label: "멀티터치 제스처", description: "두·세 손가락 탐색과 실행 취소", keywords: ["gesture", "pinch", "undo", "redo", "제스처"] },
  { id: "palm", tab: "touch", label: "손바닥 오입력 방지", description: "펜 작업 중 우발 입력 차단", keywords: ["palm", "rejection", "stylus", "펜"] },
  { id: "touch-hold", tab: "touch", label: "길게 누르기 시간", description: "터치 도구 설명 지연", keywords: ["hold", "delay", "tooltip", "long press"] },
  { id: "toolbar", tab: "toolbar", label: "도구막대 구성", description: "도구 표시·숨김·순서", keywords: ["toolbar", "rail", "tool", "도구"] },
  { id: "ruler", tab: "grids", label: "캔버스 눈금자", description: "문서 좌표 표시", keywords: ["ruler", "coordinate", "눈금"] },
  { id: "pixel-grid", tab: "grids", label: "픽셀 그리드", description: "크기·표시·스냅", keywords: ["pixel", "grid", "snap", "격자"] },
  { id: "alignment", tab: "grids", label: "정렬 가이드", description: "개체 정렬 보조선", keywords: ["align", "guide", "smart guide", "정렬"] },
  { id: "isometric", tab: "grids", label: "아이소메트릭 가이드", description: "도형 그리기 보조", keywords: ["isometric", "perspective", "등각"] },
  { id: "pressure", tab: "other", label: "필압 곡선", description: "입력 압력 반응 조정", keywords: ["pressure", "curve", "tablet", "필압"] },
  { id: "motion", tab: "other", label: "동작 효과 줄이기", description: "전환과 애니메이션 최소화", keywords: ["motion", "animation", "accessibility", "reduce"] },
]);

export interface StudioAppSettingsExportEnvelope {
  readonly kind: typeof STUDIO_APP_SETTINGS_EXPORT_KIND;
  readonly version: typeof STUDIO_APP_SETTINGS_EXPORT_VERSION;
  readonly exportedAt: string;
  readonly settings: StudioAppSettings;
}

export type StudioAppSettingsImportResult =
  | { readonly ok: true; readonly settings: StudioAppSettings; readonly source: "envelope" | "legacy" }
  | {
      readonly ok: false;
      readonly reason: "empty" | "too-large" | "invalid-json" | "unsupported-kind" | "unsupported-version" | "invalid-settings";
      readonly message: string;
    };

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwnSettingKey(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasValidStudioAppSettingsSections(
  value: Record<string, unknown>,
  requireAllSections: boolean,
): boolean {
  const presentTabs = STUDIO_APP_SETTINGS_TABS.filter((tab) => hasOwnSettingKey(value, tab));
  if (requireAllSections) {
    if (presentTabs.length !== STUDIO_APP_SETTINGS_TABS.length) return false;
  } else if (presentTabs.length === 0) {
    return false;
  }

  const defaults = defaultStudioAppSettings();
  return presentTabs.every((tab) => {
    const section = value[tab];
    if (!isRecord(section)) return false;
    return Object.keys(defaults[tab]).some((key) => hasOwnSettingKey(section, key));
  });
}

export function applyStudioAppSettingsProfile(
  current: StudioAppSettings,
  profileId: StudioAppSettingsProfileId,
): StudioAppSettings {
  const settings = normalizeStudioAppSettings(current);
  switch (profileId) {
    case "balanced":
      return normalizeStudioAppSettings({
        ...settings,
        general: { ...settings.general, densityMode: "simple", toolHintMode: "rich", brushCursorStyle: "outline", showStrokeGuide: false, confirmBeforeClearLayer: true },
        mouse: { wheel: "zoom", reverseWheel: false, middleButton: "pan", rightButton: "context" },
        touch: { ...settings.touch, oneFingerDrag: "draw", twoFinger: "pan-zoom", threeFinger: "undo", palmRejection: true },
        grids: { ...settings.grids, snapToPixelGrid: false, showAlignmentGuides: false },
        other: { pressureCurve: 1, reduceMotion: false },
      });
    case "pen-display":
      return normalizeStudioAppSettings({
        ...settings,
        general: { ...settings.general, densityMode: "full", toolHintMode: "compact", brushCursorStyle: "outline", showStrokeGuide: true, confirmBeforeClearLayer: true },
        touch: { ...settings.touch, oneFingerDrag: "pan", twoFinger: "pan-zoom", threeFinger: "undo", palmRejection: true },
        grids: { ...settings.grids, showAlignmentGuides: true },
        other: { ...settings.other, pressureCurve: 1.1 },
      });
    case "touch-first":
      return normalizeStudioAppSettings({
        ...settings,
        general: { ...settings.general, densityMode: "simple", toolHintMode: "compact", brushCursorStyle: "dot", confirmBeforeClearLayer: true },
        touch: { ...settings.touch, oneFingerDrag: "pan", twoFinger: "pan-zoom", threeFinger: "undo", palmRejection: true, toolHintHoldMs: 620 },
      });
    case "mouse-keyboard":
      return normalizeStudioAppSettings({
        ...settings,
        general: { ...settings.general, densityMode: "full", toolHintMode: "compact", brushCursorStyle: "outline", showStrokeGuide: false },
        mouse: { wheel: "zoom", reverseWheel: false, middleButton: "pan", rightButton: "context" },
        grids: { ...settings.grids, showAlignmentGuides: true },
      });
    case "focus-accessible":
      return normalizeStudioAppSettings({
        ...settings,
        general: { ...settings.general, densityMode: "focus", toolHintMode: "rich", brushCursorStyle: "outline", showStrokeGuide: true, confirmBeforeClearLayer: true },
        touch: { ...settings.touch, oneFingerDrag: "pan", palmRejection: true },
        other: { ...settings.other, reduceMotion: true },
      });
  }
}

export function resetStudioAppSettingsTab(
  current: StudioAppSettings,
  tab: StudioAppSettingsTab,
): StudioAppSettings {
  const normalized = normalizeStudioAppSettings(current);
  const defaults = defaultStudioAppSettings();
  return normalizeStudioAppSettings({ ...normalized, [tab]: defaults[tab] });
}

export function countStudioAppSettingsDifferences(
  current: StudioAppSettings,
  defaults: StudioAppSettings = defaultStudioAppSettings(),
): number {
  const left = normalizeStudioAppSettings(current);
  const right = normalizeStudioAppSettings(defaults);
  let count = 0;
  const visit = (a: unknown, b: unknown): void => {
    if (Array.isArray(a) || Array.isArray(b)) {
      if (stableStringify(a) !== stableStringify(b)) count += 1;
      return;
    }
    if (isRecord(a) && isRecord(b)) {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const key of keys) visit(a[key], b[key]);
      return;
    }
    if (!Object.is(a, b)) count += 1;
  };
  visit(left, right);
  return count;
}

export function countStudioAppSettingsTabDifferences(
  current: StudioAppSettings,
  tab: StudioAppSettingsTab,
): number {
  const normalized = normalizeStudioAppSettings(current);
  const defaults = defaultStudioAppSettings();
  if (stableStringify(normalized[tab]) === stableStringify(defaults[tab])) return 0;
  return countStudioAppSettingsDifferences(
    normalizeStudioAppSettings({ ...defaults, [tab]: normalized[tab] }),
    defaults,
  );
}

export function searchStudioAppSettings(
  query: string,
  limit = 12,
): readonly StudioAppSettingsSearchEntry[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  const terms = normalized.split(/\s+/u).filter(Boolean);
  return STUDIO_APP_SETTINGS_SEARCH_INDEX
    .map((entry) => {
      const haystack = normalizeSearchText([entry.label, entry.description, studioSettingsTabFallbackLabel(entry.tab), ...entry.keywords].join(" "));
      const matched = terms.filter((term) => haystack.includes(term));
      const starts = normalizeSearchText(entry.label).startsWith(normalized) ? 2 : 0;
      return { entry, score: matched.length + starts };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label))
    .slice(0, Math.max(1, limit))
    .map(({ entry }) => entry);
}

export function serializeStudioAppSettings(
  settings: StudioAppSettings,
  exportedAt = new Date().toISOString(),
): string {
  const envelope: StudioAppSettingsExportEnvelope = {
    kind: STUDIO_APP_SETTINGS_EXPORT_KIND,
    version: STUDIO_APP_SETTINGS_EXPORT_VERSION,
    exportedAt,
    settings: normalizeStudioAppSettings(settings),
  };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

export function importStudioAppSettings(raw: string): StudioAppSettingsImportResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty", message: "가져올 설정 파일이 비어 있습니다." };
  if (new TextEncoder().encode(trimmed).byteLength > STUDIO_APP_SETTINGS_IMPORT_MAX_BYTES) {
    return { ok: false, reason: "too-large", message: "설정 파일이 허용 크기(128KB)를 초과했습니다." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return { ok: false, reason: "invalid-json", message: "올바른 JSON 설정 파일이 아닙니다." };
  }
  if (!isRecord(parsed)) return { ok: false, reason: "invalid-settings", message: "설정 객체를 찾지 못했습니다." };
  if ("kind" in parsed || "version" in parsed || "settings" in parsed) {
    if (parsed.kind !== STUDIO_APP_SETTINGS_EXPORT_KIND) {
      return { ok: false, reason: "unsupported-kind", message: "ToonSpectrum 설정 파일 형식이 아닙니다." };
    }
    if (parsed.version !== STUDIO_APP_SETTINGS_EXPORT_VERSION) {
      return { ok: false, reason: "unsupported-version", message: "지원하지 않는 설정 파일 버전입니다." };
    }
    if (
      !isRecord(parsed.settings)
      || !hasValidStudioAppSettingsSections(parsed.settings, true)
    ) {
      return { ok: false, reason: "invalid-settings", message: "설정 데이터가 손상되었습니다." };
    }
    return { ok: true, settings: normalizeStudioAppSettings(parsed.settings), source: "envelope" };
  }
  if (!hasValidStudioAppSettingsSections(parsed, false)) {
    return { ok: false, reason: "invalid-settings", message: "설정 데이터가 손상되었습니다." };
  }
  return { ok: true, settings: normalizeStudioAppSettings(parsed), source: "legacy" };
}

export function studioSettingsTabFallbackLabel(tab: StudioAppSettingsTab): string {
  switch (tab) {
    case "general": return "일반";
    case "shortcuts": return "단축키";
    case "mouse": return "마우스";
    case "touch": return "터치";
    case "toolbar": return "도구막대";
    case "grids": return "그리드";
    case "other": return "필압·접근성";
  }
}

export interface StudioSettingsEnvironmentSnapshot {
  readonly touchPoints: number;
  readonly pointerEvents: boolean;
  readonly coarsePointer: boolean | null;
  readonly reducedMotionRequested: boolean | null;
  readonly fileSystemAccess: boolean;
  readonly persistentStorageApi: boolean;
}

export interface StudioSettingsEnvironmentTarget {
  readonly navigator?: { readonly maxTouchPoints?: number; readonly storage?: { readonly persist?: unknown } };
  readonly PointerEvent?: unknown;
  readonly showOpenFilePicker?: unknown;
  readonly showSaveFilePicker?: unknown;
  readonly matchMedia?: (query: string) => { readonly matches: boolean };
}

export function detectStudioSettingsEnvironment(
  target: StudioSettingsEnvironmentTarget = globalThis,
): StudioSettingsEnvironmentSnapshot {
  const navigatorLike = target.navigator;
  const matchMedia = typeof target.matchMedia === "function" ? target.matchMedia.bind(target) : null;
  const mediaValue = (query: string): boolean | null => {
    if (!matchMedia) return null;
    try {
      return matchMedia(query).matches;
    } catch {
      return null;
    }
  };
  return {
    touchPoints: typeof navigatorLike?.maxTouchPoints === "number" ? navigatorLike.maxTouchPoints : 0,
    pointerEvents: typeof target.PointerEvent !== "undefined",
    coarsePointer: mediaValue("(pointer: coarse)"),
    reducedMotionRequested: mediaValue("(prefers-reduced-motion: reduce)"),
    fileSystemAccess: typeof target.showOpenFilePicker === "function" && typeof target.showSaveFilePicker === "function",
    persistentStorageApi: typeof navigatorLike?.storage?.persist === "function",
  };
}
