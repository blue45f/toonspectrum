import { describe, expect, it } from "vitest";

import { isCompleteStudioDrawOp } from "./studio-draw-completion";

describe("isCompleteStudioDrawOp", () => {
  it("commits a one-point freehand tap as a visible dot", () => {
    expect(isCompleteStudioDrawOp({ kind: "freehand", points: [12, 34] })).toBe(true);
    expect(isCompleteStudioDrawOp({ points: [12, 34] })).toBe(true);
  });

  it("rejects empty or malformed freehand drafts", () => {
    expect(isCompleteStudioDrawOp({ kind: "freehand", points: [] })).toBe(false);
    expect(isCompleteStudioDrawOp({ kind: "freehand", points: [12] })).toBe(false);
  });

  it("keeps minimum drag thresholds for geometric tools", () => {
    expect(isCompleteStudioDrawOp({ kind: "line", points: [0, 0, 2, 0] })).toBe(false);
    expect(isCompleteStudioDrawOp({ kind: "line", points: [0, 0, 3, 0] })).toBe(true);
    expect(isCompleteStudioDrawOp({ kind: "rect", points: [0, 0, 10, 2] })).toBe(false);
    expect(isCompleteStudioDrawOp({ kind: "rect", points: [0, 0, 3, 3] })).toBe(true);
  });
});
