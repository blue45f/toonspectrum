import { describe, expect, it, vi } from "vitest";

import { ALL_AVAILABLE_CAPABILITIES, ALL_UNAVAILABLE_CAPABILITIES, createDefaultRecipe, createInitialLabState, createPresetCatalog, failVisible } from "../contracts";
import { applyLabEvent as referenceApplyLabEvent } from "../testing/mock-store";
import { presetEntryFixture, vocabularyCatalogEntries } from "../testing/recipe-fixtures";

import { applyLabEvent, createLabStore } from "./lab-store";

import type { LabEvent, PaintUndoToken, PresetCatalog } from "../contracts";

function catalog(): PresetCatalog {
  const entries = vocabularyCatalogEntries().map((entry) => {
    if (entry.id === "face-shape/round") return presetEntryFixture(entry.id, { patch: { face: { jawWidth: 0.4 } } });
    if (entry.id === "hair/twin-tail") return presetEntryFixture(entry.id, { patch: { parts: { hair: "twin-tail" }, colors: { hair: "#aabbcc" } } });
    return entry;
  });
  return createPresetCatalog(entries);
}

function storeWithClock() {
  let time = 1000;
  const store = createLabStore({
    catalog: catalog(),
    initial: createInitialLabState(createDefaultRecipe(), ALL_AVAILABLE_CAPABILITIES),
    now: () => time,
  });
  return { store, advance: (ms: number) => void (time += ms) };
}

