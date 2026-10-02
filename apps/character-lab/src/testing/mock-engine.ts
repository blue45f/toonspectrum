/**
 * CharacterEngine 포트의 모의 구현. 호출을 기록하고 결정적 합성 래스터를 돌려준다.
 * 셸(engine-session·thumbnail-scheduler)·export·vision 테스트가 Babylon 없이 엔진 경로를 검증할 때 쓴다.
 */
import { ALL_AVAILABLE_CAPABILITIES, CAPTURE_PROFILE_ID, ENGINE_INIT_TIMEOUT_MS, failVisible } from "../contracts";
import { fnv1a32 } from "../shared/hash";
import { mulberry32 } from "../shared/prng";

import type {
  ApplyPlan,
  ApplyReceipt,
  CameraFraming,
  CaptureRequest,
  CaptureResult,
  CapturedDepth,
  CapturedRaster,
  CharacterEngine,
  CharacterEngineFactory,
  CharacterSource,
  EngineBackend,
  EngineDiagnostics,
  EngineFactoryOptions,
  HudSample,
  JointDragHandle,
  LabFailure,
  PaintLayer,
  PartIdPalette,
  PhysicsProvider,
  PhysicsProviderFactory,
  PhysicsProviderId,
  PhysicsStatus,
  PickHit,
  RasterPassId,
  SettleReceipt,
  ShadingProfile,
  SlotCapabilityMap,
  SourceCapabilities,
  ThumbnailRequest,
} from "../contracts";

export interface MockEngineCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

export interface MockEngineOptions {
  readonly backend?: EngineBackend;
  readonly capabilities?: SlotCapabilityMap;
  readonly morphNames?: readonly string[];
  readonly boneNames?: readonly string[];
  readonly partIdPalette?: PartIdPalette;
  /** 썸네일 실패 주입(요청별 판단 가능) */
  readonly failThumbnail?: LabFailure | ((req: ThumbnailRequest) => LabFailure | null);
  readonly failPasses?: LabFailure;
  /** 썸네일 완료를 지연시킨다(직렬성 테스트용). resolve를 호출해야 완료된다. */
  readonly holdThumbnails?: boolean;
  readonly physicsStatus?: (id: PhysicsProviderId) => PhysicsStatus;
  /** `CharacterEngine.thumbnailSources` 값(임시 소스 썸네일 지원 시뮬레이션) */
  readonly thumbnailSources?: boolean;
}

export interface MockEngine extends CharacterEngine {
  readonly calls: MockEngineCall[];
  readonly loadedSources: CharacterSource[];
  readonly appliedPlans: ApplyPlan[];
  readonly paintUploads: PaintLayer[];
  readonly disposed: boolean;
  readonly shading: ShadingProfile | null;
  readonly camera: CameraFraming | null;
  readonly physicsProvider: PhysicsProviderId;
  /** holdThumbnails일 때 대기 중인 썸네일 수 */
  pendingThumbnails(): number;
  /** holdThumbnails일 때 가장 오래된 썸네일 1개를 완료시킨다 */
  releaseThumbnail(): boolean;
  /** device lost 시뮬레이션 — factory가 등록한 onLost를 호출한다 */
  emitLost(failure: LabFailure): void;
}

/** 시드 기반 결정적 RGBA 패턴(완전 투명 테두리 1px, 내부 불투명) */
export function syntheticRaster(width: number, height: number, seed: number): CapturedRaster {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const random = mulberry32(seed);
  const base = [Math.floor(random() * 256), Math.floor(random() * 256), Math.floor(random() * 256)] as const;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      rgba[i] = (base[0] + x * 3) & 255;
      rgba[i + 1] = (base[1] + y * 5) & 255;
      rgba[i + 2] = (base[2] + x + y) & 255;
      rgba[i + 3] = edge ? 0 : 255;
    }
  }
  return { width, height, rgba };
}

export function syntheticDepth(width: number, height: number): CapturedDepth {
  const depth = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) depth[y * width + x] = height <= 1 ? 0 : y / (height - 1);
  }
  return { width, height, depth, near: 0.1, far: 10 };
}

export function mockDiagnostics(backend: EngineBackend): EngineDiagnostics {
  return {
    backend,
    engineVersion: "mock-0.0.0",
    adapter: { vendor: "mock", device: "mock-device", isFallbackAdapter: false },
    caps: { maxTextureSize: 8192, computeShaders: backend === "webgpu", multiRenderTargets: true, floatReadback: true, timestampQuery: false },
  };
}

