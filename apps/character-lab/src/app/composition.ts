/**
 * 조립 진입점(core). 영역 작업자 모듈을 실제 경로로 import하는 **유일한** 파일이며,
 * render 엔진 모듈의 동적 `import()`도 여기 한 곳에만 둔다(src/architecture.test.ts가 강제).
 * 셸 자체는 lab-runtime.ts(DI)에 있고 이 파일은 실제 모듈을 꽂기만 한다.
 *
 * 조립 내용
 *  - 스토어: state/lab-store + 페인트 undo/redo 핸들러(paint-bridge → 현재 엔진 텍스처 업로드)
 *  - 카탈로그: presets/APPEARANCE_PRESETS(64) + animation/presets/PERFORMANCE_PRESETS(30)
 *  - 엔진: render/babylon-character-engine 동적 import(엔진 청크 분리, WebGPU/WebGL2 명시 선택만)
 *  - 절차 소스: domains/humanoid buildHumanoidModel + domains/outfit(createOutfitBuilder), 재생성 키는 humanoid geometryKeyOf
 *  - 물리: domains/physics provider-factory(builtin-pbd/rapier/havok)
 *  - 패널: 슬롯 패널 + 뷰포트(ViewportPane) + 인스펙터 9탭(파라미터·표정·포즈·물리·렌더·페인트·비전·제작 패키지·내보내기)
 */
import { PERFORMANCE_PRESETS } from "../animation/presets";
import { GEOMETRY_SLOT_KINDS, buildHumanoidModel, geometryKeyOf } from "../domains/humanoid/humanoid-model";
import { createOutfitBuilder } from "../domains/outfit";
import { createPhysicsProviderFactory } from "../domains/physics/provider-factory";
import { createPaintUndoHandler } from "../paint/paint-bridge";
import { isPaintLayerEmpty } from "../paint/paint-layer";
import { getDefaultPaintSession } from "../paint/paint-session";
import { APPEARANCE_PRESETS } from "../presets";
import { probeGpu, selectBackend } from "../render/capability/select-backend";
import { planApply } from "../state/apply-plan";
import { createLabStore } from "../state/lab-store";
import { thumbnailCacheKey } from "../state/thumbnail-cache";

import { createLabRuntime } from "./shell/lab-runtime";
import { ExportPanel } from "./shell/panels/ExportPanel";
import { ExpressionPanel } from "./shell/panels/ExpressionPanel";
import { PackagePanel } from "./shell/panels/PackagePanel";
import { PaintPanel } from "./shell/panels/PaintPanel";
import { ParamPanel } from "./shell/panels/ParamPanel";
import { PhysicsPanel } from "./shell/panels/PhysicsPanel";
import { PosePanel } from "./shell/panels/PosePanel";
import { RenderPanel } from "./shell/panels/RenderPanel";
import { SlotPanel } from "./shell/panels/SlotPanel";
import { ViewportPane } from "./shell/panels/ViewportPane";
import { VisionPanel } from "./shell/panels/VisionPanel";
import { createProceduralSourceBuilder } from "./shell/procedural-source";

import type { CharacterEngine, CharacterEngineFactory, PaintLayer, SlotKind } from "../contracts";
import type { PaintSession } from "../paint/paint-session";
import type { LabPanels, LabRuntime, LabRuntimeDeps } from "./shell/lab-runtime";
import type { SubdivisionLevels } from "./shell/procedural-source";

/** 절차 휴머노이드 생성 시드(결정성: 같은 레시피 → 같은 바이트). */
export const PROCEDURAL_SEED = 20261001;
/** Catmull-Clark 세분 단계. 1 = 미리보기 예산(≤140k tris) 안. */
export const SUBDIVISION_LEVELS = 1 as const;
/** 지오메트리 프리셋 카드 썸네일용 임시 소스의 세분 단계(128 px 카드라 0으로 충분하고 빌드가 가장 싸다). */
export const THUMBNAIL_SUBDIVISION_LEVELS = 0 as const;

/**
 * 렌더 엔진 팩토리 로더. 앱 전체에서 `render/babylon-character-engine`을 동적으로 import하는 **단 하나의 자리**다
 * (Babylon 번들이 별도 청크로 분리되어 엔진을 고르기 전에는 로드되지 않는다).
 */
