import { describe, expect, it } from "vitest";

import { polylineToPath } from "../ir/path";
import {
  applyMat2d,
  composeMat2d,
  identityMat2d,
  rotateMat2d,
  scaleMat2d,
  transformPathIR,
  transformSceneNodes,
  translateMat2d,
} from "../ir/path-transform";

import type { PathIR } from "../ir/path";
import type { SceneNodeIR } from "../ir/scene";

const mixedPath: PathIR = {
  verbs: [
    { v: "M", x: 1, y: 0 },
    { v: "L", x: 2, y: 0 },
    { v: "Q", cx: 3, cy: 0, x: 3, y: 1 },
    { v: "C", c1x: 3, c1y: 2, c2x: 2, c2y: 3, x: 1, y: 3 },
    { v: "Z" },
  ],
};

function strokeNode(id: string, strokeWidth: number): SceneNodeIR {
  return {
    id,
    kind: "stroke-path",
    opacity: 1,
    blend: "src-over",
    path: polylineToPath(
      [
        [0, 0],
        [4, 0],
      ],
      false,
    ),
    paint: { kind: "solid", color: { r: 0, g: 0, b: 0, a: 1 } },
    strokeWidth,
    cap: "round",
    join: "round",
    miterLimit: 4,
  };
}

function groupNode(children: SceneNodeIR[], clip: PathIR | null): SceneNodeIR {
  return {
    id: "grp",
    kind: "group",
    opacity: 1,
    blend: "src-over",
    clip,
    children,
  };
}

