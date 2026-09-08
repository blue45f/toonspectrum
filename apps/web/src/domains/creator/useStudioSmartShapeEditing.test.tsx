// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStudioSmartShapeEditing } from "./useStudioSmartShapeEditing";

import type { DrawEl } from "./studio-element-model";

vi.mock("./studio-page-lazy-ui", async () => import("./StudioSmartShapeEditDialog"));
afterEach(cleanup);

type Options = Parameters<typeof useStudioSmartShapeEditing>[0];
const stroke = (): DrawEl => ({
  id: "stroke", type: "draw", kind: "freehand", mode: "pen", brush: "pen",
  points: [10, 20, 30, 25, 50, 18, 70, 20, 100, 20], stroke: "#123456", strokeWidth: 4,
});
function fixture(): Options {
  return {
    elements: [stroke()], selectedId: "stroke", currentPageId: () => "page",
    isDrawing: () => false, isLocked: () => false,
    captureTicket: () => ({ authScopeKey: null, workId: null, accessGeneration: 1, documentGeneration: 1 }),
    canApply: () => true, commit: vi.fn(() => true), select: vi.fn(), closeMenu: vi.fn(),
    setError: vi.fn(), onApplied: vi.fn(),
  };
}
function Editor({ options }: { options: Options }) {
  const editing = useStudioSmartShapeEditing(options);
  return <><button onClick={editing.openSmartShapeEditor}>교정 열기</button>{editing.smartShapeDialog}</>;
}
async function open() {
  fireEvent.click(screen.getByRole("button", { name: "교정 열기" }));
  return screen.findByRole("dialog");
}

describe("Smart Shape editor mutation boundary", () => {
  it("opens the real dialog and commits exactly one reviewed correction", async () => {
    const options = fixture();
    const original = structuredClone(options.elements);
    render(<Editor options={options} />);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "사각형" }));
    expect(options.commit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "도형 확정" }));
    expect(options.commit).toHaveBeenCalledOnce();
    expect(options.commit).toHaveBeenCalledWith([expect.objectContaining({
      id: "stroke", smartShape: expect.objectContaining({ kind: "rect", original: original[0] }),
    })]);
    expect(options.elements).toEqual(original);
    expect(options.onApplied).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cancels a preview without a document or history mutation", async () => {
    const options = fixture();
    render(<Editor options={options} />);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "타원" }));
    fireEvent.click(screen.getByRole("button", { name: "도형 편집 취소" }));
    expect(options.commit).not.toHaveBeenCalled();
    expect(options.onApplied).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each(["drawing", "locked"])("does not open during %s", (guard) => {
    const options = fixture();
    if (guard === "drawing") options.isDrawing = () => true;
    else options.isLocked = () => true;
    render(<Editor options={options} />);
    fireEvent.click(screen.getByRole("button", { name: "교정 열기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(options.setError).toHaveBeenCalledOnce();
    expect(options.commit).not.toHaveBeenCalled();
  });

  it.each(["page", "ticket", "drawing", "lock", "source", "commit"])("rejects stale %s at confirmation", async (guard) => {
    const options = fixture();
    const view = render(<Editor options={options} />);
    await open();
    const next = { ...options };
    if (guard === "page") next.currentPageId = () => "other-page";
    if (guard === "ticket") next.canApply = () => false;
    if (guard === "drawing") next.isDrawing = () => true;
    if (guard === "lock") next.isLocked = () => true;
    if (guard === "source") next.elements = [{ ...stroke(), stroke: "#ffffff" }];
    if (guard === "commit") next.commit = vi.fn(() => false);
    view.rerender(<Editor options={next} />);
    fireEvent.click(screen.getByRole("button", { name: "도형 확정" }));
    if (guard === "commit") expect(next.commit).toHaveBeenCalledOnce();
    else expect(next.commit).not.toHaveBeenCalled();
    expect(next.onApplied).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
