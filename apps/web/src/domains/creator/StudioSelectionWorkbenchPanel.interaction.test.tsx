// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_STUDIO_SAVED_SELECTION_LIBRARY, encodeStudioSavedSelectionLibrary, STUDIO_SAVED_SELECTION_MAX_SERIALIZED_LENGTH, upsertStudioSavedSelection } from "./studio-saved-selections";
import { StudioSelectionWorkbenchPanel } from "./StudioSelectionWorkbenchPanel";
import { emptyPixelSelection, rectSelectionPolygon, type PixelSelection } from "./studio-selection-tools";

const worker = vi.hoisted(() => ({ run: vi.fn(), dispose: vi.fn() }));
vi.mock("./studio-color-range-worker-client", () => ({ createStudioColorRangeWorkerSession: () => worker }));
const selection: PixelSelection = {
  ...emptyPixelSelection(),
  subpaths: [{ mode: "add", points: rectSelectionPolygon({ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 }) }],
};
const result: PixelSelection = { ...selection, featherPx: 4 };
const base = { selection, operation: "replace" as const, imageSource: null, scopeKey: "image", storage: null, displayWidth: 2560, displayHeight: 1280 };
let resolveJob: (value: { execution: "worker"; selection: PixelSelection | null }) => void;

beforeEach(() => {
  worker.run.mockReset();
  worker.dispose.mockReset();
  worker.run.mockImplementation(() => new Promise((resolve) => { resolveJob = resolve; }));
});
afterEach(cleanup);

const apply = () => fireEvent.click(screen.getByRole("button", { name: "선택 영역을 테두리로 바꾸기" }));

