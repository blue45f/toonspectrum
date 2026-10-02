/**
 * 셸 런타임 조립기. 영역 모듈(스토어 팩토리·플래너·프리셋·엔진 팩토리·물리·휴머노이드 빌더·패널)을 DI로 받아
 * 카탈로그 → 스토어 → 엔진 세션 → 적용 루프 → 썸네일 스케줄러/드라이버 → 패키지 플랜 레지스트리를 묶는다.
 * 실제 모듈은 app/composition.ts가 넣고, 테스트는 testing/mock-*로 같은 조립을 돌린다.
 */
import { ALL_AVAILABLE_CAPABILITIES, ALL_UNAVAILABLE_CAPABILITIES, DEFAULT_FRAMING, createDefaultRecipe, createInitialLabState, failVisible } from "../../contracts";

import { createApplyLoop } from "./apply-loop";
import { tryCreateCatalog } from "./catalog-registry";
import { createEngineSession } from "./engine-session";
import { createPackagePlanRegistry } from "./package-plan-registry";
import { createThumbnailDriver, fallbackThumbnailCacheKey, presetRecipe } from "./thumbnail-driver";
import { createThumbnailScheduler } from "./thumbnail-scheduler";
import { createUiStateStore } from "./ui-state";
import { createViewportRegistry } from "./viewport-registry";

import type { ApplyLoop } from "./apply-loop";
import type { CatalogSources } from "./catalog-registry";
import type { PackagePlanRegistry } from "./package-plan-registry";
import type { ThumbnailScheduler } from "./thumbnail-scheduler";
import type { UiStateStore } from "./ui-state";
import type { ViewportRegistry } from "./viewport-registry";
import type {
  ApplyPlanner,
  BackendDecision,
  CharacterEngine,
  CharacterEngineFactory,
  CharacterRecipe,
  CharacterSource,
  EngineBackend,
  EngineSession,
  HumanoidModelData,
  LabFailure,
  LabState,
  LabStore,
  PhysicsProviderFactory,
  PresetCatalog,
  PresetId,
  ShadingMode,
  SlotKind,
} from "../../contracts";
import type { ComponentType } from "react";

/** 영역 작업자가 만드는 패널(스펙 §6). 없는 패널은 InspectorTabs/WorkbenchLayout이 '미조립' 안내로 표시한다. */
export interface LabPanels {
  readonly SlotPanel?: ComponentType;
  readonly ParamPanel?: ComponentType;
  readonly PhysicsPanel?: ComponentType;
  readonly PosePanel?: ComponentType;
  readonly ExpressionPanel?: ComponentType;
  readonly ViewportPane?: ComponentType;
  readonly RenderPanel?: ComponentType;
  readonly PaintPanel?: ComponentType;
  readonly ExportPanel?: ComponentType;
  readonly VisionPanel?: ComponentType;
  readonly PackagePanel?: ComponentType;
}

