import type {
  BrushPhysicsId,
  BrushProviderId,
  BrushQualityPolicy,
} from "./brush-studio-v5-quality-types";

export const BRUSH_STUDIO_V5_RUNTIME_SCHEMA_VERSION = 2 as const;
export const BRUSH_STUDIO_V5_BENCHMARK_SCHEMA_VERSION = 1 as const;

export type BrushRuntimePhase =
  | "hover"
  | "preview"
  | "live"
  | "settle"
  | "commit"
  | "export";

export type BrushRuntimeDomain =
  | "main"
  | "input-worker"
  | "webgpu"
  | "wasm-worker"
  | "webgl-worker"
  | "cpu-worker";

export type BrushRuntimeAuthority =
  | "input"
  | "motion"
  | "carrier"
  | "surface"
  | "deposition"
  | "wet"
  | "pickup"
  | "pigment"
  | "pattern"
  | "height"
  | "output"
  | "auxiliary";

export type BrushRuntimeProviderReadiness =
  | "wired-product"
  | "wired-conditional"
  | "bridge-ready"
  | "descriptor-only"
  | "reference-only";

export type BrushRuntimeCertification =
  | "certified"
  | "conditional"
  | "design-only"
  | "blocked";

export type BrushRuntimeFieldKind = "buffer" | "tile-texture" | "receipt";

export type BrushRuntimeFieldFormat =
  | "sample-struct-v3"
  | "path-frame-v1"
  | "contact-struct-v2"
  | "bristle-struct-v1"
  | "particle-struct-v1"
  | "r8unorm"
  | "r16float"
  | "rg16float"
  | "rgba8unorm"
  | "rgba16float"
  | "rgba32float"
  | "r32uint"
  | "json-receipt";

export type BrushRuntimeFieldLifetime =
  | "frame"
  | "stroke"
  | "settle"
  | "document"
  | "export";

export type BrushRuntimeActiveTileMode =
  | "none"
  | "dirty"
  | "wet"
  | "occupied"
  | "settling"
  | "all-visible";

export type BrushRuntimeFieldId =
  | "samples.accepted"
  | "samples.predicted"
  | "path.modeled"
  | "contacts.tip"
  | "paper.height"
  | "paper.absorbency"
  | "paper.fiber"
  | "coverage.live"
  | "coverage.pattern"
  | "pigment.weights"
  | "pigment.mobile"
  | "pigment.fixed"
  | "wetness"
  | "velocity"
  | "pressure"
  | "divergence"
  | "curl"
  | "bristle.state"
  | "reservoir.state"
  | "particle.state"
  | "reaction.a"
  | "reaction.b"
  | "paint.height"
  | "paint.normal"
  | "pattern.phase"
  | "rgba.preview"
  | "rgba.live"
  | "rgba.commit"
  | "receipt.raster";

export interface BrushRuntimeFieldDescriptor {
  readonly id: BrushRuntimeFieldId;
  readonly label: string;
  readonly kind: BrushRuntimeFieldKind;
  readonly format: BrushRuntimeFieldFormat;
  readonly lifetime: BrushRuntimeFieldLifetime;
  readonly scale: number;
  readonly layers: number;
  readonly pingPong: boolean;
  readonly bytesPerElement: number;
  readonly elementsPerTile?: number;
  readonly haloPx: number;
  readonly activeTileMode: BrushRuntimeActiveTileMode;
  readonly canonical: boolean;
  readonly estimatedBytes: number;
}

export interface BrushRuntimePass {
  readonly id: string;
  readonly label: string;
  readonly phase: BrushRuntimePhase;
  readonly domain: BrushRuntimeDomain;
  readonly provider: BrushProviderId | "browser";
  readonly authority: BrushRuntimeAuthority;
  readonly canonical: boolean;
  readonly acceptsPredicted: boolean;
  readonly reads: readonly BrushRuntimeFieldId[];
  readonly writes: readonly BrushRuntimeFieldId[];
  readonly dependsOn: readonly string[];
  readonly repeat: number;
  readonly fusionKey: string | null;
  readonly activeTileMode: BrushRuntimeActiveTileMode;
  readonly haloPx: number;
  readonly budgetMs: number;
  readonly implementationPath: string | null;
}

export interface BrushRuntimeFusedPassGroup {
  readonly id: string;
  readonly phase: BrushRuntimePhase;
  readonly domain: BrushRuntimeDomain;
  readonly passIds: readonly string[];
  readonly budgetMs: number;
  readonly reads: readonly BrushRuntimeFieldId[];
  readonly writes: readonly BrushRuntimeFieldId[];
}

