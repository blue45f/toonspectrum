import { STUDIO_CANVAS_WIDTH } from "./canvas/studio-canvas-constants";
import type { StudioProjectKind } from "./studio-project-library-store";

export interface StudioProjectStartPreset {
  readonly width: number;
  readonly height: number;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
}
const DESCRIPTIONS: Record<StudioProjectKind, readonly [string, string]> = {
  webtoon: ["긴 세로 원고 · 페이지 탐색 · 컷·말풍선", "Vertical manuscript · page navigation · panels and balloons"],
  illustration: ["브러시·색상 중심 · 페이지 목록 접기 · 넓은 작화 영역", "Brushes and color · collapsed page list · room to paint"],
  design: ["레이어·변형 중심 · 도형 도구 · 선택·복제·앞으로", "Layers and transforms · shapes · select, duplicate and arrange"],
  image: ["리터치·색보정 중심 · 마스크와 색 추출", "Retouching and grading · masks and eyedropper"],
  slides: ["가로 화면 · 페이지 탐색 · 레이어와 배치", "Landscape canvas · page navigation · layers and arrangement"],
  storyboard: ["콘티와 페이지 탐색 · 컷 흐름 구성", "Storyboard and page navigation · shot sequencing"],
  "three-d": ["배경·포즈·카메라 작업", "Background, pose and camera work"],
  animation: ["타임라인·레이어 · 움직임 편집", "Timeline and layers · motion editing"],
};
const DEFAULT_HEIGHTS: Record<StudioProjectKind, number> = {
  webtoon: 3600, illustration: 900, design: 1080, image: 720,
  slides: 405, storyboard: 1080, "three-d": 720, animation: 1280,
};
const TEMPLATE_HEIGHTS: Partial<Record<StudioProjectKind, Readonly<Record<string, number>>>> = {
  webtoon: { "webtoon-vertical": 3600, "webtoon-four-cut": 1680, "webtoon-page": 1080 },
  illustration: { "illustration-portrait": 900, "illustration-landscape": 480, "quick-sketch": 720 },
  design: { "design-cover": 1080, "design-social": 720, "design-thumbnail": 405 },
  storyboard: { "storyboard-webtoon": 1080, "storyboard-video": 405 },
  animation: { "motion-webtoon": 1280, "animation-short": 1280 },
};
/** Match the real fixed-width drawing engine rather than metadata-only output dimensions. */
export function studioProjectStartPreset(kind: StudioProjectKind, templateId?: string | null): StudioProjectStartPreset {
  return {
    width: STUDIO_CANVAS_WIDTH,
    height: (templateId ? TEMPLATE_HEIGHTS[kind]?.[templateId] : undefined) ?? DEFAULT_HEIGHTS[kind],
    descriptionKo: DESCRIPTIONS[kind][0],
    descriptionEn: DESCRIPTIONS[kind][1],
  };
}
