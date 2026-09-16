export type StudioWebtoonCanvasPresetId =
  | "webtoon-vertical"
  | "webtoon-naver"
  | "webtoon-kakao"
  | "webtoon-canvas";

export type StudioWebtoonWidthStandardId = "naver" | "kakao" | "canvas" | "hires";

export interface StudioWebtoonCanvasPreset {
  readonly id: StudioWebtoonCanvasPresetId;
  readonly guideId: StudioWebtoonWidthStandardId;
  readonly guideLabelKo: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly width: number;
  readonly height: number;
}

/**
 * New-document webtoon canvases. The long-strip height stays consistent so switching a target
 * platform changes the authoring width/aspect without silently changing the intended episode length.
 */
export const STUDIO_WEBTOON_CANVAS_PRESETS: readonly StudioWebtoonCanvasPreset[] = Object.freeze([
  {
    id: "webtoon-vertical",
    guideId: "hires",
    guideLabelKo: "고화질 작업",
    labelKo: "범용·고화질 세로 웹툰 · 1080px",
    labelEn: "Universal high-resolution vertical · 1080px",
    width: 1080,
    height: 8000,
  },
  {
    id: "webtoon-naver",
    guideId: "naver",
    guideLabelKo: "네이버",
    labelKo: "네이버 연재형 · 690px",
    labelEn: "Naver publishing canvas · 690px",
    width: 690,
    height: 8000,
  },
  {
    id: "webtoon-kakao",
    guideId: "kakao",
    guideLabelKo: "카카오",
    labelKo: "카카오 연재형 · 720px",
    labelEn: "Kakao publishing canvas · 720px",
    width: 720,
    height: 8000,
  },
  {
    id: "webtoon-canvas",
    guideId: "canvas",
    guideLabelKo: "웹툰 캔버스",
    labelKo: "WEBTOON Canvas형 · 800px",
    labelEn: "WEBTOON Canvas · 800px",
    width: 800,
    height: 8000,
  },
]);

export const DEFAULT_STUDIO_WEBTOON_CANVAS_PRESET_ID: StudioWebtoonCanvasPresetId = "webtoon-vertical";

export function studioWebtoonCanvasPreset(
  id?: string | null,
): StudioWebtoonCanvasPreset {
  return STUDIO_WEBTOON_CANVAS_PRESETS.find((preset) => preset.id === id)
    ?? STUDIO_WEBTOON_CANVAS_PRESETS[0]!;
}