export function createMockEngine(options: MockEngineOptions = {}): MockEngine {
  const backend = options.backend ?? "webgpu";
  const calls: MockEngineCall[] = [];
  const loadedSources: CharacterSource[] = [];
  const appliedPlans: ApplyPlan[] = [];
  const paintUploads: PaintLayer[] = [];
  const held: Array<() => void> = [];
  let disposed = false;
  let shading: ShadingProfile | null = null;
  let camera: CameraFraming | null = null;
  let physicsProvider: PhysicsProviderId = "builtin-pbd";
  let lostHandler: ((failure: LabFailure) => void) | null = null;
  const record = (method: string, ...args: unknown[]): void => {
    calls.push({ method, args });
  };
  const capabilities = options.capabilities ?? ALL_AVAILABLE_CAPABILITIES;

  const engine: MockEngine = {
    backend,
    diagnostics: mockDiagnostics(backend),
    ...(options.thumbnailSources !== undefined ? { thumbnailSources: options.thumbnailSources } : {}),
    calls,
    loadedSources,
    appliedPlans,
    paintUploads,
    get disposed() {
      return disposed;
    },
    get shading() {
      return shading;
    },
    get camera() {
      return camera;
    },
    get physicsProvider() {
      return physicsProvider;
    },
    async loadSource(source) {
      record("loadSource", source);
      loadedSources.push(source);
      const result: SourceCapabilities = {
        capabilities,
        morphNames: options.morphNames ?? (source.kind === "procedural" ? source.model.morphNames : Object.values(source.plan.shapeKeyMap)),
        boneNames: options.boneNames ?? (source.kind === "procedural" ? source.model.skeleton.bones.map((b) => b.name) : Object.values(source.plan.boneMap)),
        partIdPalette: options.partIdPalette ?? (source.kind === "procedural" ? source.model.partIdPalette : {}),
      };
      return result;
    },
    applyPlan(plan): ApplyReceipt {
      record("applyPlan", plan);
      appliedPlans.push(plan);
      return {
        revision: plan.revision,
        appliedMorphs: Object.keys(plan.morphWeights).length,
        appliedBones: Object.keys(plan.boneRotations).length,
        skippedMorphs: [],
        skippedBones: [],
      };
    },
    setShading(profile) {
      record("setShading", profile);
      shading = profile;
    },
    setCamera(framing) {
      record("setCamera", framing);
      camera = framing;
    },
    async setPhysicsProvider(id) {
      record("setPhysicsProvider", id);
      const status = options.physicsStatus?.(id) ?? { id, status: "active" as const, deterministic: id !== "havok", versionLabel: "mock" };
      if (status.status === "active") physicsProvider = id;
      return status;
    },
    async settle(maxSteps): Promise<SettleReceipt> {
      record("settle", maxSteps);
      return { steps: Math.min(maxSteps, 120), settled: true, maxVelocity: 0 };
    },
    async renderThumbnail(req) {
      record("renderThumbnail", req);
      if (options.holdThumbnails) {
        await new Promise<void>((resolve) => {
          held.push(resolve);
        });
      }
      const failure = typeof options.failThumbnail === "function" ? options.failThumbnail(req) : options.failThumbnail;
      if (failure) throw failure;
      return syntheticRaster(req.size, req.size, fnv1a32(req.presetId));
    },
    async renderPasses(req: CaptureRequest): Promise<CaptureResult> {
      record("renderPasses", req);
      if (options.failPasses) throw options.failPasses;
      const passes: Partial<Record<RasterPassId, CapturedRaster>> = {};
      let depth: CapturedDepth | undefined;
      for (const pass of req.passes) {
        if (pass === "depth") depth = syntheticDepth(req.width, req.height);
        else passes[pass] = syntheticRaster(req.width, req.height, fnv1a32(pass));
      }
      const result: CaptureResult = {
        profile: CAPTURE_PROFILE_ID,
        width: req.width,
        height: req.height,
        passes,
        partIdPalette: options.partIdPalette ?? {},
        provenance: { backend, synthetic: true, physicsProvider, settleSteps: req.settleSteps, recipeDigest: "mock" },
        ...(depth ? { depth } : {}),
      };
      return result;
    },
    pick(ndcX, ndcY): PickHit | null {
      record("pick", ndcX, ndcY);
      return null;
    },
    jointHandles(): readonly JointDragHandle[] {
      record("jointHandles");
      return [];
    },
    updatePaintTexture(layer) {
      record("updatePaintTexture", layer);
      paintUploads.push(layer);
    },
    async exportGlb() {
      record("exportGlb");
      // "glTF" magic + version 2 + 길이 12(빈 GLB) — 실제 GLB는 testing/minimal-glb.ts를 쓴다.
      const bytes = new Uint8Array(12);
      new DataView(bytes.buffer).setUint32(0, 0x46546c67, true);
      new DataView(bytes.buffer).setUint32(4, 2, true);
      new DataView(bytes.buffer).setUint32(8, 12, true);
      return bytes;
    },
    readHud(): HudSample {
      return {
        frameMs: 8,
        frameMsP95: 10,
        gpuFrameMs: null,
        drawCalls: appliedPlans.length,
        activeMeshes: loadedSources.length,
        triangles: 0,
        backend,
        adapterLabel: "mock",
        physicsProvider,
        shadingMode: shading?.mode ?? "pbr",
      };
    },
    resize(width, height) {
      record("resize", width, height);
    },
    dispose() {
      record("dispose");
      disposed = true;
    },
    pendingThumbnails: () => held.length,
    releaseThumbnail() {
      const next = held.shift();
      if (!next) return false;
      next();
      return true;
    },
    emitLost(failure) {
      lostHandler?.(failure);
    },
  };

  // factory가 onLost를 연결할 수 있도록 내부 훅을 노출한다.
  Object.defineProperty(engine, "__setLostHandler", {
    value: (handler: (failure: LabFailure) => void) => {
      lostHandler = handler;
    },
    enumerable: false,
  });
  return engine;
}