function sweepFill(startAngleDeg: number, endAngleDeg: number): SceneNodeIR {
  return {
    id: "sweep",
    kind: "fill-path",
    opacity: 1,
    blend: "src-over",
    path: mixedPath,
    paint: {
      kind: "sweep-gradient",
      center: [1, 1],
      startAngleDeg,
      endAngleDeg,
      stops: [
        { offset: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
        { offset: 0.25, color: { r: 0, g: 1, b: 0, a: 1 } },
        { offset: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
      ],
    },
    fillRule: "nonzero",
  };
}

function sweepPaintOf(nodes: SceneNodeIR[]) {
  const [node] = nodes;
  if (node?.kind !== "fill-path" || node.paint.kind !== "sweep-gradient") {
    throw new Error("expected sweep gradient fill");
  }
  return node.paint;
}

describe("mat2d primitives", () => {
  it("applies identity, translate and scale to points", () => {
    expect(applyMat2d(identityMat2d(), 3, -2)).toEqual([3, -2]);
    expect(applyMat2d(translateMat2d(10, 20), 3, -2)).toEqual([13, 18]);
    expect(applyMat2d(scaleMat2d(2, 3), 3, -2)).toEqual([6, -6]);
  });

  it("rotates 90° mapping +x to +y in y-down scene space", () => {
    const rot = rotateMat2d(90);
    const [x1, y1] = applyMat2d(rot, 1, 0);
    expect(x1).toBeCloseTo(0, 12);
    expect(y1).toBeCloseTo(1, 12);
    const [x2, y2] = applyMat2d(rot, 0, 1);
    expect(x2).toBeCloseTo(-1, 12);
    expect(y2).toBeCloseTo(0, 12);
  });

  it("composes outer·inner with inner applied first", () => {
    // Scale by 2 first, then translate by (10, 0): (1, 1) → (2, 2) → (12, 2).
    const m = composeMat2d(translateMat2d(10, 0), scaleMat2d(2, 2));
    expect(applyMat2d(m, 1, 1)).toEqual([12, 2]);
    // Opposite composition translates first: (1, 1) → (11, 1) → (22, 2).
    const swapped = composeMat2d(scaleMat2d(2, 2), translateMat2d(10, 0));
    expect(applyMat2d(swapped, 1, 1)).toEqual([22, 2]);
  });
});

describe("transformPathIR", () => {
  it("transforms every M/L/Q/C control point and preserves Z", () => {
    const rotated = transformPathIR(mixedPath, rotateMat2d(90));
    expect(rotated.verbs).toHaveLength(mixedPath.verbs.length);
    const [m, l, q, c, z] = rotated.verbs;
    if (m?.v !== "M" || l?.v !== "L" || q?.v !== "Q" || c?.v !== "C") {
      throw new Error("verb kinds must be preserved in order");
    }
    // R(90): (x, y) → (-y, x).
    expect(m.x).toBeCloseTo(0, 12);
    expect(m.y).toBeCloseTo(1, 12);
    expect(l.x).toBeCloseTo(0, 12);
    expect(l.y).toBeCloseTo(2, 12);
    expect(q.cx).toBeCloseTo(0, 12);
    expect(q.cy).toBeCloseTo(3, 12);
    expect(q.x).toBeCloseTo(-1, 12);
    expect(q.y).toBeCloseTo(3, 12);
    expect(c.c1x).toBeCloseTo(-2, 12);
    expect(c.c1y).toBeCloseTo(3, 12);
    expect(c.c2x).toBeCloseTo(-3, 12);
    expect(c.c2y).toBeCloseTo(2, 12);
    expect(c.x).toBeCloseTo(-3, 12);
    expect(c.y).toBeCloseTo(1, 12);
    expect(z).toEqual({ v: "Z" });
  });

  it("does not mutate the input path", () => {
    const before = structuredClone(mixedPath);
    transformPathIR(mixedPath, composeMat2d(rotateMat2d(45), scaleMat2d(3, 3)));
    expect(mixedPath).toEqual(before);
  });
});

describe("transformSceneNodes", () => {
  it("scales strokeWidth by |det|^0.5 under uniform scale without warnings", () => {
    const uniform = composeMat2d(rotateMat2d(45), scaleMat2d(3, 3));
    const { nodes, warnings } = transformSceneNodes([strokeNode("s1", 2)], uniform);
    expect(warnings).toEqual([]);
    const [node] = nodes;
    if (node?.kind !== "stroke-path") throw new Error("expected stroke node");
    expect(node.strokeWidth).toBeCloseTo(6, 12);
  });

  it("warns on non-uniform scale and applies the |det|^0.5 approximation", () => {
    const { nodes, warnings } = transformSceneNodes(
      [strokeNode("s1", 2)],
      scaleMat2d(2, 8),
    );
    const [node] = nodes;
    if (node?.kind !== "stroke-path") throw new Error("expected stroke node");
    // |det|^0.5 = sqrt(16) = 4.
    expect(node.strokeWidth).toBeCloseTo(8, 12);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("stroke s1");
    expect(warnings[0]).toContain("비균등 스케일");
    expect(warnings[0]).toContain("|det|^0.5");
  });

  it("transforms group clips and children recursively", () => {
    const clip = polylineToPath(
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      true,
    );
    const tree = [groupNode([groupNode([strokeNode("deep", 1)], null)], clip)];
    const m = composeMat2d(translateMat2d(5, 7), scaleMat2d(2, 2));
    const { nodes, warnings } = transformSceneNodes(tree, m);
    expect(warnings).toEqual([]);
    const [outer] = nodes;
    if (outer?.kind !== "group" || outer.clip === null) {
      throw new Error("expected clipped group");
    }
    expect(outer.clip.verbs[0]).toEqual({ v: "M", x: 5, y: 7 });
    expect(outer.clip.verbs[2]).toEqual({ v: "L", x: 25, y: 27 });
    const [inner] = outer.children;
    if (inner?.kind !== "group") throw new Error("expected nested group");
    const [deep] = inner.children;
    if (deep?.kind !== "stroke-path") throw new Error("expected deep stroke");
    expect(deep.strokeWidth).toBeCloseTo(2, 12);
    expect(deep.path.verbs[1]).toEqual({ v: "L", x: 13, y: 7 });
  });

  it("transforms gradient geometry (linear from/to, radial center+radius)", () => {
    const fill: SceneNodeIR = {
      id: "grad",
      kind: "fill-path",
      opacity: 1,
      blend: "src-over",
      path: mixedPath,
      paint: {
        kind: "radial-gradient",
        center: [1, 1],
        radius: 5,
        stops: [
          { offset: 0, color: { r: 1, g: 1, b: 1, a: 1 } },
          { offset: 1, color: { r: 0, g: 0, b: 0, a: 1 } },
        ],
      },
      fillRule: "nonzero",
    };
    const { nodes, warnings } = transformSceneNodes([fill], scaleMat2d(2, 2));
    expect(warnings).toEqual([]);
    const [node] = nodes;
    if (node?.kind !== "fill-path" || node.paint.kind !== "radial-gradient") {
      throw new Error("expected radial gradient fill");
    }
    expect(node.paint.center).toEqual([2, 2]);
    expect(node.paint.radius).toBeCloseTo(10, 12);
  });

  it("rotates sweep-gradient angle windows exactly under a rotation", () => {
    const fill = sweepFill(30, 120);
    const { nodes, warnings } = transformSceneNodes([fill], rotateMat2d(45));
    expect(warnings).toEqual([]);
    const paint = sweepPaintOf(nodes);
    // center [1,1] under rotate(45°): x' = cos45 − sin45 = 0, y' = √2.
    expect(paint.center[0]).toBeCloseTo(0, 12);
    expect(paint.center[1]).toBeCloseTo(Math.SQRT2, 12);
    expect(paint.startAngleDeg).toBeCloseTo(75, 10);
    expect(paint.endAngleDeg).toBeCloseTo(165, 10);
    expect(paint.stops).toEqual(sweepPaintOf([fill]).stops);
  });

  it("mirrors sweep windows and reverses stops under a reflection", () => {
    // scale(-1, 1) reflects across the Y axis: ψ = 180°, θ → 180° − θ.
    const fill = sweepFill(30, 120);
    const { nodes, warnings } = transformSceneNodes([fill], scaleMat2d(-1, 1));
    expect(warnings).toEqual([]);
    const paint = sweepPaintOf(nodes);
    expect(paint.startAngleDeg).toBeCloseTo(60, 10);
    expect(paint.endAngleDeg).toBeCloseTo(150, 10);
    expect(paint.stops.map((stop) => stop.offset)).toEqual([0, 0.75, 1]);
    expect(paint.stops[0]?.color).toEqual({ r: 0, g: 0, b: 1, a: 1 });
    expect(paint.stops[2]?.color).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  it("re-anchors rotated sweep windows into one turn and reports seam straddle", () => {
    const fill = sweepFill(300, 350);
    const { nodes, warnings } = transformSceneNodes([fill], rotateMat2d(30));
    const paint = sweepPaintOf(nodes);
    // 330..380 straddles the 360° seam: window is kept (start re-anchored into
    // [0°, 360°)) and the clamped wedge is reported, never silently dropped.
    expect(paint.startAngleDeg).toBeCloseTo(330, 10);
    expect(paint.endAngleDeg).toBeCloseTo(380, 10);
    expect(paint.endAngleDeg).toBeGreaterThan(paint.startAngleDeg);
    expect(warnings.join("\n")).toContain("이음선");
  });

  it("keeps sweep angles and warns under non-uniform scale", () => {
    const fill = sweepFill(0, 360);
    const { nodes, warnings } = transformSceneNodes([fill], scaleMat2d(2, 8));
    const paint = sweepPaintOf(nodes);
    expect(paint.center).toEqual([2, 8]);
    expect(paint.startAngleDeg).toBe(0);
    expect(paint.endAngleDeg).toBe(360);
    expect(warnings.join("\n")).toContain("sweep-gradient");
    expect(warnings.join("\n")).toContain("비균등");
  });

  it("reports unrepresentable text rotation instead of dropping it", () => {
    const text: SceneNodeIR = {
      id: "t1",
      kind: "text",
      opacity: 1,
      blend: "src-over",
      x: 10,
      y: 0,
      text: "컷",
      fontSizePx: 12,
      color: { r: 0, g: 0, b: 0, a: 1 },
      fontFamily: "sans-serif",
    };
    const { nodes, warnings } = transformSceneNodes([text], rotateMat2d(90));
    const [node] = nodes;
    if (node?.kind !== "text") throw new Error("expected text node");
    expect(node.x).toBeCloseTo(0, 12);
    expect(node.y).toBeCloseTo(10, 12);
    expect(node.fontSizePx).toBeCloseTo(12, 12);
    expect(warnings.join("\n")).toContain("text t1");
    expect(warnings.join("\n")).toContain("표현 불가");
  });

  it("is deterministic and never mutates its inputs", () => {
    const tree = [groupNode([strokeNode("s1", 2)], mixedPath)];
    const before = structuredClone(tree);
    const m = composeMat2d(rotateMat2d(30), scaleMat2d(2, 8));
    const first = transformSceneNodes(tree, m);
    const second = transformSceneNodes(tree, m);
    expect(second).toEqual(first);
    expect(tree).toEqual(before);
  });
});
