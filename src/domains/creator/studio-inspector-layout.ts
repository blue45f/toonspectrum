export const STUDIO_INSPECTOR_LAYOUT_STORAGE_KEY =
  "toonspectrum:studio:inspector-layout:v1";

export const STUDIO_INSPECTOR_PRIMARY_SECTIONS = [
  "properties",
  "layers",
  "document",
  "publish",
] as const;

export const STUDIO_IMAGE_INSPECTOR_SECTIONS = [
  "quick",
  "fill",
  "retouch",
  "mask",
  "transform",
] as const;

export const STUDIO_DOCUMENT_INSPECTOR_SECTIONS = [
  "canvas",
  "grade",
  "navigator",
] as const;

export type StudioInspectorPrimarySection =
  (typeof STUDIO_INSPECTOR_PRIMARY_SECTIONS)[number];
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
}

export interface StudioInspectorAction {
  id: string;
  label: string;
  description: string;
  keywords: readonly string[];
  route: StudioInspectorRoute;
}

export const DEFAULT_STUDIO_INSPECTOR_LAYOUT: StudioInspectorLayout = {
  primary: "properties",
  image: "quick",
  document: "canvas",
};

function includesValue<Value extends string>(
  values: readonly Value[],
  value: unknown
): value is Value {
  return typeof value === "string" && values.includes(value as Value);
}

export function normalizeStudioInspectorLayout(
  value: unknown
): StudioInspectorLayout {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_STUDIO_INSPECTOR_LAYOUT };
  }

  const candidate = value as Partial<StudioInspectorLayout>;
  return {
    primary: includesValue(
      STUDIO_INSPECTOR_PRIMARY_SECTIONS,
      candidate.primary
    )
      ? candidate.primary
      : DEFAULT_STUDIO_INSPECTOR_LAYOUT.primary,
    image: includesValue(STUDIO_IMAGE_INSPECTOR_SECTIONS, candidate.image)
      ? candidate.image
      : DEFAULT_STUDIO_INSPECTOR_LAYOUT.image,
    document: includesValue(
      STUDIO_DOCUMENT_INSPECTOR_SECTIONS,
      candidate.document
    )
      ? candidate.document
      : DEFAULT_STUDIO_INSPECTOR_LAYOUT.document,
  };
}

export function loadStudioInspectorLayout(
  storage: StudioInspectorStorage | null | undefined
): StudioInspectorLayout {
  if (!storage) return { ...DEFAULT_STUDIO_INSPECTOR_LAYOUT };

  try {
    const raw = storage.getItem(STUDIO_INSPECTOR_LAYOUT_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STUDIO_INSPECTOR_LAYOUT };
    return normalizeStudioInspectorLayout(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STUDIO_INSPECTOR_LAYOUT };
  }
}

export function saveStudioInspectorLayout(
  storage: StudioInspectorStorage | null | undefined,
  layout: StudioInspectorLayout
): void {
  if (!storage) return;
  try {
    storage.setItem(
      STUDIO_INSPECTOR_LAYOUT_STORAGE_KEY,
      JSON.stringify(normalizeStudioInspectorLayout(layout))
    );
  } catch {
    // 작업공간 선호 저장이 막혀도 편집 자체는 계속되어야 한다.
  }
}

export function navigateStudioInspector(
  current: StudioInspectorLayout,
  route: StudioInspectorRoute
): StudioInspectorLayout {
  return normalizeStudioInspectorLayout({
    ...current,
    primary: route.primary,
    ...(route.image ? { image: route.image } : {}),
    ...(route.document ? { document: route.document } : {}),
  });
}

