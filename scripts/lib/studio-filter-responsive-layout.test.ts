import { describe, expect, it, vi } from "vitest";

import {
  studioFilterResponsiveLayoutIssues, waitForStudioFilterLayoutSettled,
  type StudioFilterResponsiveLayout,
} from "./studio-filter-responsive-layout";

function fakePage() {
  const waitFor = vi.fn();
  const evaluate = vi.fn(async () => undefined);
  return { page: { locator: () => ({ waitFor }), evaluate } as never, waitFor, evaluate };
}

const valid: StudioFilterResponsiveLayout = {
  width: 568, height: 320, theme: "dark", bodyHeight: 135,
  panelWithinViewport: true, panelOverflowX: 0,
  actions: ["취소", "적용"].map((label) => ({
    label, disabled: false, withinViewport: true, withinPanel: true, hitTarget: true, blocking: "",
    width: 80, height: 44,
  })),
};

describe("필터 실행 영역 반응형 판정", () => {
  it("모든 실행 영역과 본문이 닿을 수 있어야 통과한다", () => {
    expect(studioFilterResponsiveLayoutIssues(valid)).toEqual([]);
  });
  it("허용되지 않은 적용 버튼이 입력을 받지 않는 것은 결함으로 오인하지 않는다", () => {
    const actions = valid.actions.map((action) => action.label === "적용"
      ? { ...action, disabled: true, hitTarget: false } : action);
    expect(studioFilterResponsiveLayoutIssues({ ...valid, actions })).toEqual([]);
  });
  it("비활성 버튼이라도 화면 밖으로 나가면 실패한다", () => {
    const actions = valid.actions.map((action) => ({ ...action, disabled: true, withinViewport: false }));
    expect(studioFilterResponsiveLayoutIssues({ ...valid, actions })).toHaveLength(2);
  });
  it("활성 버튼의 입력 차단과 패널 내부 잘림을 각각 실패로 기록한다", () => {
    const actions = valid.actions.map((action) => ({ ...action, hitTarget: false, withinPanel: false }));
    expect(studioFilterResponsiveLayoutIssues({ ...valid, actions })).toHaveLength(4);
  });
  it("입력 차단의 원인이 된 요소를 실패 사유에 함께 적는다", () => {
    const actions = valid.actions.map((action) => (action.label === "취소"
      ? { ...action, hitTarget: false, blocking: 'div#overlay[data-testid="sheet"]' }
      : action));
    const [issue] = studioFilterResponsiveLayoutIssues({ ...valid, actions });
    expect(issue).toContain("취소: 다른 요소가 입력을 가로막습니다");
    expect(issue).toContain('div#overlay[data-testid="sheet"]');
  });
  it("본문 소실·가로 넘침·패널 이탈·누락 버튼을 모두 검출한다", () => {
    expect(studioFilterResponsiveLayoutIssues({ ...valid, bodyHeight: 32, panelOverflowX: 8,
      panelWithinViewport: false, actions: [] })).toHaveLength(4);
  });
});

describe("필터 반응형 측정 대기", () => {
  it("패널이 보일 때까지 기다린 뒤 사각형이 멈추는 창에서만 잰다", async () => {
    const { page, waitFor, evaluate } = fakePage();
    await waitForStudioFilterLayoutSettled(page);
    expect(waitFor).toHaveBeenCalledWith({ state: "visible", timeout: 45_000 });
    expect(evaluate).toHaveBeenCalledOnce();
    expect(evaluate.mock.calls[0]?.[1]).toBe('[aria-labelledby="studio-filter-dialog-title"]');
  });
  it("정착 대기는 고정 지연이 아니라 프레임 기반이다", async () => {
    const { page, evaluate } = fakePage();
    await waitForStudioFilterLayoutSettled(page);
    const body = String(evaluate.mock.calls[0]?.[0]);
    expect(body).toContain("requestAnimationFrame");
    expect(body).not.toMatch(/setTimeout|waitForTimeout/u);
  });
});
