/**
 * Magma-class tool hover copy — short title + longer “what it does” body + optional shortcut.
 * Pure data for StudioToolHint / rail buttons. No brand clones.
 */

export type StudioToolHintSpec = {
  id: string;
  title: string;
  /** Longer description shown under the title (Magma tooltip body). */
  description: string;
  shortcut?: string;
};

const HINTS: Record<string, StudioToolHintSpec> = {
  select: {
    id: "select",
    title: "선택",
    description: "캔버스 위 요소를 클릭·드래그로 고르고 옮기거나 크기를 바꿉니다. 여러 개를 드래그해 함께 선택할 수 있어요.",
    shortcut: "V",
  },
  pen: {
    id: "pen",
    title: "펜",
    description: "자유선으로 그립니다. 필압·보정·브러시 프리셋은 상단 옵션 막대와 브러시 스튜디오에서 조절해요.",
    shortcut: "B",
  },
  eraser: {
    id: "eraser",
    title: "지우개",
    description: "현재 레이어/획 위를 지웁니다. 굵기는 펜과 같은 크기 칩으로 맞출 수 있어요.",
    shortcut: "E",
  },
  fill: {
    id: "fill",
    title: "고급 채우기",
    description: "선 안을 탭해 색을 채웁니다. 경계 인식과 참조 레이어 설정은 속성 패널에서 조정해요.",
    shortcut: "G",
  },
  eyedropper: {
    id: "eyedropper",
    title: "스포이드",
    description: "캔버스 색을 샘플링해 주 색으로 가져옵니다. 펜으로 그리는 중엔 Alt+클릭으로도 동작해요.",
    shortcut: "I",
  },
  "smart-shape": {
    id: "smart-shape",
    title: "스마트 도형",
    description: "낙서를 잠시 멈추면 선·원·사각형 등 깔끔한 도형으로 자동 다듬어요. AutoDraw 계열 보조 기능입니다.",
  },
  "shape-rect": {
    id: "shape-rect",
    title: "사각형 도형",
    description: "드래그로 사각형을 그립니다. Shift를 누르면 정사각형으로 맞출 수 있어요.",
  },
  "shape-ellipse": {
    id: "shape-ellipse",
    title: "타원 도형",
    description: "드래그로 타원을 그립니다. Shift를 누르면 정원으로 맞출 수 있어요.",
  },
  text: {
    id: "text",
    title: "텍스트",
    description: "캔버스에 글자 상자를 추가합니다. 폰트·정렬·효과는 우측 속성에서 편집해요.",
  },
  bubble: {
    id: "bubble",
    title: "말풍선",
    description: "만화 말풍선을 넣습니다. 꼬리 위치·스타일 프리셋은 말풍선 패널에서 바꿀 수 있어요.",
  },
  image: {
    id: "image",
    title: "이미지 추가",
    description: "파일에서 그림을 불러와 캔버스에 배치합니다. 이후 필터·블러·스마트 필터 스택을 적용할 수 있어요.",
  },
  "frame-anim": {
    id: "frame-anim",
    title: "프레임 애니메이션",
    description: "선택한 이미지에 여러 프레임을 쌓아 간단한 셀 애니메이션을 만듭니다.",
  },
  filter: {
    id: "filter",
    title: "필터",
    description: "이미지에 가우시안/모션 블러, 곡선, 레벨 등 보정 필터를 쌓아 관리합니다.",
  },
};

export function studioToolHint(id: string): StudioToolHintSpec | null {
  return HINTS[id] ?? null;
}

export function studioToolHintFromLabel(
  title: string,
  description: string,
  shortcut?: string
): StudioToolHintSpec {
  return {
    id: title,
    title,
    description,
    shortcut,
  };
}

/** Magma-style filter catalog entries for the smart-filter manager. */
export type StudioFilterCatalogEntry = {
  engine: string;
  title: string;
  description: string;
  group: "blur" | "tone" | "color" | "detail";
};

export const STUDIO_FILTER_CATALOG: readonly StudioFilterCatalogEntry[] = [
  {
    engine: "gaussian-blur",
    title: "가우시안 블러",
    description: "픽셀을 고르게 퍼뜨려 부드럽게 만듭니다. 배경을 흐리게 해 초점을 강조할 때 유용해요. (Magma Gaussian Blur)",
    group: "blur",
  },
  {
    engine: "motion-blur",
    title: "모션 블러",
    description: "지정한 각도로 선형 잔상을 만들어 속도·이동감을 냅니다. 거리와 각도를 조절하세요. (Magma Motion Blur)",
    group: "blur",
  },
  {
    engine: "blur",
    title: "빠른 블러",
    description: "가벼운 박스 블러입니다. 미리보기용 가벼운 흐림에 적합해요.",
    group: "blur",
  },
  {
    engine: "curves",
    title: "색상 곡선",
    description: "톤 커브로 밝기·대비·채널 응답을 정밀하게 잡습니다. 포토샵 Curves 계열입니다.",
    group: "tone",
  },
  {
    engine: "levels",
    title: "레벨",
    description: "검정·흰점과 감마로 노출과 대비를 빠르게 보정합니다.",
    group: "tone",
  },
  {
    engine: "brightness-contrast",
    title: "밝기/대비",
    description: "전체 밝기와 대비를 한 번에 조절합니다.",
    group: "tone",
  },
  {
    engine: "hue-saturation",
    title: "색조/채도",
    description: "색상 회전과 선명도(채도)를 바꿉니다.",
    group: "color",
  },
  {
    engine: "color-balance",
    title: "색 균형",
    description: "그림자와 하이라이트 쪽 색 기운을 조절합니다.",
    group: "color",
  },
  {
    engine: "sharpen",
    title: "샤픈",
    description: "가장자리를 선명하게 해 초점을 또렷하게 만듭니다.",
    group: "detail",
  },
  {
    engine: "noise",
    title: "노이즈",
    description: "필름 입자처럼 미세한 잡음을 더합니다.",
    group: "detail",
  },
  {
    engine: "invert",
    title: "반전",
    description: "색상을 반전합니다. 마스크·특수 효과에 자주 씁니다.",
    group: "detail",
  },
] as const;

export function studioFilterCatalogEntry(engine: string): StudioFilterCatalogEntry | null {
  return STUDIO_FILTER_CATALOG.find((e) => e.engine === engine) ?? null;
}

export function studioFilterGroupLabel(group: StudioFilterCatalogEntry["group"]): string {
  switch (group) {
    case "blur":
      return "블러";
    case "tone":
      return "톤";
    case "color":
      return "색";
    case "detail":
      return "디테일";
  }
}