export interface MockEngineFactoryOptions {
  readonly engine?: MockEngine;
  /** 생성 실패 주입 */
  readonly failWith?: LabFailure;
  /** 생성 지연(ms). initTimeoutMs보다 크면 세션이 timeout으로 실패해야 한다. */
  readonly delayMs?: number;
  readonly neverResolve?: boolean;
}

export interface MockEngineFactory extends CharacterEngineFactory {
  readonly calls: EngineFactoryOptions[];
}

/** CharacterEngineFactory 모의. 호출 옵션을 기록하고 engine.emitLost → options.onLost를 연결한다. */
export function createMockEngineFactory(options: MockEngineFactoryOptions = {}): MockEngineFactory {
  const calls: EngineFactoryOptions[] = [];
  const factory = (async (factoryOptions: EngineFactoryOptions): Promise<CharacterEngine> => {
    calls.push(factoryOptions);
    if (options.neverResolve) {
      await new Promise<never>(() => undefined);
    }
    if (options.delayMs) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, options.delayMs);
      });
    }
    if (options.failWith) throw options.failWith;
    const engine = options.engine ?? createMockEngine({ backend: factoryOptions.backend });
    const hook = (engine as unknown as { __setLostHandler?: (handler: (failure: LabFailure) => void) => void }).__setLostHandler;
    hook?.(factoryOptions.onLost);
    return engine;
  }) as MockEngineFactory;
  Object.defineProperty(factory, "calls", { value: calls, enumerable: true });
  return factory;
}

/** 입자 위치를 보존만 하는 모의 물리 provider */
export function createMockPhysicsProvider(id: PhysicsProviderId, status?: PhysicsStatus): PhysicsProvider {
  const chainPositions = new Map<string, Float32Array>();
  return {
    id,
    async init() {
      return status ?? { id, status: "active", deterministic: true, versionLabel: "mock" };
    },
    setChains(chains) {
      chainPositions.clear();
      for (const chain of chains) {
        const positions = new Float32Array(chain.restPoints.length * 3);
        chain.restPoints.forEach((point, index) => {
          positions[index * 3] = point[0];
          positions[index * 3 + 1] = point[1];
          positions[index * 3 + 2] = point[2];
        });
        chainPositions.set(chain.id, positions);
      }
    },
    setBoneWorld() {
      // 모의: 본 변환은 무시한다.
    },
    step() {
      // 모의: 정지 상태 유지.
    },
    settle(maxSteps) {
      return { steps: Math.min(maxSteps, 1), settled: true, maxVelocity: 0 };
    },
    readChainPositions(chainId) {
      return chainPositions.get(chainId) ?? new Float32Array(0);
    },
    reset() {
      // 모의: 상태 없음.
    },
    dispose() {
      chainPositions.clear();
    },
  };
}

export function createMockPhysicsProviderFactory(statusById: Partial<Record<PhysicsProviderId, PhysicsStatus>> = {}): PhysicsProviderFactory {
  return async (id) => createMockPhysicsProvider(id, statusById[id]);
}

/** 테스트에서 자주 쓰는 실패 값 */
export const MOCK_ENGINE_FAILURE: LabFailure = failVisible("mock-engine-failed", "모의 엔진 생성 실패", undefined, 0);

export { ENGINE_INIT_TIMEOUT_MS };
