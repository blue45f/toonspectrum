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

    const width = screen.getByLabelText("너비 W") as HTMLInputElement;
    const height = screen.getByLabelText("높이 H") as HTMLInputElement;
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
    expect((screen.getByLabelText("너비 W") as HTMLInputElement).disabled).toBe(false);
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

  it("moves a multi-selection as one group and accepts a shared mixed opacity", () => {
    const onChange = renderPanel([
      {
        id: "a",
        type: "image",
        src: "data:image/png;base64,AA==",
        x: 10,
        y: 20,
        width: 40,
        height: 30,
        opacity: 0.25,
      } as ImageEl,
      {
        id: "b",
        type: "image",
        src: "data:image/png;base64,AA==",
        x: 80,
        y: 60,
        width: 20,
        height: 20,
        opacity: 0.75,
      } as ImageEl,
    ]);

    const x = screen.getByLabelText("가로 위치 X") as HTMLInputElement;
    const width = screen.getByLabelText("너비 W") as HTMLInputElement;
    const opacity = screen.getByLabelText("불투명") as HTMLInputElement;
    expect(x.disabled).toBe(false);
    expect(width.disabled).toBe(true);
    expect(opacity.disabled).toBe(false);
    expect(opacity.placeholder).toBe("혼합");
    expect(screen.getByText("2개 선택 · 공통 속성")).toBeTruthy();
    expect(screen.getByText(/대상마다 다른 속성은 한 개만 선택/u)).toBeTruthy();
    expect(
      screen
        .getByText("2개 선택 · 공통 속성")
        .closest('[data-studio-selection-scope="multiple"]'),
    ).toBeTruthy();

    fireEvent.change(x, { target: { value: "40" } });
    fireEvent.keyDown(x, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ x: 40 });

    fireEvent.change(opacity, { target: { value: "60" } });
    fireEvent.keyDown(opacity, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith({ opacity: 0.6 });

    // The first selected item is already 25%, but choosing 25% must still normalise
    // the other mixed values instead of being mistaken for a no-op.
    fireEvent.change(opacity, { target: { value: "25" } });
    fireEvent.keyDown(opacity, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith({ opacity: 0.25 });
  });

  it("drops a half-typed draft when the selected target changes", () => {
    const onChange = vi.fn();
    const first = {
      id: "first",
      type: "image",
      src: "data:image/png;base64,AA==",
      x: 10,
      y: 20,
      width: 80,
      height: 40,
    } as ImageEl;
    const second = { ...first, id: "second" } as ImageEl;
    const view = render(
      <StudioFigmaDesignPanel
        metrics={resolveStudioFigmaSelectionLayoutMetrics([first])}
        onChange={onChange}
      />,
    );
    const x = screen.getByLabelText("가로 위치 X") as HTMLInputElement;
    fireEvent.change(x, { target: { value: "999" } });
    expect(x.value).toBe("999");

    view.rerender(
      <StudioFigmaDesignPanel
        metrics={resolveStudioFigmaSelectionLayoutMetrics([second])}
        onChange={onChange}
      />,
    );
    expect((screen.getByLabelText("가로 위치 X") as HTMLInputElement).value).toBe("10");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clamps typed bounded values before committing them", () => {
    const onChange = renderPanel([
      {
        id: "i",
        type: "image",
        src: "data:image/png;base64,AA==",
        x: 0,
        y: 0,
        width: 80,
        height: 40,
        opacity: 0.5,
      } as ImageEl,
    ]);
    const width = screen.getByLabelText("너비 W") as HTMLInputElement;
    const opacity = screen.getByLabelText("불투명") as HTMLInputElement;
    fireEvent.change(width, { target: { value: "-10" } });
    fireEvent.keyDown(width, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith({ width: 1 });
    fireEvent.change(opacity, { target: { value: "140" } });
    fireEvent.keyDown(opacity, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith({ opacity: 1 });
  });

  it("lets every numeric control shrink inside the fixed-width Inspector grid", () => {
    renderPanel([
      {
        id: "i",
        type: "image",
        src: "data:image/png;base64,AA==",
        x: 0,
        y: 0,
        width: 80,
        height: 40,
      } as ImageEl,
    ]);

    for (const name of ["가로 위치 X", "세로 위치 Y", "너비 W", "높이 H"]) {
      const input = screen.getByLabelText(name) as HTMLInputElement;
      expect(input.className).toContain("w-0");
      expect(input.parentElement?.className).toContain("w-full");
      expect(input.parentElement?.className).toContain("overflow-hidden");
    }
  });
});
