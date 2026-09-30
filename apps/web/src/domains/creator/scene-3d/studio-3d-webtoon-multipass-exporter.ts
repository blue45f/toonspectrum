/**
 * studio-3d-webtoon-multipass-exporter.ts
 *
 * Webtoon multi-pass planning aligned with the renderer-neutral artifact-capture-v2 contract.
 * The planner combines LT-derived manuscript layers with depth/normal/ID/VFX control artifacts
 * without moving engine objects or GPU handles across the product boundary.
 */

export type WebtoonRenderPassKind =
  | "line-art"
  | "flat-color"
  | "shadow-ambient"
  | "ambient-occlusion"
  | "specular-highlight"
  | "emission"
  | "depth-map"
  | "normal-map"
  | "object-id-mask"
  | "material-id-mask"
  | "velocity-map"
  | "background";

export type WebtoonRenderPassSource = "derived-lt" | "artifact-v2";

export type WebtoonRenderPixelFormat =
  | "rgba8-srgb"
  | "rgba8-linear"
  | "r8-linear"
  | "r32f"
  | "rg8-octahedral"
  | "r32u-stable-id"
  | "rg32f";

export interface RenderPassSpec {
  readonly kind: WebtoonRenderPassKind;
  readonly layerName: string;
  readonly blendMode: "normal" | "multiply" | "screen" | "overlay";
  readonly opacity: number;
  readonly description: string;
  readonly defaultEnabled: boolean;
  readonly source: WebtoonRenderPassSource;
  readonly pixelFormat: WebtoonRenderPixelFormat;
  /** Raw planning cost before PNG/PSD compression. */
  readonly bytesPerPixel: 1 | 2 | 4 | 8;
  readonly productionRole: "manuscript" | "mask" | "relight" | "motion";
}

export interface MultiPassExportConfig {
  readonly resolutionWidth: number;
  readonly resolutionHeight: number;
  readonly transparentBackground: boolean;
  readonly includeLineArt: boolean;
  readonly includeFlatColor: boolean;
  readonly includeShadow: boolean;
  readonly includeHighlight: boolean;
  readonly includeDepthMap: boolean;
  readonly includeObjectIdMask: boolean;
  readonly includeNormalMap?: boolean;
  readonly includeMaterialIdMask?: boolean;
  readonly includeAmbientOcclusion?: boolean;
  readonly includeEmission?: boolean;
  readonly includeVelocity?: boolean;
  /** Background plate pass. Renders empty while transparentBackground is on; the planner warns. */
  readonly includeBackground?: boolean;
  readonly format: "png-zip" | "psd" | "clip-studio-layers";
}

export type MultiPassBooleanConfigKey =
  | "includeLineArt"
  | "includeFlatColor"
  | "includeShadow"
  | "includeHighlight"
  | "includeDepthMap"
  | "includeObjectIdMask"
  | "includeNormalMap"
  | "includeMaterialIdMask"
  | "includeAmbientOcclusion"
  | "includeEmission"
  | "includeVelocity"
  | "includeBackground";

export type MultiPassExportPreset =
  | "manuscript"
  | "ai-control"
  | "compositing"
  | "complete";

