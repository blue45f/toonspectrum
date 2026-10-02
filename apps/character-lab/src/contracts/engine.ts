/**
 * 캐릭터 엔진 포트. 구현은 render/babylon-character-engine.ts 하나이며 앱은 이 인터페이스만 본다.
 * core는 Babylon 타입을 알지 못한다(`@babylonjs/*` import는 render/**만).
 */
import type { ApplyPlan, ApplyReceipt } from "./apply-plan";
import type { EngineBackend } from "./backend";
import type { HumanoidBoneName } from "./bones";
import type { CameraFraming, CaptureRequest, CaptureResult, CapturedRaster, ThumbnailRequest } from "./capture";
import type { LabFailure } from "./errors";
import type { HumanoidModelData, PartIdPalette, PartRole } from "./mesh-data";
import type { AuthoredPackagePlan } from "./package-manifest";
import type { PaintLayer } from "./paint";
import type { PhysicsProviderFactory, PhysicsProviderId, PhysicsStatus, SettleReceipt } from "./physics";
import type { Vec3 } from "./pose";
import type { ShadingMode, ShadingProfile } from "./shading";
import type { SlotCapabilityMap } from "./slots";

export const ENGINE_INIT_TIMEOUT_MS = 15_000;

export interface EngineAdapterInfo {
  readonly vendor?: string;
  readonly architecture?: string;
  readonly device?: string;
  readonly description?: string;
  readonly isFallbackAdapter?: boolean;
}

export interface EngineCaps {
  readonly maxTextureSize: number;
  readonly computeShaders: boolean;
  readonly multiRenderTargets: boolean;
  readonly floatReadback: boolean;
  readonly timestampQuery: boolean;
}

export interface EngineDiagnostics {
  readonly backend: EngineBackend;
  readonly engineVersion: string;
  readonly adapter: EngineAdapterInfo | null;
  /** WebGL2 RENDERER 문자열 등 */
  readonly renderer?: string;
  readonly caps: EngineCaps;
}

export type EngineStatus =
  | { readonly phase: "idle" }
  | { readonly phase: "initializing"; readonly backend: EngineBackend }
  | { readonly phase: "ready"; readonly backend: EngineBackend; readonly diagnostics: EngineDiagnostics }
  | { readonly phase: "failed"; readonly backend: EngineBackend; readonly failure: LabFailure }
  | { readonly phase: "lost"; readonly backend: EngineBackend; readonly failure: LabFailure };

export type CharacterSource =
  | { readonly kind: "procedural"; readonly model: HumanoidModelData }
  | { readonly kind: "package"; readonly plan: AuthoredPackagePlan };

export interface SourceCapabilities {
  readonly capabilities: SlotCapabilityMap;
  readonly morphNames: readonly string[];
  readonly boneNames: readonly string[];
  readonly partIdPalette: PartIdPalette;
}

export interface PickHit {
  readonly partId: number;
  readonly role: PartRole;
  readonly uv: readonly [number, number];
  readonly worldPosition: Vec3;
  readonly worldNormal: Vec3;
  readonly distance: number;
}

export interface HudSample {
  readonly frameMs: number;
  readonly frameMsP95: number;
  /** timestamp query 미지원이면 null */
  readonly gpuFrameMs: number | null;
  readonly drawCalls: number;
  readonly activeMeshes: number;
  readonly triangles: number;
  readonly backend: EngineBackend;
  readonly adapterLabel: string;
  readonly physicsProvider: PhysicsProviderId;
  readonly shadingMode: ShadingMode;
}

export interface JointDragHandle {
  readonly bone: HumanoidBoneName;
  /** 캔버스 픽셀 좌표 */
  readonly screen: readonly [number, number];
  readonly world: Vec3;
}

export interface CharacterEngine {
  readonly backend: EngineBackend;
  readonly diagnostics: EngineDiagnostics;
  /**
   * `renderThumbnail`이 `ThumbnailRequest.source`(지오메트리 프리셋의 임시 소스)를 처리하는지(선택, 기본 false).
   * true인 엔진에만 셸이 임시 소스를 만들어 보낸다 — false·미정의 엔진은 현재 로드된 소스를 그린다(source를 무시).
   */
  readonly thumbnailSources?: boolean;
  loadSource(source: CharacterSource): Promise<SourceCapabilities>;
  applyPlan(plan: ApplyPlan): ApplyReceipt;
  setShading(profile: ShadingProfile): void;
  setCamera(framing: CameraFraming): void;
  setPhysicsProvider(id: PhysicsProviderId): Promise<PhysicsStatus>;
  settle(maxSteps: number): Promise<SettleReceipt>;
  renderThumbnail(req: ThumbnailRequest): Promise<CapturedRaster>;
  renderPasses(req: CaptureRequest): Promise<CaptureResult>;
  /** NDC [-1, 1]. NullEngine에서는 null 허용 */
  pick(ndcX: number, ndcY: number): PickHit | null;
  jointHandles(): readonly JointDragHandle[];
  updatePaintTexture(layer: PaintLayer): void;
  exportGlb(): Promise<Uint8Array>;
  readHud(): HudSample;
  resize(width: number, height: number): void;
  dispose(): void;
}

