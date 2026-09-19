// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { planStudioNativeBrushDocument } from "./studio-native-brush-document-contract";
import Inspector from "./StudioNativeBrushDocumentInspector";

import type { DrawEl } from "../studio-element-model";
import type { StudioNativeBrushDocumentResult } from "./studio-native-brush-document-contract";
import type { StudioNativeBrushDocumentInspectorProps } from "./StudioNativeBrushDocumentInspector";

const renderProduct = vi.hoisted(() => vi.fn());
const sessionInstances = vi.hoisted(() => [] as Array<{ dispose: ReturnType<typeof vi.fn> }>);
vi.mock("./studio-native-brush-document-session", () => ({ StudioNativeBrushDocumentSession: class {
  readonly dispose = vi.fn();
  constructor() { sessionInstances.push(this); }
  render = renderProduct;
} }));
vi.mock("./studio-native-brush-document-product", () => ({ renderStudioNativeBrushDocument: renderProduct }));
const source: DrawEl = { id: "s", type: "draw", kind: "freehand", points: [100, 100, 120, 110],
  pressures: [0.5, 0.8], sampleTimeOffsets: [0, 8], strokeWidth: 12, stroke: "#123456" };
const plan = planStudioNativeBrushDocument(source, { engine: "libmypaint", style: "ink", documentWidth: 720, documentHeight: 1000 });
const result: StudioNativeBrushDocumentResult = { sourceElementId: source.id, sourceRevision: plan.sourceRevision,
  engine: "libmypaint", style: "ink", seed: 7, bounds: plan.bounds, src: "data:image/png;base64,iVBORw0KGgo=", pngHash: "a".repeat(64) };
function props(overrides: Partial<StudioNativeBrushDocumentInspectorProps> = {}): StudioNativeBrushDocumentInspectorProps {
  return { selected: source, documentWidth: 720, documentHeight: 1000, pageId: "p", masterEditMode: false,
    disabled: false, onPrepare: () => () => true, ...overrides };
}
function open() {
  const details = screen.getByText("선택 획 · 네이티브 엔진 변환").closest("details")!;
  details.open = true; fireEvent(details, new Event("toggle"));
}
afterEach(() => { cleanup(); vi.clearAllMocks(); sessionInstances.length = 0; });

describe("native document inspector", () => {
  it("does not create an engine before explicit conversion", () => {
    render(<Inspector {...props()} />); open();
    expect(renderProduct).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "선택 획 변환" }).hasAttribute("disabled")).toBe(false);
  });
  it("shows only ink when switching from a natural-media style to a vector renderer", () => {
    render(<Inspector {...props()} />); open();
    const style = screen.getByRole("combobox", { name: "문서 변환 재질" }) as HTMLSelectElement;
    fireEvent.change(style, { target: { value: "wash" } });
    expect(style.value).toBe("wash");
    fireEvent.change(screen.getByRole("combobox", { name: "문서 변환 엔진" }), { target: { value: "canvaskit" } });
    expect(style.value).toBe("ink"); expect(style.disabled).toBe(true);
    expect(screen.getByText(/워시·초크는 libmypaint/)).toBeTruthy();
    expect(renderProduct).not.toHaveBeenCalled();
  });
  it("captures the document commit permission before calling the Worker", async () => {
    const calls: string[] = [], commit = vi.fn(() => { calls.push("commit"); return true; });
    renderProduct.mockImplementation(async () => { calls.push("worker"); return result; });
    const onPrepare = vi.fn(() => { calls.push("prepare"); return commit; });
    render(<Inspector {...props({ onPrepare })} />); open();
    fireEvent.click(screen.getByRole("button", { name: "선택 획 변환" }));
    await waitFor(() => expect(commit).toHaveBeenCalledWith(result));
    expect(calls).toEqual(["prepare", "worker", "commit"]);
    expect(onPrepare).toHaveBeenCalledWith({ pageId: "p", masterEditMode: false, sourceElementId: "s", sourceRevision: plan.sourceRevision });
  });
  it("never calls the Worker when the document authority denies preparation", () => {
    render(<Inspector {...props({ onPrepare: () => null })} />); open();
    fireEvent.click(screen.getByRole("button", { name: "선택 획 변환" }));
    expect(renderProduct).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("시작할 수 없습니다");
  });
  it.each(["cancel", "unmount", "source", "page", "lock"])("aborts on %s and ignores a late result", async (change) => {
    let resolve!: (value: StudioNativeBrushDocumentResult) => void;
    let signal!: AbortSignal;
    renderProduct.mockImplementation((_plan, current: AbortSignal) => {
      signal = current; return new Promise((done) => { resolve = done; });
    });
    const commit = vi.fn(() => true), initial = props({ onPrepare: () => commit });
    const view = render(<Inspector {...initial} />); open();
    fireEvent.click(screen.getByRole("button", { name: "선택 획 변환" }));
    expect(signal.aborted).toBe(false);
    if (change === "cancel") fireEvent.click(screen.getByRole("button", { name: "변환 취소" }));
    if (change === "unmount") view.unmount();
    if (change === "source") view.rerender(<Inspector {...initial} selected={{ ...source, strokeWidth: 14 }} />);
    if (change === "page") view.rerender(<Inspector {...initial} pageId="other" />);
    if (change === "lock") view.rerender(<Inspector {...initial} disabled />);
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve(result); });
    expect(commit).not.toHaveBeenCalled();
  });
  it("keeps the original and reports a rejected final transaction", async () => {
    renderProduct.mockResolvedValue(result);
    render(<Inspector {...props({ onPrepare: () => () => false })} />); open();
    fireEvent.click(screen.getByRole("button", { name: "선택 획 변환" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("결과를 적용하지 않았습니다"));
  });
  it("shows missing-sensor assumptions before the artist chooses conversion", () => {
    render(<Inspector {...props({ selected: { ...source, pressures: undefined, sampleTimeOffsets: undefined } })} />); open();
    expect(screen.getByText(/일정한 필압 0.5/)).toBeTruthy();
    expect(screen.getByText(/입력점마다 8ms/)).toBeTruthy();
  });
});

