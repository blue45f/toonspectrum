// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ALL_AVAILABLE_CAPABILITIES, createDefaultRecipe, createInitialLabState, createPresetCatalog } from "../contracts";
import { vocabularyCatalogEntries } from "../testing/recipe-fixtures";

import { createLabStore } from "./lab-store";
import { shallowEqual, useLabStoreSelector, useLabStoreState } from "./useLabStore";

import type { LabState, LabStore } from "../contracts";

afterEach(cleanup);

function makeStore(): LabStore {
  return createLabStore({ catalog: createPresetCatalog(vocabularyCatalogEntries()), initial: createInitialLabState(createDefaultRecipe(), ALL_AVAILABLE_CAPABILITIES) });
}

function HeightView({ store }: { readonly store: LabStore }) {
  const state = useLabStoreState(store);
  return <output data-testid="height">{state.recipe.body.height ?? 0}</output>;
}

const selectSlots = (state: LabState): readonly (string | null)[] => [state.recipe.slots.hair, state.recipe.slots.top];

function SlotsView({ store, renders }: { readonly store: LabStore; readonly renders: { count: number } }) {
  const slots = useLabStoreSelector(store, selectSlots, shallowEqual);
  renders.count += 1;
  return <output data-testid="slots">{slots.join(",")}</output>;
}

describe("state/useLabStore", () => {
  it("useLabStoreState는 dispatch 후 리렌더한다", () => {
    const store = makeStore();
    render(<HeightView store={store} />);
    expect(screen.getByTestId("height").textContent).toBe("0");
    act(() => store.dispatch({ type: "param/set", group: "body", key: "height", value: 0.5 }));
    expect(screen.getByTestId("height").textContent).toBe("0.5");
  });

  it("useLabStoreSelector는 선택 결과가 얕게 같으면 리렌더하지 않는다", () => {
    const store = makeStore();
    const renders = { count: 0 };
    render(<SlotsView store={store} renders={renders} />);
    expect(screen.getByTestId("slots").textContent).toBe("hair/soft-bob,top/tee");
    const after = renders.count;
    act(() => store.dispatch({ type: "param/set", group: "body", key: "height", value: 0.2 }));
    expect(renders.count).toBe(after);
    act(() => store.dispatch({ type: "slot/apply", slot: "hair", presetId: "hair/twin-tail" }));
    expect(screen.getByTestId("slots").textContent).toBe("hair/twin-tail,top/tee");
    expect(renders.count).toBe(after + 1);
  });

  it("shallowEqual", () => {
    expect(shallowEqual([1, 2], [1, 2])).toBe(true);
    expect(shallowEqual([1, 2], [1, 3])).toBe(false);
    expect(shallowEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(shallowEqual({ a: {} }, { a: {} })).toBe(false);
    expect(shallowEqual(null, null)).toBe(true);
    expect(shallowEqual(null, {})).toBe(false);
    expect(shallowEqual([1], { 0: 1 })).toBe(false);
  });

  it("언마운트 후에는 구독이 해제된다", () => {
    const store = makeStore();
    const subscribe = vi.spyOn(store, "subscribe");
    const view = render(<HeightView store={store} />);
    expect(subscribe).toHaveBeenCalled();
    view.unmount();
    act(() => store.dispatch({ type: "param/set", group: "body", key: "height", value: 0.9 }));
    expect(store.getState().recipe.body.height).toBe(0.9);
  });
});
