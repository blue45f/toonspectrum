// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveStudioChromeInspectorPropertySurface } from "./studio-chrome-ia-map";
import { StudioInspectorSelectionStrokeControls } from "./StudioInspectorSelectionStrokeControls";

import type { DrawEl } from "./studio-element-model";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function drawSelection(overrides: Partial<DrawEl> = {}): DrawEl {
  return {
    id: "draw-1",
    type: "draw",
    kind: "freehand",
    points: [0, 0, 10, 10],
    stroke: "#112233",
    strokeWidth: 5,
    opacity: 0.8,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    ...overrides,
  } as DrawEl;
}

describe("StudioInspectorSelectionStrokeControls", () => {
  it("exposes the live selection context labels for a draw element (shipped path)", () => {
    const patchEl = vi.fn();
    const selected = drawSelection();
    const surface = resolveStudioChromeInspectorPropertySurface({
      kind: "selection",
      selectedType: "draw",
    });

    render(
      <div data-testid={surface.testId} role="tabpanel" aria-label="선택 요소 속성">
        <StudioInspectorSelectionStrokeControls selected={selected} patchEl={patchEl} />
      </div>,
    );

    expect(screen.getByTestId("studio-inspector-context-selection")).toBeTruthy();
    expect(screen.getByTestId("studio-inspector-selection-stroke-controls")).toBeTruthy();
    expect(screen.getByLabelText("선 색상")).toBeTruthy();
    expect(screen.getByLabelText("선 없음")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("studio-selection-stroke-preview")).toHaveAttribute(
      "aria-label",
      "선 미리보기: #112233, 5px, 80%",
    );
    for (const label of surface.requiredControlLabels) {
      expect(screen.getByText(label), label).toBeTruthy();
      expect(screen.getByLabelText(label), `aria ${label}`).toBeTruthy();
    }

    fireEvent.change(screen.getByLabelText("선 두께"), { target: { value: "12" } });
    expect(patchEl).toHaveBeenCalledWith("draw-1", { strokeWidth: 12 });

    fireEvent.change(screen.getByLabelText("불투명도"), { target: { value: "0.5" } });
    expect(patchEl).toHaveBeenCalledWith("draw-1", { opacity: 0.5 });
  });

  it("applies a recent stroke colour immediately and records the committed colour", () => {
    const patchEl = vi.fn();
    const onRememberColor = vi.fn();

    render(
      <StudioInspectorSelectionStrokeControls
        selected={drawSelection()}
        patchEl={patchEl}
        recentColors={["#445566", "#778899"]}
        onRememberColor={onRememberColor}
      />,
    );

    fireEvent.click(screen.getByLabelText("최근 선 색상 1 #445566 적용"));

    expect(patchEl).toHaveBeenCalledWith("draw-1", { stroke: "#445566" });
    expect(onRememberColor).toHaveBeenCalledWith("#445566");
  });

  it("hides a freehand stroke without feeding a non-hex colour to brush renderers", () => {
    const patchEl = vi.fn();
    const { rerender } = render(
      <StudioInspectorSelectionStrokeControls
        selected={drawSelection()}
        patchEl={patchEl}
      />,
    );

    fireEvent.click(screen.getByLabelText("선 없음"));
    expect(patchEl).toHaveBeenLastCalledWith("draw-1", { opacity: 0 });

    rerender(
      <StudioInspectorSelectionStrokeControls
        selected={drawSelection({ opacity: 0 })}
        patchEl={patchEl}
      />,
    );

    expect(screen.getByLabelText("선 없음")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("선 두께")).toBeDisabled();
    expect(screen.getByTestId("studio-selection-stroke-preview")).toHaveAttribute(
      "aria-label",
      "선 미리보기: 선 없음",
    );

    fireEvent.click(screen.getByLabelText("선 없음"));
    expect(patchEl).toHaveBeenLastCalledWith("draw-1", {
      stroke: "#112233",
      opacity: 0.8,
    });
  });

  it("removes only the outline from a filled vector shape", () => {
    const patchEl = vi.fn();
    const shape = drawSelection({ kind: "rect", fill: "#ffffff" });
    const { rerender } = render(
      <StudioInspectorSelectionStrokeControls selected={shape} patchEl={patchEl} />,
    );

    fireEvent.click(screen.getByLabelText("선 없음"));
    expect(patchEl).toHaveBeenLastCalledWith("draw-1", { stroke: "transparent" });

    rerender(
      <StudioInspectorSelectionStrokeControls
        selected={drawSelection({ kind: "rect", fill: "#ffffff", stroke: "transparent" })}
        patchEl={patchEl}
      />,
    );

    fireEvent.click(screen.getByLabelText("선 없음"));
    expect(patchEl).toHaveBeenLastCalledWith("draw-1", { stroke: "#112233" });
  });
});