export interface EngineFactoryOptions {
  readonly canvas: HTMLCanvasElement;
  readonly backend: EngineBackend;
  readonly initTimeoutMs: number;
  readonly physicsProviders: PhysicsProviderFactory;
  onLost(failure: LabFailure): void;
}

export type CharacterEngineFactory = (options: EngineFactoryOptions) => Promise<CharacterEngine>;

// ---------------------------------------------------------------- backend 선택(render/capability가 구현)

export interface GpuAdapterProbe {
  readonly isFallbackAdapter: boolean;
  readonly limits: {
    readonly maxTextureDimension2D: number;
    readonly maxBufferSize: number;
    readonly maxStorageBufferBindingSize: number;
    readonly maxColorAttachments: number;
  };
  readonly features: readonly string[];
}

export interface GpuProbe {
  readonly hasNavigatorGpu: boolean;
  /** requestAdapter 결과(null = 어댑터 없음). GPUDevice는 할당하지 않는다. */
  readonly adapter: GpuAdapterProbe | null;
  readonly webgl2: boolean;
}

export const BACKEND_BLOCK_CODES = [
  "webgpu-unsupported",
  "webgpu-no-adapter",
  "webgpu-fallback-adapter",
  "webgpu-limits",
  "webgl2-unsupported",
] as const;
export type BackendBlockCode = (typeof BACKEND_BLOCK_CODES)[number];

export type BackendDecision =
  | { readonly ok: true; readonly backend: EngineBackend }
  | { readonly ok: false; readonly backend: EngineBackend; readonly code: BackendBlockCode; readonly reasonKo: string };

/** WebGPU 최소 한계(render/capability/select-backend.ts가 적용) */
export const WEBGPU_MIN_LIMITS = Object.freeze({
  maxTextureDimension2D: 4096,
  maxBufferSize: 128 * 1024 * 1024,
  maxStorageBufferBindingSize: 32 * 1024 * 1024,
  maxColorAttachments: 4,
});

// ---------------------------------------------------------------- 엔진 세션(app/shell/engine-session.ts가 구현)

export interface EngineSession {
  /** 사용자 명시 선택. 차단·실패는 EngineStatus.failed로 노출하고 다른 backend를 시도하지 않는다. */
  select(backend: EngineBackend, canvas: HTMLCanvasElement): Promise<void>;
  status(): EngineStatus;
  engine(): CharacterEngine | null;
  /** 현재 엔진에 소스를 (재)로드한다. 엔진이 없으면 null. */
  reloadSource(source: CharacterSource): Promise<SourceCapabilities | null>;
  subscribe(listener: (status: EngineStatus) => void): () => void;
  dispose(): void;
}

// ---------------------------------------------------------------- 엔진 레인 표(문서·HUD 동일 표기)

export type EngineLaneStatus = "primary-experimental" | "explicit-alternative" | "test-only" | "available" | "available-dynamic" | "unavailable" | "docs-only";

export interface EngineLane {
  readonly id: string;
  readonly labelKo: string;
  readonly status: EngineLaneStatus;
  readonly noteKo: string;
}

export const ENGINE_LANES: readonly EngineLane[] = [
  { id: "babylon-webgpu", labelKo: "Babylon 9.19 WebGPU", status: "primary-experimental", noteKo: "주 엔진(실험, 브라우저 미검증). 사용자 명시 선택, 실패 시 failed 노출." },
  { id: "babylon-webgl2", labelKo: "Babylon 9.19 WebGL2", status: "explicit-alternative", noteKo: "명시 대안. 자동 전환 금지." },
  { id: "null", labelKo: "NullEngine", status: "test-only", noteKo: "테스트 전용. readback은 provenance.synthetic=true." },
  { id: "physics-builtin-pbd", labelKo: "내장 PBD", status: "available", noteKo: "결정적 XPBD 체인·캡슐 충돌." },
  { id: "physics-rapier", labelKo: "Rapier 0.19.3", status: "available-dynamic", noteKo: "동적 import. 소품·접지용." },
  { id: "physics-havok", labelKo: "Havok", status: "unavailable", noteKo: "@babylonjs/havok 미설치(라이선스·lockfile 승인 필요)." },
  { id: "three-webgpu-vrm", labelKo: "Three 0.184 WebGPU + three-vrm", status: "docs-only", noteKo: "비교 문서 전용." },
  { id: "playcanvas", labelKo: "PlayCanvas", status: "docs-only", noteKo: "비교 문서 전용(자동 폴백 기본이라 ADR-0018 충돌)." },
];