describe("state/lab-store", () => {
  it("초기 상태: 기본 레시피·history 비어 있음·revision 0", () => {
    const store = createLabStore({ catalog: catalog() });
    const state = store.getState();
    expect(state.recipe).toEqual(createDefaultRecipe());
    expect(state.capabilities).toBe(ALL_UNAVAILABLE_CAPABILITIES);
    expect(state.history).toEqual({ canUndo: false, canRedo: false, depth: 0, revision: 0 });
    expect(state.failures).toEqual([]);
  });

  it("명령 1개 = history 1단계, revision 단조 증가", () => {
    const { store } = storeWithClock();
    store.dispatch({ type: "slot/apply", slot: "face-shape", presetId: "face-shape/round" });
    store.dispatch({ type: "slot/apply", slot: "hair", presetId: "hair/twin-tail" });
    store.dispatch({ type: "color/set", key: "skin", value: "#123456" });
    const state = store.getState();
    expect(state.history).toEqual({ canUndo: true, canRedo: false, depth: 3, revision: 3 });
    expect(state.recipe.face).toEqual({ jawWidth: 0.4 });
    expect(state.recipe.colors.hair).toBe("#aabbcc");
    expect(state.recipe.colors.skin).toBe("#123456");
  });

  it("param/set은 coalesceKey로 1단계에 병합되고 undo 한 번에 전부 되돌아간다", () => {
    const { store, advance } = storeWithClock();
    for (const value of [0.1, 0.2, 0.3, 0.4]) {
      store.dispatch({ type: "param/set", group: "body", key: "height", value, coalesceKey: "body:height" });
      advance(50);
    }
    expect(store.getState().history.depth).toBe(1);
    expect(store.getState().history.revision).toBe(4);
    expect(store.getState().recipe.body.height).toBe(0.4);
    advance(1000);
    store.dispatch({ type: "param/set", group: "body", key: "height", value: 0.5, coalesceKey: "body:height" });
    expect(store.getState().history.depth).toBe(2);
    store.dispatch({ type: "history/undo" });
    expect(store.getState().recipe.body.height).toBe(0.4);
    store.dispatch({ type: "history/undo" });
    expect(store.getState().recipe.body).toEqual({});
    expect(store.getState().history).toMatchObject({ canUndo: false, canRedo: true, depth: 0, revision: 7 });
    store.dispatch({ type: "history/redo" });
    expect(store.getState().recipe.body.height).toBe(0.4);
    expect(store.getState().history.revision).toBe(8);
  });

  it("coalesceKey 없는 param/set은 매번 1단계다", () => {
    const { store } = storeWithClock();
    store.dispatch({ type: "param/set", group: "face", key: "eyeSize", value: 0.1 });
    store.dispatch({ type: "param/set", group: "face", key: "eyeSize", value: 0.2 });
    expect(store.getState().history.depth).toBe(2);
  });

  it("레시피가 바뀌지 않는 명령은 history 단계를 만들지 않는다", () => {
    const { store } = storeWithClock();
    store.dispatch({ type: "slot/apply", slot: "accessory", presetId: null });
    store.dispatch({ type: "color/set", key: "skin", value: createDefaultRecipe().colors.skin });
    store.dispatch({ type: "history/undo" });
    store.dispatch({ type: "history/redo" });
    expect(store.getState().history).toEqual({ canUndo: false, canRedo: false, depth: 0, revision: 0 });
  });

  it("거부된 명령은 상태를 바꾸지 않고 failures에 한글 사유를 쌓는다", () => {
    const { store } = storeWithClock();
    const before = store.getState();
    store.dispatch({ type: "slot/apply", slot: "hair", presetId: "hair/mohawk" });
    store.dispatch({ type: "color/set", key: "skin", value: "red" });
    const state = store.getState();
    expect(state.recipe).toBe(before.recipe);
    expect(state.history.depth).toBe(0);
    expect(state.failures.map((f) => f.code)).toEqual(["command-preset-unknown", "command-color-invalid"]);
    expect(state.failures.every((f) => /[가-힣]/u.test(f.reasonKo))).toBe(true);
    expect(state.failures[0]?.at).toBe(1000);
  });

  it("subscribe는 변경마다 호출되고 해제 후에는 호출되지 않는다", () => {
    const { store } = storeWithClock();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.dispatch({ type: "color/set", key: "hair", value: "#000000" });
    store.applyEvent({ type: "engine/status", status: { phase: "initializing", backend: "webgpu" } });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.dispatch({ type: "color/set", key: "hair", value: "#111111" });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("이벤트 반영은 testing/mock-store의 참조 구현과 같다", () => {
    const { store } = storeWithClock();
    const failure = failVisible("x", "실패", undefined, 1);
    const events: LabEvent[] = [
      { type: "engine/status", status: { phase: "initializing", backend: "webgl2" } },
      { type: "physics/status", status: { id: "rapier", status: "unavailable", reasonKo: "없음" } },
      { type: "vision/status", status: { phase: "loading", model: "imageEmbedder" } },
      { type: "failure", failure },
      { type: "thumbnail/update", presetId: "hair/soft-bob", entry: { status: "pending", cacheKey: "k" } },
      { type: "failure/dismiss", failure },
      { type: "capture/done", result: {} as never },
    ];
    let expected = store.getState();
    for (const event of events) {
      expected = referenceApplyLabEvent(expected, event);
      store.applyEvent(event);
      expect(store.getState()).toEqual(expected);
      expect(applyLabEvent(expected, event)).toEqual(referenceApplyLabEvent(expected, event));
    }
    expect(store.getState().failures).toEqual([]);
    expect(store.getState().thumbnails["hair/soft-bob"]).toEqual({ status: "pending", cacheKey: "k" });
    expect(store.getState().history.revision).toBe(0);
  });

  it("source/set은 능력 맵도 바꾸고 undo/redo가 함께 되돌린다", () => {
    const { store } = storeWithClock();
    const source = { kind: "package", characterId: "orion", sha256: "b".repeat(64) } as const;
    store.dispatch({ type: "source/set", source, capabilities: ALL_UNAVAILABLE_CAPABILITIES });
    expect(store.getState().capabilities).toBe(ALL_UNAVAILABLE_CAPABILITIES);
    expect(store.getState().recipe.source).toEqual(source);
    store.dispatch({ type: "history/undo" });
    expect(store.getState().capabilities).toBe(ALL_AVAILABLE_CAPABILITIES);
    expect(store.getState().recipe.source).toEqual({ kind: "procedural" });
    store.dispatch({ type: "history/redo" });
    expect(store.getState().capabilities).toBe(ALL_UNAVAILABLE_CAPABILITIES);
    // 같은 소스라도 능력 맵이 바뀌면 단계를 만든다.
    store.dispatch({ type: "source/set", source, capabilities: ALL_AVAILABLE_CAPABILITIES });
    expect(store.getState().history.depth).toBe(2);
  });

  it("paint/stroke는 history 1단계이며 undo/redo가 콜백을 방향과 함께 호출한다", () => {
    const token: PaintUndoToken = { part: "skin", tiles: [{ x: 0, y: 0, data: new Uint8ClampedArray(4) }], tileSize: 64 };
    const inverse: PaintUndoToken = { part: "skin", tiles: [{ x: 0, y: 0, data: new Uint8ClampedArray([1, 2, 3, 4]) }], tileSize: 64 };
    const onPaintUndo = vi.fn((_token: PaintUndoToken, direction: "undo" | "redo") => (direction === "undo" ? inverse : undefined));
    const store = createLabStore({ catalog: catalog(), onPaintUndo });
    store.dispatch({ type: "paint/stroke", undoToken: token });
    expect(store.getState().history).toEqual({ canUndo: true, canRedo: false, depth: 1, revision: 0 });
    store.dispatch({ type: "history/undo" });
    expect(onPaintUndo).toHaveBeenLastCalledWith(token, "undo");
    store.dispatch({ type: "history/redo" });
    expect(onPaintUndo).toHaveBeenLastCalledWith(inverse, "redo");
    store.dispatch({ type: "history/undo" });
    expect(onPaintUndo).toHaveBeenLastCalledWith(token, "undo");
    expect(store.getState().history.revision).toBe(0);
  });

  it("getPlan은 revision을 담고 상태가 같으면 메모된 참조를 돌려준다", () => {
    const { store } = storeWithClock();
    const first = store.getPlan();
    expect(first.revision).toBe(0);
    expect(store.getPlan()).toBe(first);
    store.dispatch({ type: "slot/apply", slot: "face-shape", presetId: "face-shape/round" });
    const second = store.getPlan();
    expect(second).not.toBe(first);
    expect(second.revision).toBe(1);
    expect(second.morphWeights["param:jawWidth:+"]).toBe(0.4);
    expect(second.unsupported).toEqual([]);
  });

  it("planForPreset은 프리셋을 임시 적용한 플랜을 돌려주고 레시피는 그대로다", () => {
    const { store } = storeWithClock();
    const plan = store.planForPreset("face-shape/round");
    expect(plan.morphWeights["param:jawWidth:+"]).toBe(0.4);
    expect(store.getState().recipe.face).toEqual({});
    expect(store.getState().history.depth).toBe(0);
  });

  it("history 한도를 넘으면 가장 오래된 단계가 사라진다", () => {
    const store = createLabStore({ catalog: catalog(), initial: createInitialLabState(createDefaultRecipe(), ALL_AVAILABLE_CAPABILITIES), history: { limit: 3 } });
    for (let i = 1; i <= 5; i += 1) store.dispatch({ type: "param/set", group: "body", key: "height", value: i / 10 });
    expect(store.getState().history.depth).toBe(3);
    while (store.getState().history.canUndo) store.dispatch({ type: "history/undo" });
    expect(store.getState().recipe.body.height).toBe(0.2);
  });
});
