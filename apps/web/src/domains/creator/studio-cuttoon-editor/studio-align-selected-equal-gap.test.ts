import { describe, expect, it } from "vitest";

import { alignStudioSelection } from "./studio-align-selected";

import type { El } from "../studio-element-model";

function imageElement(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number
): El {
  return {
    id,
    type: "image",
    src: "data:image/png;base64,",
    x,
    y,
    width,
    height,
  } as unknown as El;
}

function coordinateOf(element: El, axis: "x" | "y"): number {
  return (element as El & { x: number; y: number })[axis];
}

function distribute(
  mode: "distributeH" | "distributeV",
  elements: El[]
): El[] {
  const commits: El[][] = [];
  alignStudioSelection(mode, {
    elements,
    marqueeIds: elements.map((element) => element.id),
    selected: elements[0],
    groups: [],
    activeGroupIdRef: { current: null },
    canvasH: 1_000,
    completeSelectedGroupId: () => null,
    commit: (next) => {
      commits.push(next);
    },
    patchEl: () => undefined,
    setError: (message) => {
      throw new Error(message);
    },
  });
  expect(commits).toHaveLength(1);
  return commits[0]!;
}

describe("Studio selection equal-gap integration", () => {
  it("uses equal visual horizontal gaps instead of equal center spacing", () => {
    const next = distribute("distributeH", [
      imageElement("left", 0, 0, 20, 20),
      imageElement("middle", 50, 0, 10, 20),
      imageElement("right", 120, 0, 30, 20),
    ]);

    expect(next.map((element) => coordinateOf(element, "x"))).toEqual([0, 65, 120]);
    const [left, middle, right] = next.map((element) => ({
      x: coordinateOf(element, "x"),
      width: (element as El & { width: number }).width,
    }));
    expect(middle!.x - (left!.x + left!.width)).toBe(45);
    expect(right!.x - (middle!.x + middle!.width)).toBe(45);
  });

  it("uses equal visual vertical gaps and keeps the outer objects fixed", () => {
    const next = distribute("distributeV", [
      imageElement("top", 0, 0, 20, 20),
      imageElement("middle", 0, 50, 20, 10),
      imageElement("bottom", 0, 120, 20, 30),
    ]);

    expect(next.map((element) => coordinateOf(element, "y"))).toEqual([0, 65, 120]);
    const [top, middle, bottom] = next.map((element) => ({
      y: coordinateOf(element, "y"),
      height: (element as El & { height: number }).height,
    }));
    expect(middle!.y - (top!.y + top!.height)).toBe(45);
    expect(bottom!.y - (middle!.y + middle!.height)).toBe(45);
  });
});
