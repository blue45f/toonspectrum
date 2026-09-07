import {
  studioSearchTextMatches,
  tokenizeStudioSearchQuery,
} from "./studio-search-text";

import type { StudioInspectorFocusTarget } from "./studio-inspector-focus";

export const STUDIO_INSPECTOR_LAYOUT_STORAGE_KEY =
  "toonspectrum:studio:inspector-layout:v1";
export const STUDIO_INSPECTOR_PRIMARY_SECTIONS = [
  "properties", "layers", "document", "publish",
] as const;
export const STUDIO_INSPECTOR_PRIMARY_TABS = [
  "properties", "layers", "document",
] as const;
export const STUDIO_IMAGE_INSPECTOR_SECTIONS = [
  "quick", "fill", "transform", "retouch", "mask",
] as const;
export const STUDIO_DOCUMENT_INSPECTOR_SECTIONS = [
  "canvas", "grade", "navigator",
] as const;

export type StudioInspectorPrimarySection =
  (typeof STUDIO_INSPECTOR_PRIMARY_SECTIONS)[number];
export type StudioInspectorPrimaryTab =
  (typeof STUDIO_INSPECTOR_PRIMARY_TABS)[number];
export type StudioImageInspectorSection =
  (typeof STUDIO_IMAGE_INSPECTOR_SECTIONS)[number];
export type StudioDocumentInspectorSection =
  (typeof STUDIO_DOCUMENT_INSPECTOR_SECTIONS)[number];

export interface StudioInspectorLayout {
  primary: StudioInspectorPrimarySection;
  image: StudioImageInspectorSection;
  document: StudioDocumentInspectorSection;
}
export interface StudioInspectorRoute {
  primary: StudioInspectorPrimarySection;
  image?: StudioImageInspectorSection;
  document?: StudioDocumentInspectorSection;
}
export interface StudioInspectorStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface StudioInspectorActionContext {
  hasSelection: boolean;
  selectedType: string | null;
  drawing: boolean;
  drawingToolPropertiesAvailable?: boolean;
  imageToolsAvailable?: boolean;
}
export interface StudioInspectorAction {
  id: string;
  label: string;
  description: string;
  keywords: readonly string[];
  route: StudioInspectorRoute;
  kind?: "panel" | "property" | "tool";
  path?: string;
  focusTarget?: StudioInspectorFocusTarget;
}

export const DEFAULT_STUDIO_INSPECTOR_LAYOUT: StudioInspectorLayout = {
  primary: "properties",
  image: "quick",
  document: "canvas",
};

function includesValue<Value extends string>(
  values: readonly Value[], value: unknown,
): value is Value {
  return typeof value === "string" && values.includes(value as Value);
}

export function normalizeStudioInspectorLayout(value: unknown): StudioInspectorLayout {
  if (!value || typeof value !== "object") return { ...DEFAULT_STUDIO_INSPECTOR_LAYOUT };
  const candidate = value as Partial<StudioInspectorLayout>;
  return {
    primary: includesValue(STUDIO_INSPECTOR_PRIMARY_SECTIONS, candidate.primary)
      ? candidate.primary : DEFAULT_STUDIO_INSPECTOR_LAYOUT.primary,
    image: includesValue(STUDIO_IMAGE_INSPECTOR_SECTIONS, candidate.image)
      ? candidate.image : DEFAULT_STUDIO_INSPECTOR_LAYOUT.image,
    document: includesValue(STUDIO_DOCUMENT_INSPECTOR_SECTIONS, candidate.document)
      ? candidate.document : DEFAULT_STUDIO_INSPECTOR_LAYOUT.document,
  };
}

export function loadStudioInspectorLayout(
  storage: StudioInspectorStorage | null | undefined,
): StudioInspectorLayout {
  if (!storage) return { ...DEFAULT_STUDIO_INSPECTOR_LAYOUT };
  try {
    const raw = storage.getItem(STUDIO_INSPECTOR_LAYOUT_STORAGE_KEY);
    return raw ? normalizeStudioInspectorLayout(JSON.parse(raw)) : { ...DEFAULT_STUDIO_INSPECTOR_LAYOUT };
  } catch {
    return { ...DEFAULT_STUDIO_INSPECTOR_LAYOUT };
  }
}

export function saveStudioInspectorLayout(
  storage: StudioInspectorStorage | null | undefined,
  layout: StudioInspectorLayout,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      STUDIO_INSPECTOR_LAYOUT_STORAGE_KEY,
      JSON.stringify(normalizeStudioInspectorLayout(layout)),
    );
  } catch {
    // Preference persistence must never block editing.
  }
}

export function navigateStudioInspector(
  current: StudioInspectorLayout,
  route: StudioInspectorRoute,
): StudioInspectorLayout {
  return normalizeStudioInspectorLayout({
    ...current,
    primary: route.primary,
    ...(route.image ? { image: route.image } : {}),
    ...(route.document ? { document: route.document } : {}),
  });
}