export const WEBTOON_RENDER_PASSES: readonly RenderPassSpec[] = Object.freeze([
  {
    kind: "line-art",
    layerName: "01_선화 (Line Art)",
    blendMode: "normal",
    opacity: 1,
    description: "깊이·법선 기반 외곽선과 형태 엣지를 투명 선화 레이어로 추출",
    defaultEnabled: true,
    source: "derived-lt",
    pixelFormat: "rgba8-srgb",
    bytesPerPixel: 4,
    productionRole: "manuscript",
  },
  {
    kind: "flat-color",
    layerName: "02_밑색 (Flat Color)",
    blendMode: "normal",
    opacity: 1,
    description: "조명과 그림자를 제외한 원고용 베이스 컬러 레이어",
    defaultEnabled: true,
    source: "derived-lt",
    pixelFormat: "rgba8-srgb",
    bytesPerPixel: 4,
    productionRole: "manuscript",
  },
  {
    kind: "shadow-ambient",
    layerName: "03_직접 그림자 (Shadow)",
    blendMode: "multiply",
    opacity: 0.85,
    description: "광원 방향에 따른 직접 그림자를 별도 곱하기 레이어로 추출",
    defaultEnabled: true,
    source: "artifact-v2",
    pixelFormat: "r8-linear",
    bytesPerPixel: 1,
    productionRole: "relight",
  },
  {
    kind: "ambient-occlusion",
    layerName: "04_접촉 음영 (Ambient Occlusion)",
    blendMode: "multiply",
    opacity: 0.65,
    description: "모서리·접지·접촉부의 미세 음영을 직접 그림자와 분리",
    defaultEnabled: false,
    source: "artifact-v2",
    pixelFormat: "r8-linear",
    bytesPerPixel: 1,
    productionRole: "relight",
  },
  {
    kind: "specular-highlight",
    layerName: "05_하이라이트 (Highlight)",
    blendMode: "screen",
    opacity: 0.9,
    description: "금속 반사·안광·재질 광택을 스크린 합성용 레이어로 추출",
    defaultEnabled: true,
    source: "derived-lt",
    pixelFormat: "rgba8-linear",
    bytesPerPixel: 4,
    productionRole: "relight",
  },
  {
    kind: "emission",
    layerName: "06_발광 (Emission)",
    blendMode: "screen",
    opacity: 1,
    description: "네온·마법·UI 등 자체 발광만 선형 RGBA로 분리",
    defaultEnabled: false,
    source: "artifact-v2",
    pixelFormat: "rgba8-linear",
    bytesPerPixel: 4,
    productionRole: "relight",
  },
  {
    kind: "depth-map",
    layerName: "07_원근 깊이 (Z-Depth)",
    blendMode: "normal",
    opacity: 1,
    description: "대기원근·심도·ControlNet에 사용하는 정규화 선형 깊이 맵",
    defaultEnabled: false,
    source: "artifact-v2",
    pixelFormat: "r32f",
    bytesPerPixel: 4,
    productionRole: "mask",
  },
  {
    kind: "normal-map",
    layerName: "08_법선 벡터 (Normal)",
    blendMode: "normal",
    opacity: 1,
    description: "후반 리라이팅과 normal-control용 view-space octahedral 법선",
    defaultEnabled: false,
    source: "artifact-v2",
    pixelFormat: "rg8-octahedral",
    bytesPerPixel: 2,
    productionRole: "relight",
  },
  {
    kind: "object-id-mask",
    layerName: "09_오브젝트 ID (Object ID)",
    blendMode: "normal",
    opacity: 1,
    description: "캐릭터·소품·배경을 안정적으로 다시 선택하는 장면 ID 마스크",
    defaultEnabled: true,
    source: "artifact-v2",
    pixelFormat: "r32u-stable-id",
    bytesPerPixel: 4,
    productionRole: "mask",
  },
  {
    kind: "material-id-mask",
    layerName: "10_재질 ID (Material ID)",
    blendMode: "normal",
    opacity: 1,
    description: "피부·의상·금속·유리 등 재질별 보정 선택용 안정 ID 마스크",
    defaultEnabled: false,
    source: "artifact-v2",
    pixelFormat: "r32u-stable-id",
    bytesPerPixel: 4,
    productionRole: "mask",
  },
  {
    kind: "velocity-map",
    layerName: "11_모션 벡터 (Velocity)",
    blendMode: "normal",
    opacity: 1,
    description: "방향성 모션 블러와 속도선 정렬을 위한 화면 픽셀 속도 벡터",
    defaultEnabled: false,
    source: "artifact-v2",
    pixelFormat: "rg32f",
    bytesPerPixel: 8,
    productionRole: "motion",
  },
  {
    kind: "background",
    layerName: "12_배경 (Background)",
    blendMode: "normal",
    opacity: 1,
    description: "투명 배경을 끈 장면의 배경판을 별도 레이어로 분리",
    defaultEnabled: false,
    source: "derived-lt",
    pixelFormat: "rgba8-srgb",
    bytesPerPixel: 4,
    productionRole: "manuscript",
  },
]);

