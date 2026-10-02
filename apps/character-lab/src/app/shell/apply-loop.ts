/**
 * 적용 루프: store의 레시피 변화와 엔진 준비 상태를 구독해
 * 소스 로드(변경 시) → 셰이딩(변경 시) → 물리 provider(변경 시) → planApply → engine.applyPlan을 직렬로 실행한다.
 * 실패는 failure 이벤트로 노출하고 재시도하지 않는다(무음 대체 없음).
 *
 * 재진입 방지: 실패 보고(`failure` 이벤트)·썸네일·엔진 상태 이벤트도 스토어 구독자를 깨우므로, 루프는 적용에 영향을 주는
 * 값(recipe 참조·history.revision·capabilities 참조)이 바뀐 알림에만 다시 돈다. 같은 엔진에서 실패한 같은 소스·셰이딩·물리 provider는
 * 값이 바뀌거나 엔진이 바뀔 때까지 다시 시도하지 않는다(실패가 실패를 부르는 마이크로태스크 무한 루프 방지).
 *
 * device lost → 사용자가 엔진을 다시 선택하면 `ready`에서 같은 레시피로 소스·셰이딩·물리·플랜을 다시 올린다
 * (레시피 JSON이 복원 단일 소스, 연구 종합 §1.10 "device.lost → 레시피 복원").
 */
import { failVisible, isLabFailure } from "../../contracts";
import { stableStringify } from "../../shared/stable-json";

import type {
  ApplyPlan,
  ApplyPlanner,
  ApplyReceipt,
  CharacterEngine,
  CharacterRecipe,
  CharacterSource,
  EngineSession,
  LabState,
  LabStore,
  PresetCatalog,
  SourceCapabilities,
} from "../../contracts";

export interface ApplyLoopDeps {
  readonly store: LabStore;
  readonly catalog: PresetCatalog;
  readonly planner: ApplyPlanner;
  readonly engineSession: EngineSession;
  /** 절차 소스: humanoid-model.buildHumanoidModel, 패키지 소스: package-plan-registry(composition이 주입) */
  readonly buildSource: (recipe: CharacterRecipe) => Promise<CharacterSource> | CharacterSource;
  /** 루프가 소스를 성공적으로 올린 직후(페인트 레이어 재업로드 등). 예외는 failure 이벤트로 노출한다. */
  readonly onSourceLoaded?: (engine: CharacterEngine, source: CharacterSource) => void;
  /**
   * 절차 소스의 지오메트리 재생성 키(humanoid `geometryKeyOf`). 레시피의 이 값이 바뀌면(헤어·의상·눈 스타일 슬롯 변경) 절차 소스를
   * 다시 만들어 올린다. 파라미터·색·표정·포즈 같은 나머지 변경은 플랜만 다시 적용한다. 없으면 절차 소스는 엔진당 한 번만 만든다.
   */
  readonly proceduralGeometryKey?: (recipe: CharacterRecipe) => string;
  readonly now?: () => number;
}

export interface ApplyLoopSnapshot {
  readonly plan: ApplyPlan | null;
  readonly receipt: ApplyReceipt | null;
  /** step이 끝날 때마다 1씩 증가(React useSyncExternalStore 스냅샷 비교용) */
  readonly sequence: number;
}

export interface ApplyLoop {
  /** 구독 시작. 반환 함수로 중지. */
  start(): () => void;
  /** 대기 중인 적용이 끝날 때까지 */
  flush(): Promise<void>;
  /**
   * 현재 엔진에서 소스 로드와 첫 적용 단계(셰이딩·물리·플랜)가 한 번 끝났는지.
   * 썸네일 드라이버처럼 소스가 필요한 소비자는 이 값이 true일 때만 엔진을 렌더한다.
   * 엔진이 바뀌거나 사라지거나 소스가 다시 올라가면 다음 적용 단계가 끝날 때까지 false다.
   */
  settled(): boolean;
  lastPlan(): ApplyPlan | null;
  lastReceipt(): ApplyReceipt | null;
  snapshot(): ApplyLoopSnapshot;
  /**
   * 바깥(PackagePanel → engineSession.reloadSource)에서 이미 소스를 올렸음을 알린다.
   * 같은 레시피 소스라면 루프가 다시 loadSource하지 않는다. 레시피가 아직 이 소스를 가리키지 않으면(패널은 reloadSource 직후
   * `source/set`을 보낸다) 레시피가 따라잡는 입력 변경이 올 때까지 기다린다 — 그 사이 step이 이전 소스를 가리키는 레시피로
   * 방금 올린 소스를 지우고 다시 만들지 않게 한다. 끝내 따라잡지 않으면 다음 입력 변경에서 레시피(단일 진실) 소스로 되돌린다.
   */
  markSourceLoaded(engine: CharacterEngine, source: CharacterSource): void;
  subscribe(listener: (snapshot: ApplyLoopSnapshot) => void): () => void;
}

