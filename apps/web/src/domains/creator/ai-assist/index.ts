/**
 * AI 드로잉 어시스턴트 — 공개 API
 *
 * 유료 AI API 없이 클라이언트 측 알고리즘으로 동작하는
 * 드로잉 보조 기능 모음 (채색·선화·투시·말풍선).
 */
import "./ai-assist.css";

export { AiAssistDock, type AiFeatureId } from "./AiAssistDock";
export { AiColorHintStudio } from "./AiColorHintStudio";
export { AiStrokeStudio } from "./AiStrokeStudio";
export { AiPerspectiveStudio } from "./AiPerspectiveStudio";
export { AiBalloonStudio } from "./AiBalloonStudio";
export { AiLightGuidePanel } from "./AiLightGuidePanel";
export { AiBeforeAfter } from "./AiBeforeAfter";
export { AiIntensityControl } from "./AiIntensityControl";
export { AiFeatureArt, AiEmptyStateArt } from "./AiFeatureArt";
export { AiWorkflowDiagram } from "./AiWorkflowDiagram";
export { useCountUp, useScrollReveal, staggerDelay } from "./ai-motion";

export {
  fillColorHints,
  suggestShadowHighlight,
  extractReferencePalette,
  hexToRgb,
  pixelLuminance,
  DEFAULT_AI_COLOR_FILL_OPTIONS,
  type AiColorHint,
  type AiColorFillOptions,
  type AiFilledRegion,
  type AiLightDirection,
} from "./ai-color-hint-engine";

export {
  AI_MOOD_PALETTES,
  getMoodPalette,
  guessMoodFromText,
  type AiMoodPalette,
  type AiSceneMood,
  type BilingualLabel,
} from "./ai-mood-palettes";

export {
  stabilizeStroke,
  smoothStrokeChaikin,
  mirrorStrokeSymmetric,
  normalizeStrokePressure,
  strokeLength,
  oneEuroFilter1D,
  createOneEuroFilterState,
  type AiStrokePoint,
  type AiSymmetryAxis,
  type OneEuroFilterState,
} from "./ai-stroke-assist";

export {
  generatePerspectiveGrid,
  suggestVanishingPoints,
  type AiPerspectiveType,
  type AiPerspectiveGridOptions,
  type AiGridLine,
} from "./ai-perspective-grid";

export {
  recommendBalloonPlacement,
  estimateBalloonSize,
  guessBalloonKind,
  type AiBalloonKind,
  type AiBalloonPlacement,
  type AiBalloonRect,
  type AiBalloonRequest,
  type AiSpeaker,
} from "./ai-balloon-placement";

export {
  AI_BALLOON_FONTS,
  recommendBalloonFonts,
  balloonFontCssUrl,
  type AiBalloonFont,
} from "./ai-balloon-fonts";
