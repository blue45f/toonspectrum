// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioMarketplaceModelImportMount } from "./StudioMarketplaceModelImportMount";

const state = vi.hoisted(() => ({ failed: true, module: null, retry: vi.fn() }));
const requested = vi.hoisted(() => vi.fn());
vi.mock("../useStudioOnDemandModule", () => ({
  useStudioOnDemandModule: (_load: unknown, open: boolean) => { requested(open); return state; },
}));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); state.failed = true; });
const props = { modelId: "selected-model", scopeKey: "page-1", disabled: false, onImport: vi.fn(async () => true) };

describe("optional model catalogue failure isolation", () => {
  it("does not replace the canvas or reset an unsaved field when import fails or retries", () => {
    const view = render(<><canvas aria-label="작업 캔버스" /><input aria-label="저장 전 이름" defaultValue="그림" />
      <StudioMarketplaceModelImportMount {...props} /></>);
    const canvas = screen.getByLabelText("작업 캔버스");
    const input = screen.getByRole("textbox", { name: "저장 전 이름" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "아직 저장하지 않은 그림" } });
    expect(screen.getByRole("alert").textContent).toContain("현재 장면은 유지됩니다");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(state.retry).toHaveBeenCalledTimes(1);
    state.failed = false;
    view.rerender(<><canvas aria-label="작업 캔버스" /><input aria-label="저장 전 이름" defaultValue="그림" />
      <StudioMarketplaceModelImportMount {...props} /></>);
    expect(screen.getByLabelText("작업 캔버스")).toBe(canvas);
    expect(input.value).toBe("아직 저장하지 않은 그림");
    expect(screen.getByRole("status").textContent).toContain("불러오는 중");
    expect(props.onImport).not.toHaveBeenCalled();
  });
  it("does not request the catalogue or show a stale failure after selection is cleared", () => {
    const view = render(<StudioMarketplaceModelImportMount {...props} />);
    view.rerender(<StudioMarketplaceModelImportMount {...props} modelId={null} />);
    expect(requested).toHaveBeenLastCalledWith(false);
    expect(view.container.textContent).toBe("");
  });
});
