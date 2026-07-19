// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioAdvancedRulerPanel,
  type StudioAdvancedRulerPanelProps,
} from "./StudioAdvancedRulerPanel";

import type { StudioAdvancedRulerDocument } from "./studio-advanced-ruler-document";

afterEach(cleanup);

const rulerDocument: StudioAdvancedRulerDocument = {
  version: 1,
  activeSnapRulerId: "curve-a",
  selectedRulerId: "curve-a",
  rulers: [{
    id: "curve-a",
    type: "curve",
    name: "옷 주름",
    enabled: true,
    visible: true,
    scope: { kind: "page", groupId: null },
    snapMode: "through-start",
    fixedOffset: 0,
    p0: { x: 10, y: 100 },
    p1: { x: 50, y: 20 },
    p2: { x: 150, y: 180 },
    p3: { x: 200, y: 100 },
  }],
};

function props(overrides: Partial<StudioAdvancedRulerPanelProps> = {}): StudioAdvancedRulerPanelProps {
  return {
    document: rulerDocument,
    groups: [{ id: "background", name: "배경" }],
    canvasWidth: 800,
    canvasHeight: 1_200,
    onAdd: vi.fn(),
    onPatch: vi.fn(),
    onRemove: vi.fn(),
    onSelect: vi.fn(),
    onSetActiveSnap: vi.fn(),
    ...overrides,
  };
}

describe("StudioAdvancedRulerPanel", () => {
  it("adds curve and fisheye rulers from explicit controls", () => {
    const onAdd = vi.fn();
    render(<StudioAdvancedRulerPanel {...props({ onAdd })} />);
    fireEvent.click(screen.getByRole("button", { name: /^곡선자$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^어안자$/ }));
    expect(onAdd).toHaveBeenNthCalledWith(1, "curve");
    expect(onAdd).toHaveBeenNthCalledWith(2, "fisheye");
  });

  it("selects, hides, deactivates and removes a ruler", () => {
    const onSelect = vi.fn();
    const onPatch = vi.fn();
    const onRemove = vi.fn();
    const onSetActiveSnap = vi.fn();
    render(<StudioAdvancedRulerPanel {...props({
      onSelect,
      onPatch,
      onRemove,
      onSetActiveSnap,
    })} />);
    fireEvent.click(screen.getByRole("button", { name: /^곡선자 · 옷 주름$/ }));
    fireEvent.click(screen.getByRole("button", { name: "옷 주름 숨기기" }));
    fireEvent.click(screen.getByRole("button", { name: "옷 주름 스냅 해제" }));
    fireEvent.click(screen.getByRole("button", { name: "옷 주름 삭제" }));
    expect(onSelect).toHaveBeenCalledWith("curve-a");
    expect(onPatch).toHaveBeenCalledWith("curve-a", { visible: false });
    expect(onSetActiveSnap).toHaveBeenCalledWith(null);
    expect(onRemove).toHaveBeenCalledWith("curve-a");
  });

  it("changes a ruler from page scope to an authored layer group", () => {
    const onPatch = vi.fn();
    render(<StudioAdvancedRulerPanel {...props({ onPatch })} />);
    fireEvent.change(screen.getByLabelText("적용 범위"), {
      target: { value: "group:background" },
    });
    expect(onPatch).toHaveBeenCalledWith("curve-a", {
      scope: { kind: "group", groupId: "background" },
    });
  });

  it("disables mutation controls at a locked document boundary", () => {
    render(<StudioAdvancedRulerPanel {...props({ disabled: true, disabledReason: "검토 잠금" })} />);
    expect((screen.getByRole("button", { name: /^곡선자$/ }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect((screen.getByRole("button", { name: "옷 주름 삭제" }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect((screen.getByLabelText("적용 범위") as HTMLSelectElement).disabled).toBe(true);
  });
});
