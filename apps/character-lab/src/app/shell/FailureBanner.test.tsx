// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ALL_AVAILABLE_CAPABILITIES, ALL_UNAVAILABLE_CAPABILITIES, failVisible } from "../../contracts";
import { createMockLabStore, MockLabProvider } from "../../testing/mock-store";
import { applyPlanFixture } from "../../testing/recipe-fixtures";

import { FailureBanner, summarizeCapabilities } from "./FailureBanner";

import type { ApplyLoop } from "./apply-loop";

afterEach(cleanup);

describe("app/shell/FailureBanner", () => {
  it("엔진 실패 사유·물리 불가·비전 실패·failure 목록을 보여주고 닫기는 dismiss 이벤트를 낸다", () => {
    const store = createMockLabStore({ capabilities: ALL_AVAILABLE_CAPABILITIES });
    render(
      <MockLabProvider store={store}>
        <FailureBanner />
      </MockLabProvider>,
    );
    expect(screen.getByText(/엔진 미선택/u)).toBeTruthy();
    const failure = failVisible("source-build-failed", "캐릭터 소스를 만들지 못했습니다.", undefined, 3);
    // 스토어 이벤트는 React 밖에서 오므로 act로 감싸 리렌더를 확정한다
    act(() => {
      store.applyEvent({ type: "engine/status", status: { phase: "failed", backend: "webgpu", failure: failVisible("webgpu-no-adapter", "WebGPU 어댑터를 얻지 못했습니다.", "detail-1", 1) } });
      store.applyEvent({ type: "physics/status", status: { id: "havok", status: "unavailable", reasonKo: "@babylonjs/havok 패키지가 설치되어 있지 않습니다." } });
      store.applyEvent({ type: "vision/status", status: { phase: "failed", failure: failVisible("vision-timeout", "모델 로드 시간 초과", undefined, 2) } });
      store.applyEvent({ type: "failure", failure });
    });
    expect(screen.getAllByText(/webgpu-no-adapter/u).length).toBeGreaterThan(0);
    expect(screen.getByText(/havok 패키지가 설치되어/u)).toBeTruthy();
    expect(screen.getByText(/모델 로드 시간 초과/u)).toBeTruthy();
    expect(screen.getByText("detail-1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "닫기: 캐릭터 소스를 만들지 못했습니다." }));
    expect(store.events.at(-1)).toEqual({ type: "failure/dismiss", failure });
    expect(store.getState().failures).toEqual([]);
  });

  it("슬롯 능력 사유와 마지막 플랜의 미적용 슬롯을 숨기지 않는다", () => {
    const store = createMockLabStore({ capabilities: ALL_UNAVAILABLE_CAPABILITIES });
    const plan = applyPlanFixture({ unsupported: [{ slot: "hair", presetId: "hair/hime-cut", reasonKo: "제작 패키지는 교체형 헤어를 제공하지 않습니다." }] });
    // useSyncExternalStore 계약: snapshot()은 변경이 없으면 같은 참조를 돌려줘야 한다(실제 ApplyLoop도 캐시한다)
    const snapshot = { plan, receipt: null, sequence: 1 };
    const loop: ApplyLoop = {
      start: () => () => undefined,
      flush: async () => undefined,
      lastPlan: () => plan,
      lastReceipt: () => null,
      snapshot: () => snapshot,
      markSourceLoaded: () => undefined,
      settled: () => true,
      subscribe: () => () => undefined,
    };
    render(
      <MockLabProvider store={store} shell={{ applyLoop: loop }}>
        <FailureBanner />
      </MockLabProvider>,
    );
    expect(screen.getByText(/미지원 15개 · 부분 지원 0개/u)).toBeTruthy();
    expect(screen.getByText(/헤어 프리셋 'hair\/hime-cut' 미적용: 제작 패키지는 교체형 헤어/u)).toBeTruthy();
    const summary = summarizeCapabilities(ALL_UNAVAILABLE_CAPABILITIES);
    expect(summary.unavailable).toHaveLength(15);
    expect(summary.unavailable[0]?.reasonKo).toContain("로드되지 않았습니다");
    expect(summarizeCapabilities(ALL_AVAILABLE_CAPABILITIES)).toEqual({ unavailable: [], partial: [] });
  });
});
