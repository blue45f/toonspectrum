import type { StudioProjectKind } from "./studio-project-library-store";
import { STUDIO_WEBTOON_CANVAS_PRESETS } from "./studio-webtoon-canvas-presets";

export interface StudioCreationPreset {
  readonly id: string;
  readonly kind: StudioProjectKind;
  readonly width: number;
  readonly height: number;
}

const WEBTOON_PLATFORM_CREATION_PRESETS = STUDIO_WEBTOON_CANVAS_PRESETS.map(
  (preset): StudioCreationPreset => ({
    id: preset.id,
    kind: "webtoon",
    width: preset.width,
    height: preset.height,
  }),
);

/** Creation-only dimensions. Existing documents are never resized by a workspace change. */
export const STUDIO_CREATION_PRESETS: readonly StudioCreationPreset[] = [
  ...WEBTOON_PLATFORM_CREATION_PRESETS,
  { id: "webtoon-four-cut", kind: "webtoon", width: 1080, height: 4320 },
  { id: "webtoon-page", kind: "webtoon", width: 1600, height: 2400 },
  { id: "cuttoon-square-4", kind: "webtoon", width: 1080, height: 1080 },
  { id: "cuttoon-portrait-8", kind: "webtoon", width: 1080, height: 1350 },
  { id: "cuttoon-story-10", kind: "webtoon", width: 1080, height: 1920 },
  { id: "page-comic-digital-8", kind: "webtoon", width: 1600, height: 2400 },
  { id: "page-comic-b5-24", kind: "webtoon", width: 1760, height: 2508 },
  { id: "illustration-portrait", kind: "illustration", width: 2048, height: 2560 },
  { id: "illustration-landscape", kind: "illustration", width: 2560, height: 1440 },
  { id: "illustration-square", kind: "illustration", width: 2048, height: 2048 },
  { id: "quick-sketch", kind: "illustration", width: 1600, height: 1200 },
  { id: "design-cover", kind: "design", width: 1600, height: 2400 },
  { id: "design-social", kind: "design", width: 1080, height: 1080 },
  { id: "design-thumbnail", kind: "design", width: 1280, height: 720 },
  { id: "image-edit", kind: "image", width: 2048, height: 2048 },
  { id: "image-composite", kind: "image", width: 2560, height: 1440 },
  { id: "slides-pitch", kind: "slides", width: 1920, height: 1080 },
  { id: "slides-production", kind: "slides", width: 1920, height: 1080 },
  { id: "storyboard-webtoon", kind: "storyboard", width: 1080, height: 4320 },
  { id: "storyboard-video", kind: "storyboard", width: 1920, height: 1080 },
  { id: "3d-background", kind: "three-d", width: 1920, height: 1080 },
  { id: "3d-pose", kind: "three-d", width: 1600, height: 2400 },
  { id: "motion-webtoon", kind: "animation", width: 1920, height: 1080 },
  { id: "animation-short", kind: "animation", width: 1080, height: 1920 },
  { id: "motion-toon-vertical", kind: "animation", width: 1080, height: 1920 },
  { id: "motion-toon-landscape", kind: "animation", width: 1920, height: 1080 },
];

export function studioCreationPreset(kind: StudioProjectKind, templateId?: string | null): StudioCreationPreset {
  const compatible = STUDIO_CREATION_PRESETS.filter((preset) => preset.kind === kind);
  return compatible.find((preset) => preset.id === templateId) ?? compatible[0]!;
}

export const STUDIO_CREATION_WORKFLOW_COPY: Readonly<Record<StudioProjectKind, { ko: string; en: string }>> = {
  webtoon: { ko: "컷·말풍선 · 페이지 탐색 · 세로 원고", en: "Panels & balloons · Page navigator · Vertical canvas" },
  illustration: { ko: "브러시·지우개 · 색 추출·채우기 · 넓은 그림 영역", en: "Brush & eraser · Color & fill · Spacious drawing area" },
  design: { ko: "도형·변형 · 레이어 순서 · 표지·SNS 비율", en: "Shapes & transforms · Layer order · Cover & social ratios" },
  image: { ko: "마스크·보정 · 색 추출 · 이미지 합성", en: "Masks & retouching · Color picker · Compositing" },
  slides: { ko: "레이어·변형 · 가로 화면 · 발표 자료 검사", en: "Layers & transforms · Widescreen · Presentation checks" },
  storyboard: { ko: "장면·페이지 · 컷 흐름 · 콘티 계획", en: "Scenes & pages · Panel flow · Story planning" },
  "three-d": { ko: "3D 배경 · 카메라·포즈 · 원고 참고", en: "3D background · Camera & poses · Drawing reference" },
  animation: { ko: "타임라인 · 키프레임 · 어니언 스킨", en: "Timeline · Keyframes · Onion skin" },
};