export interface BrushRuntimeProviderEvidence {
  readonly id: BrushProviderId;
  readonly label: string;
  readonly readiness: BrushRuntimeProviderReadiness;
  readonly productKernel: boolean;
  readonly phases: readonly BrushRuntimePhase[];
  readonly domains: readonly BrushRuntimeDomain[];
  readonly authorities: readonly BrushRuntimeAuthority[];
  readonly browserRequirements: readonly (
    | "webgpu"
    | "webgl2"
    | "offscreen-canvas"
    | "shared-array-buffer"
  )[];
  readonly evidencePaths: readonly string[];
  readonly qualityGate: string;
  readonly note: string;
}

export interface BrushRuntimeCapabilities {
  readonly scannedAt: string;
  readonly secureContext: boolean;
  readonly webgpu: boolean;
  readonly webgpuAdapter: boolean;
  readonly webgpuTimestampQuery: boolean;
  readonly webgl2: boolean;
  readonly offscreenCanvas: boolean;
  readonly sharedArrayBuffer: boolean;
  readonly crossOriginIsolated: boolean;
  readonly pointerRawUpdate: boolean;
  readonly coalescedEvents: boolean;
  readonly predictedEvents: boolean;
  readonly hover: boolean;
  readonly hardwareConcurrency: number;
  readonly deviceMemoryGb: number | null;
}

export interface BrushRuntimeBenchmarkReceipt {
  readonly schemaVersion: typeof BRUSH_STUDIO_V5_BENCHMARK_SCHEMA_VERSION;
  readonly measuredAt: string;
  readonly capabilityFingerprint: string;
  readonly iterations: number;
  readonly cpuDabMillionMarksPerSecond: number;
  readonly eventLoopP50Ms: number;
  readonly eventLoopP95Ms: number;
  readonly webgpuDispatchP50Ms: number | null;
  readonly webgpuDispatchP95Ms: number | null;
  readonly webgpuWorkItems: number;
  readonly checksum: number;
  readonly stable: boolean;
}

export type BrushRuntimeGateSeverity = "error" | "warning" | "info";

export interface BrushRuntimeGate {
  readonly id: string;
  readonly severity: BrushRuntimeGateSeverity;
  readonly title: string;
  readonly detail: string;
  readonly fix: string | null;
  readonly provider?: BrushProviderId;
  readonly passId?: string;
  readonly fieldId?: BrushRuntimeFieldId;
}

export interface BrushRuntimeAuthorityBinding {
  readonly authority: BrushRuntimeAuthority;
  readonly provider: BrushProviderId | "browser";
  readonly reason: string;
}

export interface BrushRuntimeTilePlan {
  readonly tileSize: 64 | 128 | 256;
  readonly activeTileCount: number;
  readonly liveTileLimit: number;
  readonly settleTileLimit: number;
  readonly maxHaloPx: number;
  readonly atlasMemoryMb: number;
  readonly scheduling: readonly string[];
}

export interface BrushRuntimeQualityBudget {
  readonly targetFrameMs: number;
  readonly liveBudgetMs: number;
  readonly settleBudgetMs: number;
  readonly estimatedLiveMs: number;
  readonly estimatedSettleMs: number;
  readonly estimatedMemoryMb: number;
  readonly wiredProviderFraction: number;
  readonly descriptorOnlyCount: number;
}

export interface BrushRuntimeProgram {
  readonly schemaVersion: typeof BRUSH_STUDIO_V5_RUNTIME_SCHEMA_VERSION;
  readonly programKey: string;
  readonly certification: BrushRuntimeCertification;
  readonly policy: BrushQualityPolicy;
  readonly capabilities: BrushRuntimeCapabilities;
  readonly benchmark: BrushRuntimeBenchmarkReceipt | null;
  readonly authorities: readonly BrushRuntimeAuthorityBinding[];
  readonly providers: readonly BrushRuntimeProviderEvidence[];
  readonly fields: readonly BrushRuntimeFieldDescriptor[];
  readonly passes: readonly BrushRuntimePass[];
  readonly fusedGroups: readonly BrushRuntimeFusedPassGroup[];
  readonly gates: readonly BrushRuntimeGate[];
  readonly tilePlan: BrushRuntimeTilePlan;
  readonly budget: BrushRuntimeQualityBudget;
}

export interface BrushRuntimeCompileOptions {
  readonly capabilities?: BrushRuntimeCapabilities;
  readonly benchmark?: BrushRuntimeBenchmarkReceipt | null;
  readonly strictProduct?: boolean;
  readonly activeTileCount?: number;
}

