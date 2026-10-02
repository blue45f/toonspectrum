/**
 * NullEngine 하네스: GPU·DOM 없는 Node에서 `BabylonCharacterEngine` 본체를 돌리는 **유일한** 테스트 진입점
 * (architecture.test.ts가 테스트 파일의 `render/babylon/**` 직접 import를 금지하고 이 파일만 예외로 둔다).
 *
 * - 엔진 생성(WebGPUEngine·Engine, DOM 의존)은 하지 않는다. NullEngine을 만들어 클래스 생성자에 주입한다.
 * - readback이 없는 레인이라 `renderPasses().provenance.synthetic = true`, `backend = "null"`이다(합성 래스터).
 * - 테스트가 필요한 순수 헬퍼(물리 회전 역산·메시 이름 분해·헤어 LOD 선택 등)는 여기서 재export한다.
 *
 * NullEngine이 검증하지 못하는 것: 셰이더 컴파일(WGSL/GLSL), 실제 RTT readPixels 행 순서·premultiply,
 * IBL 프리필터(float 큐브 미지원), SSS PrePass, 후처리 품질, 그림자 품질 — docs/parity/render.md '브라우저 미검증'.
 */
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage.js";
import { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import { InternalTexture, InternalTextureSource } from "@babylonjs/core/Materials/Textures/internalTexture.js";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture.js";
import { Scene } from "@babylonjs/core/scene.js";

import { BabylonCharacterEngine } from "../babylon/character-engine";
import { mapEngineCaps } from "../babylon/engine-capabilities";
import { bindProceduralModel } from "../babylon/mesh-binding";
import { featureActive } from "../scene-features";

import type { EngineDiagnostics, HumanoidModelData, PhysicsProviderFactory, RenderPassId } from "../../contracts";
import type { BetaLoaders } from "../babylon/beta-controller";
import type { BabylonCharacterEngineDeps } from "../babylon/character-engine";
import type { CharacterRig } from "../babylon/character-rig";
import type { ProceduralIbl } from "../babylon/lighting/ibl";
import type { ReadbackLane } from "../readback";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";

export { BabylonCharacterEngine } from "../babylon/character-engine";
export { isRigNode } from "../babylon/glb-exporter";
export { readRigMeshMetadata } from "../babylon/mesh-binding";
export { chooseHairLod, splitPackageMeshName } from "../babylon/package-loader";
export { backSolveSource, swingsFromPositions } from "../babylon/physics-bridge";
export { pickableMesh } from "../babylon/pick-and-paint";
export { THUMBNAIL_LAYER_MASK } from "../babylon/character-engine";
export { pickStats } from "../babylon/skinned-pick";
export { mapEngineCaps, readAdapterInfo } from "../babylon/engine-capabilities";
// 베타 기능(NodeMaterial 툰·OpenPBR·IBL Shadows·투영 페인트)과 장면 보조 — 테스트는 render/babylon/**을 직접 import하지 않고 여기서만 받는다.
export { createBetaController, DEFAULT_BETA_LOADERS } from "../babylon/beta-controller";
export { iblShadowsSupport, openPbrSupport } from "../babylon/beta-support";
export { withScatteringOff } from "../babylon/capture";
export { applyRigPlan, restoreRig, rigBoneSnapshots, snapshotRig } from "../babylon/character-rig";
export { createJointOffsetRig } from "../babylon/joint-offset-rig";
export { createIblShadows, IBL_VOXEL_MIN_INTERVAL_MS } from "../babylon/lighting/ibl-shadows";
export { createNodeToon, NODE_TOON_INPUTS, nodeLanguageFor } from "../babylon/materials/node-toon-material";
export { applyOpenPbrParams, createOpenPbrMaterial } from "../babylon/materials/openpbr-material";
export { createProjectionPainter, projectionPaintSupport } from "../babylon/projection-paint";
export type { BetaController, BetaHost, BetaLoaders } from "../babylon/beta-controller";
export type { IblShadowsBinding, IblShadowsDeps, IblShadowsPipelineLike, SceneAuxiliary } from "../babylon/lighting/ibl-shadows";
export type { NodeToon } from "../babylon/materials/node-toon-material";
export type { ProjectionPainter } from "../babylon/projection-paint";

/** NodeMaterial 셰이더 언어 상수(테스트가 `@babylonjs`를 직접 import하지 않도록) */
export const NODE_SHADER_LANGUAGE = Object.freeze({ glsl: ShaderLanguage.GLSL, wgsl: ShaderLanguage.WGSL });

/** 톤맵 상수(`SceneInspection.toneMappingType` 비교용) */
export const TONE_MAPPING_TYPES = Object.freeze({
  standard: ImageProcessingConfiguration.TONEMAPPING_STANDARD,
  aces: ImageProcessingConfiguration.TONEMAPPING_ACES,
  khrPbrNeutral: ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL,
});

/** NullEngine 기본 렌더 크기(작게 유지: RTT·readback 비용을 줄인다) */
export const NULL_HARNESS_SIZE = 64;

export interface NullHarnessOptions {
  /** 물리 provider 팩토리(기본: 항상 reject — physics를 쓰지 않는 테스트는 setPhysicsProvider를 부르지 않는다) */
  readonly physicsProviders?: PhysicsProviderFactory;
  /** 제작 패키지 GLB 바이트 로더(Node 테스트는 node:fs로 주입) */
  readonly fetchBytes?: (url: string) => Promise<Uint8Array>;
  /** 패키지 SHA 검증(기본 true) */
  readonly verifyPackageSha?: boolean;
  readonly size?: number;
  /**
   * readback 레인 표기(기본 "null" = readback 없음·합성 래스터). "webgl2"/"webgpu"는 `installFakeReadback`과 함께 써서
   * 행 뒤집기·premultiply 변환 배선을 검증한다(실제 GPU readback이 아니다).
   */
  readonly lane?: ReadbackLane;
  /** 결정적 시각(epoch ms) */
  readonly now?: () => number;
  /** 베타 무거운 모듈 로더(가짜 IBL 파이프라인·실패 경로 주입) */
  readonly betaLoaders?: BetaLoaders;
  /** NullEngine이 모자란 능력을 덧씌운다(베타 능력 게이트 검증용 — 실제 GPU 능력이 아니다). */
  readonly capabilities?: NullCapabilityOverrides;
  /** 베타 재질 준비 대기 상한(ms, 기본 0 = 기다리지 않음). 준비 대기·시간 초과 경로 검증에 쓴다. */
  readonly materialReadyTimeoutMs?: number;
  /** IBL 생성기 주입(기본: 절차 IBL) */
  readonly createIbl?: BabylonCharacterEngineDeps["createIbl"];
  /** 캡처 전 재질 준비 대기(기본 false: NullEngine은 컴파일하지 않는다). 준비 대기·시간 초과 경로 검증에 켠다. */
  readonly awaitShaderCompile?: boolean;
  /** 캡처 셰이더 컴파일 대기 상한(ms) */
  readonly captureCompileTimeoutMs?: number;
}

/** NullEngine에 덧씌우는 능력(실제 엔진 능력을 흉내 낸 것이며 GPU 검증이 아니다). */
export interface NullCapabilityOverrides {
  readonly webGLVersion?: 1 | 2;
  readonly supportIBLShadows?: boolean;
  readonly textureFloatRender?: boolean;
  readonly texture2DArrayMaxLayerCount?: number;
  readonly maxVertexAttribs?: number;
  readonly isWebGPU?: boolean;
  /**
   * morph 텍스처 저장 조건(`canUseGLVertexID`·`textureFloat`·정점 텍스처 유닛)을 켠다. Babylon `MorphTargetManager`는 **생성자에서** 이 능력을 읽으므로
   * 엔진·소스를 만들기 전에 덧씌워야 한다(하네스 `capabilities` 옵션이 그 시점이다).
   */
  readonly morphTextures?: boolean;
}

/** 엔진 인스턴스에 능력 값을 덧씌운다(프로토타입은 건드리지 않는다). */
export function patchNullCapabilities(engine: AbstractEngine, overrides: NullCapabilityOverrides): void {
  if (overrides.webGLVersion !== undefined) Object.defineProperty(engine, "webGLVersion", { value: overrides.webGLVersion, configurable: true });
  if (overrides.isWebGPU !== undefined) Object.defineProperty(engine, "isWebGPU", { value: overrides.isWebGPU, configurable: true });
  if (overrides.supportIBLShadows !== undefined) engine._features.supportIBLShadows = overrides.supportIBLShadows;
  const caps = engine.getCaps();
  if (overrides.textureFloatRender !== undefined) caps.textureFloatRender = overrides.textureFloatRender;
  if (overrides.texture2DArrayMaxLayerCount !== undefined) caps.texture2DArrayMaxLayerCount = overrides.texture2DArrayMaxLayerCount;
  if (overrides.maxVertexAttribs !== undefined) caps.maxVertexAttribs = overrides.maxVertexAttribs;
  if (overrides.morphTextures !== undefined) {
    caps.canUseGLVertexID = overrides.morphTextures;
    caps.textureFloat = overrides.morphTextures;
    caps.maxVertexTextureImageUnits = overrides.morphTextures ? 16 : 0;
    if (overrides.morphTextures) stubRawTexture2DArray(engine);
  }
}

/**
 * NullEngine에는 `RawTexture2DArray` 생성 경로가 없어(`_gl` 없음) morph 텍스처 저장 모드가 생성자에서 throw한다.
 * 내용 없는 내부 텍스처를 돌려주는 대체를 인스턴스에 붙인다 — 능력 보고·모드 판정을 검증하기 위한 것이고 텍스처 내용은 아무것도 검증하지 않는다.
 */
function stubRawTexture2DArray(engine: AbstractEngine): void {
  const stub = {
    createRawTexture2DArray: () => {
      const texture = new InternalTexture(engine, InternalTextureSource.Raw2DArray);
      texture.isReady = true;
      return texture;
    },
    updateRawTexture2DArray: () => undefined,
  };
  Object.defineProperties(engine, {
    createRawTexture2DArray: { value: stub.createRawTexture2DArray, configurable: true, writable: true },
    updateRawTexture2DArray: { value: stub.updateRawTexture2DArray, configurable: true, writable: true },
  });
}

/** 엔진 본체 없이 절차 모델을 리그로 묶은 것(관절 오프셋·스킨 정합 같은 리그 단위 검증용) */
export interface FixtureRig {
  readonly rig: CharacterRig;
  readonly scene: Scene;
  dispose(): void;
}

/** 절차 모델을 NullEngine 장면에 묶는다. 재질은 기본 PBRMaterial, 재질 훅은 비어 있다(리그 단위 검증에는 필요 없다). */
export function bindFixtureRig(model: HumanoidModelData, overrides: NullCapabilityOverrides = {}): FixtureRig {
  const bare = createBareNullScene(overrides);
  const rig = bindProceduralModel(model, {
    scene: bare.scene,
    createMaterial: (part) => new PBRMaterial(`fixture:${part.id}`, bare.scene),
    materials: { applyPreset: () => undefined, applyColor: () => undefined },
    now: 1_000,
  });
  return {
    rig,
    scene: bare.scene,
    dispose: () => {
      rig.dispose();
      bare.dispose();
    },
  };
}

/** 엔진 없이 장면만 필요한 테스트(NodeMaterial 그래프·OpenPBR 매핑 등)용 NullEngine + Scene */
export interface BareNullScene {
  readonly engine: NullEngine;
  readonly scene: Scene;
  dispose(): void;
}

export function createBareNullScene(overrides: NullCapabilityOverrides = {}): BareNullScene {
  const engine = new NullEngine({ renderWidth: NULL_HARNESS_SIZE, renderHeight: NULL_HARNESS_SIZE, textureSize: NULL_HARNESS_SIZE, deterministicLockstep: true, lockstepMaxSteps: 4 });
  patchNullCapabilities(engine, overrides);
  const scene = new Scene(engine);
  return {
    engine,
    scene,
    dispose: () => {
      scene.dispose();
      engine.dispose();
    },
  };
}

export interface NullEngineHarness {
  readonly engine: BabylonCharacterEngine;
  readonly nullEngine: NullEngine;
  /** 엔진 해제 횟수(dispose 멱등성 검증) */
  disposeCount(): number;
  dispose(): void;
}

/** NullEngine의 진단. 계약상 backend는 webgpu|webgl2라 webgl2로 표기하고(HUD adapterLabel·provenance는 "NullEngine"/"null"), 능력은 엔진에서 읽는다. */
function nullDiagnostics(engine: NullEngine): EngineDiagnostics {
  return { backend: "webgl2", engineVersion: NullEngine.Version, adapter: null, renderer: "NullEngine", caps: mapEngineCaps(engine) };
}

const REJECT_PHYSICS: PhysicsProviderFactory = () => Promise.reject(new Error("NullEngine 하네스에 물리 provider 팩토리가 주입되지 않았습니다."));

/** NullEngine 위에 `BabylonCharacterEngine`을 만든다. `diagnostics.backend`는 계약상 webgpu|webgl2라 webgl2로 표기하고 lane은 "null"이다. */
export async function createNullEngineHarness(options: NullHarnessOptions = {}): Promise<NullEngineHarness> {
  const size = options.size ?? NULL_HARNESS_SIZE;
  const nullEngine = new NullEngine({ renderWidth: size, renderHeight: size, textureSize: size, deterministicLockstep: true, lockstepMaxSteps: 4 });
  if (options.capabilities) patchNullCapabilities(nullEngine, options.capabilities);
  let disposed = 0;
  const deps: BabylonCharacterEngineDeps = {
    engine: nullEngine,
    lane: options.lane ?? "null",
    diagnostics: nullDiagnostics(nullEngine),
    physicsProviders: options.physicsProviders ?? REJECT_PHYSICS,
    runRenderLoop: false,
    awaitShaderCompile: options.awaitShaderCompile ?? false,
    verifyPackageSha: options.verifyPackageSha ?? true,
    disposeEngine: () => {
      disposed += 1;
      nullEngine.dispose();
    },
    ...(options.fetchBytes ? { fetchBytes: options.fetchBytes } : {}),
    ...(options.now ? { now: options.now } : {}),
    ...(options.betaLoaders ? { betaLoaders: options.betaLoaders } : {}),
    ...(options.materialReadyTimeoutMs !== undefined ? { betaMaterialReadyTimeoutMs: options.materialReadyTimeoutMs } : {}),
    ...(options.createIbl ? { createIbl: options.createIbl } : {}),
    ...(options.captureCompileTimeoutMs !== undefined ? { captureCompileTimeoutMs: options.captureCompileTimeoutMs } : {}),
  };
  const engine = await BabylonCharacterEngine.create(deps);
  return {
    engine,
    nullEngine,
    disposeCount: () => disposed,
    dispose: () => engine.dispose(),
  };
}

/** `installFakeReadback` 핸들러: RTT 패스·크기를 받아 readback 바이트를 돌려준다(null = readback 불가). */
export type FakeReadbackHandler = (pass: RenderPassId, width: number, height: number) => Uint8Array | Promise<Uint8Array> | null;

const CAPTURE_RTT_PREFIX = "capture-";

/**
 * `RenderTargetTexture.prototype.readPixels`를 결정적 바이트로 바꾼다(NullEngine은 readback을 못 하므로 변환 배선 검증용).
 * 캡처 RTT 이름(`capture-<pass>`)에서 패스를 읽는다. 돌려주는 함수가 원복이다 — 테스트는 반드시 `afterEach`에서 호출한다.
 * 이것은 모의 readback이다: 행 순서·premultiply·셰이더 출력은 실제 GPU에서 검증되지 않는다.
 */
export function installFakeReadback(handler: FakeReadbackHandler): () => void {
  const proto = RenderTargetTexture.prototype;
  const original = proto.readPixels;
  proto.readPixels = function readPixelsFake(this: RenderTargetTexture) {
    if (!this.name.startsWith(CAPTURE_RTT_PREFIX)) return null;
    const size = this.getSize();
    const bytes = handler(this.name.slice(CAPTURE_RTT_PREFIX.length) as RenderPassId, size.width, size.height);
    return bytes ? Promise.resolve(bytes) : null;
  };
  return () => {
    proto.readPixels = original;
  };
}

/** UV 공간 렌더러 RTT 이름 접미사(`MeshUVSpaceRenderer`가 `<메시 이름>_uvspaceTexture`로 만든다) */
const UV_SPACE_RTT_SUFFIX = "_uvspaceTexture";

/** `installFakeUvReadback` 핸들러: 메시 이름·RTT 크기를 받아 RGBA8 바이트를 돌려준다(null = readback 불가). */
export type FakeUvReadbackHandler = (meshName: string, width: number, height: number) => Uint8Array | null;

/**
 * 투영 페인트의 UV 공간 RTT(`<메시>_uvspaceTexture`) `readPixels`를 결정적 바이트로 바꾼다. 다른 RTT는 설치 전 구현(실제 또는 `installFakeReadback`)으로 넘긴다.
 * 돌려주는 함수가 원복이다 — 테스트는 반드시 `afterEach`에서 호출한다. 이것은 모의 readback이다(GPU 투영 결과가 아니다).
 */
export function installFakeUvReadback(handler: FakeUvReadbackHandler): () => void {
  const proto = RenderTargetTexture.prototype;
  const original = proto.readPixels;
  proto.readPixels = function readPixelsUvFake(this: RenderTargetTexture, ...args: Parameters<typeof original>) {
    if (!this.name.endsWith(UV_SPACE_RTT_SUFFIX)) return original.apply(this, args);
    const size = this.getSize();
    const bytes = handler(this.name.slice(0, -UV_SPACE_RTT_SUFFIX.length), size.width, size.height);
    return bytes ? Promise.resolve(bytes) : null;
  };
  return () => {
    proto.readPixels = original;
  };
}

/**
 * 가짜 절차 IBL(환경 텍스처가 있는 것처럼 보인다). NullEngine은 float 큐브를 못 만들어 IBL이 항상 없으므로, IBL이 필요한 베타(IBL Shadows)의
 * 게이트·수명 검증에 `createIbl`로 주입한다. 텍스처는 내용 없는 `BaseTexture`라 렌더 품질은 검증하지 못한다.
 */
export function createFakeIbl(scene: Scene): Promise<ProceduralIbl> {
  const texture = new BaseTexture(scene);
  texture.name = "fake:ibl";
  return Promise.resolve({
    texture,
    state: featureActive("가짜 IBL(테스트)"),
    averageColor: [0.2, 0.2, 0.2],
    dispose: () => texture.dispose(),
  });
}
