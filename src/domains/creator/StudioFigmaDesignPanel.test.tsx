// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolveStudioFigmaSelectionLayoutMetrics,
} from "./studio-figma-selection-ux";
import { StudioFigmaDesignPanel } from "./StudioFigmaDesignPanel";

import type { DrawEl, El, ImageEl } from "./studio-element-model";

afterEach(cleanup);

function draw(partial: Partial<DrawEl> & Pick<DrawEl, "id" | "points">): DrawEl {
  return {
    type: "draw",
    mode: "pen",
    brush: "pen",
    stroke: "#111",
    strokeWidth: 6,
    ...partial,
  } as DrawEl;
}

function renderPanel(elements: readonly El[], onChange = vi.fn()) {
  render(
    <StudioFigmaDesignPanel
      metrics={resolveStudioFigmaSelectionLayoutMetrics(elements)}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe("StudioFigmaDesignPanel", () => {
  it("lets a lone stroke be resized and rotated by number", () => {
    const onChange = renderPanel([
      draw({ id: "s", points: [10, 10, 110, 60], strokeWidth: 4 }),
    ]);

    const width = screen.getByLabelText("W") as HTMLInputElement;
    const height = screen.getByLabelText("H") as HTMLInputElement;
    const rotation = screen.getByLabelText("회전(상대)") as HTMLInputElement;
    expect(width.disabled).toBe(false);
    expect(height.disabled).toBe(false);
    expect(rotation.disabled).toBe(false);
    // Relative model: the box reads 0 because a stroke stores no angle.
    expect(rotation.value).toBe("0");

    // One typed number is one commit — the draft is local until Enter/blur.
    fireEvent.change(width, { target: { value: "1" } });
    fireEvent.change(width, { target: { value: "15" } });
    fireEvent.change(width, { target: { value: "150" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(width, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ width: 150 });

    fireEvent.change(rotation, { target: { value: "15" } });
    fireEvent.blur(rotation);
    expect(onChange).toHaveBeenLastCalledWith({ rotation: 15 });
  });

  it("explains the relative rotation model instead of faking an absolute angle", () => {
    renderPanel([draw({ id: "s", points: [0, 0, 40, 40] })]);
    expect(screen.getByText(/여기서 몇 도/u)).toBeTruthy();
  });

  it("says why rotation is inert on a box-derived shape stroke", () => {
    renderPanel([draw({ id: "r", kind: "rect", points: [0, 0, 60, 30] })]);
    const rotation = screen.getByLabelText("회전(상대)") as HTMLInputElement;
    expect(rotation.disabled).toBe(true);
    expect(rotation.title).toContain("자유곡선");
    // Size stays live: only the angle is impossible for an axis-aligned shape.
    expect((screen.getByLabelText("W") as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByText(/축에 정렬된 상자/u)).toBeTruthy();
  });

  it("keeps the absolute angle label and value for elements that store one", () => {
    renderPanel([
      {
        id: "i",
        type: "image",
        src: "data:image/png;base64,AA==",
        x: 0,
        y: 0,
        width: 80,
        height: 40,
        rotation: 15,
      } as ImageEl,
    ]);
    const rotation = screen.getByLabelText("회전") as HTMLInputElement;
    expect(rotation.disabled).toBe(false);
    expect(rotation.value).toBe("15");
    expect(screen.queryByText(/여기서 몇 도/u)).toBeNull();
  });
});
