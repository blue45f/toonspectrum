// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ALL_AVAILABLE_CAPABILITIES, SLOT_GROUPS, createDefaultRecipe, createInitialLabState, createPresetCatalog } from "../../../contracts";
import { APPEARANCE_PRESETS } from "../../../presets";
import { createLabStore } from "../../../state/lab-store";
import { MockLabProvider, createMockLabStore } from "../../../testing/mock-store";
import { vocabularyCatalogEntries } from "../../../testing/recipe-fixtures";

import { SlotPanel } from "./SlotPanel";

import type { LabState, PresetCatalog, SlotCapabilityMap } from "../../../contracts";

afterEach(cleanup);

function catalog(): PresetCatalog {
  const performance = vocabularyCatalogEntries().filter((e) => SLOT_GROUPS.performance.includes(e.slot));
  return createPresetCatalog([...APPEARANCE_PRESETS, ...performance]);
}

function capabilities(overrides: Partial<SlotCapabilityMap> = {}): SlotCapabilityMap {
  return { ...ALL_AVAILABLE_CAPABILITIES, ...overrides };
}

function card(name: string): HTMLButtonElement {
  return screen.getByRole("button", { name: new RegExp(`^${name}`, "u") });
}

describe("SlotPanel", () => {
  it("기본 슬롯(얼굴형) 카드 6개를 보여주고 카드 클릭은 slot/apply 1회를 dispatch한다", () => {
    const dispatchSpy = vi.fn();
    render(
      <MockLabProvider catalog={catalog()} dispatchSpy={dispatchSpy} initialState={{ capabilities: capabilities() }}>
        <SlotPanel />
      </MockLabProvider>,
    );
    const grid = screen.getByRole("group", { name: "얼굴형 프리셋" });
    expect(within(grid).getAllByRole("button")).toHaveLength(6);
    expect(card("계란형").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(card("둥근형"));
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith({ type: "slot/apply", slot: "face-shape", presetId: "face-shape/round" });
  });

  it("탭을 바꾸면 해당 슬롯 카드가 나오고 액세서리에는 '없음' 카드가 있다", () => {
    const dispatchSpy = vi.fn();
    render(
      <MockLabProvider catalog={catalog()} dispatchSpy={dispatchSpy} initialState={{ capabilities: capabilities() }}>
        <SlotPanel />
      </MockLabProvider>,
    );
    fireEvent.click(screen.getByRole("tab", { name: /^헤어/u }));
    expect(screen.getByRole("tab", { name: /^헤어/u }).getAttribute("aria-selected")).toBe("true");
    expect(within(screen.getByRole("group", { name: "헤어 프리셋" })).getAllByRole("button")).toHaveLength(7);
    fireEvent.click(screen.getByRole("tab", { name: /^액세서리/u }));
    const grid = screen.getByRole("group", { name: "액세서리 프리셋" });
    expect(within(grid).getAllByRole("button")).toHaveLength(7);
    const none = within(grid).getByRole("button", { name: "없음" });
    expect(none.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(none);
    expect(dispatchSpy).toHaveBeenLastCalledWith({ type: "slot/apply", slot: "accessory", presetId: null });
    expect(screen.getByRole("tablist", { name: "슬롯" }).querySelectorAll('[role="tab"]')).toHaveLength(15);
  });

  it("unavailable 슬롯의 카드는 disabled이고 사유를 보여주며 클릭해도 dispatch하지 않는다", () => {
    const dispatchSpy = vi.fn();
    const reason = "제작 패키지는 교체형 헤어를 제공하지 않습니다.";
    render(
      <MockLabProvider catalog={catalog()} dispatchSpy={dispatchSpy} initialState={{ capabilities: capabilities({ hair: { status: "unavailable", reasonKo: reason } }) }}>
        <SlotPanel />
      </MockLabProvider>,
    );
    fireEvent.click(screen.getByRole("tab", { name: /^헤어/u }));
    const bob = card("소프트 보브");
    expect(bob.disabled).toBe(true);
    expect(bob.title).toContain(reason);
    expect(screen.getAllByText(reason).length).toBeGreaterThan(0);
    expect(screen.getAllByText("미지원").length).toBeGreaterThan(0);
    fireEvent.click(bob);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it("partial 슬롯은 경고 배지와 사유를 보여주지만 클릭할 수 있다", () => {
    const dispatchSpy = vi.fn();
    render(
      <MockLabProvider catalog={catalog()} dispatchSpy={dispatchSpy} initialState={{ capabilities: capabilities({ "face-shape": { status: "partial", reasonKo: "음수 방향 shape key 없음" } }) }}>
        <SlotPanel />
      </MockLabProvider>,
    );
    expect(screen.getAllByText("부분 지원").length).toBeGreaterThan(0);
    expect(screen.getAllByText("음수 방향 shape key 없음").length).toBeGreaterThan(0);
    fireEvent.click(card("하트형"));
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
  });

  it("현재 레시피와 충돌하는 후보 카드에 '겹침 주의' 배지를 단다", () => {
    const base = createDefaultRecipe();
    const recipe = { ...base, slots: { ...base.slots, hair: "hair/twin-tail" as const } };
    render(
      <MockLabProvider catalog={catalog()} initialState={{ capabilities: capabilities(), recipe }}>
        <SlotPanel />
      </MockLabProvider>,
    );
    fireEvent.click(screen.getByRole("tab", { name: /^액세서리/u }));
    expect(within(card("캡 모자")).getByText("겹침 주의")).toBeTruthy();
    expect(card("캡 모자").title).toContain("트윈테일");
    expect(within(card("안경")).queryByText("겹침 주의")).toBeNull();
  });

  it("썸네일 pending/failed 배지를 보여준다", () => {
    const thumbnails: LabState["thumbnails"] = {
      "face-shape/oval": { status: "pending", cacheKey: "k1" },
      "face-shape/round": { status: "failed", cacheKey: "k2", reasonKo: "엔진이 준비되지 않아 썸네일을 만들 수 없습니다." },
    };
    render(
      <MockLabProvider catalog={catalog()} initialState={{ capabilities: capabilities(), thumbnails }}>
        <SlotPanel />
      </MockLabProvider>,
    );
    expect(within(card("계란형")).getByText("생성 중")).toBeTruthy();
    expect(within(card("둥근형")).getByText(/썸네일 실패: 엔진이 준비되지 않아/u)).toBeTruthy();
    expect(within(card("하트형")).getByText("썸네일 없음")).toBeTruthy();
  });

  it("undo/redo 버튼은 history 상태를 따르고 dispatch한다", () => {
    const store = createMockLabStore({ capabilities: capabilities(), history: { canUndo: true, canRedo: false, depth: 2, revision: 2 } });
    render(
      <MockLabProvider catalog={catalog()} store={store}>
        <SlotPanel />
      </MockLabProvider>,
    );
    const undo = screen.getByRole("button", { name: "실행 취소" });
    const redo = screen.getByRole("button", { name: "다시 실행" });
    expect(undo.hasAttribute("disabled")).toBe(false);
    expect(redo.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("2단계")).toBeTruthy();
    fireEvent.click(undo);
    expect(store.dispatched).toEqual([{ type: "history/undo" }]);
    act(() => store.setState({ history: { canUndo: false, canRedo: true, depth: 1, revision: 3 } }));
    expect(screen.getByRole("button", { name: "다시 실행" }).hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "다시 실행" }));
    expect(store.dispatched.at(-1)).toEqual({ type: "history/redo" });
  });

  it("실제 store와 함께 쓰면 카드 클릭이 레시피를 바꾸고 선택 카드가 옮겨간다", () => {
    const cat = catalog();
    const store = createLabStore({ catalog: cat, initial: createInitialLabState(createDefaultRecipe(), capabilities()) });
    render(
      <MockLabProvider catalog={cat} store={store}>
        <SlotPanel />
      </MockLabProvider>,
    );
    fireEvent.click(card("둥근형"));
    expect(store.getState().recipe.slots["face-shape"]).toBe("face-shape/round");
    expect(store.getState().recipe.face.jawWidth).toBe(0.35);
    expect(card("둥근형").getAttribute("aria-pressed")).toBe("true");
    expect(card("계란형").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(card("계란형").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("슬롯 15개 · 프리셋 94개")).toBeTruthy();
  });
});
