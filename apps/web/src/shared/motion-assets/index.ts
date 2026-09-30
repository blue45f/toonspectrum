/**
 * motion-assets: Remotion 스타일 모션 그래픽 + SVG 일러스트 공용 에셋 라이브러리.
 * 다른 팀이 가져다 쓰는 공용 에셋 — 전부 SVG/CSS/Canvas 기반.
 */

export {
  delayStyle,
  easeInOutQuad,
  easeOutCubic,
  isLowPowerEnvironment,
  MOTION_ASSET_SIZES,
  motionAssetClass,
  prefersReducedMotion,
  resolveAssetSize,
  useMotionAssetLang,
  useMotionInView,
  type MotionAssetSize,
  type MotionInViewOptions,
} from "./motion-assets-engine";

export {
  getMotionAssetLabels,
  normalizeMotionAssetLang,
  type MotionAssetLabels,
  type MotionAssetLang,
} from "./motion-assets-labels";

export {
  listMotionIllustrations,
  MotionIllustration,
  MOTION_ILLUSTRATION_NAMES,
  type MotionIllustrationName,
  type MotionIllustrationProps,
} from "./motion-assets-illustrations";

export {
  MotionCompareDiagram,
  MotionGauge,
  MotionStepFlow,
  MotionTimeline,
  type MotionCompareDiagramProps,
  type MotionGaugeProps,
  type MotionStep,
  type MotionStepFlowProps,
  type MotionTimelineItem,
  type MotionTimelineProps,
} from "./motion-assets-diagrams";

export {
  MotionCountUp,
  MotionParallax,
  MotionReveal,
  MotionSequence,
  MotionStagger,
  MotionTypewriter,
  type MotionCountUpProps,
  type MotionParallaxProps,
  type MotionRevealProps,
  type MotionRevealVariant,
  type MotionSequenceProps,
  type MotionStaggerProps,
  type MotionTypewriterProps,
} from "./motion-assets-primitives";

export {
  MotionLightRays,
  MotionNoise,
  MotionOrbs,
  MotionParticles,
  type MotionLightRaysProps,
  type MotionNoiseProps,
  type MotionOrbsProps,
  type MotionParticlesProps,
} from "./motion-assets-backgrounds";

export {
  MotionEmptyState,
  type MotionEmptyKind,
  type MotionEmptyStateProps,
} from "./motion-assets-empty";