export const MULTIPASS_CONFIG_KEY_BY_KIND: Readonly<
  Record<WebtoonRenderPassKind, MultiPassBooleanConfigKey>
> = Object.freeze({
  "line-art": "includeLineArt",
  "flat-color": "includeFlatColor",
  "shadow-ambient": "includeShadow",
  "ambient-occlusion": "includeAmbientOcclusion",
  "specular-highlight": "includeHighlight",
  emission: "includeEmission",
  "depth-map": "includeDepthMap",
  "normal-map": "includeNormalMap",
  "object-id-mask": "includeObjectIdMask",
  "material-id-mask": "includeMaterialIdMask",
  "velocity-map": "includeVelocity",
  "background": "includeBackground",
});

const PRESET_BOOLEAN_STATE: Readonly<
  Record<MultiPassExportPreset, Readonly<Record<MultiPassBooleanConfigKey, boolean>>>
> = Object.freeze({
  manuscript: Object.freeze({
    includeLineArt: true,
    includeFlatColor: true,
    includeShadow: true,
    includeHighlight: true,
    includeDepthMap: false,
    includeObjectIdMask: true,
    includeNormalMap: false,
    includeMaterialIdMask: false,
    includeAmbientOcclusion: false,
    includeEmission: false,
    includeVelocity: false,
    includeBackground: false,
  }),
  "ai-control": Object.freeze({
    includeLineArt: true,
    includeFlatColor: false,
    includeShadow: false,
    includeHighlight: false,
    includeDepthMap: true,
    includeObjectIdMask: true,
    includeNormalMap: true,
    includeMaterialIdMask: true,
    includeAmbientOcclusion: false,
    includeEmission: false,
    includeVelocity: false,
    includeBackground: false,
  }),
  compositing: Object.freeze({
    includeLineArt: true,
    includeFlatColor: true,
    includeShadow: true,
    includeHighlight: true,
    includeDepthMap: true,
    includeObjectIdMask: true,
    includeNormalMap: true,
    includeMaterialIdMask: true,
    includeAmbientOcclusion: true,
    includeEmission: true,
    includeVelocity: false,
    includeBackground: false,
  }),
  complete: Object.freeze({
    includeLineArt: true,
    includeFlatColor: true,
    includeShadow: true,
    includeHighlight: true,
    includeDepthMap: true,
    includeObjectIdMask: true,
    includeNormalMap: true,
    includeMaterialIdMask: true,
    includeAmbientOcclusion: true,
    includeEmission: true,
    includeVelocity: true,
    includeBackground: false,
  }),
});

export interface PlannedMultiPassExport {
  readonly totalPasses: number;
  readonly activePasses: readonly RenderPassSpec[];
  readonly estimatedFileSizeMb: number;
  readonly estimatedWorkingSetMb: number;
  readonly exportResolution: readonly [number, number];
  readonly captureProfile: "lt-only" | "artifact-v2" | "hybrid";
  readonly recommendedExecution: "interactive" | "worker";
  /** True when format is psd/clip-studio-layers and the PSD budget below is exceeded. */
  readonly psdBlocked: boolean;
  readonly warnings: readonly string[];
}

/**
 * Layered-PSD output budget. Must stay identical to the scene3d-psd-output-notice copy and to
 * STUDIO_BG3D_SHOT_PSD_MAX_* in studio-bg3d-shot-psd-contract.ts; CLIP STUDIO PAINT reads the
 * same layered PSD, so clip-studio-layers shares this budget.
 */
export const MULTIPASS_PSD_MAX_CANVAS_PIXELS = 2_097_152;
export const MULTIPASS_PSD_MAX_LAYERS = 4;
export const MULTIPASS_PSD_MAX_AGGREGATE_LAYER_PIXELS = 8_388_608;

function roundedMb(bytes: number): number {
  return Math.max(0.1, Number((bytes / (1024 * 1024)).toFixed(2)));
}

function normalizedDimension(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(16_384, Math.trunc(value)));
}

export function applyMultiPassExportPreset(
  config: MultiPassExportConfig,
  preset: MultiPassExportPreset,
): MultiPassExportConfig {
  return Object.freeze({ ...config, ...PRESET_BOOLEAN_STATE[preset] });
}

