// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { failVisible } from "../../contracts";
import { createMockEngineSession, createMockLabStore, MockLabProvider } from "../../testing/mock-store";
import { applyPlanFixture } from "../../testing/recipe-fixtures";

import { useApplyPlan, useDispatch, useEngineSession, useLabState, useUiActions, useUiState, useViewportRegistry } from "./lab-store-context";
import { createUiStateStore } from "./ui-state";

import type { ApplyLoop, ApplyLoopSnapshot } from "./apply-loop";
import type { ReactNode } from "react";

afterEach(cleanup);

describe("app/shell/lab-store-context", () => {
  it("Provider 밖에서 훅을 쓰면 throw한다", () => {
    expect(() => renderHook(() => useLabState())).toThrow(/LabStoreProvider 밖/u);
  });

  it("useLabState는 이벤트 반영 시 갱신되고 useDispatch는 store.dispatch로 간다", () => {
    const store = createMockLabStore();
    const wrapper = ({ children }: { children: ReactNode }) => <MockLabProvider store={store}>{children}</MockLabProvider>;
    const { result } = renderHook(() => ({ state: useLabState(), dispatch: useDispatch() }), { wrapper });
    expect(result.current.state.failures).toEqual([]);
    act(() => {
      store.applyEvent({ type: "failure", failure: failVisible("x", "실패", undefined, 1) });
    });
    expect(result.current.state.failures).toHaveLength(1);
    act(() => {
      result.current.dispatch({ type: "history/undo" });
    });
    expect(store.dispatched).toEqual([{ type: "history/undo" }]);
  });

  it("셸 값(UI 상태·뷰포트·엔진 세션)을 주입하고 구독한다", () => {
    const ui = createUiStateStore();
    const session = createMockEngineSession();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MockLabProvider engineSession={session} shell={{ ui }}>
        {children}
      </MockLabProvider>
    );
    const { result } = renderHook(() => ({ ui: useUiState(), actions: useUiActions(), session: useEngineSession(), viewport: useViewportRegistry() }), { wrapper });
    expect(result.current.ui.activeSlot).toBe("face-shape");
    act(() => {
      result.current.actions.setActiveSlot("hair");
    });
    expect(result.current.ui.activeSlot).toBe("hair");
    expect(result.current.session).toBe(session);
    expect(result.current.viewport.current()).toBeNull();
  });

  it("useApplyPlan은 루프 스냅샷을 구독하고 루프가 없으면 null이다", () => {
    const listeners = new Set<(snapshot: ApplyLoopSnapshot) => void>();
    let snapshot: ApplyLoopSnapshot = { plan: null, receipt: null, sequence: 0 };
    const loop: ApplyLoop = {
      start: () => () => undefined,
      flush: async () => undefined,
      lastPlan: () => snapshot.plan,
      lastReceipt: () => snapshot.receipt,
      snapshot: () => snapshot,
      markSourceLoaded: () => undefined,
      settled: () => true,
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
    function Probe() {
      const plan = useApplyPlan();
      return <output>{plan ? `rev ${plan.revision}` : "플랜 없음"}</output>;
    }
    render(
      <MockLabProvider shell={{ applyLoop: loop }}>
        <Probe />
      </MockLabProvider>,
    );
    expect(screen.getByText("플랜 없음")).toBeTruthy();
    act(() => {
      snapshot = { plan: applyPlanFixture({ revision: 4 }), receipt: null, sequence: 1 };
      for (const listener of listeners) listener(snapshot);
    });
    expect(screen.getByText("rev 4")).toBeTruthy();
    cleanup();
    render(
      <MockLabProvider>
        <Probe />
      </MockLabProvider>,
    );
    expect(screen.getByText("플랜 없음")).toBeTruthy();
  });
});
