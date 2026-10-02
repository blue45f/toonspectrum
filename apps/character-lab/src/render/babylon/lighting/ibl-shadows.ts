/**
 * IBL Shadows(베타): Babylon 9.19 `IblShadowsRenderPipeline`(복셀 기반 IBL 그림자)을 켜고 끄는 바인더. 엔진 본체가 **동적 import**로만 불러온다
 * (파이프라인·복셀·누적 패스 코드와 셰이더가 커서 베타를 켤 때만 청크를 받는다). 파이프라인 클래스는 별도 side-effect import 없이 값 import로 충분하다
 * (scene component 등록은 생성자가 한다) — `babylon-side-effects.ts`에 항목을 더하지 않는다.
 *
 * 요구·한계
 * - 엔진 기능 `supportIBLShadows`(WebGL2·WebGPU 모두 true, NullEngine·WebGL1은 false) + float 렌더 타깃이 필요하다. 지원하지 않으면 켜지 않고 사유를 보고한다(자동 대체 없음).
 * - 그림자를 받는 재질은 PBR·OpenPBR·Standard뿐이다. 툰(ShaderMaterial·NodeMaterial)은 받지 못한다 → 툰 모드에서는 켜져 있어도 적용하지 않는다(컨트롤러가 처리).
 * - 파이프라인 생성자가 청색 노이즈 PNG 1장을 assets.babylonjs.com에서 받는다(외부 요청). 복셀화가 스킨·morph를 반영하는지는 브라우저 미검증이다 —
 *   포즈가 바뀌면 `markDirty`로 재복셀화를 예약한다(최소 간격 `IBL_VOXEL_MIN_INTERVAL_MS`).
 * - **누수 방지**: Babylon `dispose()`는 `enableGeometryBufferRenderer`·`enableIblCdfGenerator`로 켠 장면 구성요소와 생성자가 단 관찰자
 *   (`onActiveCameraChanged`·`onBeforeRenderObservable`·`engine.onResizeObservable`)를 되돌리지 않는다. 바인더가 생성 전후를 비교해 이 모두를 해제한다.
 */
import { IblShadowsRenderPipeline } from "@babylonjs/core/Rendering/IBLShadows/iblShadowsRenderPipeline.js";

import { describeDetail } from "../../../contracts";

import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Observable, Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";

/** 포즈 변경 뒤 재복셀화 최소 간격(ms) — 슬라이더 드래그마다 복셀화하지 않는다 */
export const IBL_VOXEL_MIN_INTERVAL_MS = 250;

/** 바인더가 쓰는 파이프라인 표면(실제 `IblShadowsRenderPipeline`이 만족한다. 테스트는 가짜를 주입한다). */
export interface IblShadowsPipelineLike {
  addShadowCastingMesh(mesh: Mesh | Mesh[]): void;
  clearShadowCastingMeshes(): void;
  addShadowReceivingMaterial(material?: Material | Material[]): void;
  clearShadowReceivingMaterials(): void;
  updateSceneBounds(): void;
  updateVoxelization(): void;
  toggleShadow(enabled: boolean): void;
  isReady(): boolean | null;
  dispose(): void;
}

/** 장면의 보조 구성요소 접근(테스트가 가짜를 주입해 해제 호출을 확인한다) */
export interface SceneAuxiliary {
  hasGeometryBufferRenderer(): boolean;
  disableGeometryBufferRenderer(): void;
  hasIblCdfGenerator(): boolean;
  disableIblCdfGenerator(): void;
}

export interface IblShadowsDeps {
  readonly scene: Scene;
  readonly camera: Camera;
  /** 파이프라인 생성기(기본: 실제 `IblShadowsRenderPipeline`) */
  readonly createPipeline?: (scene: Scene, camera: Camera) => IblShadowsPipelineLike;
  readonly auxiliary?: SceneAuxiliary;
}

export interface IblShadowsBinding {
  readonly pipeline: IblShadowsPipelineLike;
  /** 그림자를 드리울 메시(복셀화 대상)를 통째로 교체한다. */
  setCasters(meshes: readonly Mesh[]): void;
  /** 그림자를 받을 재질을 통째로 교체한다(PBR·OpenPBR만 의미가 있다). */
  setReceivers(materials: readonly Material[]): void;
  /** 포즈·소스 변경 → 다음 `tick`에서 재복셀화를 예약한다. */
  markDirty(): void;
  /** 렌더 루프에서 호출. 필요하고 간격이 지났으면 복셀화를 요청하고 true. */
  tick(nowMs: number): boolean;
  /** 해제(파이프라인 + 남은 장면 구성요소·관찰자). 여러 번 불러도 안전하다. */
  dispose(): void;
  readonly disposed: boolean;
  /** 복셀화 요청 횟수(진단) */
  voxelizations(): number;
}