export interface BrushRuntimeProviderSelection {
  readonly provider: BrushProviderId;
  readonly requiredByPhysics?: BrushPhysicsId;
  readonly reason: string;
}

const phaseList = (...values: BrushRuntimePhase[]): readonly BrushRuntimePhase[] => Object.freeze(values);
const domainList = (...values: BrushRuntimeDomain[]): readonly BrushRuntimeDomain[] => Object.freeze(values);
const authorityList = (...values: BrushRuntimeAuthority[]): readonly BrushRuntimeAuthority[] => Object.freeze(values);
const requirementList = (...values: ("webgpu" | "webgl2" | "offscreen-canvas" | "shared-array-buffer")[]): readonly ("webgpu" | "webgl2" | "offscreen-canvas" | "shared-array-buffer")[] => Object.freeze(values);
const pathList = (...values: string[]): readonly string[] => Object.freeze(values);

export const BRUSH_RUNTIME_PROVIDER_EVIDENCE: readonly BrushRuntimeProviderEvidence[] = Object.freeze([
  Object.freeze({
    id: "native-webgpu",
    label: "Native WebGPU",
    readiness: "wired-product",
    productKernel: true,
    phases: phaseList("hover", "preview", "live", "settle", "commit", "export"),
    domains: domainList("webgpu"),
    authorities: authorityList("carrier", "surface", "deposition", "pattern", "height", "output"),
    browserRequirements: requirementList("webgpu", "offscreen-canvas"),
    evidencePaths: pathList(
      "apps/web/src/domains/creator/render/studio-gpu-bristle-runtime.ts",
      "apps/web/src/domains/creator/studio-living-ink-webgpu-runtime.ts",
    ),
    qualityGate: "실제 GPU device/pipeline 생성과 live·commit 검증 경로가 있어야 함",
    note: "동등 질감에서는 기본 캐리어·타일·합성 권위입니다.",
  }),
  Object.freeze({
    id: "perfect-freehand",
    label: "perfect-freehand",
    readiness: "wired-product",
    productKernel: true,
    phases: phaseList("live", "commit", "export"),
    domains: domainList("input-worker", "webgpu"),
    authorities: authorityList("carrier"),
    browserRequirements: requirementList(),
    evidencePaths: pathList(
      "apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-brush-filter-edit-runtime.ts",
      "packages/studio-engine-registry/src/renderer-roles.ts",
    ),
    qualityGate: "outline 결과의 self-intersection·taper·live/export 동등성",
    note: "압력 외곽선을 만들고 제품 WebGPU 경로가 래스터화합니다.",
  }),
  Object.freeze({
    id: "google-ink",
    label: "Google Ink",
    readiness: "wired-conditional",
    productKernel: true,
    phases: phaseList("preview", "live", "commit", "export"),
    domains: domainList("wasm-worker", "webgpu"),
    authorities: authorityList("motion", "carrier"),
    browserRequirements: requirementList("offscreen-canvas"),
    evidencePaths: pathList(
      "packages/studio-engine-registry/src/renderer-roles.ts",
      "apps/web/src/domains/creator/hybrid-dcc/studio-hybrid-brush-filter-edit-runtime.ts",
    ),
    qualityGate: "버전 고정·종점 catch-up·corner overshoot·mesh export 검증",
    note: "기기·브러시별 필기감 A/B 승격이 필요한 메시 캐리어입니다.",
  }),
  Object.freeze({
    id: "libmypaint",
    label: "libmypaint",
    readiness: "bridge-ready",
    productKernel: false,
    phases: phaseList("live", "commit", "export"),
    domains: domainList("wasm-worker"),
    authorities: authorityList("deposition", "pickup"),
    browserRequirements: requirementList("offscreen-canvas"),
    evidencePaths: pathList(
      "apps/web/src/domains/creator/brush/studio-drawing-library-strategy.ts",
    ),
    qualityGate: "실제 WASM worker·브라우저 readback·live/commit 영수증 필요",
    note: "전략·브리지 수준이며 제품 픽셀 authority로 자동 승격하지 않습니다.",
  }),
  Object.freeze({
    id: "hokusai",
    label: "Hokusai",
    readiness: "wired-conditional",
    productKernel: true,
    phases: phaseList("live", "commit", "export"),
    domains: domainList("wasm-worker"),
    authorities: authorityList("deposition", "pickup"),
    browserRequirements: requirementList("offscreen-canvas"),
    evidencePaths: pathList(
      "apps/web/src/domains/creator/render/studio-hokusai-live-brush-runtime.ts",
      "apps/web/src/domains/creator/render/studio-hokusai-live-brush.worker.ts",
      "scripts/verify-studio-hokusai-live-brush.mjs",
    ),
    qualityGate: "프리셋별 Chromium 질감·처리량·live/commit parity 승격",
    note: "검증된 MYB 프리셋만 조건부 제품 authority로 허용합니다.",
  }),
  Object.freeze({
    id: "krita-smudge",
    label: "Krita Color Smudge",
    readiness: "descriptor-only",
    productKernel: false,
    phases: phaseList("live", "settle", "commit"),
    domains: domainList("wasm-worker"),
    authorities: authorityList("pickup"),
    browserRequirements: requirementList("offscreen-canvas"),
    evidencePaths: pathList(),
    qualityGate: "GPL source closure·WASM worker·underpaint corpus 필요",
    note: "선택 가능하되 실제 제품 커널이 배선되기 전에는 설계 전용입니다.",
  }),
  Object.freeze({
    id: "krita-hairy",
    label: "Krita Hairy",
    readiness: "descriptor-only",
    productKernel: false,
    phases: phaseList("live", "commit", "export"),
    domains: domainList("wasm-worker"),
    authorities: authorityList("carrier", "deposition"),
    browserRequirements: requirementList("offscreen-canvas"),
    evidencePaths: pathList(),
    qualityGate: "강모 접촉·reservoir·GPL 배포·실기기 처리량 검증",
    note: "Hairy/Bristle PaintOp의 제품 포트가 필요합니다.",
  }),
  Object.freeze({
    id: "krita-spray",
    label: "Krita Spray",
    readiness: "descriptor-only",
    productKernel: false,
    phases: phaseList("live", "commit"),
    domains: domainList("wasm-worker"),
    authorities: authorityList("deposition"),
    browserRequirements: requirementList("offscreen-canvas"),
    evidencePaths: pathList(),
    qualityGate: "입자 분포·회전·결정성·GPL 배포 검증",
    note: "WebGPU 입자 경로보다 고유한 결과가 입증될 때만 승격합니다.",
  }),
  Object.freeze({
    id: "krita-hatching",
    label: "Krita Hatching",
    readiness: "descriptor-only",
    productKernel: false,
    phases: phaseList("live", "commit", "export"),
    domains: domainList("wasm-worker"),
    authorities: authorityList("pattern"),
    browserRequirements: requirementList("offscreen-canvas"),
    evidencePaths: pathList(),
    qualityGate: "방향·교차·곡률 추종과 GPL 배포 검증",
    note: "현재는 패턴 설계 provider이며 제품 커널이 아닙니다.",
  }),
  Object.freeze({
    id: "inkwash",
    label: "Living Ink / Inkwash",
    readiness: "wired-product",
    productKernel: true,
    phases: phaseList("live", "settle", "commit", "export"),
    domains: domainList("webgpu", "cpu-worker"),
    authorities: authorityList("wet", "deposition", "output"),
    browserRequirements: requirementList("webgpu", "offscreen-canvas"),
    evidencePaths: pathList(
      "apps/web/src/domains/creator/studio-living-ink-webgpu-runtime.ts",
      "apps/web/src/domains/creator/studio-living-ink.worker.ts",
      "apps/web/src/domains/creator/studio-living-ink-provider.ts",
      "scripts/verify-studio-living-ink-execution.mjs",
    ),
    qualityGate: "mobile/fixed pigment·wetness·flow·settle의 브라우저 execution receipt",
    note: "습식 필드의 제품 WebGPU authority입니다.",
  }),
  Object.freeze({
    id: "thin-film",
    label: "Thin-film",
    readiness: "descriptor-only",
    productKernel: false,
    phases: phaseList("settle", "commit", "export"),
    domains: domainList("webgpu"),
    authorities: authorityList("wet", "height"),
    browserRequirements: requirementList("webgpu"),
    evidencePaths: pathList(),
    qualityGate: "질량 보존·드립 길이/두께·active tile 안정성",
    note: "연구 설계는 있으나 제품 커널 배선 전에는 설계 전용입니다.",
  }),
  Object.freeze({
    id: "reaction-diffusion",
    label: "Reaction–Diffusion",
    readiness: "descriptor-only",
    productKernel: false,
    phases: phaseList("settle", "commit", "export"),
    domains: domainList("webgpu"),
    authorities: authorityList("auxiliary"),
    browserRequirements: requirementList("webgpu"),
    evidencePaths: pathList(),
    qualityGate: "고정 timestep·성장 경계·tile halo·결정성 검증",
    note: "덴드라이트·균열용 실험 provider입니다.",
  }),
  Object.freeze({
    id: "p5-brush",
    label: "p5.brush standalone",
    readiness: "wired-conditional",
    productKernel: true,
    phases: phaseList("settle", "commit", "export"),
    domains: domainList("webgl-worker"),
    authorities: authorityList("pattern", "deposition"),
    browserRequirements: requirementList("webgl2", "offscreen-canvas"),
    evidencePaths: pathList(
      "apps/web/src/domains/creator/studio-procedural-artistic-brush-provider.ts",
      "apps/web/src/domains/creator/brush/studio-p5-brush-standalone-runtime-adapter.ts",
      "scripts/verify-studio-p5-brush-real-runtime.mjs",
    ),
    qualityGate: "settled-only Worker·owned RGBA·시드 결정성·실브라우저 검증",
    note: "라이브 hot path가 아닌 정착형 생성 provider입니다.",
  }),
  Object.freeze({
    id: "spectral",
    label: "Spectral.js",
    readiness: "descriptor-only",
    productKernel: false,
    phases: phaseList("live", "settle", "commit", "export"),
    domains: domainList("webgpu", "cpu-worker"),
    authorities: authorityList("pigment"),
    browserRequirements: requirementList("webgpu"),
    evidencePaths: pathList(),
    qualityGate: "공식 JS/GLSL 벡터와 WGSL ΔE·글레이즈·성능 parity",
    note: "기본 안료 후보지만 제품 WGSL 커널 증거가 생기기 전에는 설계 전용입니다.",
  }),
  Object.freeze({
    id: "open-km",
    label: "Open K/S",
    readiness: "descriptor-only",
    productKernel: false,
    phases: phaseList("live", "settle", "commit", "export"),
    domains: domainList("webgpu", "cpu-worker"),
    authorities: authorityList("pigment"),
    browserRequirements: requirementList("webgpu"),
    evidencePaths: pathList(),
    qualityGate: "검증 K/S 데이터·Saunderson·D65/observer·WGSL parity",
    note: "수식은 적극 차용하되 예제의 가상 안료 데이터는 제품 사용하지 않습니다.",
  }),
  Object.freeze({
    id: "pigment-painter",
    label: "pigment-painter",
    readiness: "descriptor-only",
    productKernel: false,
    phases: phaseList("live", "settle", "commit"),
    domains: domainList("wasm-worker", "webgpu"),
    authorities: authorityList("pickup", "pigment"),
    browserRequirements: requirementList("webgpu", "offscreen-canvas"),
    evidencePaths: pathList(),
    qualityGate: "GPL closure·자체 LUT receipt·hole/noise score·reservoir corpus",
    note: "LUT baker·pickup reservoir·normal tip를 제품 수준으로 포트해야 합니다.",
  }),
  Object.freeze({
    id: "mixbox",
    label: "Mixbox",
    readiness: "descriptor-only",
    productKernel: false,
    phases: phaseList("live", "settle", "commit", "export"),
    domains: domainList("webgpu", "cpu-worker"),
    authorities: authorityList("pigment"),
    browserRequirements: requirementList("webgpu"),
    evidencePaths: pathList(),
    qualityGate: "private grant·LUT/WGSL 파생권·Spectral/K/S 대체 불가능성 영수증",
    note: "대체 불가능성이 입증된 브러시에서만 조건부 사용합니다.",
  }),
  Object.freeze({
    id: "realbrush",
    label: "RealBrush exemplar",
    readiness: "reference-only",
    productKernel: false,
    phases: phaseList("live", "commit", "export"),
    domains: domainList("webgpu", "cpu-worker"),
    authorities: authorityList("surface", "deposition"),
    browserRequirements: requirementList("webgpu"),
    evidencePaths: pathList(),
    qualityGate: "권리 정리된 실물 atlas·seam·반복성·multi-pressure corpus",
    note: "연구 원리를 차용하는 exemplar 합성 후보입니다.",
  }),
]);

export function brushRuntimeProviderEvidence(id: BrushProviderId): BrushRuntimeProviderEvidence {
  return BRUSH_RUNTIME_PROVIDER_EVIDENCE.find((entry) => entry.id === id)
    ?? BRUSH_RUNTIME_PROVIDER_EVIDENCE[0]!;
}