/** Plans a bounded export queue and its browser memory pressure before rendering begins. */
export function planMultiPassExport(config: MultiPassExportConfig): PlannedMultiPassExport {
  const width = normalizedDimension(config.resolutionWidth);
  const height = normalizedDimension(config.resolutionHeight);
  const pixels = width * height;
  const activePasses = WEBTOON_RENDER_PASSES.filter((pass) =>
    Boolean(config[MULTIPASS_CONFIG_KEY_BY_KIND[pass.kind]]),
  );
  const rawBytes = activePasses.reduce(
    (total, pass) => total + pixels * pass.bytesPerPixel,
    0,
  );
  const compressionRatio = config.format === "png-zip"
    ? 0.3
    : config.format === "psd"
      ? 0.42
      : 0.36;
  const derivedCount = activePasses.filter((pass) => pass.source === "derived-lt").length;
  const artifactCount = activePasses.length - derivedCount;
  const captureProfile = derivedCount > 0 && artifactCount > 0
    ? "hybrid"
    : artifactCount > 0
      ? "artifact-v2"
      : "lt-only";
  const workingSetBytes = rawBytes * (captureProfile === "hybrid" ? 1.55 : 1.3);
  const warnings: string[] = [];

  if (activePasses.length === 0) warnings.push("내보낼 패스를 하나 이상 선택하세요.");
  if (width !== config.resolutionWidth || height !== config.resolutionHeight) {
    warnings.push("해상도를 브라우저 캡처 한계인 1~16384px 범위로 보정했습니다.");
  }
  if (pixels > 16_777_216) {
    warnings.push("총 픽셀이 artifact-v2 단일 캡처 예산을 넘으므로 분할 렌더가 필요합니다.");
  }
  if (workingSetBytes > 256 * 1024 * 1024) {
    warnings.push("예상 작업 메모리가 256MB를 넘어 Worker 순차 패스 렌더를 권장합니다.");
  }
  if (Boolean(config.includeVelocity) && config.format !== "png-zip") {
    warnings.push("모션 벡터는 편집기 호환 PSD보다 PNG ZIP + manifest 보존이 안전합니다.");
  }
  if (activePasses.some((pass) => pass.kind === "background") && config.transparentBackground) {
    warnings.push("투명 배경이 켜져 있어 배경 패스는 비어 저장됩니다. 배경을 분리하려면 투명 배경을 끄세요.");
  }

  let psdBlocked = false;
  if (config.format === "psd" || config.format === "clip-studio-layers") {
    if (pixels > MULTIPASS_PSD_MAX_CANVAS_PIXELS) {
      psdBlocked = true;
      warnings.push("레이어 PSD는 캔버스 2,097,152px까지 지원합니다. 해상도를 낮추거나 분리 PNG 패스로 전환하세요.");
    }
    if (activePasses.length > MULTIPASS_PSD_MAX_LAYERS) {
      psdBlocked = true;
      warnings.push(`레이어 PSD는 최대 4레이어까지 지원합니다. 현재 ${activePasses.length}개 패스가 선택되어 패스를 4개 이하로 줄이거나 분리 PNG 패스로 전환하세요.`);
    }
    if (pixels * activePasses.length > MULTIPASS_PSD_MAX_AGGREGATE_LAYER_PIXELS) {
      psdBlocked = true;
      warnings.push("레이어 PSD는 합계 8,388,608px까지 지원합니다. 해상도나 패스 수를 줄이거나 분리 PNG 패스로 전환하세요.");
    }
  }

  return Object.freeze({
    totalPasses: activePasses.length,
    activePasses: Object.freeze(activePasses),
    estimatedFileSizeMb: roundedMb(rawBytes * compressionRatio),
    estimatedWorkingSetMb: roundedMb(workingSetBytes),
    exportResolution: [width, height] as const,
    captureProfile,
    recommendedExecution: pixels > 2_073_600 || workingSetBytes > 64 * 1024 * 1024
      ? "worker"
      : "interactive",
    psdBlocked,
    warnings: Object.freeze(warnings),
  });
}
