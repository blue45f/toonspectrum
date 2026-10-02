/**
 * 썸네일 드라이버: 엔진이 준비되고 레시피·셰이딩 모드가 바뀔 때마다 외형 12슬롯의 프리셋 카드 썸네일을
 * thumbnail-scheduler 큐에 넣는다(활성 슬롯 카드 우선). SlotPanel이 직접 scheduler를 쓰지 않아도
 * 카드 썸네일이 채워지도록 셸이 구동한다. 엔진이 없어지면 큐를 비운다.
 *
 * `applyLoop`이 주어지면 현재 엔진에 소스가 올라가고 첫 적용 단계가 끝난 뒤에만 요청한다: 엔진 `ready` 직후에는 적용 루프가
 * 절차 소스를 만들고 `loadSource`하는 중이라, 그 전에 `renderThumbnail`을 부르면 소스 없는 엔진을 렌더하게 된다.
 * 루프가 스냅샷을 발행할 때(소스 로드·플랜 적용 직후) 다시 확인한다.
 */
import { APPEARANCE_SLOT_KINDS } from "../../contracts";
import { fnv1a64Hex } from "../../shared/hash";
import { stableStringify } from "../../shared/stable-json";

import type { ApplyLoop } from "./apply-loop";
import type { ThumbnailScheduler } from "./thumbnail-scheduler";
import type { UiStateStore } from "./ui-state";
import type { CharacterRecipe, EngineSession, LabStore, PresetCatalog, PresetEntry, PresetId, ShadingMode } from "../../contracts";

export interface ThumbnailDriverDeps {
  readonly store: LabStore;
  readonly catalog: PresetCatalog;
  readonly engineSession: EngineSession;
  readonly scheduler: ThumbnailScheduler;
  readonly ui?: UiStateStore;
  /** 소스 로드·첫 적용 완료 신호(없으면 엔진이 있으면 바로 요청) */
  readonly applyLoop?: Pick<ApplyLoop, "settled" | "subscribe">;
}

export interface ThumbnailDriver {
  start(): () => void;
  /** 외형 슬롯 프리셋 전부를 큐에 넣는다(활성 슬롯 우선). 엔진이 없으면 아무것도 하지 않는다. */
  requestAll(): void;
}

/** 프리셋을 현재 레시피에 임시 적용한 레시피(썸네일 플랜 입력). 다른 슬롯은 그대로 둔다. */
export function presetRecipe(recipe: CharacterRecipe, entry: Pick<PresetEntry, "id" | "slot">): CharacterRecipe {
  return { ...recipe, slots: { ...recipe.slots, [entry.slot]: entry.id } };
}

/**
 * state/thumbnail-cache.ts `thumbnailCacheKey`가 없을 때 쓰는 참조 구현.
 * 해당 슬롯과 페인트 레이어를 제외한 레시피 digest + 셰이딩 모드 + 프리셋 id.
 */
export function fallbackThumbnailCacheKey(presetId: PresetId, recipe: CharacterRecipe, shadingMode: ShadingMode): string {
  const slot = presetId.slice(0, presetId.indexOf("/"));
  const slots: Record<string, PresetId | null> = { ...recipe.slots };
  slots[slot] = null;
  return fnv1a64Hex(stableStringify({ presetId, shadingMode, recipe: { ...recipe, slots, paint: { layers: [] } } }));
}

export function createThumbnailDriver(deps: ThumbnailDriverDeps): ThumbnailDriver {
  let lastRevision = -1;
  let lastShadingMode: ShadingMode | null = null;
  let lastEngine: unknown = null;

  const activeSlotIds = (): readonly PresetId[] => {
    const slot = deps.ui?.getState().activeSlot;
    if (!slot) return [];
    return deps.catalog.bySlot(slot).map((entry) => entry.id);
  };

  const sourceReady = (): boolean => (deps.applyLoop ? deps.applyLoop.settled() : true);

  const requestAll = (): void => {
    if (!deps.engineSession.engine() || !sourceReady()) return;
    const activeSlot = deps.ui?.getState().activeSlot;
    deps.scheduler.setVisible(activeSlotIds());
    for (const slot of APPEARANCE_SLOT_KINDS) {
      for (const entry of deps.catalog.bySlot(slot)) {
        deps.scheduler.request(entry.id, { visible: slot === activeSlot });
      }
    }
  };

  const onStoreChange = (): void => {
    const state = deps.store.getState();
    const engine = deps.engineSession.engine();
    if (!engine) {
      lastEngine = null;
      return;
    }
    if (!sourceReady()) return;
    const mode = state.recipe.shading.mode;
    if (engine === lastEngine && state.history.revision === lastRevision && mode === lastShadingMode) return;
    lastEngine = engine;
    lastRevision = state.history.revision;
    lastShadingMode = mode;
    requestAll();
  };

  return {
    requestAll,
    start() {
      const unsubscribeStore = deps.store.subscribe(onStoreChange);
      const unsubscribeEngine = deps.engineSession.subscribe((status) => {
        if (status.phase === "ready") {
          onStoreChange();
          return;
        }
        lastEngine = null;
        deps.scheduler.clear();
      });
      const unsubscribeLoop = deps.applyLoop?.subscribe(() => onStoreChange()) ?? (() => undefined);
      const unsubscribeUi =
        deps.ui?.subscribe(() => {
          if (!deps.engineSession.engine() || !sourceReady()) return;
          const ids = activeSlotIds();
          deps.scheduler.setVisible(ids);
          for (const id of ids) deps.scheduler.request(id, { visible: true });
        }) ?? (() => undefined);
      onStoreChange();
      return () => {
        unsubscribeStore();
        unsubscribeEngine();
        unsubscribeLoop();
        unsubscribeUi();
      };
    },
  };
}