describe("native preview and scoped engine lifecycle", () => {
  it("previews without mutation and applies the exact checked output once", async () => {
    renderProduct.mockResolvedValue(result);
    const commit = vi.fn(() => true);
    render(<Inspector {...props({ onPrepare: () => commit })} />); open();
    fireEvent.click(screen.getByRole("button", { name: "결과 미리보기" }));
    await waitFor(() => expect(screen.getByRole("img").getAttribute("src")).toBe(result.src));
    expect(commit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "미리보기 적용" }));
    expect(commit).toHaveBeenCalledTimes(1); expect(commit).toHaveBeenCalledWith(result);
    expect(screen.queryByRole("button", { name: "미리보기 적용" })).toBeNull();
  });
  it("rejects a stale preview without re-rendering it or changing the source", async () => {
    renderProduct.mockResolvedValue(result); const commit = vi.fn(() => false);
    render(<Inspector {...props({ onPrepare: () => commit })} />); open();
    fireEvent.click(screen.getByRole("button", { name: "결과 미리보기" }));
    await waitFor(() => expect(screen.getByRole("img")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "미리보기 적용" }));
    expect(renderProduct).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("미리보기를 적용하지 않았습니다");
  });
  it("reuses an idle session across style changes but discards stale preview pixels", async () => {
    renderProduct.mockResolvedValue(result); render(<Inspector {...props()} />); open();
    fireEvent.click(screen.getByRole("button", { name: "결과 미리보기" }));
    await waitFor(() => expect(screen.getByRole("img")).toBeTruthy());
    fireEvent.change(screen.getByRole("combobox", { name: "문서 변환 재질" }), { target: { value: "chalk" } });
    expect(screen.queryByRole("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "결과 미리보기" }));
    await waitFor(() => expect(renderProduct).toHaveBeenCalledTimes(2));
    expect(sessionInstances).toHaveLength(1); expect(sessionInstances[0]!.dispose).not.toHaveBeenCalled();
  });
  it.each(["close", "page", "engine", "hidden", "pagehide", "disable-reuse", "unmount"])("releases the idle session on %s", async (change) => {
    renderProduct.mockResolvedValue(result); const initial = props(), view = render(<Inspector {...initial} />); open();
    fireEvent.click(screen.getByRole("button", { name: "결과 미리보기" }));
    await waitFor(() => expect(screen.getByRole("img")).toBeTruthy());
    const lease = sessionInstances[0]!;
    if (change === "close") { const details = screen.getByText("선택 획 · 네이티브 엔진 변환").closest("details")!; details.open = false; fireEvent(details, new Event("toggle")); }
    if (change === "page") view.rerender(<Inspector {...initial} pageId="other" />);
    if (change === "engine") fireEvent.change(screen.getByRole("combobox", { name: "문서 변환 엔진" }), { target: { value: "vello" } });
    if (change === "hidden") {
      const hidden = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      fireEvent(document, new Event("visibilitychange")); hidden.mockRestore();
    }
    if (change === "pagehide") fireEvent(window, new Event("pagehide"));
    if (change === "disable-reuse") fireEvent.click(screen.getByRole("checkbox", { name: "연속 미리보기 가속" }));
    if (change === "unmount") view.unmount();
    expect(lease.dispose).toHaveBeenCalled();
  });
});
