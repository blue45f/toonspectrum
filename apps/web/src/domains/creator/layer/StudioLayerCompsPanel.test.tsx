// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { captureLayerComp } from "./studio-layer-comps";
import { StudioLayerCompsPanel } from "./StudioLayerCompsPanel";

describe("StudioLayerCompsPanel", () => {
  afterEach(() => {
    cleanup();
  });

  const sampleLayers = [
    { id: "layer-lineart", visible: true, opacity: 1 },
    { id: "layer-colors", visible: true, opacity: 0.9 },
    { id: "layer-text", visible: false, opacity: 1 },
  ];

  it("renders empty state when no comps exist", () => {
    render(
      <StudioLayerCompsPanel
        layers={sampleLayers}
        comps={[]}
        onApplyComp={vi.fn()}
        onCompsChange={vi.fn()}
      />,
    );

    expect(screen.getByText("저장된 레이어 콤프가 없습니다.")).toBeDefined();
  });

  it("allows capturing a new layer comp", () => {
    const onCompsChange = vi.fn();
    render(
      <StudioLayerCompsPanel
        layers={sampleLayers}
        comps={[]}
        onApplyComp={vi.fn()}
        onCompsChange={onCompsChange}
      />,
    );

    fireEvent.click(screen.getByText("새 콤프"));
    const input = screen.getByPlaceholderText(/콤프 이름/i);
    fireEvent.change(input, { target: { value: "선화전용" } });
    fireEvent.click(screen.getByText("저장"));

    expect(onCompsChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: "선화전용",
        }),
      ]),
    );
  });

  it("calls onApplyComp when applying a comp", () => {
    const onApplyComp = vi.fn();
    const comp1 = captureLayerComp("완성본", sampleLayers, "comp-1");

    render(
      <StudioLayerCompsPanel
        layers={sampleLayers}
        comps={[comp1]}
        activeCompId={null}
        onApplyComp={onApplyComp}
        onCompsChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("적용"));
    expect(onApplyComp).toHaveBeenCalledWith(comp1);
  });

  it("triggers batch export plan callback", () => {
    const onBatchExportPlan = vi.fn();
    const comp1 = captureLayerComp("완성본", sampleLayers, "comp-1");

    render(
      <StudioLayerCompsPanel
        layers={sampleLayers}
        comps={[comp1]}
        onApplyComp={vi.fn()}
        onCompsChange={vi.fn()}
        onBatchExportPlan={onBatchExportPlan}
      />,
    );

    fireEvent.click(screen.getByText("콤프 일괄 내보내기"));
    expect(onBatchExportPlan).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          compId: "comp-1",
          fileName: "webtoon_cut_완성본.png",
        }),
      ]),
    );
  });

  it("captures and updates folder visibility with each layer's blend mode", () => {
    const onCompsChange = vi.fn();
    const layers = [{ id: "ink", groupId: "folder", visible: true, opacity: 0.7, blendMode: "multiply" }];
    const groups = [{ id: "folder", hidden: true }];
    const view = render(<StudioLayerCompsPanel layers={layers} groups={groups} comps={[]}
      onApplyComp={vi.fn()} onCompsChange={onCompsChange} />);
    fireEvent.click(screen.getByText("새 콤프"));
    fireEvent.change(screen.getByRole("textbox", { name: "새 콤프 이름" }), { target: { value: "그룹 상태" } });
    fireEvent.click(screen.getByText("저장"));
    const saved = onCompsChange.mock.calls[0][0][0];
    expect(saved.layerStates.ink).toMatchObject({ groupId: "folder", opacity: 0.7, blendMode: "multiply" });
    expect(saved.groupStates.folder).toEqual({ groupId: "folder", visible: false });
    view.rerender(<StudioLayerCompsPanel layers={[{ ...layers[0], blendMode: "source-over" }]}
      groups={[{ id: "folder", hidden: false }]} comps={[saved]}
      onApplyComp={vi.fn()} onCompsChange={onCompsChange} />);
    expect(screen.getByText("표시 레이어 0 / 1개")).toBeDefined();
    fireEvent.click(screen.getByTitle("현재 레이어 상태로 업데이트"));
    const updated = onCompsChange.mock.calls[1][0][0];
    expect(updated.layerStates.ink.blendMode).toBe("source-over");
    expect(updated.groupStates.folder.visible).toBe(true);
  });

  it("prevents another comp action while its authoritative lease is pending", async () => {
    let finish!: (success: boolean) => void;
    const onApplyComp = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const comp = captureLayerComp("완성본", sampleLayers, "comp-1");
    render(<StudioLayerCompsPanel layers={sampleLayers} comps={[comp]} onApplyComp={onApplyComp} />);
    fireEvent.click(screen.getByText("적용"));
    expect((screen.getByRole("group", { name: "레이어 콤프" }) as HTMLFieldSetElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("적용"));
    expect(onApplyComp).toHaveBeenCalledTimes(1);
    await act(async () => { finish(true); });
    expect((screen.getByRole("group", { name: "레이어 콤프" }) as HTMLFieldSetElement).disabled).toBe(false);
  });

  it("cancels creating a comp with Escape without closing the surrounding inspector", () => {
    const onCompsChange = vi.fn();
    const inspectorShortcut = vi.fn();
    render(<div role="presentation" onKeyDown={inspectorShortcut}>
      <StudioLayerCompsPanel layers={sampleLayers} comps={[]}
        onApplyComp={vi.fn()} onCompsChange={onCompsChange} />
    </div>);
    fireEvent.click(screen.getByRole("button", { name: "새 콤프" }));
    const input = screen.getByRole("textbox", { name: "새 콤프 이름" });
    fireEvent.change(input, { target: { value: "취소할 초안" } });
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    fireEvent(input, escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(inspectorShortcut).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "새 콤프 이름" })).toBeNull();
    expect(screen.getByRole("group", { name: "레이어 콤프" })).toBeTruthy();
    expect(onCompsChange).not.toHaveBeenCalled();
    expect(screen.getByText("저장된 레이어 콤프가 없습니다.")).toBeTruthy();
  });

  it("cancels renaming with Escape and restores the saved name when editing again", () => {
    const onCompsChange = vi.fn();
    const inspectorShortcut = vi.fn();
    const comp = captureLayerComp("저장된 이름", sampleLayers, "comp-1");
    render(<div role="presentation" onKeyDown={inspectorShortcut}>
      <StudioLayerCompsPanel layers={sampleLayers} comps={[comp]}
        onApplyComp={vi.fn()} onCompsChange={onCompsChange} />
    </div>);
    fireEvent.click(screen.getByTitle("이름 수정"));
    const input = screen.getByRole("textbox", { name: "저장된 이름 이름 수정" });
    fireEvent.change(input, { target: { value: "저장하지 않을 이름" } });
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    fireEvent(input, escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(inspectorShortcut).not.toHaveBeenCalled();
    expect(onCompsChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("저장된 이름")).toBeTruthy();
    fireEvent.click(screen.getByTitle("이름 수정"));
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("저장된 이름");
  });

  it("applies the saved comp when its name is clicked", async () => {
    const comp = captureLayerComp("완성본", sampleLayers, "comp-1");
    const onApplyComp = vi.fn(async () => true);
    render(<StudioLayerCompsPanel layers={sampleLayers} comps={[comp]} onApplyComp={onApplyComp} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^완성본 표시 레이어/u })); });
    expect(onApplyComp).toHaveBeenCalledExactlyOnceWith(comp);
    expect((screen.getByRole("group", { name: "레이어 콤프" }) as HTMLFieldSetElement).disabled).toBe(false);
  });

  it("announces a rejected apply, re-enables controls, and clears the error when retrying", async () => {
    let reject!: (reason: Error) => void;
    const onApplyComp = vi.fn<() => Promise<boolean>>()
      .mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }))
      .mockResolvedValueOnce(true);
    const comp = captureLayerComp("완성본", sampleLayers, "comp-1");
    render(<StudioLayerCompsPanel layers={sampleLayers} comps={[comp]} onApplyComp={onApplyComp} />);
    const panel = screen.getByRole("group", { name: "레이어 콤프" }) as HTMLFieldSetElement;
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(panel.disabled).toBe(true);
    await act(async () => { reject(new Error("lease request failed")); });
    expect(screen.getByRole("alert").textContent).toBe("콤프를 적용하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    expect(panel.disabled).toBe(false);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "적용" })); });
    expect(onApplyComp).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(panel.disabled).toBe(false);
  });

  it("does not save a 65th comp if the page reaches its limit while its name is being typed", () => {
    const comps = Array.from({ length: 63 }, (_, index) =>
      captureLayerComp(`저장된 콤프 ${index + 1}`, sampleLayers, `comp-${index}`));
    const onCompsChange = vi.fn();
    const onApplyComp = vi.fn();
    const view = render(<StudioLayerCompsPanel layers={sampleLayers} comps={comps}
      onApplyComp={onApplyComp} onCompsChange={onCompsChange} />);
    fireEvent.click(screen.getByRole("button", { name: "새 콤프" }));
    fireEvent.change(screen.getByRole("textbox", { name: "새 콤프 이름" }), { target: { value: "입력 중인 콤프" } });
    view.rerender(<StudioLayerCompsPanel layers={sampleLayers}
      comps={[...comps, captureLayerComp("다른 곳에서 저장한 콤프", sampleLayers, "last-comp")]}
      onApplyComp={onApplyComp} onCompsChange={onCompsChange} />);
    expect((screen.getByRole("button", { name: "새 콤프" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTitle("페이지마다 콤프를 64개까지 저장할 수 있습니다")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "새 콤프 이름" }), { key: "Enter" });
    expect(onCompsChange).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "새 콤프 이름" })).toBeTruthy();
  });

  it("delegates editor capture/update to the live document and retains the name after rejection", () => {
    const onCaptureComp = vi.fn(() => false);
    const onCompsChange = vi.fn();
    const comp = captureLayerComp("기존", sampleLayers, "existing");
    render(<StudioLayerCompsPanel layers={[]} comps={[comp]} onApplyComp={vi.fn()}
      onCaptureComp={onCaptureComp} onCompsChange={onCompsChange} />);
    fireEvent.click(screen.getByRole("button", { name: "새 콤프" }));
    fireEvent.change(screen.getByRole("textbox", { name: "새 콤프 이름" }), { target: { value: "즉시 캡처" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(onCaptureComp).toHaveBeenCalledWith("즉시 캡처");
    expect((screen.getByRole("textbox", { name: "새 콤프 이름" }) as HTMLInputElement).value).toBe("즉시 캡처");
    expect(onCompsChange).not.toHaveBeenCalled();
    onCaptureComp.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.queryByRole("textbox", { name: "새 콤프 이름" })).toBeNull();
    fireEvent.click(screen.getByTitle("현재 레이어 상태로 업데이트"));
    expect(onCaptureComp).toHaveBeenLastCalledWith("기존", "existing");
    expect(onCompsChange).not.toHaveBeenCalled();
  });

  it("retains a rename draft when the editor rejects its metadata commit", () => {
    const comp = captureLayerComp("기존", sampleLayers, "existing");
    const onCompsChange = vi.fn(() => false);
    render(<StudioLayerCompsPanel layers={sampleLayers} comps={[comp]} onApplyComp={vi.fn()} onCompsChange={onCompsChange} />);
    fireEvent.click(screen.getByTitle("이름 수정"));
    fireEvent.change(screen.getByRole("textbox", { name: "기존 이름 수정" }), { target: { value: "유지할 이름" } });
    fireEvent.click(screen.getByRole("button", { name: "콤프 이름 저장" }));
    expect((screen.getByRole("textbox", { name: "기존 이름 수정" }) as HTMLInputElement).value).toBe("유지할 이름");
    onCompsChange.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "콤프 이름 저장" }));
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("supports standalone capture, Enter rename, and deletion without a document callback", () => {
    render(<StudioLayerCompsPanel layers={sampleLayers} onApplyComp={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "새 콤프" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "새 콤프 이름" }), { key: "Enter" });
    expect(screen.getByText("콤프 1")).toBeTruthy();
    fireEvent.click(screen.getByTitle("이름 수정"));
    const input = screen.getByRole("textbox", { name: "콤프 1 이름 수정" });
    fireEvent.change(input, { target: { value: "  키보드로 저장한 이름  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("키보드로 저장한 이름")).toBeTruthy();
    fireEvent.click(screen.getByTitle("콤프 삭제"));
    expect(screen.queryByText("키보드로 저장한 이름")).toBeNull();
    expect(screen.getByText("저장된 레이어 콤프가 없습니다.")).toBeTruthy();
  });

  it("keeps a comp and its rename draft when deletion is rejected, then allows a confirmed retry", () => {
    const comp = captureLayerComp("기존", sampleLayers, "existing");
    const onCompsChange = vi.fn(() => false);
    const onApplyComp = vi.fn();
    const view = render(<StudioLayerCompsPanel layers={sampleLayers} comps={[comp]}
      onApplyComp={onApplyComp} onCompsChange={onCompsChange} />);
    fireEvent.click(screen.getByTitle("이름 수정"));
    fireEvent.change(screen.getByRole("textbox", { name: "기존 이름 수정" }), { target: { value: "삭제 보류 중인 초안" } });
    fireEvent.click(screen.getByTitle("콤프 삭제"));
    expect(onCompsChange).toHaveBeenCalledExactlyOnceWith([]);
    expect((screen.getByRole("textbox", { name: "기존 이름 수정" }) as HTMLInputElement).value).toBe("삭제 보류 중인 초안");
    expect(screen.queryByText("저장된 레이어 콤프가 없습니다.")).toBeNull();
    onCompsChange.mockReturnValue(true);
    fireEvent.click(screen.getByTitle("콤프 삭제"));
    expect(onCompsChange).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("textbox")).toBeNull();
    view.rerender(<StudioLayerCompsPanel layers={sampleLayers} comps={[]}
      onApplyComp={onApplyComp} onCompsChange={onCompsChange} />);
    expect(screen.getByText("저장된 레이어 콤프가 없습니다.")).toBeTruthy();
  });
});
