/**
 * Magma-class tool hover copy — short title + longer “what it does” body + optional shortcut.
 * Pure data for StudioToolHint / rail buttons. No brand clones.
 */

import type { StudioToolHintPreviewKind } from "./components/StudioToolHintPreview";

export type StudioToolHintSpec = {
  id: string;
  title: string;
  /** Longer description shown under the title (Magma tooltip body). */
  description: string;
  shortcut?: string;
  /** Purpose-built animated visual that demonstrates the tool rather than decorating it. */
  preview?: StudioToolHintPreviewKind;
  /** One concise workflow hint shown below the visual. */
  tip?: string;
};

const HINTS: Record<string, StudioToolHintSpec> = {
  select: {
    id: "select",
    title: "선택",
    description: "캔버스 위 요소를 클릭·드래그로 고르고 옮기거나 크기를 바꿉니다. 여러 개를 드래그해 함께 선택할 수 있어요.",
    shortcut: "V",
    preview: "select",
    tip: "Shift를 누르면 기존 선택에 요소를 더할 수 있어요.",
  },
  pen: {
    id: "pen",
    title: "펜",
    description: "자유선으로 그립니다. 필압·보정·브러시 프리셋은 하단 옵션 도크와 브러시 스튜디오에서 조절해요.",
    shortcut: "B",
    preview: "ink",
    tip: "[ 와 ] 키로 그리는 흐름을 끊지 않고 크기를 바꿔보세요.",
  },
  eraser: {
    id: "eraser",
    title: "지우개",
    description: "현재 레이어/획 위를 지웁니다. 굵기는 펜과 같은 크기 칩으로 맞출 수 있어요.",
    shortcut: "E",
    preview: "erase",
    tip: "지우개도 필압과 불투명도를 유지해 부드럽게 다듬을 수 있어요.",
  },
  fill: {
    id: "fill",
    title: "고급 채우기",
    description: "선 안을 탭해 색을 채웁니다. 경계 인식과 참조 레이어 설정은 속성 패널에서 조정해요.",
    shortcut: "G",
    preview: "fill",
    tip: "작은 틈이 있다면 속성에서 경계 닫기 강도를 먼저 높여보세요.",
  },
  eyedropper: {
    id: "eyedropper",
    title: "스포이드",
    description: "캔버스 색을 샘플링해 주 색으로 가져옵니다. 펜으로 그리는 중엔 Alt+클릭으로도 동작해요.",
    shortcut: "I",
    preview: "sample",
    tip: "펜 사용 중에는 Alt를 잠깐 눌러 도구 전환 없이 색을 고를 수 있어요.",
  },
  "smart-shape": {
    id: "smart-shape",
    title: "스마트 도형",
    description: "낙서를 잠시 멈추면 선·원·사각형 등 깔끔한 도형으로 자동 다듬어요. AutoDraw 계열 보조 기능입니다.",
    preview: "shape",
    tip: "획 끝에서 잠깐 멈추면 원래 손맛을 유지한 채 모양만 정리합니다.",
  },
  "shape-rect": {
    id: "shape-rect",
    title: "사각형 도형",
    description: "드래그로 사각형을 그립니다. Shift를 누르면 정사각형으로 맞출 수 있어요.",
    preview: "shape",
  },
  "shape-ellipse": {
    id: "shape-ellipse",
    title: "타원 도형",
    description: "드래그로 타원을 그립니다. Shift를 누르면 정원으로 맞출 수 있어요.",
    preview: "shape",
  },
  text: {
    id: "text",
    title: "텍스트",
    description: "캔버스에 글자 상자를 추가합니다. 폰트·정렬·효과는 우측 속성에서 편집해요.",
    preview: "text",
    tip: "대사를 먼저 붙여넣고 우측 속성에서 스타일을 한 번에 맞출 수 있어요.",
  },
  bubble: {
    id: "bubble",
    title: "말풍선",
    description: "만화 말풍선을 넣습니다. 꼬리 위치·스타일 프리셋은 말풍선 패널에서 바꿀 수 있어요.",
    preview: "bubble",
    tip: "말풍선을 배치한 뒤 캔버스에서 꼬리 끝을 화자 쪽으로 끌어보세요.",
  },
  image: {
    id: "image",
    title: "이미지 추가",
    description: "파일에서 그림을 불러와 캔버스에 배치합니다. 이후 필터·블러·스마트 필터 스택을 적용할 수 있어요.",
    preview: "image",
    tip: "클립보드 이미지는 ⌘V 또는 Ctrl+V로 바로 가져올 수 있어요.",
  },
  "frame-anim": {
    id: "frame-anim",
    title: "프레임 애니메이션",
    description: "선택한 이미지에 여러 프레임을 쌓아 간단한 셀 애니메이션을 만듭니다.",
    preview: "image",
  },
  filter: {
    id: "filter",
    title: "필터",
    description: "이미지에 가우시안/모션 블러, 곡선, 레벨 등 보정 필터를 쌓아 관리합니다.",
    preview: "filter",
    tip: "필터 스택은 원본을 보존하므로 순서와 강도를 언제든 다시 바꿀 수 있어요.",
  },
  lasso: {
    id: "lasso",
    title: "올가미 선택",
    description:
      "이미지 픽셀을 자유 올가미(드래그 닫기) 또는 다각형 올가미(클릭 꼭짓점 → Enter/더블클릭 닫기)로 고릅니다. 합치기·빼기·교집합, 페더, 확장/축소, 밝기·색조·콘텐츠 인식 채우기를 속성 패널에서 이어서 쓸 수 있어요.",
    preview: "lasso",
    tip: "Shift는 선택 추가, Alt는 선택 빼기로 바로 전환됩니다.",
  },
  "poly-lasso": {
    id: "poly-lasso",
    title: "다각형 올가미",
    description: "클릭으로 꼭짓점을 찍고, 더블클릭 또는 Enter로 닫습니다. Esc로 초안을 취소해요.",
    preview: "lasso",
  },
  "pixel-select": {
    id: "pixel-select",
    title: "픽셀 선택",
    description:
      "사각·타원·올가미·브러시로 이미지 안쪽 픽셀을 고른 뒤 부분 조정·삭제·콘텐츠 인식 채우기를 적용합니다.",
    preview: "lasso",
  },
};