export interface LabRuntimeDeps {
  /** state/lab-store.ts createLabStore */
  readonly createStore: (args: { catalog: PresetCatalog; planner: ApplyPlanner; initial: LabState }) => LabStore;
  /** state/apply-plan.ts planApply */
  readonly planner: ApplyPlanner;
  /** presets/APPEARANCE_PRESETS + animation/presets/PERFORMANCE_PRESETS */
  readonly catalogSources: CatalogSources;
  /** 단 하나의 `import("../render/babylon-character-engine")` (app/composition.ts) */
  readonly loadFactory: () => Promise<CharacterEngineFactory>;
  /** render/capability probeGpu + selectBackend — 요청 backend만 판정 */
  readonly decideBackend: (backend: EngineBackend) => Promise<BackendDecision>;
  /** physics/provider-factory */
  readonly physicsProviders: PhysicsProviderFactory;
  /** humanoid/humanoid-model.buildHumanoidModel(+ outfit 포트) */
  readonly buildProceduralSource: (recipe: CharacterRecipe) => Promise<HumanoidModelData> | HumanoidModelData;
  /**
   * humanoid/humanoid-model.geometryKeyOf — 절차 소스 재생성 키(헤어·의상·눈 스타일 슬롯 변경 = 소스 재생성).
   * 없으면 절차 소스는 엔진당 한 번만 만든다.
   */
  readonly proceduralGeometryKey?: (recipe: CharacterRecipe) => string;
  /**
   * 지오메트리 슬롯 프리셋(헤어·의상·눈 스타일 등) 카드 썸네일용 임시 소스. `recipe`는 그 프리셋을 현재 레시피에 적용한 것이다.
   * 지오메트리와 무관한 슬롯이면 null(현재 소스로 그린다). `engine.thumbnailSources`가 true인 엔진에서만 호출되고
   * 현재 소스가 절차 소스일 때만 쓴다(제작 패키지는 변형 소스를 만들 수 없다).
   */
  readonly buildThumbnailSource?: (recipe: CharacterRecipe, slot: SlotKind) => CharacterSource | null | Promise<CharacterSource | null>;
  /**
   * state/thumbnail-cache.thumbnailCacheKey. 없으면 셸 참조 구현.
   * 네 번째 인자로 카탈로그를 넘기면 해당 프리셋 patch가 덮어쓰는 필드를 키에서 빼 슬라이더 드래그 중 재생성이 줄어든다.
   */
  readonly thumbnailCacheKey?: (presetId: PresetId, recipe: CharacterRecipe, shadingMode: ShadingMode, catalog: PresetCatalog) => string;
  /**
   * 엔진에 소스가 (재)로드된 직후 호출(적용 루프·PackagePanel reloadSource 양쪽).
   * composition은 여기서 페인트 세션의 레이어를 새 엔진 텍스처로 다시 올린다(device lost 뒤 복원 포함).
   */
  readonly onSourceLoaded?: (engine: CharacterEngine, source: CharacterSource) => void;
  readonly panels: LabPanels;
  readonly initialRecipe?: CharacterRecipe;
  readonly initTimeoutMs?: number;
  readonly now?: () => number;
}

export interface LabRuntime {
  readonly store: LabStore;
  readonly catalog: PresetCatalog;
  /** 카탈로그 불변식 위반(비어 있으면 통과). 위반은 failure 이벤트로도 노출된다. */
  readonly catalogFailures: readonly LabFailure[];
  readonly engineSession: EngineSession;
  readonly viewport: ViewportRegistry;
  readonly ui: UiStateStore;
  readonly thumbnails: ThumbnailScheduler;
  readonly applyLoop: ApplyLoop;
  readonly packagePlans: PackagePlanRegistry;
  readonly panels: LabPanels;
  /** 적용 루프·썸네일 드라이버 구독 시작. 반환 함수로 중지. */
  start(): () => void;
  /** 구독 중지 + 큐 비움 + 엔진 해제 */
  dispose(): void;
}

