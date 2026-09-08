// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { commitStudioSmartShapeEdit } from "./studio-smart-shape-edit";
import { StudioSmartShapeEditDialog } from "./StudioSmartShapeEditDialog";

import type { DrawEl } from "./studio-element-model";

const source: DrawEl = { id: "s1", type: "draw", kind: "freehand", mode: "pen", brush: "pen",
  points: [10, 20, 30, 25, 50, 18, 70, 20, 100, 20], stroke: "#123456", strokeWidth: 4 };
afterEach(cleanup);

describe("Smart Shape draft review", () => {
  it("keeps kind, geometry and comparison changes draft-only until one explicit confirm", () => {
    const confirm = vi.fn((_result: DrawEl) => true), cancel = vi.fn();
    render(<StudioSmartShapeEditDialog source={source} onConfirm={confirm} onCancel={cancel} />);
    fireEvent.click(screen.getByRole("button", { name: "사각형" }));
    fireEvent.change(screen.getByLabelText("크기 (%)"), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText("회전 (°)"), { target: { value: "45" } });
    fireEvent.change(screen.getByLabelText("점 X"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "원래 자유선과 비교" }));
    expect(screen.getByRole("img", { name: "원래 자유선 경로" })).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "도형 확정" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    const result = confirm.mock.calls[0]![0] as unknown as DrawEl;
    expect(result.smartShape?.kind).toBe("rect");
    expect(result.smartShape?.original).toEqual(source);
    expect(result.points).not.toEqual(source.points);
    expect(cancel).not.toHaveBeenCalled();
  });
  it("cancels without committing and preserves a stale draft when document authority rejects apply", () => {
    const confirm = vi.fn(() => false), cancel = vi.fn();
    render(<StudioSmartShapeEditDialog source={source} onConfirm={confirm} onCancel={cancel} />);
    fireEvent.click(screen.getByRole("button", { name: "도형 확정" }));
    expect(screen.getByRole("alert").textContent).toContain("원고나 레이어가 바뀌어");
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
  });
  it("offers an exact original restoration after a persisted correction reopens", () => {
    const corrected = commitStudioSmartShapeEdit(source, "line", [10, 20, 100, 20])!;
    const confirm = vi.fn((_result: DrawEl) => true);
    render(<StudioSmartShapeEditDialog source={JSON.parse(JSON.stringify(corrected))} onConfirm={confirm} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "원래 자유선 복원" }));
    expect(confirm).toHaveBeenCalledWith(source);
  });
  it("lets Escape dismiss without applying the preview", () => {
    const confirm = vi.fn((_result: DrawEl) => true), cancel = vi.fn();
    render(<StudioSmartShapeEditDialog source={source} onConfirm={confirm} onCancel={cancel} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
  });
});