export function studioToolHint(id: string): StudioToolHintSpec | null {
  return HINTS[id] ?? null;
}

/** Resolve a meaningful visual for dynamic rail labels that are not in HINTS. */
export function studioToolHintPreview(
  hint: Pick<StudioToolHintSpec, "id" | "title" | "description" | "preview">
): StudioToolHintPreviewKind {
  if (hint.preview) return hint.preview;
  const identity = `${hint.id} ${hint.title}`.toLocaleLowerCase("ko-KR");
  const text = `${identity} ${hint.description}`.toLocaleLowerCase("ko-KR");
  // Tool identity wins over incidental words in the help copy. For example,
  // a pen description mentions stabilisation/correction but is still an ink demo.
  if (/(지우|eraser)/u.test(identity)) return "erase";
  if (/(스포이드|색.?추출|eyedrop|sample)/u.test(identity)) return "sample";
  if (/(올가미|lasso)/u.test(identity)) return "lasso";
  if (/(채우|paint.?bucket|fill)/u.test(identity)) return "fill";
  if (/(펜|연필|브러시|픽셀|pen|pencil|brush)/u.test(identity)) return "ink";
  if (/(말풍선|대사|댓글|bubble|comment)/u.test(identity)) return "bubble";
  if (/(텍스트|글자|자막|text|type)/u.test(identity)) return "text";
  if (/(이미지|사진|프레임|애니메이션|소재|image|photo|frame|asset)/u.test(identity)) return "image";
  if (/(도형|사각|타원|원근|그리드|반전|shape|rect|ellipse|grid|flip)/u.test(identity)) return "shape";
  if (/(필터|블러|보정|왜곡|리퀴|섞|filter|blur|liquify|blend)/u.test(text)) return "filter";
  return "select";
}

export function studioToolHintFromLabel(
  title: string,
  description: string,
  shortcut?: string,
  preview?: StudioToolHintPreviewKind
): StudioToolHintSpec {
  const cleanTitle = title.replace(/\s*\([^)]*\)\s*$/u, "").trim() || title;
  const registeredId = (() => {
    if (/^선택$/u.test(cleanTitle)) return "select";
    if (/^(펜|브러시)$/u.test(cleanTitle)) return "pen";
    if (/지우개/u.test(cleanTitle)) return "eraser";
    if (/스포이드/u.test(cleanTitle)) return "eyedropper";
    if (/스마트 도형/u.test(cleanTitle)) return "smart-shape";
    if (/사각형 도형/u.test(cleanTitle)) return "shape-rect";
    if (/타원 도형/u.test(cleanTitle)) return "shape-ellipse";
    if (/텍스트/u.test(cleanTitle)) return "text";
    if (/말풍선/u.test(cleanTitle)) return "bubble";
    if (/프레임 애니메이션/u.test(cleanTitle)) return "frame-anim";
    if (/이미지/u.test(cleanTitle)) return "image";
    if (/필터/u.test(cleanTitle)) return "filter";
    if (/다각형 올가미/u.test(cleanTitle)) return "poly-lasso";
    if (/올가미/u.test(cleanTitle)) return "lasso";
    return null;
  })();
  const registered = registeredId ? HINTS[registeredId] : null;
  return {
    id: title,
    title: cleanTitle,
    description,
    shortcut: shortcut ?? registered?.shortcut,
    preview: preview ?? registered?.preview,
    tip: registered?.tip,
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
