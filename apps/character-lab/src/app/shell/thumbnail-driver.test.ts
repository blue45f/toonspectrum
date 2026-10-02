import { describe, expect, it } from "vitest";

import { APPEARANCE_SLOT_KINDS, createDefaultRecipe, createPresetCatalog } from "../../contracts";
import { createMockEngine } from "../../testing/mock-engine";
import { createMockEngineSession, createMockLabStore } from "../../testing/mock-store";
import { vocabularyCatalogEntries } from "../../testing/recipe-fixtures";

import { createThumbnailDriver, fallbackThumbnailCacheKey, presetRecipe } from "./thumbnail-driver";
import { createUiStateStore } from "./ui-state";

import type { ApplyLoopSnapshot } from "./apply-loop";
import type { ThumbnailRequestOptions, ThumbnailScheduler } from "./thumbnail-scheduler";
import type { PresetId } from "../../contracts";

function schedulerSpy(): ThumbnailScheduler & { readonly requests: Array<[PresetId, ThumbnailRequestOptions | undefined]>; visible: readonly PresetId[]; cleared: number } {
  const requests: Array<[PresetId, ThumbnailRequestOptions | undefined]> = [];
  const spy = {
    requests,
    visible: [] as readonly PresetId[],
    cleared: 0,
    request(presetId: PresetId, options?: ThumbnailRequestOptions) {
      requests.push([presetId, options]);
    },
    setVisible(ids: readonly PresetId[]) {
      spy.visible = ids;
    },
    cancel() {
      // 사용 안 함
    },
    pending: () => requests.length,
    isRunning: () => false,
    idle: async () => undefined,
    clear() {
      spy.cleared += 1;
    },
  };
  return spy;
}

describe("app/shell/thumbnail-driver", () => {
  const catalog = createPresetCatalog(vocabularyCatalogEntries());
  const appearanceCount = APPEARANCE_SLOT_KINDS.reduce((sum, slot) => sum + catalog.bySlot(slot).length, 0);

  it("엔진 ready 시 외형 슬롯 프리셋 전부를 요청하고 활성 슬롯을 가시로 둔다", () => {
    const store = createMockLabStore();
    const session = createMockEngineSession();
    const engine = createMockEngine();
    const scheduler = schedulerSpy();
    const ui = createUiStateStore({ activeSlot: "hair" });
    const driver = createThumbnailDriver({ store, catalog, engineSession: session, scheduler, ui });
    const stop = driver.start();
    expect(scheduler.requests).toHaveLength(0);
    session.setEngine(engine);
    session.setStatus({ phase: "ready", backend: "webgpu", diagnostics: engine.diagnostics });
    expect(scheduler.requests).toHaveLength(appearanceCount);
    expect(scheduler.visible).toEqual(catalog.bySlot("hair").map((entry) => entry.id));
    expect(scheduler.requests.filter(([, options]) => options?.visible).map(([id]) => id)).toEqual(catalog.bySlot("hair").map((entry) => entry.id));
    // 같은 revision·모드의 상태 변화(이벤트)는 다시 요청하지 않는다
    store.setState({ failures: [] });
    expect(scheduler.requests).toHaveLength(appearanceCount);
    // 셰이딩 모드가 바뀌면 전부 다시 요청
    const recipe = store.getState().recipe;
    store.setState({ recipe: { ...recipe, shading: { ...recipe.shading, mode: "toon" } } });
    expect(scheduler.requests).toHaveLength(appearanceCount * 2);
    // 활성 슬롯이 바뀌면 그 슬롯만 가시 요청
    ui.setActiveSlot("eyes");
    expect(scheduler.visible).toEqual(catalog.bySlot("eyes").map((entry) => entry.id));
    expect(scheduler.requests).toHaveLength(appearanceCount * 2 + catalog.bySlot("eyes").length);
    // 엔진이 사라지면 큐를 비운다
    session.setEngine(null);
    session.setStatus({ phase: "idle" });
    expect(scheduler.cleared).toBe(1);
    stop();
  });

  it("applyLoop이 있으면 소스 로드·첫 적용이 끝난 뒤에만 요청한다(ready 직후 소스 없는 엔진 렌더 방지)", () => {
    const store = createMockLabStore();
    const session = createMockEngineSession();
    const engine = createMockEngine();
    const scheduler = schedulerSpy();
    let loaded = false;
    const loopListeners = new Set<(snapshot: ApplyLoopSnapshot) => void>();
    const applyLoop = {
      settled: () => loaded,
      subscribe(listener: (snapshot: ApplyLoopSnapshot) => void) {
        loopListeners.add(listener);
        return () => {
          loopListeners.delete(listener);
        };
      },
    };
    const driver = createThumbnailDriver({ store, catalog, engineSession: session, scheduler, applyLoop });
    const stop = driver.start();
    session.setEngine(engine);
    session.setStatus({ phase: "ready", backend: "webgpu", diagnostics: engine.diagnostics });
    // 엔진은 ready지만 소스가 아직 없다 → 요청하지 않는다
    expect(scheduler.requests).toHaveLength(0);
    driver.requestAll();
    expect(scheduler.requests).toHaveLength(0);
    // 적용 루프가 소스를 올리고 스냅샷을 발행하면 그때 전부 요청한다
    loaded = true;
    for (const listener of loopListeners) listener({ plan: null, receipt: null, sequence: 1 });
    expect(scheduler.requests).toHaveLength(appearanceCount);
    // 같은 엔진·revision·모드에서 루프가 다시 발행해도 중복 요청하지 않는다
    for (const listener of loopListeners) listener({ plan: null, receipt: null, sequence: 2 });
    expect(scheduler.requests).toHaveLength(appearanceCount);
    stop();
    expect(loopListeners.size).toBe(0);
  });

  it("presetRecipe는 해당 슬롯만 바꾸고 fallback 캐시 키는 그 슬롯 변경에 불변이다", () => {
    const recipe = createDefaultRecipe();
    const changed = presetRecipe(recipe, { id: "hair/hime-cut", slot: "hair" });
    expect(changed.slots.hair).toBe("hair/hime-cut");
    expect(changed.slots.eyes).toBe(recipe.slots.eyes);
    const keyA = fallbackThumbnailCacheKey("hair/hime-cut", recipe, "pbr");
    const keyB = fallbackThumbnailCacheKey("hair/hime-cut", changed, "pbr");
    expect(keyA).toBe(keyB);
    expect(fallbackThumbnailCacheKey("hair/hime-cut", recipe, "toon")).not.toBe(keyA);
    expect(fallbackThumbnailCacheKey("hair/hime-cut", { ...recipe, slots: { ...recipe.slots, eyes: "eyes/round" } }, "pbr")).not.toBe(keyA);
    expect(fallbackThumbnailCacheKey("hair/soft-bob", recipe, "pbr")).not.toBe(keyA);
  });
});