export function loadEngineFactory(): Promise<CharacterEngineFactory> {
  return import("../render/babylon-character-engine").then((module) => module.createBabylonCharacterEngine);
}

/** 세션의 비어 있지 않은 페인트 레이어를 엔진 텍스처로 올린다(소스 로드·device lost 복원 직후). */
export function uploadPaintLayers(session: PaintSession, engine: CharacterEngine): number {
  let uploaded = 0;
  for (const layer of session.layersForExport()) {
    if (isPaintLayerEmpty(layer)) continue;
    engine.updatePaintTexture(layer);
    uploaded += 1;
  }
  return uploaded;
}

/** 조립된 패널(스펙 §6). 미제출 패널은 InspectorTabs/WorkbenchLayout이 '미조립' 안내로 표시한다. */
export const COMPOSED_PANELS: LabPanels = Object.freeze({
  SlotPanel,
  ViewportPane,
  ParamPanel,
  ExpressionPanel,
  PosePanel,
  PhysicsPanel,
  RenderPanel,
  PaintPanel,
  VisionPanel,
  PackagePanel,
  ExportPanel,
});

/** 통합 테스트용 교체 지점(GPU 없는 Node에서 같은 조립을 모의 엔진 팩토리로 돌린다). 앱 진입점은 인자 없이 호출한다. */
export interface CompositionOverrides {
  readonly loadFactory?: LabRuntimeDeps["loadFactory"];
  readonly decideBackend?: LabRuntimeDeps["decideBackend"];
  readonly subdivisionLevels?: SubdivisionLevels;
}

export function composeCharacterLab(overrides: CompositionOverrides = {}): LabRuntime {
  const paint = getDefaultPaintSession();
  let runtime: LabRuntime | null = null;
  // history undo/redo → 페인트 토큰 적용 → 현재 엔진 텍스처 업로드(엔진이 없으면 레이어만 갱신, 다음 소스 로드 때 재업로드)
  const uploadLayer = (layer: PaintLayer): void => {
    runtime?.engineSession.engine()?.updatePaintTexture(layer);
  };
  const outfit = createOutfitBuilder();
  const buildProceduralSource = createProceduralSourceBuilder({
    humanoid: buildHumanoidModel,
    outfit,
    subdivisionLevels: overrides.subdivisionLevels ?? SUBDIVISION_LEVELS,
    seed: PROCEDURAL_SEED,
  });
  const buildThumbnailModel = createProceduralSourceBuilder({ humanoid: buildHumanoidModel, outfit, subdivisionLevels: THUMBNAIL_SUBDIVISION_LEVELS, seed: PROCEDURAL_SEED });
  const geometrySlots: readonly SlotKind[] = GEOMETRY_SLOT_KINDS;
  runtime = createLabRuntime({
    createStore: ({ catalog, planner, initial }) => createLabStore({ catalog, planner, initial, onPaintUndo: createPaintUndoHandler(paint, uploadLayer) }),
    planner: planApply,
    catalogSources: { appearance: APPEARANCE_PRESETS, performance: PERFORMANCE_PRESETS },
    loadFactory: overrides.loadFactory ?? loadEngineFactory,
    decideBackend: overrides.decideBackend ?? (async (backend) => selectBackend(backend, await probeGpu(navigator))),
    physicsProviders: createPhysicsProviderFactory(),
    buildProceduralSource,
    proceduralGeometryKey: geometryKeyOf,
    // 지오메트리 슬롯(헤어·의상·눈…) 프리셋 카드는 그 프리셋을 입힌 임시 소스로 그린다(엔진이 thumbnailSources를 지원할 때만 쓰인다).
    buildThumbnailSource: async (recipe, slot) => (geometrySlots.includes(slot) ? { kind: "procedural", model: await buildThumbnailModel(recipe) } : null),
    thumbnailCacheKey,
    onSourceLoaded: (engine) => {
      uploadPaintLayers(paint, engine);
    },
    panels: COMPOSED_PANELS,
  });
  return runtime;
}