/** 두 능력 맵이 같은 내용인지(참조가 달라도 내용이 같으면 같다). */
function sameCapabilities(a: LabState["capabilities"], b: LabState["capabilities"]): boolean {
  return a === b || stableStringify(a) === stableStringify(b);
}

/**
 * 엔진 소스를 레시피 `source` 필드와 같은 모양의 키로 만든다(두 쪽이 같은 소스인지 비교).
 * 절차 소스는 `geometryKey`(레시피의 지오메트리 재생성 키)를 주면 그 값까지 키에 넣는다.
 */
export function sourceKeyOf(source: CharacterSource, geometryKey?: string): string {
  if (source.kind === "procedural") return stableStringify(geometryKey === undefined ? { kind: "procedural" } : { kind: "procedural", geometry: geometryKey });
  return stableStringify({ kind: "package", characterId: source.plan.manifest.characterId, sha256: source.plan.glbSha256 });
}

export function createApplyLoop(deps: ApplyLoopDeps): ApplyLoop {
  const now = deps.now ?? (() => Date.now());
  const listeners = new Set<(snapshot: ApplyLoopSnapshot) => void>();
  let chain: Promise<void> = Promise.resolve();
  let lastPlan: ApplyPlan | null = null;
  let lastReceipt: ApplyReceipt | null = null;
  let sequence = 0;
  let snapshot: ApplyLoopSnapshot = { plan: null, receipt: null, sequence };
  let loadedEngine: CharacterEngine | null = null;
  let loadedSourceKey: string | null = null;
  let appliedRevision = -1;
  let appliedCapabilities: LabState["capabilities"] | null = null;
  let shadingKey: string | null = null;
  let providerKey: string | null = null;
  /** 소스 로드와 첫 적용 단계가 끝난 엔진 */
  let settledEngine: CharacterEngine | null = null;
  /** 이 엔진에서 이미 실패한 소스(같은 키면 다시 만들지 않는다) */
  let failedSource: { readonly engine: CharacterEngine; readonly key: string } | null = null;
  /** 마지막으로 처리한 적용 입력(스토어 알림이 이 값을 바꾸지 않았다면 루프는 다시 돌지 않는다) */
  let observed: { readonly recipe: CharacterRecipe; readonly revision: number; readonly capabilities: LabState["capabilities"] } | null = null;

  /** 레시피가 가리키는 엔진 소스의 키. 절차 소스는 지오메트리 슬롯까지 포함한다. */
  const recipeSourceKey = (recipe: CharacterRecipe): string => {
    if (recipe.source.kind === "procedural" && deps.proceduralGeometryKey) {
      return stableStringify({ kind: "procedural", geometry: deps.proceduralGeometryKey(recipe) });
    }
    return stableStringify(recipe.source);
  };

  const report = (code: string, reasonKo: string, error: unknown): void => {
    deps.store.applyEvent({ type: "failure", failure: isLabFailure(error) ? error : failVisible(code, reasonKo, error, now()) });
  };

  const publish = (): void => {
    sequence += 1;
    snapshot = { plan: lastPlan, receipt: lastReceipt, sequence };
    for (const listener of listeners) listener(snapshot);
  };

  const resetForEngine = (): void => {
    appliedRevision = -1;
    appliedCapabilities = null;
    shadingKey = null;
    providerKey = null;
    failedSource = null;
    settledEngine = null;
  };

  /** 적용 입력이 이전 알림 이후 바뀌었는지(바뀌었으면 관측값을 갱신한다). */
  const inputsChanged = (): boolean => {
    const state = deps.store.getState();
    if (observed && observed.recipe === state.recipe && observed.revision === state.history.revision && observed.capabilities === state.capabilities) {
      return false;
    }
    observed = { recipe: state.recipe, revision: state.history.revision, capabilities: state.capabilities };
    return true;
  };

  const step = async (): Promise<void> => {
    const engine = deps.engineSession.engine();
    if (!engine) return;
    let state = deps.store.getState();
    let recipe = state.recipe;
    const sourceKey = recipeSourceKey(recipe);
    if (engine !== loadedEngine || sourceKey !== loadedSourceKey) {
      if (failedSource && failedSource.engine === engine && failedSource.key === sourceKey) return;
      let source: CharacterSource;
      let loaded: SourceCapabilities;
      try {
        source = await deps.buildSource(recipe);
        loaded = await engine.loadSource(source);
      } catch (error) {
        // 엔진은 새 소스를 올리기 전에 이전 리그를 해제하므로(render `loadSource`) 실패 뒤의 엔진 상태는 알 수 없다 — 이전 소스 키도 버려서
        // 레시피가 이전 소스로 돌아가면 다시 올리게 한다. 같은 실패 키는 값이 바뀔 때까지 재시도하지 않는다.
        loadedEngine = null;
        loadedSourceKey = null;
        settledEngine = null;
        failedSource = { engine, key: sourceKey };
        report("source-build-failed", "캐릭터 소스를 만들거나 올리지 못했습니다.", error);
        publish();
        return;
      }
      loadedEngine = engine;
      loadedSourceKey = sourceKey;
      resetForEngine();
      // 엔진이 보고한 능력 맵이 스토어와 다르면(기본 절차 소스, 레시피 불러오기로 소스가 바뀐 경우) 스토어를 맞춘다(history 밖 이벤트).
      if (!sameCapabilities(loaded.capabilities, state.capabilities)) {
        deps.store.applyEvent({ type: "source/capabilities", capabilities: loaded.capabilities });
        state = deps.store.getState();
        recipe = state.recipe;
      }
      try {
        deps.onSourceLoaded?.(engine, source);
      } catch (error) {
        report("source-loaded-hook-failed", "소스 로드 후처리(페인트 레이어 재업로드 등)에 실패했습니다.", error);
      }
    }
    const nextShadingKey = stableStringify(recipe.shading);
    if (nextShadingKey !== shadingKey) {
      // 시도한 값을 먼저 기록한다: 실패해도 같은 값으로는 다시 시도하지 않는다(값이 바뀌면 재시도).
      shadingKey = nextShadingKey;
      try {
        engine.setShading(recipe.shading);
      } catch (error) {
        report("shading-apply-failed", "셰이딩 프로파일 적용에 실패했습니다.", error);
      }
    }
    if (recipe.physics.provider !== providerKey) {
      providerKey = recipe.physics.provider;
      try {
        const status = await engine.setPhysicsProvider(recipe.physics.provider);
        deps.store.applyEvent({ type: "physics/status", status });
      } catch (error) {
        report("physics-provider-failed", "물리 provider 전환에 실패했습니다.", error);
      }
    }
    const revision = state.history.revision;
    if (revision === appliedRevision && state.capabilities === appliedCapabilities && lastPlan !== null) {
      settledEngine = engine;
      return;
    }
    try {
      // 플래너는 revision을 알 수 없어 0을 돌려준다(state/apply-plan) — 스토어 getPlan과 같이 history revision으로 덮어쓴다.
      const plan: ApplyPlan = { ...deps.planner(recipe, state.capabilities, deps.catalog), revision };
      lastReceipt = engine.applyPlan(plan);
      lastPlan = plan;
      appliedRevision = revision;
      appliedCapabilities = state.capabilities;
    } catch (error) {
      report("apply-plan-failed", "플랜 적용에 실패했습니다.", error);
    }
    settledEngine = engine;
    publish();
  };

  const schedule = (): void => {
    chain = chain.then(step, step);
  };

  return {
    start() {
      observed = null;
      inputsChanged();
      const unsubscribeStore = deps.store.subscribe(() => {
        if (inputsChanged()) schedule();
      });
      const unsubscribeEngine = deps.engineSession.subscribe((status) => {
        if (status.phase === "ready") schedule();
        if (status.phase === "idle" || status.phase === "failed" || status.phase === "lost") {
          loadedEngine = null;
          loadedSourceKey = null;
          lastPlan = null;
          lastReceipt = null;
          resetForEngine();
          publish();
        }
      });
      schedule();
      return () => {
        unsubscribeStore();
        unsubscribeEngine();
      };
    },
    flush: () => chain,
    settled() {
      const engine = deps.engineSession.engine();
      return engine !== null && engine === settledEngine;
    },
    lastPlan: () => lastPlan,
    lastReceipt: () => lastReceipt,
    snapshot: () => snapshot,
    markSourceLoaded(engine, source) {
      const recipe = deps.store.getState().recipe;
      loadedEngine = engine;
      // 절차 소스는 지금 레시피로 만든 것으로 본다(패널이 올리는 소스는 패키지뿐이고, 절차 소스는 루프만 만든다).
      loadedSourceKey = source.kind === "procedural" ? recipeSourceKey(recipe) : sourceKeyOf(source);
      resetForEngine();
      lastPlan = null;
      lastReceipt = null;
      if (recipeSourceKey(recipe) === loadedSourceKey) schedule();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
