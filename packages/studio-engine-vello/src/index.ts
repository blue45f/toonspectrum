export {
  velloClassicWgpuProviderDescriptor,
  velloCpuProviderDescriptor,
  velloCpuReferenceProviderDescriptor,
  velloGpuBrowserProviderDescriptor,
  velloHybridWgpuProviderDescriptor,
  velloSvgNativeProviderDescriptor,
} from "./descriptor";
export {
  adoptGpuDevice,
  compareGpuVsCpu,
  fuzzyMismatchPct,
  gpuDeviceHandle,
  hasWebGpu,
  isGpuDeviceAdopted,
  loadVelloGpuBrowser,
  probeWebGpu,
  renderSceneToPixelsGpu,
  renderSceneToTextureGpu,
  type GpuCpuComparison,
  type VelloGpuInitInput,
  type WebGpuAdapterInfo,
  type WebGpuProbeResult,
} from "./gpu-browser";
export {
  LottieRenderError,
  renderLottieToPixelsGpu,
  type LottieErrorCode,
} from "./lottie";
export {
  adapterVersion,
  fitPolylineToPath,
  loadVelloWasm,
  renderSceneToPixels,
  type VelloInitInput,
} from "./render";
export {
  renderShardedScene,
  renderSceneToPixelsWithFragments,
  type ShardRenderTiming,
  type ShardedRenderResult,
} from "./scene-sharding";
export { shapeTextToGlyphPaths, shapedTextSchema, shapedGlyphSchema } from "./text";
export type { ShapedText, ShapedGlyph, ShapeTextOptions } from "./text";
export {
  shapeTextVerticalToGlyphPaths,
  verticalColumnSchema,
  verticalFeatureEvidenceSchema,
  verticalMetricsSourceSchema,
  verticalShapedGlyphSchema,
  verticalShapedTextSchema,
} from "./text-vertical";
export type {
  ShapeTextVerticalOptions,
  VerticalColumn,
  VerticalFeatureEvidence,
  VerticalMetricsSource,
  VerticalShapedGlyph,
  VerticalShapedText,
} from "./text-vertical";
export {
  computeTextShapeKey,
  createTextShapeCache,
  estimateShapedTextBytes,
  fnv1a32,
  shapeTextCached,
} from "./text-cache";
export {
  SvgNativeRenderError,
  auditSvgNative,
  loadVelloSvgNative,
  renderSvgToPixelsVelloCpu,
  renderSvgToPixelsVelloGpu,
} from "./svg-vello";
export type { SvgNativeAudit, SvgNativeErrorCode } from "./svg-vello";
export type {
  TextShapeCache,
  TextShapeCacheMetrics,
  TextShapeCacheOptions,
} from "./text-cache";
