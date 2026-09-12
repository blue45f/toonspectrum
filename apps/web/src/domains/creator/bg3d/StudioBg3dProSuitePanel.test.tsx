// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dProSuiteRuntimeContext, type StudioBg3dProSuiteRuntimeValue } from "./studio-bg3d-pro-suite-runtime-context";
import { composeStudioBg3dLens } from "./studio-bg3d-lens-composition";
import { StudioBg3dProSuitePanel } from "./StudioBg3dProSuitePanelContent";

vi.mock("./StudioBg3dCinematicDirectorPanel", () => ({ StudioBg3dCinematicDirectorPanel: () => <p>컷 편집 연결됨</p> }));
vi.mock("./StudioBg3dMultiPassExporterPanel", () => ({ StudioBg3dMultiPassExporterPanel: () => <p>원고 출력 연결됨</p> }));

function runtime(overrides: Partial<StudioBg3dProSuiteRuntimeValue> = {}): StudioBg3dProSuiteRuntimeValue {
  return {
    disabled: false,
    baseCamera: { position: [0, 1, 8], target: [0, 1, 0], fovDegrees: 50 },
    productionShots: [], onApplyCameraView: vi.fn(), onCaptureCurrentShot: vi.fn(),
    onComposeLens: vi.fn(() => null),
    onApplyProductionShot: vi.fn(), onMoveProductionShot: vi.fn(), onRemoveProductionShot: vi.fn(),
    onUseCurrentFrameAsAiReference: undefined, aiReferenceBusy: false, aiReferenceDisabled: false,
    ...overrides,
  };
}
function workbench(value: StudioBg3dProSuiteRuntimeValue, disabled = false) {
  return <StudioBg3dProSuiteRuntimeContext.Provider value={value}><StudioBg3dProSuitePanel disabled={disabled} /></StudioBg3dProSuiteRuntimeContext.Provider>;
}

afterEach(cleanup);
describe("production workbench scene integration", () => {
  it("applies a camera command and records the selected lens from scene state, including undo", () => {
    const value = runtime();
    const view = render(workbench(value));
    fireEvent.click(screen.getByRole("button", { name: /인물 중심 35°/ }));
    expect(value.onComposeLens).toHaveBeenCalledExactlyOnceWith(35, true);
    expect(value.onApplyCameraView).not.toHaveBeenCalled();
    const next = composeStudioBg3dLens(value.baseCamera, 35, true)!;
    // A click is only a command; selection follows the authoritative scene commit.
    expect(screen.getByRole("button", { name: /기본 구도 50°/ }).getAttribute("aria-pressed")).toBe("true");
    view.rerender(workbench({ ...value, baseCamera: next }));
    expect(screen.getByRole("button", { name: /인물 중심 35°/ }).getAttribute("aria-pressed")).toBe("true");
    view.rerender(workbench(value));
    expect(screen.getByRole("button", { name: /기본 구도 50°/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "이 구도를 컷으로 저장" }));
    expect(value.onCaptureCurrentShot).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])("honors parent and runtime capture locks (parent: %s)", (parent) => {
    const value = runtime({ disabled: !parent });
    render(workbench(value, parent));
    const lens = screen.getByRole("button", { name: /인물 중심 35°/ }) as HTMLButtonElement;
    expect(lens.disabled).toBe(true);
    fireEvent.click(lens);
    fireEvent.click(screen.getByRole("button", { name: "이 구도를 컷으로 저장" }));
    expect(value.onApplyCameraView).not.toHaveBeenCalled();
    expect(value.onComposeLens).not.toHaveBeenCalled();
    expect(value.onCaptureCurrentShot).not.toHaveBeenCalled();
  });
  it("does not offer successful fake scene actions without a scene", () => {
    render(<StudioBg3dProSuitePanel />);
    expect(screen.getByRole("status").textContent).toContain("3D 장면을 연 뒤");
    expect((screen.getByRole("button", { name: "이 구도를 컷으로 저장" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/Ground Lock OK|전체 \(20\)|플라스크/)).toBeNull();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["구도", "컷 디렉터", "원고 출력"]);
  });
  it("exposes arrow-key tab navigation and preserves the camera panel settings", async () => {
    render(workbench(runtime()));
    fireEvent.click(screen.getByRole("checkbox", { name: "피사체 크기를 유지하며 거리 조절" }));
    const lensTab = screen.getByRole("tab", { name: "구도" });
    fireEvent.keyDown(lensTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "컷 디렉터" }).getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByText("컷 편집 연결됨")).toBeDefined();
    fireEvent.click(lensTab);
    expect((screen.getByRole("checkbox", { name: "피사체 크기를 유지하며 거리 조절" }) as HTMLInputElement).checked).toBe(false);
  });
  it("explains why lens edits are unavailable for orthographic scenes", () => {
    const value = runtime();
    render(workbench({ ...value, baseCamera: { ...value.baseCamera, projection: "orthographic" } }));
    expect(screen.getByText(/평행 투영에서는 화각을 바꾸지 않습니다/)).toBeDefined();
    expect((screen.getByRole("button", { name: /인물 중심 35°/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("shows a live composition rejection and lets the user retry without distance adjustment", () => {
    const compose = vi.fn<(fov: number, preserve: boolean) => string | null>()
      .mockReturnValueOnce("현재 거리에서는 피사체 크기를 유지할 수 없습니다.")
      .mockReturnValueOnce(null);
    render(workbench(runtime({ onComposeLens: compose })));
    fireEvent.click(screen.getByRole("button", { name: /인물 중심 35°/ }));
    expect(screen.getByRole("alert").textContent).toContain("현재 거리");
    fireEvent.click(screen.getByRole("checkbox", { name: "피사체 크기를 유지하며 거리 조절" }));
    fireEvent.click(screen.getByRole("button", { name: /인물 중심 35°/ }));
    expect(compose.mock.calls).toEqual([[35, true], [35, false]]);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