function action(
  id: string,
  label: string,
  description: string,
  keywords: readonly string[],
  route: StudioInspectorRoute,
  kind: "panel" | "property" | "tool",
  path: string,
  focusTarget?: StudioInspectorFocusTarget,
): StudioInspectorAction {
  return {
    id, label, description, keywords, route, kind, path,
    ...(focusTarget ? { focusTarget } : {}),
  };
}

const ALWAYS_AVAILABLE_ACTIONS: readonly StudioInspectorAction[] = [
  action("layers", "레이어", "레이어 순서, 그룹, 표시와 잠금을 관리합니다.", ["layer", "folder", "그룹", "잠금", "표시", "참조"], { primary: "layers" }, "panel", "레이어"),
  action("canvas", "페이지 설정", "현재 페이지의 배경, 높이, 여백, 격자와 가이드를 조절합니다.", ["canvas", "캔버스 설정", "문서", "배경", "높이", "gutter", "그리드", "가이드"], { primary: "document", document: "canvas" }, "panel", "페이지 › 크기·가이드"),
  action("grade", "페이지 색상 보정", "현재 페이지 전체의 밝기, 대비, 채도와 분위기를 조절합니다.", ["grade", "color", "색보정", "밝기", "대비", "채도", "무드", "비네트"], { primary: "document", document: "grade" }, "panel", "페이지 › 색상 보정"),
  action("navigator", "긴 원고 미니맵", "긴 웹툰 페이지의 현재 위치를 확인하고 이동합니다.", ["navigator", "minimap", "미니맵", "탐색", "이동", "스크롤"], { primary: "document", document: "navigator" }, "panel", "페이지 › 긴 원고 미니맵"),
  action("publish", "작품 정보", "저장과 게시에 공통으로 쓰는 제목, 설명과 태그를 입력합니다.", ["publish", "게시", "작품", "제목", "설명", "태그", "업로드"], { primary: "publish" }, "panel", "게시 준비 › 작품 정보"),
  action("canvas-resize", "페이지 크기", "페이지 높이와 여백, 크기 변경 방식을 조절합니다.", ["canvas", "resize", "height", "캔버스 크기", "높이", "크기", "여백"], { primary: "document", document: "canvas" }, "property", "페이지 › 크기", "canvas.resize"),
  action("canvas-guides", "가이드와 자동 맞춤", "웹툰 가이드, 사용자 가이드와 가까운 선에 자동으로 맞추는 동작을 설정합니다.", ["guide", "snap", "grid", "가이드와 스냅", "가이드", "스냅", "그리드", "맞춤"], { primary: "document", document: "canvas" }, "property", "페이지 › 가이드", "canvas.guide-lines"),
  action("canvas-style", "용지와 페이지 스타일", "배경색, 종이 질감과 웹툰 테마를 조절합니다.", ["paper", "style", "background", "캔버스 스타일", "용지", "종이", "질감", "배경", "테마"], { primary: "document", document: "canvas" }, "property", "페이지 › 스타일", "canvas.style"),
];

const IMAGE_ACTIONS: readonly StudioInspectorAction[] = [
  action("image-quick", "이미지 빠른 수정", "레이어 복원, 배경 제거, AI 채색, 팔레트와 기본 보정을 엽니다.", ["image", "quick", "레이어 복원", "분리", "배경 제거", "ai", "채색", "팔레트", "보정"], { primary: "properties", image: "quick" }, "tool", "선택 항목 › 이미지 › 빠른 수정"),
  action("image-fill", "채우기·선화", "참조 레이어 채우기와 선화 정리를 엽니다.", ["fill", "bucket", "paint", "채우기", "선화", "틈 닫기", "참조"], { primary: "properties", image: "fill" }, "tool", "선택 항목 › 이미지 › 채우기·선화"),
  action("image-transform", "크기·회전", "이미지 자르기, 크기·회전과 퍼펫 변형을 엽니다.", ["transform", "crop", "warp", "크롭·변형", "크롭", "자르기", "퍼펫", "변형"], { primary: "properties", image: "transform" }, "tool", "선택 항목 › 이미지 › 크기·회전"),
  action("image-retouch", "선택·보정", "부분 선택, 자동 선택, 색 경계 섞기, 복제와 복원 브러시를 엽니다.", ["retouch", "selection", "wand", "smudge", "heal", "clone", "선택·리터치", "리터치", "선택", "마술봉", "스머지", "복원"], { primary: "properties", image: "retouch" }, "tool", "선택 항목 › 이미지 › 선택·보정"),
  action("image-mask", "원본 유지하고 가리기", "원본을 지우지 않고 필요한 부분만 숨기거나 다시 보이게 합니다.", ["mask", "레이어 마스크", "마스크", "비파괴", "반전", "페인팅", "가리기"], { primary: "properties", image: "mask" }, "tool", "선택 항목 › 이미지 › 원본 유지하고 가리기"),
];

