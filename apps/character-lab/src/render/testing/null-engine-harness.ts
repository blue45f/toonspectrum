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
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture.js";

import { BabylonCharacterEngine } from "../babylon/character-engine";
import { mapEngineCaps } from "../babylon/engine-capabilities";

import type { EngineDiagnostics, PhysicsProviderFactory, RenderPassId } from "../../contracts";
import type { BabylonCharacterEngineDeps } from "../babylon/character-engine";
import type { ReadbackLane } from "../readback";

export { BabylonCharacterEngine } from "../babylon/character-engine";
export { isRigNode } from "../babylon/glb-exporter";
export { readRigMeshMetadata } from "../babylon/mesh-binding";
export { chooseHairLod, splitPackageMeshName } from "../babylon/package-loader";
export { backSolveSource, swingsFromPositions } from "../babylon/physics-bridge";
export { pickableMesh } from "../babylon/pick-and-paint";
export { THUMBNAIL_LAYER_MASK } from "../babylon/character-engine";
export { pickStats } from "../babylon/skinned-pick";
export { mapEngineCaps, readAdapterInfo } from "../babylon/engine-capabilities";

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
  let disposed = 0;
  const deps: BabylonCharacterEngineDeps = {
    engine: nullEngine,
    lane: options.lane ?? "null",
    diagnostics: nullDiagnostics(nullEngine),
    physicsProviders: options.physicsProviders ?? REJECT_PHYSICS,
    runRenderLoop: false,
    awaitShaderCompile: false,
    verifyPackageSha: options.verifyPackageSha ?? true,
    disposeEngine: () => {
      disposed += 1;
      nullEngine.dispose();
    },
    ...(options.fetchBytes ? { fetchBytes: options.fetchBytes } : {}),
    ...(options.now ? { now: options.now } : {}),
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
