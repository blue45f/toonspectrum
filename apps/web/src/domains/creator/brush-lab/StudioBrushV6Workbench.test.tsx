// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioBrushV6Workbench } from "./StudioBrushV6Workbench";
import { createBrushStudioV6Program, type BrushStudioV6Program } from "./brush-studio-v6-engine";

const { preview, save } = vi.hoisted(() => ({ preview: vi.fn(), save: vi.fn() }));

vi.mock("./brush-studio-v6-preview", () => ({
  renderBrushStudioV6Preview: preview,
  attachBrushStudioV6LivePreview: () => ({ clear: vi.fn(), destroy: vi.fn() }),
}));

vi.mock("./brush-studio-v6-product-bridge", () => ({
  saveBrushStudioV6ProductBrush: save,
  brushStudioV6ProductBrushHref: (id: string) => `/studio?materialBrush=${id}`,
}));

vi.mock("./brush-studio-v6-engine", async (importOriginal) => ({
  ...await importOriginal<typeof import("./brush-studio-v6-engine")>(),
  detectBrushStudioV6Capabilities: () => ({
    webgpu: true, wasm: true, webgl2: true, sharedArrayBuffer: true,
    pointerRawUpdate: true, coalescedEvents: true, predictedEvents: true,
    pressure: true, tilt: true, twist: true, hover: true,
    maxTextureDimension2D: 8192, memoryBudgetMb: 1024,
  }),
}));

beforeEach(() => {
  localStorage.clear();
  preview.mockClear();
  save.mockReset();
});
afterEach(cleanup);

const stored = (): BrushStudioV6Program => JSON.parse(localStorage.getItem("toonspectrum.brush-program-v6:test")!);

describe("V6 brush experiments in the workbench", () => {
  it("pins a full reference, applies a controlled sample, restores it and undoes the restore", () => {
    render(<StudioBrushV6Workbench scope="test" />);
    fireEvent.click(screen.getByRole("button", { name: "비교·실험" }));
    fireEvent.click(screen.getByRole("button", { name: "현재를 기준으로 고정" }));
    const initial = stored();
    fireEvent.click(screen.getByRole("button", { name: "낮게 적용" }));
    const candidate = stored();
    expect(candidate.tuning.flow).toBeLessThan(initial.tuning.flow);
    expect(candidate.seed).toBe(initial.seed);
    expect(candidate.slots).toEqual(initial.slots);
    expect(screen.getByText("기준에서 바뀐 설정 1개")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "기준 설정 복원" }));
    expect(stored()).toEqual(initial);
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(stored()).toEqual(candidate);
    expect(preview.mock.calls.some(([, program]) => program.tuning.flow === candidate.tuning.flow)).toBe(true);
  });

  it("groups continuous slider events but keeps the next gesture separately undoable", () => {
    render(<StudioBrushV6Workbench scope="test" />);
    fireEvent.click(screen.getByRole("button", { name: "Material" }));
    const slider = screen.getByRole("slider", { name: /도포 유량/u });
    const initial = stored().tuning.flow;
    fireEvent.change(slider, { target: { value: "0.2" } });
    fireEvent.change(slider, { target: { value: "0.3" } });
    fireEvent.pointerUp(slider);
    fireEvent.change(slider, { target: { value: "0.6" } });
    fireEvent.pointerUp(slider);
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(stored().tuning.flow).toBe(0.3);
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(stored().tuning.flow).toBe(initial);
    fireEvent.click(screen.getByRole("button", { name: "다시 실행" }));
    expect(stored().tuning.flow).toBe(0.3);
  });

  it("only offers physically active experiment fields when changing materials", () => {
    localStorage.setItem("toonspectrum.brush-program-v6:test", JSON.stringify(createBrushStudioV6Program("oil-hair-mixer")));
    render(<StudioBrushV6Workbench scope="test" />);
    fireEvent.click(screen.getByRole("button", { name: "비교·실험" }));
    const select = screen.getByLabelText("비교할 속성");
    expect([...select.querySelectorAll("option")].map((option) => option.value)).toContain("bristleStrands");
    expect([...select.querySelectorAll("option")].map((option) => option.value)).not.toContain("wetness");
    fireEvent.change(select, { target: { value: "bristleStrands" } });
    expect(screen.getByRole("img", { name: "강모 수 낮게 비교 획" })).toBeTruthy();
  });

  it("allows clearing and typing a precise number without resetting the brush mid-entry", () => {
    render(<StudioBrushV6Workbench scope="test" />);
    fireEvent.click(screen.getByRole("button", { name: "Material" }));
    const numeric = screen.getByRole("spinbutton", { name: "도포 유량 직접 입력" });
    const before = stored().tuning.flow;
    fireEvent.change(numeric, { target: { value: "" } });
    fireEvent.change(numeric, { target: { value: "0" } });
    expect(stored().tuning.flow).toBe(before);
    fireEvent.change(numeric, { target: { value: "0.37" } });
    fireEvent.blur(numeric);
    expect(stored().tuning.flow).toBe(0.37);
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(stored().tuning.flow).toBe(before);
  });

  it("preserves native text undo and scopes brush keyboard undo to the workbench", () => {
    render(<StudioBrushV6Workbench scope="test" />);
    const name = screen.getByRole("textbox", { name: "브러시 이름" });
    const initial = stored().name;
    fireEvent.change(name, { target: { value: "새 질감" } });
    fireEvent.keyDown(name, { key: "z", metaKey: true });
    expect(stored().name).toBe("새 질감");
    const undo = screen.getByRole("button", { name: "실행 취소" });
    fireEvent.keyDown(undo, { key: "z", metaKey: true });
    expect(stored().name).toBe(initial);
    fireEvent.keyDown(undo, { key: "z", metaKey: true, shiftKey: true });
    expect(stored().name).toBe("새 질감");
  });

  it("offers the Studio link only after successful library save and retains edits on failure", async () => {
    save.mockRejectedValueOnce(new Error("저장소 연결 실패"));
    render(<StudioBrushV6Workbench scope="test" />);
    const before = stored();
    fireEvent.click(screen.getByRole("button", { name: "스튜디오에 브러시 저장" }));
    expect(await screen.findByText("브러시 저장 실패: 저장소 연결 실패")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "원고에서 사용하기" })).toBeNull();
    expect(stored()).toEqual(before);
    save.mockResolvedValueOnce({ id: "saved-physical-brush", name: "테스트 브러시" });
    fireEvent.click(screen.getByRole("button", { name: "스튜디오에 브러시 저장" }));
    expect((await screen.findByRole("link", { name: "원고에서 사용하기" })).getAttribute("href"))
      .toBe("/studio?materialBrush=saved-physical-brush");
    expect(save).toHaveBeenLastCalledWith(before);
  });
});