export function studioInspectorActions(
  context: StudioInspectorActionContext,
): readonly StudioInspectorAction[] {
  const contextual: StudioInspectorAction[] = [];

  if (context.hasSelection) {
    contextual.push(action(
      "selection-properties", "선택 항목 설정",
      "선택한 그림·글자·말풍선의 기본, 배치와 스타일 설정을 엽니다.",
      ["properties", "inspector", "선택 요소 속성", "속성", "선택", "배치", "스타일"],
      { primary: "properties" }, "property", "선택 항목",
    ));
    if (context.selectedType === "text") {
      contextual.push(action(
        "text-fill", "글자 채우기 스타일",
        "글자색과 그라디언트, 패턴 채우기를 설정합니다.",
        ["text fill", "font color", "글자색", "채우기", "그라디언트", "패턴"],
        { primary: "properties" }, "property", "선택 항목 › 글자 › 채우기", "element.text-fill",
      ));
    }
    if (context.selectedType === "text" || context.selectedType === "bubble") {
      contextual.push(
        action("typography", "글꼴", "글꼴, 크기, 굵기와 기울임을 고릅니다. 외곽선·그림자는 외형, 곡선 텍스트는 고급 조판에 있습니다.", ["typography", "font", "타이포그래피", "글꼴", "폰트", "크기", "굵게", "기울임"], { primary: "properties" }, "property", "선택 항목 › 글자 › 글꼴", "element.typography"),
        action("text-align", "문단 · 정렬과 자간·행간", "가로 정렬, 세로 쓰기, 자간·행간과 말풍선 맞춤을 설정합니다.", ["align", "vertical", "letter spacing", "line height", "정렬", "왼쪽", "가운데", "오른쪽", "세로 쓰기", "자간", "행간", "문단"], { primary: "properties" }, "property", "선택 항목 › 글자 › 문단", "element.text-align"),
      );
    }
    contextual.push(action(
      "selection-layout", "위치와 크기",
      "선택 항목의 위치, 크기, 회전과 배치 제약을 편집합니다.",
      ["layout", "position", "size", "rotation", "x", "y", "width", "height", "위치", "크기", "회전", "배치"],
      { primary: "properties" }, "property", "선택 항목 › 배치", "selection.geometry",
    ));
    if (context.selectedType !== null) {
      contextual.push(action(
        "selection-order-align", "정렬과 순서",
        "앞뒤 순서, 페이지 정렬, 복제와 삭제를 관리합니다.",
        ["order", "align", "arrange", "캔버스 정렬", "정렬", "순서", "앞으로", "뒤로", "복제"],
        { primary: "properties" }, "property", "선택 항목 › 정렬·순서", "element.order-align",
      ));
    }
  } else if (context.drawing) {
    contextual.push(action(
      "drawing-properties", "현재 도구 설정",
      "브러시, 지우개, 도형, 필압과 그리기 보조 설정을 엽니다.",
      ["draw", "brush", "pen", "그리기 도구 설정", "그리기", "브러시", "지우개", "필압", "대칭"],
      { primary: "properties" }, "tool", "선택 항목 › 현재 도구",
    ));
    if (context.drawingToolPropertiesAvailable !== false) {
      contextual.push(
        action("brush-studio", "브러시 세밀한 설정", "브러시 끝, 간격, 압력과 질감의 고급 설정을 엽니다.", ["brush studio", "브러시 스튜디오", "tip", "spacing", "pressure", "브러시", "간격", "필압", "질감"], { primary: "properties" }, "property", "선택 항목 › 현재 도구 › 브러시 세밀한 설정", "tool.brush-studio"),
        action("brush-engines", "브러시 종류", "자연 매체와 고급 브러시 종류를 선택하고 조절합니다.", ["brush engine", "브러시 엔진", "natural media", "자연매체", "유화", "수채"], { primary: "properties" }, "property", "선택 항목 › 현재 도구 › 브러시 종류", "tool.brush-engines"),
      );
    }
  }

  if (
    context.imageToolsAvailable === true ||
    context.selectedType === "image" ||
    context.selectedType === "draw"
  ) contextual.push(...IMAGE_ACTIONS);

  return [...contextual, ...ALWAYS_AVAILABLE_ACTIONS];
}

export function filterStudioInspectorActions(
  actions: readonly StudioInspectorAction[], query: string,
): readonly StudioInspectorAction[] {
  if (tokenizeStudioSearchQuery(query).length === 0) return actions;
  return actions.filter((entry) => studioSearchTextMatches(query, [
    entry.label, entry.description, ...entry.keywords,
  ]));
}