const ALWAYS_AVAILABLE_ACTIONS: readonly StudioInspectorAction[] = [
  {
    id: "layers",
    label: "레이어",
    description: "레이어 순서, 그룹, 표시와 잠금을 관리합니다.",
    keywords: ["layer", "folder", "그룹", "잠금", "표시", "참조"],
    route: { primary: "layers" },
  },
  {
    id: "canvas",
    label: "캔버스 설정",
    description: "배경, 높이, 여백, 그리드와 가이드를 조절합니다.",
    keywords: ["canvas", "배경", "높이", "gutter", "그리드", "가이드"],
    route: { primary: "document", document: "canvas" },
  },
  {
    id: "grade",
    label: "페이지 색보정",
    description: "페이지 전체의 밝기, 대비, 채도와 무드를 조절합니다.",
    keywords: ["grade", "color", "밝기", "대비", "채도", "무드", "비네트"],
    route: { primary: "document", document: "grade" },
  },
  {
    id: "navigator",
    label: "미니맵·탐색",
    description: "긴 웹툰 페이지의 현재 위치를 확인하고 이동합니다.",
    keywords: ["navigator", "minimap", "미니맵", "이동", "스크롤"],
    route: { primary: "document", document: "navigator" },
  },
  {
    id: "publish",
    label: "게시 정보",
    description: "제목, 설명과 태그를 입력합니다.",
    keywords: ["publish", "제목", "설명", "태그", "업로드"],
    route: { primary: "publish" },
  },
];

const IMAGE_ACTIONS: readonly StudioInspectorAction[] = [
  {
    id: "image-quick",
    label: "이미지 빠른 수정",
    description: "배경 제거, AI 채색, 팔레트와 기본 보정을 엽니다.",
    keywords: ["image", "quick", "배경 제거", "ai", "채색", "팔레트", "보정"],
    route: { primary: "properties", image: "quick" },
  },
  {
    id: "image-fill",
    label: "채우기·선화",
    description: "참조 레이어 채우기와 선화 정리를 엽니다.",
    keywords: ["fill", "bucket", "paint", "채우기", "선화", "틈 닫기", "참조"],
    route: { primary: "properties", image: "fill" },
  },
  {
    id: "image-retouch",
    label: "선택·리터치",
    description: "선택, 마술봉, 스머지, 복제와 복원 브러시를 엽니다.",
    keywords: ["retouch", "selection", "wand", "smudge", "heal", "clone", "선택", "마술봉", "복원"],
    route: { primary: "properties", image: "retouch" },
  },
  {
    id: "image-mask",
    label: "레이어 마스크",
    description: "비파괴 마스크 추가, 반전과 페인팅을 엽니다.",
    keywords: ["mask", "마스크", "비파괴", "반전", "페인팅"],
    route: { primary: "properties", image: "mask" },
  },
  {
    id: "image-transform",
    label: "크롭·변형",
    description: "이미지 크롭과 퍼펫 워프를 엽니다.",
    keywords: ["transform", "crop", "warp", "크롭", "자르기", "퍼펫", "변형"],
    route: { primary: "properties", image: "transform" },
  },
];

export function studioInspectorActions(
  context: StudioInspectorActionContext
): readonly StudioInspectorAction[] {
  const contextual: StudioInspectorAction[] = [];

  if (context.hasSelection) {
    contextual.push({
      id: "selection-properties",
      label: "선택 요소 속성",
      description: "선택한 요소의 기본, 배치와 스타일 설정을 엽니다.",
      keywords: ["properties", "inspector", "속성", "선택", "배치", "스타일"],
      route: { primary: "properties" },
    });
  } else if (context.drawing) {
    contextual.push({
      id: "drawing-properties",
      label: "그리기 도구 설정",
      description: "브러시, 지우개, 도형, 필압과 자를 엽니다.",
      keywords: ["draw", "brush", "pen", "그리기", "브러시", "지우개", "필압", "대칭"],
      route: { primary: "properties" },
    });
  }

  if (context.selectedType === "image") contextual.push(...IMAGE_ACTIONS);
  return [...contextual, ...ALWAYS_AVAILABLE_ACTIONS];
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, " ");
}

export function filterStudioInspectorActions(
  actions: readonly StudioInspectorAction[],
  query: string
): readonly StudioInspectorAction[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return actions;

  const terms = normalizedQuery.split(" ");
  return actions.filter((action) => {
    const haystack = normalizeSearchText(
      [action.label, action.description, ...action.keywords].join(" ")
    );
    return terms.every((term) => haystack.includes(term));
  });
}
