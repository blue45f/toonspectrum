// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveStudioChromeInspectorPropertySurface } from "./studio-chrome-ia-map";
import {
  getStudioRecentColorsSnapshot,
  rememberSharedStudioRecentColor,
  resetStudioRecentColorsBridgeForTests,
} from "./studio-recent-colors-bridge";
import { resetStudioStrokeVisibilityMemoryForTests } from "./studio-stroke-visibility-memory";
import { StudioInspectorSelectionStrokeControls } from "./StudioInspectorSelectionStrokeControls";

import type { DrawEl } from "./studio-element-model";

afterEach(() => {
  cleanup();
  resetStudioRecentColorsBridgeForTests();
  resetStudioStrokeVisibilityMemoryForTests();
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
  it("exposes the live selection context labels for a draw element", () => {
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
    expect(screen.getByLabelText("선 없음").getAttribute("aria-pressed")).toBe("false");
    expect(
      screen.getByTestId("studio-selection-stroke-preview").getAttribute("aria-label"),
    ).toBe("선 미리보기: #112233, 5px, 80%");
    for (const label of surface.requiredControlLabels) {
      expect(screen.getByText(label), label).toBeTruthy();
      expect(screen.getByLabelText(label), `aria ${label}`).toBeTruthy();
    }

    fireEvent.change(screen.getByLabelText("선 두께"), { target: { value: "12" } });
    expect(patchEl).toHaveBeenCalledWith("draw-1", { strokeWidth: 12 });

    fireEvent.change(screen.getByLabelText("불투명도"), { target: { value: "0.5" } });
    expect(patchEl).toHaveBeenCalledWith("draw-1", { opacity: 0.5 });
  });

  it("applies a recent stroke color and records the committed color", () => {
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

    fireEvent.click(
      screen.getByRole("button", { name: "선 색상 최근 색상 #445566 적용" }),
    );
    expect(patchEl).toHaveBeenCalledWith("draw-1", { stroke: "#445566" });
    expect(onRememberColor).toHaveBeenCalledWith("#445566");
  });

  it("keeps an explicit recent-colour surface isolated from the shared owner", () => {
    rememberSharedStudioRecentColor("#010203");
    const patchEl = vi.fn();
    render(
      <StudioInspectorSelectionStrokeControls
        selected={drawSelection()}
        patchEl={patchEl}
        recentColors={["#445566"]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "선 색상 최근 색상 #445566 적용" }),
    );

    expect(patchEl).toHaveBeenCalledWith("draw-1", { stroke: "#445566" });
    expect(getStudioRecentColorsSnapshot()).toEqual(["#010203"]);
  });

  it("hides a freehand stroke with opacity and restores its authored color", () => {
    const patchEl = vi.fn();
    const view = render(
      <StudioInspectorSelectionStrokeControls
        selected={drawSelection({ stroke: "#334455" })}
        patchEl={patchEl}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "선 없음" }));
    expect(patchEl).toHaveBeenLastCalledWith("draw-1", { opacity: 0 });

    view.rerender(
      <StudioInspectorSelectionStrokeControls
        selected={drawSelection({ stroke: "#334455", opacity: 0 })}
        patchEl={patchEl}
      />,
    );
    expect(screen.getByRole("button", { name: "선 없음" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("선 두께") as HTMLInputElement).disabled).toBe(true);
    expect(
      screen.getByTestId("studio-selection-stroke-preview").getAttribute("aria-label"),
    ).toBe("선 미리보기: 선 없음");

    fireEvent.click(screen.getByRole("button", { name: "선 없음" }));
    expect(patchEl).toHaveBeenLastCalledWith("draw-1", {
      stroke: "#334455",
      opacity: 0.8,
    });
  });

  it("restores a freehand opacity after the inspector unmounts", () => {
    const firstPatch = vi.fn();
    const first = render(
      <StudioInspectorSelectionStrokeControls
        selected={drawSelection({ opacity: 0.35 })}
        patchEl={firstPatch}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "선 없음" }));
    expect(firstPatch).toHaveBeenLastCalledWith("draw-1", { opacity: 0 });
    first.unmount();

    const restoredPatch = vi.fn();
    render(
      <StudioInspectorSelectionStrokeControls
        selected={drawSelection({ opacity: 0 })}
        patchEl={restoredPatch}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "선 없음" }));

    expect(restoredPatch).toHaveBeenLastCalledWith("draw-1", {
      stroke: "#112233",
      opacity: 0.35,
    });
  });

  it("removes only the outline from a filled vector shape and restores it", () => {
    const patchEl = vi.fn();
    const view = render(
      <StudioInspectorSelectionStrokeControls
        selected={drawSelection({ kind: "rect", fill: "#ffffff", stroke: "#334455" })}
        patchEl={patchEl}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "선 없음" }));
    expect(patchEl).toHaveBeenLastCalledWith("draw-1", { stroke: "transparent" });

    view.rerender(
      <StudioInspectorSelectionStrokeControls
        selected={drawSelection({
          kind: "rect",
          fill: "#ffffff",
          stroke: "transparent",
        })}
        patchEl={patchEl}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "선 없음" }));
    expect(patchEl).toHaveBeenLastCalledWith("draw-1", { stroke: "#334455" });
  });

  it("keeps vector restoration colours scoped to the selected element", () => {
    const patchEl = vi.fn();
    const view = render(
      <StudioInspectorSelectionStrokeControls
        selected={drawSelection({
          id: "shape-a",
          kind: "rect",
          fill: "#ffffff",
          stroke: "#445566",
        })}
        patchEl={patchEl}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "선 없음" }));
    expect(patchEl).toHaveBeenLastCalledWith("shape-a", { stroke: "transparent" });

    view.rerender(
      <StudioInspectorSelectionStrokeControls
        selected={drawSelection({
          id: "shape-b",
          kind: "rect",
          fill: "#ffffff",
          stroke: "#abcdef",
        })}
        patchEl={patchEl}
      />,
    );
    view.rerender(
      <StudioInspectorSelectionStrokeControls
        selected={drawSelection({
          id: "shape-a",
          kind: "rect",
          fill: "#ffffff",
          stroke: "transparent",
        })}
        patchEl={patchEl}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "선 없음" }));
    expect(patchEl).toHaveBeenLastCalledWith("shape-a", { stroke: "#445566" });
  });
});
