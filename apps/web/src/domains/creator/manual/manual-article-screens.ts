/**
 * 매뉴얼 문서별 "화면에서 찾기" 도식과 단계별 위치·도구 바로가기.
 *
 * - `focus`: 도식에서 번호를 붙여 강조할 영역(번호 = 배열 순서 + 1).
 * - `steps`: 섹션 id → 단계마다 일어나는 영역(없으면 null). 단계 수와 길이가 같아야 한다(테스트로 확인).
 * - `tools`: 섹션 id → 그 섹션을 바로 따라 할 수 있는 실제 화면 바로가기.
 * 본문(studio-manual-data)과 분리해, 화면 배치가 바뀌면 이 파일만 고치면 되게 한다.
 */
import type { ManualBilingual, ManualRegion, ManualSurface } from "./manual-screen-map";

type ArticleScreenFor<S extends ManualSurface> = {
  readonly surface: S;
  readonly focus: readonly ManualRegion<S>[];
  readonly steps?: Readonly<Record<string, readonly (ManualRegion<S> | null)[]>>;
};

export type ManualArticleScreen = { readonly [S in ManualSurface]: ArticleScreenFor<S> }[ManualSurface];

export interface ManualSectionTool {
  readonly href: string;
  readonly label: ManualBilingual;
}

export const MANUAL_ARTICLE_SCREENS: Readonly<Record<string, ManualArticleScreen>> = {
  "getting-started": {
    surface: "editor",
    focus: ["tools", "panel", "canvas", "topbar"],
    steps: { "first-panel": ["tools", "panel", "tools", "canvas", "topbar"] },
  },
  workspace: {
    surface: "editor",
    focus: ["tools", "canvas", "panel", "topbar", "pages"],
    steps: { navigation: ["canvas", "canvas", "tools"] },
  },
  brushes: {
    surface: "editor",
    focus: ["tools", "panel", "canvas"],
    steps: { basics: ["tools", "panel", "canvas", "canvas"] },
  },
  "selection-fill": {
    surface: "editor",
    focus: ["tools", "panel", "canvas"],
    steps: { fill: ["panel", "tools", "panel", "canvas"] },
  },
  layers: {
    surface: "editor",
    focus: ["panel", "canvas"],
    steps: { check: ["panel", "panel", "panel", "canvas"] },
  },
  filters: {
    surface: "editor",
    focus: ["panel", "canvas", "topbar"],
    steps: { compare: ["panel", null, "canvas", null, "topbar"] },
  },
  lettering: {
    surface: "editor",
    focus: ["tools", "panel", "canvas"],
    steps: { dialogue: ["tools", "panel", "canvas", "canvas"] },
  },
  assets: {
    surface: "editor",
    focus: ["canvas", "panel"],
    steps: { place: ["canvas", "canvas", "canvas", "panel"] },
  },
  "character-3d": {
    surface: "three",
    focus: ["library", "inspector", "poses", "gizmo", "viewport"],
    steps: { setup: [null, "inspector", "poses", "gizmo"] },
  },
  "background-3d": {
    surface: "three",
    focus: ["library", "gizmo", "viewport"],
    steps: { compose: ["library", "gizmo", "viewport", "viewport"] },
  },
  "ai-director": {
    surface: "ai",
    focus: ["director", "suggestions", "request", "answer"],
    steps: { "ask-luna": ["suggestions", "request", "request", "answer", "answer"] },
  },
  "music-ost": {
    surface: "music",
    focus: ["mode", "presets", "brief", "library"],
    steps: { flow: ["mode", "presets", "brief", "brief", "library", "library"] },
  },
  "production-tools": {
    surface: "toolchain",
    focus: ["connection", "tools", "queue", "results"],
    steps: { connect: [null, "connection", "tools", "queue", "results"] },
  },
  "save-recovery": {
    surface: "editor",
    focus: ["topbar", "panel"],
    steps: { backup: ["topbar", "topbar", "topbar", null] },
  },
  export: {
    surface: "publish",
    focus: ["manuscript", "distribution", "preview", "result"],
    steps: { review: [null, null, null, "manuscript", "preview"] },
  },
  shortcuts: {
    surface: "editor",
    focus: ["canvas", "topbar"],
    steps: { focus: [null, "canvas", null, "topbar"] },
  },
  troubleshooting: {
    surface: "editor",
    focus: ["panel", "tools", "topbar"],
    steps: { isolate: ["panel", "tools", null, null, "topbar"] },
  },
};

/** 섹션 단위 바로가기. 문서 머리말의 작업 공간 버튼보다 더 구체적인 화면이 있을 때만 둔다. */
export const MANUAL_SECTION_TOOLS: Readonly<Record<string, Readonly<Record<string, ManualSectionTool>>>> = {
  "getting-started": {
    "first-panel": { href: "/studio/new", label: { ko: "새 작품 만들기", en: "Start a new work" } },
  },
  "character-3d": {
    setup: { href: "/studio/assets/characters/new", label: { ko: "새 3D 캐릭터 만들기", en: "Create a 3D character" } },
    pose: { href: "/studio/poser", label: { ko: "포즈 스튜디오 열기", en: "Open Pose Studio" } },
  },
  "ai-director": {
    what: { href: "/studio/generate", label: { ko: "생성 실험실 열기", en: "Open the generative lab" } },
    "ask-luna": { href: "/studio/ai-lab#ai-director", label: { ko: "루나에게 바로 묻기", en: "Ask Luna now" } },
    conditions: { href: "/settings/ai", label: { ko: "AI 설정 열기", en: "Open AI settings" } },
  },
  "music-ost": {
    import: { href: "/studio/assets/audio#music-import", label: { ko: "외부 음원 가져오기 열기", en: "Open audio import" } },
  },
  export: {
    review: { href: "/studio/publish", label: { ko: "발행 준비 열기", en: "Open publishing" } },
  },
};

export function manualArticleScreen(articleId: string): ManualArticleScreen | undefined {
  return MANUAL_ARTICLE_SCREENS[articleId];
}

export function manualSectionTool(articleId: string, sectionId: string): ManualSectionTool | undefined {
  return MANUAL_SECTION_TOOLS[articleId]?.[sectionId];
}

/** 섹션의 단계별 위치(영역 id 또는 null). 정의가 없으면 빈 배열. */
export function manualStepRegions(screen: ManualArticleScreen | undefined, sectionId: string): readonly (string | null)[] {
  return screen?.steps?.[sectionId] ?? [];
}