export function createLabRuntime(deps: LabRuntimeDeps): LabRuntime {
  const now = deps.now ?? (() => Date.now());
  const catalogResult = tryCreateCatalog(deps.catalogSources, now());
  const catalog = catalogResult.catalog;
  const catalogFailures = catalogResult.ok ? [] : catalogResult.failures;

  const initialRecipe = deps.initialRecipe ?? createDefaultRecipe();
  // 능력 맵의 초기값은 소스 종류에서 정한다: 절차 휴머노이드는 15슬롯 전부 지원, 제작 패키지는 로드(PackagePanel `source/set` 또는
  // 적용 루프의 `source/capabilities` 보고) 전까지 미지원. 엔진이 소스를 올리면 엔진 보고 값으로 맞춘다.
  const initialCapabilities = initialRecipe.source.kind === "procedural" ? ALL_AVAILABLE_CAPABILITIES : ALL_UNAVAILABLE_CAPABILITIES;
  const store = deps.createStore({ catalog, planner: deps.planner, initial: createInitialLabState(initialRecipe, initialCapabilities) });
  for (const failure of catalogFailures) store.applyEvent({ type: "failure", failure });

  const innerSession = createEngineSession({
    loadFactory: deps.loadFactory,
    decideBackend: deps.decideBackend,
    physicsProviders: deps.physicsProviders,
    store,
    ...(deps.initTimeoutMs !== undefined ? { initTimeoutMs: deps.initTimeoutMs } : {}),
    now,
  });
  const packagePlans = createPackagePlanRegistry();
  const viewport = createViewportRegistry();
  const ui = createUiStateStore();

  const buildSource = async (recipe: CharacterRecipe): Promise<CharacterSource> => {
    if (recipe.source.kind === "package") {
      return { kind: "package", plan: packagePlans.resolve(recipe.source, now()) };
    }
    return { kind: "procedural", model: await deps.buildProceduralSource(recipe) };
  };

  const applyLoop = createApplyLoop({
    store,
    catalog,
    planner: deps.planner,
    engineSession: innerSession,
    buildSource,
    now,
    ...(deps.onSourceLoaded ? { onSourceLoaded: deps.onSourceLoaded } : {}),
    ...(deps.proceduralGeometryKey ? { proceduralGeometryKey: deps.proceduralGeometryKey } : {}),
  });

  /** 패널이 reloadSource로 올린 패키지 플랜은 레지스트리에 등록하고 루프가 중복 로드하지 않도록 표시한다. */
  const engineSession: EngineSession = {
    select: (backend, canvas) => innerSession.select(backend, canvas),
    status: () => innerSession.status(),
    engine: () => innerSession.engine(),
    async reloadSource(source) {
      const capabilities = await innerSession.reloadSource(source);
      if (capabilities) {
        if (source.kind === "package") packagePlans.register(source.plan);
        const engine = innerSession.engine();
        if (engine) {
          applyLoop.markSourceLoaded(engine, source);
          deps.onSourceLoaded?.(engine, source);
        }
      }
      return capabilities;
    },
    subscribe: (listener) => innerSession.subscribe(listener),
    dispose: () => innerSession.dispose(),
  };

  const cacheKey = deps.thumbnailCacheKey ?? fallbackThumbnailCacheKey;
  const thumbnails = createThumbnailScheduler({
    engine: () => innerSession.engine(),
    planForPreset(presetId) {
      const entry = catalog.get(presetId);
      if (!entry) throw failVisible("thumbnail-unknown-preset", `카탈로그에 없는 프리셋입니다: ${presetId}`, undefined, now());
      const state = store.getState();
      return deps.planner(presetRecipe(state.recipe, entry), state.capabilities, catalog);
    },
    cacheKeyFor(presetId) {
      const recipe = store.getState().recipe;
      return cacheKey(presetId, recipe, recipe.shading.mode, catalog);
    },
    framingFor(presetId) {
      const entry = catalog.get(presetId);
      return entry ? entry.thumbnailFraming : DEFAULT_FRAMING;
    },
    ...(deps.buildThumbnailSource
      ? {
          sourceFor(presetId: PresetId) {
            const entry = catalog.get(presetId);
            const state = store.getState();
            if (!entry || state.recipe.source.kind !== "procedural") return undefined;
            return deps.buildThumbnailSource?.(presetRecipe(state.recipe, entry), entry.slot);
          },
        }
      : {}),
    currentEntry: (presetId) => store.getState().thumbnails[presetId],
    onUpdate: (presetId, entry) => store.applyEvent({ type: "thumbnail/update", presetId, entry }),
  });
  const driver = createThumbnailDriver({ store, catalog, engineSession: innerSession, scheduler: thumbnails, ui, applyLoop });

  let stop: (() => void) | null = null;
  return {
    store,
    catalog,
    catalogFailures,
    engineSession,
    viewport,
    ui,
    thumbnails,
    applyLoop,
    packagePlans,
    panels: deps.panels,
    start() {
      stop?.();
      const stopLoop = applyLoop.start();
      const stopDriver = driver.start();
      const stopAll = (): void => {
        stopLoop();
        stopDriver();
        if (stop === stopAll) stop = null;
      };
      stop = stopAll;
      return stopAll;
    },
    dispose() {
      stop?.();
      thumbnails.clear();
      innerSession.dispose();
    },
  };
}