function defaultAuxiliary(scene: Scene): SceneAuxiliary {
  const aux = scene as unknown as {
    geometryBufferRenderer?: unknown;
    iblCdfGenerator?: unknown;
    disableGeometryBufferRenderer?: () => void;
    disableIblCdfGenerator?: () => void;
  };
  return {
    hasGeometryBufferRenderer: () => Boolean(aux.geometryBufferRenderer),
    disableGeometryBufferRenderer: () => aux.disableGeometryBufferRenderer?.(),
    hasIblCdfGenerator: () => Boolean(aux.iblCdfGenerator),
    disableIblCdfGenerator: () => aux.disableIblCdfGenerator?.(),
  };
}

/** 생성 중 추가된 관찰자를 기록해 해제 시 제거한다. */
function trackObserver<T>(observable: Observable<T>): { readonly snapshot: ReadonlySet<Observer<T>>; collect(): () => void } {
  const snapshot = new Set(observable.observers);
  return {
    snapshot,
    collect() {
      const added = observable.observers.filter((observer) => !snapshot.has(observer));
      return () => {
        for (const observer of added) observable.remove(observer);
      };
    },
  };
}

/**
 * IBL Shadows 파이프라인을 만들어 바인더로 감싼다. 생성 실패 시 이미 켜진 장면 구성요소를 되돌리고 throw한다(호출자가 사유를 보고).
 */
export function createIblShadows(deps: IblShadowsDeps): IblShadowsBinding {
  const { scene, camera } = deps;
  const engine = scene.getEngine();
  const aux = deps.auxiliary ?? defaultAuxiliary(scene);
  const hadGeometryBuffer = aux.hasGeometryBufferRenderer();
  const hadCdf = aux.hasIblCdfGenerator();
  const trackers = [trackObserver(scene.onActiveCameraChanged), trackObserver(scene.onBeforeRenderObservable), trackObserver(engine.onResizeObservable)];

  const revertScene = (releasers: ReadonlyArray<() => void>): void => {
    for (const release of releasers) release();
    if (!hadGeometryBuffer && aux.hasGeometryBufferRenderer()) aux.disableGeometryBufferRenderer();
    if (!hadCdf && aux.hasIblCdfGenerator()) aux.disableIblCdfGenerator();
  };

  let pipeline: IblShadowsPipelineLike;
  try {
    pipeline = deps.createPipeline ? deps.createPipeline(scene, camera) : new IblShadowsRenderPipeline("cl-ibl-shadows", scene, { resolutionExp: 6, sampleDirections: 2, shadowOpacity: 0.8, triPlanarVoxelization: true }, [camera]);
  } catch (error) {
    revertScene(trackers.map((tracker) => tracker.collect()));
    throw new Error(`IBL Shadows 파이프라인을 만들지 못했습니다(${error instanceof Error ? error.message : (describeDetail(error) ?? "알 수 없는 오류")}).`, { cause: error });
  }
  const releasers = trackers.map((tracker) => tracker.collect());
  pipeline.toggleShadow(true);

  let dirty = true;
  let lastVoxelizationAt = Number.NEGATIVE_INFINITY;
  let disposed = false;
  let casterCount = 0;
  let voxelizationCount = 0;

  return {
    pipeline,
    get disposed() {
      return disposed;
    },
    setCasters(meshes) {
      if (disposed) return;
      pipeline.clearShadowCastingMeshes();
      casterCount = meshes.length;
      if (meshes.length > 0) pipeline.addShadowCastingMesh([...meshes]);
      dirty = true;
    },
    setReceivers(materials) {
      if (disposed) return;
      pipeline.clearShadowReceivingMaterials();
      // 인자 없이 부르면 장면의 모든 재질을 받게 되므로 빈 목록이면 부르지 않는다.
      if (materials.length > 0) pipeline.addShadowReceivingMaterial([...materials]);
    },
    markDirty() {
      dirty = true;
    },
    tick(nowMs) {
      if (disposed || !dirty || casterCount === 0) return false;
      if (nowMs - lastVoxelizationAt < IBL_VOXEL_MIN_INTERVAL_MS) return false;
      pipeline.updateSceneBounds();
      pipeline.updateVoxelization();
      lastVoxelizationAt = nowMs;
      dirty = false;
      voxelizationCount += 1;
      return true;
    },
    voxelizations: () => voxelizationCount,
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        pipeline.clearShadowCastingMeshes();
        pipeline.clearShadowReceivingMaterials();
        pipeline.dispose();
      } finally {
        revertScene(releasers);
      }
    },
  };
}
