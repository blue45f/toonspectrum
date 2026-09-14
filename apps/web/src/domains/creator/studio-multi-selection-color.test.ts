import { describe, expect, it } from "vitest";

import {
  applyStudioMultiSelectionStrokeColor,
  resolveStudioMultiSelectionStrokeColor,
} from "./studio-multi-selection-color";

import type { DrawEl, El, FrameEl, ImageEl, TextEl } from "./studio-element-model";

function draw(id: string, stroke: string): DrawEl {
  return {
    id,
    type: "draw",
    points: [0, 0, 20, 20],
    mode: "pen",
    brush: "pen",
    stroke,
    strokeWidth: 3,
  } as DrawEl;
}

function text(id: string, stroke?: string): TextEl {
  return {
    id,
    type: "text",
    text: id,
    x: 0,
    y: 0,
    width: 120,
    fontSize: 24,
    fill: "#111111",
    rotation: 0,
    stroke,
  };
}

function frame(id: string, stroke?: string): FrameEl {
  return {
    id,
    type: "frame",
    x: 0,
    y: 0,
    width: 200,
    height: 120,
    stroke,
  };
}

function image(id: string): ImageEl {
  return {
    id,
    type: "image",
    src: "data:image/png;base64,AA==",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
  } as ImageEl;
}

describe("multi-selection stroke colors", () => {
  it("reports one shared color without a mixed state", () => {
    const state = resolveStudioMultiSelectionStrokeColor(
      [draw("a", "#ABCDEF"), text("b", "#abcdef")],
      ["a", "b"],
    );

    expect(state).toMatchObject({
      value: "#abcdef",
      mixed: false,
      includesNone: false,
    });
    expect(state.targets).toHaveLength(2);
  });

  it("exposes a representative color while marking mixed and none members", () => {
    const state = resolveStudioMultiSelectionStrokeColor(
      [draw("a", "transparent"), text("b", "#654321"), image("c")],
      ["a", "b", "c"],
    );

    expect(state).toMatchObject({
      value: "#654321",
      mixed: true,
      includesNone: true,
    });
    expect(state.targets.map((target) => target.id)).toEqual(["a", "b"]);
  });

  it("applies one color only to selected stroke-capable elements", () => {
    const outside = frame("outside", "#999999");
    const picture = image("picture");
    const elements: El[] = [draw("a", "#111111"), text("b"), picture, outside];
    const next = applyStudioMultiSelectionStrokeColor(elements, ["a", "b", "picture"], "#224466");

    expect(next[0]).toMatchObject({ stroke: "#224466", strokeWidth: 3 });
    expect(next[1]).toMatchObject({ stroke: "#224466", strokeWidth: 3 });
    expect(next[2]).toBe(picture);
    expect(next[3]).toBe(outside);
  });

  it("uses transparent for draw none and undefined for semantic outlines", () => {
    const elements: El[] = [
      draw("draw", "#111111"),
      text("text", "#222222"),
      frame("frame", "#333333"),
    ];
    const next = applyStudioMultiSelectionStrokeColor(
      elements,
      ["draw", "text", "frame"],
      null,
    );

    expect(next[0]).toMatchObject({ stroke: "transparent" });
    expect((next[1] as TextEl).stroke).toBeUndefined();
    expect((next[2] as FrameEl).stroke).toBeUndefined();
  });
});
