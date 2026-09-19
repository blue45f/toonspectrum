// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBrushStudioV6MaterialReceipt } from "../brush-lab/brush-studio-v6-material-receipt";
import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6MaterialStroke, normalizeBrushStudioV6MaterialConfig } from "../brush-lab/brush-studio-v6-material-engine";
import { StudioBrushEngineProgramControls } from "./StudioBrushEngineProgramControls";
import type { StudioBrushEngineProgramSet } from "./studio-brush-engine-program-set";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-router-dom")>(),
  useNavigate: () => navigate,
}));

const editorUuid = "00000000-0000-4000-8000-000000000001";
const editorId = `material-${editorUuid}`;
beforeEach(() => { vi.spyOn(crypto, "randomUUID").mockReturnValue(editorUuid); });

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); navigate.mockReset(); });

describe("material brush controls inside Studio", () => {
  it("disables the secondary pigment for a primary-only material and enables it for bristle mixing", () => {
    const material = normalizeBrushStudioV6MaterialConfig(createBrushStudioV6Program("clean-ink"))!;
    const { rerender } = render(<StudioBrushEngineProgramControls brushId="brush" programSet={{ version: 1, material }} onChange={vi.fn()} />);
    const inactive = screen.getByLabelText("혼합·문양 색") as HTMLInputElement;
    expect(inactive.disabled).toBe(true);
    expect(inactive.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("현재 재료 조합에서 사용하지 않음")).toBeTruthy();
    const bristle = normalizeBrushStudioV6MaterialConfig(createBrushStudioV6Program("oil-hair-mixer"))!;
    const onChange = vi.fn();
    rerender(<StudioBrushEngineProgramControls brushId="brush" programSet={{ version: 1, material: bristle }} onChange={onChange} />);
    const active = screen.getByLabelText("혼합·문양 색") as HTMLInputElement;
    expect(active.disabled).toBe(false);
    fireEvent.change(active, { target: { value: "#113355" } });
    expect(onChange.mock.calls[0]?.[0].material.tuning.secondaryColor).toBe("#113355");
  });

  it("edits real contact parameters while retaining the material snapshot and suppressing legacy no-op switches", () => {
    const material = normalizeBrushStudioV6MaterialConfig(createBrushStudioV6Program("oil-hair-mixer"))!;
    const onChange = vi.fn();
    render(<StudioBrushEngineProgramControls brushId="oil" programSet={{ version: 1, material }} onChange={onChange} />);
    expect(screen.queryByText("원하는 질감으로 고르기")).toBeNull();
    expect(screen.queryByText("전문 엔진 그래프")).toBeNull();
    expect(screen.queryByRole("slider", { name: /수분/u })).toBeNull();
    fireEvent.change(screen.getByRole("slider", { name: /안료 저장량/u }), { target: { value: "0.1" } });
    const next = onChange.mock.calls[0]![0] as StudioBrushEngineProgramSet;
    expect(next.material?.tuning.reservoir).toBe(0.1);
    expect(next.material?.seed).toBe(material.seed);
    expect(next.material?.slots).toEqual(material.slots);
    expect(next.material?.input).toEqual(material.input);
    const point = { x: 30, y: 20, pressure: 0.8 };
    expect(createBrushStudioV6MaterialStroke(next.material!).push(point))
      .not.toEqual(createBrushStudioV6MaterialStroke(material).push(point));
    fireEvent.click(screen.getByRole("button", { name: "기본 브러시로 전환" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it.each([false, true])("hands the exact material to the editor before navigating, modifier=%s", (metaKey) => {
    const material = createBrushStudioV6MaterialReceipt(createBrushStudioV6Program("dendritic-copper"));
    render(<StudioBrushEngineProgramControls brushId="brush" programSet={{ version: 1, material }} onChange={vi.fn()} />);
    const action = screen.getByRole("button", { name: "브러시 편집기에서 비교·실험" });
    expect(screen.queryByRole("link", { name: "브러시 편집기에서 비교·실험" })).toBeNull();
    const storageKey = `toonspectrum.brush-program-v6:${encodeURIComponent(`brush:${editorId}`)}`;
    navigate.mockImplementation(() => {
      expect(JSON.parse(localStorage.getItem(storageKey)!).tuning).toEqual(material.tuning);
    });
    fireEvent.contextMenu(action);
    expect(navigate).not.toHaveBeenCalled();
    expect(localStorage.getItem(storageKey)).toBeNull();
    fireEvent.click(action, { metaKey });
    const program = JSON.parse(localStorage.getItem(`toonspectrum.brush-program-v6:${encodeURIComponent(`brush:${editorId}`)}`)!);
    expect(program.tuning).toEqual(material.tuning);
    expect(program.input).toEqual(material.input);
    expect(program.slots).toEqual(material.slots);
    expect(program.seed).toBe(material.seed);
    expect(navigate).toHaveBeenCalledWith(`/studio/assets/brushes/${editorId}/edit`);
  });

  it("stays in Studio with an explicit error when the exact editor draft cannot be stored", () => {
    const material = createBrushStudioV6MaterialReceipt(createBrushStudioV6Program("oil-hair-mixer"));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    render(<StudioBrushEngineProgramControls brushId="brush" programSet={{ version: 1, material }} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "브러시 편집기에서 비교·실험" }));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("설정을 전달하지 못했습니다");
  });

  it("transfers current main-tool size, opacity and color without mutating the material program", () => {
    const material = createBrushStudioV6MaterialReceipt(createBrushStudioV6Program("oil-hair-mixer"));
    const original = structuredClone(material);
    const onChange = vi.fn();
    const programSet = { version: 1 as const, material };
    const { rerender } = render(<StudioBrushEngineProgramControls brushId="brush" programSet={programSet}
      currentSnapshot={{ strokeWidth: 54, brushOpacity: 0.95, color: "#112233" }} onChange={onChange} />);
    rerender(<StudioBrushEngineProgramControls brushId="brush" programSet={programSet}
      currentSnapshot={{ strokeWidth: 150, brushOpacity: 0.01, color: "#34ab67" }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "브러시 편집기에서 비교·실험" }));
    const storageKey = `toonspectrum.brush-program-v6:${encodeURIComponent(`brush:${editorId}`)}`;
    const draft = JSON.parse(localStorage.getItem(storageKey)!);
    expect(draft.tuning).toEqual({ ...material.tuning, size: 150, opacity: 0.01, primaryColor: "#34ab67" });
    expect(draft.slots).toEqual(material.slots);
    expect(draft.input).toEqual(material.input);
    expect(material).toEqual(original);
    expect(onChange).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(`/studio/assets/brushes/${editorId}/edit`);
  });
  it("switches topology, edits meaningful physics and combines material/neon without losing the receipt", () => {
    const original = normalizeBrushStudioV6MaterialConfig(createBrushStudioV6Program("oil-hair-mixer"))!;
    const snapshot = structuredClone(original), onChange = vi.fn();
    const view = render(<StudioBrushEngineProgramControls brushId="brush" programSet={{ version: 1, material: original }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("획 구조 엔진"), { target: { value: "carrier-cpu-ballistic-spray-v1" } });
    let next = onChange.mock.lastCall![0] as StudioBrushEngineProgramSet;
    expect(next.material!.slots.physics).toEqual([]);
    expect(next.material!.seed).toBe(original.seed); expect(next.material!.input).toEqual(original.input);
    view.rerender(<StudioBrushEngineProgramControls brushId="brush" programSet={next} onChange={onChange} />);
    fireEvent.change(screen.getByRole("slider", { name: "중력 방향·강도" }), { target: { value: "-0.75" } });
    next = onChange.mock.lastCall![0]; expect(next.material!.tuning.gravity).toBe(-0.75);
    view.rerender(<StudioBrushEngineProgramControls brushId="brush" programSet={next} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("도포 재료"), { target: { value: "deposit-wet" } });
    next = onChange.mock.lastCall![0]; expect(next.material!.slots.deposition).toBe("deposit-wet");
    view.rerender(<StudioBrushEngineProgramControls brushId="brush" programSet={next} onChange={onChange} />);
    expect(screen.getByRole("slider", { name: "번짐" })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "발광 마감 결합" }));
    expect(onChange.mock.lastCall![0].material.slots.finish).toEqual(["finish-neon"]);
    expect(original).toEqual(snapshot);
  });

  it("refuses an unversioned legacy material rather than enabling newer contact adapters", () => {
    const material = normalizeBrushStudioV6MaterialConfig(createBrushStudioV6Program("oil-hair-mixer"))!;
    render(<StudioBrushEngineProgramControls brushId="brush" programSet={{ version: 1, material }} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "브러시 편집기에서 비교·실험" }));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("자동 변환하지 않습니다");
    expect(localStorage.length).toBe(0);
  });

  it("does not overwrite another brush draft that has the same random seed", () => {
    const material = createBrushStudioV6MaterialReceipt(createBrushStudioV6Program("oil-hair-mixer"));
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(editorUuid)
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000002");
    render(<StudioBrushEngineProgramControls brushId="brush" programSet={{ version: 1, material }} onChange={vi.fn()} />);
    const button = screen.getByRole("button", { name: "브러시 편집기에서 비교·실험" });
    fireEvent.click(button);
    const key = `toonspectrum.brush-program-v6:${encodeURIComponent(`brush:${editorId}`)}`;
    const first = localStorage.getItem(key);
    fireEvent.click(button);
    expect(navigate.mock.calls[0]![0]).not.toBe(navigate.mock.calls[1]![0]);
    expect(localStorage.getItem(key)).toBe(first);
    expect(localStorage.length).toBe(2);
  });

});