describe("selection border workbench interaction", () => {
  it("프로젝트 재열기 한도를 넘는 선택 추가를 거절하고 이전 저장 목록과 현재 선택을 유지한다", () => {
    const largeSelection: PixelSelection = { ...emptyPixelSelection(), subpaths: [{ mode: "add", points:
      Array.from({ length: 40_000 }, (_, index) => ({
        x: 0.5 + 0.4 * Math.cos(index / 40_000 * Math.PI * 2),
        y: 0.5 + 0.4 * Math.sin(index / 40_000 * Math.PI * 2),
      })),
    }] };
    const first = upsertStudioSavedSelection(EMPTY_STUDIO_SAVED_SELECTION_LIBRARY, {
      id: "first", name: "보관", selection: largeSelection, now: 1,
    }).items[0];
    if (!first) throw new Error("유효한 원본 선택 fixture 없음");
    const library = { version: 1 as const, items: Array.from({ length: 8 }, (_, index) => ({
      ...first, id: `saved-${index}`, name: `보관 ${index}`,
    })) };
    const before = encodeStudioSavedSelectionLibrary(library);
    expect(before.length).toBeLessThan(STUDIO_SAVED_SELECTION_MAX_SERIALIZED_LENGTH);
    const save = vi.fn();
    const commit = vi.fn();
    render(<StudioSelectionWorkbenchPanel {...base} selection={largeSelection} savedSelections={library} onSaveSelections={save} onCommitSelection={commit} />);
    fireEvent.click(screen.getByRole("button", { name: "현재 픽셀 선택 저장" }));
    expect(save).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(screen.getByText("저장 선택 데이터가 허용 크기를 초과했습니다. 기존 저장 선택을 정리한 뒤 다시 저장해 주세요.")).toBeTruthy();
    expect(screen.getByText("이 이미지 · 이 작품 · 8개")).toBeTruthy();
    expect(encodeStudioSavedSelectionLibrary(library)).toBe(before);
    fireEvent.click(screen.getByRole("button", { name: "보관 0 선택 불러오기" }));
    expect(commit).toHaveBeenCalledWith(first.selection, "restore-saved");
  });

  it("기기 저장소 없이 작품에 선택을 저장하고 다시 연 패널에서 복원한다", () => {
    const save = vi.fn();
    const commit = vi.fn();
    const view = render(<StudioSelectionWorkbenchPanel {...base} savedSelections={EMPTY_STUDIO_SAVED_SELECTION_LIBRARY} onSaveSelections={save} onCommitSelection={commit} />);
    fireEvent.click(screen.getByRole("button", { name: "현재 픽셀 선택 저장" }));
    expect(save).toHaveBeenCalledOnce();
    const library = save.mock.calls[0]![0];
    view.unmount();
    render(<StudioSelectionWorkbenchPanel {...base} savedSelections={library} onSaveSelections={save} onCommitSelection={commit} />);
    fireEvent.click(screen.getByRole("button", { name: "선택 1 선택 불러오기" }));
    expect(commit).toHaveBeenCalledWith(selection, "restore-saved");
    expect(screen.getByText("이 이미지 · 이 작품 · 1개")).toBeTruthy();
  });

  it("submits displayed width/placement, remains independent from image source, then commits one history intent", async () => {
    const commit = vi.fn();
    render(<StudioSelectionWorkbenchPanel {...base} onCommitSelection={commit} />);
    fireEvent.click(screen.getByRole("button", { name: "선택 테두리 중앙" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "테두리 두께 (px)" }), { target: { value: "12" } });
    apply();
    expect(worker.run).toHaveBeenCalledWith(expect.objectContaining({ kind: "selection-border", width: 2560, height: 1280, widthPx: 12, placement: "center", displayWidth: 2560, displayHeight: 1280 }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect((screen.getByRole("button", { name: "선택 영역을 테두리로 바꾸기" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => resolveJob({ execution: "worker", selection: result }));
    expect(commit).toHaveBeenCalledExactlyOnceWith(result, "border");
    expect(worker.dispose).toHaveBeenCalledOnce();
    expect(screen.getByText(/중앙 테두리 12px를 선택했습니다/)).toBeTruthy();
  });

  it.each(["selection", "source", "geometry", "lock", "scope"])("aborts and rejects a late result when %s changes", async (change) => {
    const commit = vi.fn();
    const view = render(<StudioSelectionWorkbenchPanel {...base} onCommitSelection={commit} />);
    apply();
    const signal = worker.run.mock.calls[0]![1].signal as AbortSignal;
    const next = {
      ...base,
      ...(change === "selection" ? { selection: result } : {}),
      ...(change === "source" ? { imageSource: "changed.png" } : {}),
      ...(change === "geometry" ? { displayWidth: 1280, displayHeight: 640 } : {}),
      ...(change === "lock" ? { busy: true } : {}),
      ...(change === "scope" ? { scopeKey: "another-image" } : {}),
    };
    view.rerender(<StudioSelectionWorkbenchPanel {...next} onCommitSelection={commit} />);
    expect(signal.aborted).toBe(true);
    await act(async () => resolveJob({ execution: "worker", selection: result }));
    expect(commit).not.toHaveBeenCalled();
    expect(worker.dispose).toHaveBeenCalledOnce();
  });

  it("cancels on unmount and preserves the selection if the worker fails", async () => {
    const commit = vi.fn();
    const view = render(<StudioSelectionWorkbenchPanel {...base} onCommitSelection={commit} />);
    apply();
    const signal = worker.run.mock.calls[0]![1].signal as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => resolveJob({ execution: "worker", selection: result }));
    expect(commit).not.toHaveBeenCalled();
    worker.run.mockRejectedValueOnce(new Error("테두리 계산 실패"));
    render(<StudioSelectionWorkbenchPanel {...base} onCommitSelection={commit} />);
    await act(async () => apply());
    expect(commit).not.toHaveBeenCalled();
    expect(screen.getByText("테두리 계산 실패")).toBeTruthy();
  });

  it.each([0, -1, NaN, Infinity])("disables invalid image geometry without crashing the other selection tools (%s)", (width) => {
    render(<StudioSelectionWorkbenchPanel {...base} displayWidth={width} onCommitSelection={vi.fn()} />);
    expect((screen.getByRole("button", { name: "선택 영역을 테두리로 바꾸기" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("이미지의 너비와 높이를 지정한 뒤 테두리를 선택할 수 있습니다.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "현재 픽셀 선택 저장" })).toBeTruthy();
  });
});
