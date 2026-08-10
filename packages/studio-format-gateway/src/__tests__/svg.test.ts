import { sceneIRSchema } from "@toonspectrum/studio-project-model";
import { describe, expect, it } from "vitest";

import { SvgParseError, parsePathData, parseSvgToScene } from "../svg";

import type {
  FillPathNodeIR,
  PathVerbIR,
  SceneNodeIR,
  StrokePathNodeIR,
} from "@toonspectrum/studio-project-model";

function flatten(nodes: SceneNodeIR[]): SceneNodeIR[] {
  return nodes.flatMap((node) =>
    node.kind === "group" ? [node, ...flatten(node.children)] : [node],
  );
}

function fills(nodes: SceneNodeIR[]): FillPathNodeIR[] {
  return flatten(nodes).filter((node): node is FillPathNodeIR => node.kind === "fill-path");
}

function strokes(nodes: SceneNodeIR[]): StrokePathNodeIR[] {
  return flatten(nodes).filter(
    (node): node is StrokePathNodeIR => node.kind === "stroke-path",
  );
}

function endPoint(verb: PathVerbIR): [number, number] {
  if (verb.v === "Z") throw new Error("Z has no endpoint");
  return [verb.x, verb.y];
}

describe("svg importer: shapes", () => {
  it("converts rect/circle/ellipse/line/polyline/polygon into path nodes", () => {
    const { scene, warnings } = parseSvgToScene(`
      <svg width="100" height="100">
        <rect x="10" y="20" width="30" height="40"/>
        <circle cx="50" cy="50" r="10" fill="none" stroke="red"/>
        <ellipse cx="50" cy="50" rx="20" ry="10"/>
        <line x1="0" y1="0" x2="10" y2="10" stroke="blue"/>
        <polyline points="0,0 10,0 10,10" fill="none" stroke="black"/>
        <polygon points="0 0 10 0 5 10"/>
      </svg>`);
    expect(scene.width).toBe(100);
    expect(scene.height).toBe(100);
    expect(fills(scene.nodes)).toHaveLength(3); // rect, ellipse, polygon
    expect(strokes(scene.nodes)).toHaveLength(3); // circle, line, polyline
    expect(warnings).toEqual([]);

    const rect = fills(scene.nodes)[0];
    expect(rect?.path.verbs).toEqual([
      { v: "M", x: 10, y: 20 },
      { v: "L", x: 40, y: 20 },
      { v: "L", x: 40, y: 60 },
      { v: "L", x: 10, y: 60 },
      { v: "Z" },
    ]);
    const polygon = fills(scene.nodes)[2];
    expect(polygon?.path.verbs.at(-1)).toEqual({ v: "Z" });
  });

  it("builds rounded rects and circles from cubic segments only", () => {
    const { scene } = parseSvgToScene(`
      <svg width="100" height="100">
        <rect x="0" y="0" width="60" height="40" rx="8"/>
        <circle cx="50" cy="50" r="25"/>
      </svg>`);
    const [rounded, circle] = fills(scene.nodes);
    const cubicCount = (verbs: readonly PathVerbIR[]): number =>
      verbs.filter((verb) => verb.v === "C").length;
    expect(cubicCount(rounded?.path.verbs ?? [])).toBe(4);
    expect(cubicCount(circle?.path.verbs ?? [])).toBe(4);
    // ry defaults to rx; corner arc starts at x + rx.
    expect(rounded?.path.verbs[0]).toEqual({ v: "M", x: 8, y: 0 });
    // Circle starts at (cx + r, cy) and closes.
    expect(circle?.path.verbs[0]).toEqual({ v: "M", x: 75, y: 50 });
    expect(circle?.path.verbs.at(-1)).toEqual({ v: "Z" });
  });
});

describe("svg importer: path data grammar", () => {
  it("parses every absolute command (M L H V C S Q T A Z)", () => {
    const verbs = parsePathData(
      "M10 10 L20 10 H30 V20 C30 25 25 30 20 30 S10 25 10 20 Q10 15 15 15 T25 15 A5 5 0 0 1 35 15 Z",
    );
    expect(verbs[0]).toEqual({ v: "M", x: 10, y: 10 });
    expect(verbs[1]).toEqual({ v: "L", x: 20, y: 10 });
    expect(verbs[2]).toEqual({ v: "L", x: 30, y: 10 }); // H
    expect(verbs[3]).toEqual({ v: "L", x: 30, y: 20 }); // V
    expect(verbs[4]?.v).toBe("C");
    expect(verbs[5]?.v).toBe("C"); // S
    expect(verbs[6]?.v).toBe("Q");
    expect(verbs[7]?.v).toBe("Q"); // T
    expect(verbs.at(-1)).toEqual({ v: "Z" });
    const arcVerbs = verbs.slice(8, -1);
    expect(arcVerbs.every((verb) => verb.v === "C")).toBe(true);
    expect(endPoint(arcVerbs.at(-1) as PathVerbIR)).toEqual([35, 15]);
  });

  it("resolves relative commands cumulatively with S/T reflections", () => {
    const verbs = parsePathData(
      "m10 10 l5 0 q5 0 5 5 t0 10 c0 5 -5 5 -5 10 s-5 5 -10 5 z",
    );
    expect(verbs).toEqual([
      { v: "M", x: 10, y: 10 },
      { v: "L", x: 15, y: 10 },
      { v: "Q", cx: 20, cy: 10, x: 20, y: 15 },
      { v: "Q", cx: 20, cy: 20, x: 20, y: 25 }, // t reflects (20,10) about (20,15)
      { v: "C", c1x: 20, c1y: 30, c2x: 15, c2y: 30, x: 15, y: 35 },
      { v: "C", c1x: 15, c1y: 40, c2x: 10, c2y: 40, x: 5, y: 40 }, // s reflects c2
      { v: "Z" },
    ]);
  });

  it("treats extra M coordinates as implicit linetos and packed arc flags", () => {
    expect(parsePathData("M0 0 10 0 10 10")).toEqual([
      { v: "M", x: 0, y: 0 },
      { v: "L", x: 10, y: 0 },
      { v: "L", x: 10, y: 10 },
    ]);
    const arc = parsePathData("M0 0 a25 25 0 1150 0");
    expect(arc.every((verb, index) => index === 0 || verb.v === "C")).toBe(true);
    expect(endPoint(arc.at(-1) as PathVerbIR)).toEqual([50, 0]);
  });

  it("converts arcs to cubics that stay on the circle", () => {
    const verbs = parsePathData("M0 25 A25 25 0 1 1 50 25");
    const center = { x: 25, y: 25 };
    let current: [number, number] = [0, 25];
    for (const verb of verbs.slice(1)) {
      if (verb.v !== "C") throw new Error(`unexpected verb ${verb.v}`);
      for (const t of [0.25, 0.5, 0.75, 1]) {
        const u = 1 - t;
        const x =
          u ** 3 * current[0] +
          3 * u ** 2 * t * verb.c1x +
          3 * u * t ** 2 * verb.c2x +
          t ** 3 * verb.x;
        const y =
          u ** 3 * current[1] +
          3 * u ** 2 * t * verb.c1y +
          3 * u * t ** 2 * verb.c2y +
          t ** 3 * verb.y;
        expect(Math.hypot(x - center.x, y - center.y)).toBeCloseTo(25, 1);
      }
      current = [verb.x, verb.y];
    }
    expect(current).toEqual([50, 25]);
  });

  it("rejects malformed path data with a positioned SvgParseError", () => {
    expect(() => parseSvgToScene('<svg width="10" height="10"><path d="M 10 x"/></svg>')).toThrow(
      SvgParseError,
    );
    expect(() => parsePathData("10 10 L0 0")).toThrow(/must start with a command/);
  });
});

describe("svg importer: transforms are baked into coordinates", () => {
  it("bakes rotate(90) exactly (including control points)", () => {
    const { scene } = parseSvgToScene(`
      <svg width="100" height="100">
        <rect x="10" y="20" width="30" height="40" transform="rotate(90)"/>
        <path d="M10 0 Q20 0 20 10" fill="none" stroke="black" transform="rotate(90 50 50)"/>
      </svg>`);
    // rotate(90) about origin: (x, y) -> (-y, x)
    const rectMove = fills(scene.nodes)[0]?.path.verbs[0];
    if (rectMove?.v !== "M") throw new Error("expected M verb");
    expect(rectMove.x).toBeCloseTo(-20, 10);
    expect(rectMove.y).toBeCloseTo(10, 10);
    // rotate(90 50 50): (10, 0) -> (100, 10); control (20, 0) -> (100, 20)
    const q = strokes(scene.nodes)[0]?.path.verbs;
    expect(q?.[0]?.v).toBe("M");
    const [mx, my] = endPoint(q?.[0] as PathVerbIR);
    expect(mx).toBeCloseTo(100, 10);
    expect(my).toBeCloseTo(10, 10);
    const quad = q?.[1];
    if (quad?.v !== "Q") throw new Error("expected Q verb");
    expect(quad.cx).toBeCloseTo(100, 10);
    expect(quad.cy).toBeCloseTo(20, 10);
  });

  it("composes nested group/shape transforms and scales stroke width", () => {
    const { scene } = parseSvgToScene(`
      <svg width="100" height="100">
        <g transform="translate(10 20)">
          <path d="M0 0 L10 0" transform="scale(2)" fill="none" stroke="black" stroke-width="3"/>
        </g>
      </svg>`);
    const stroke = strokes(scene.nodes)[0];
    expect(stroke?.path.verbs).toEqual([
      { v: "M", x: 10, y: 20 },
      { v: "L", x: 30, y: 20 },
    ]);
    expect(stroke?.strokeWidth).toBeCloseTo(6);
  });

  it("maps viewBox units into the pixel viewport", () => {
    const { scene } = parseSvgToScene(`
      <svg width="200" height="100" viewBox="0 0 100 50">
        <rect x="10" y="10" width="10" height="10"/>
      </svg>`);
    expect(scene.width).toBe(200);
    expect(scene.height).toBe(100);
    expect(fills(scene.nodes)[0]?.path.verbs[0]).toEqual({ v: "M", x: 20, y: 20 });
  });
});

describe("svg importer: paint and style", () => {
  it("lets style=\"\" win over presentation attributes", () => {
    const { scene } = parseSvgToScene(`
      <svg width="10" height="10">
        <rect width="10" height="10" fill="red" style="fill: #00f"/>
      </svg>`);
    expect(fills(scene.nodes)[0]?.paint).toEqual({
      kind: "solid",
      color: { r: 0, g: 0, b: 1, a: 1 },
    });
  });

  it("parses #rgb/#rrggbb/rgb()/named colors and currentColor", () => {
    const { scene } = parseSvgToScene(
      `<svg width="10" height="10">
        <rect width="1" height="1" fill="#f00"/>
        <rect width="1" height="1" fill="#00ff00"/>
        <rect width="1" height="1" fill="rgb(0, 0, 255)"/>
        <rect width="1" height="1" fill="teal"/>
        <rect width="1" height="1" fill="currentColor"/>
      </svg>`,
      { currentColor: { r: 1, g: 0, b: 1, a: 1 } },
    );
    const colors = fills(scene.nodes).map((node) =>
      node.paint.kind === "solid" ? node.paint.color : null,
    );
    expect(colors).toEqual([
      { r: 1, g: 0, b: 0, a: 1 },
      { r: 0, g: 1, b: 0, a: 1 },
      { r: 0, g: 0, b: 1, a: 1 },
      { r: 0, g: 128 / 255, b: 128 / 255, a: 1 },
      { r: 1, g: 0, b: 1, a: 1 },
    ]);
  });

  it("wraps fill+stroke in a group when element opacity < 1", () => {
    const { scene } = parseSvgToScene(`
      <svg width="10" height="10">
        <rect width="10" height="10" fill="red" stroke="blue" opacity="0.5" fill-opacity="0.8"/>
        <rect width="10" height="10" fill="red" opacity="0.5"/>
      </svg>`);
    const group = scene.nodes[0];
    if (group?.kind !== "group") throw new Error("expected an opacity group");
    expect(group.opacity).toBeCloseTo(0.5);
    expect(group.children).toHaveLength(2);
    const groupedFill = group.children[0];
    if (groupedFill?.kind !== "fill-path") throw new Error("expected fill child");
    expect(groupedFill.opacity).toBeCloseTo(0.8);
    // Single-node case multiplies opacity instead of wrapping.
    const solo = scene.nodes[1];
    if (solo?.kind !== "fill-path") throw new Error("expected a bare fill node");
    expect(solo.opacity).toBeCloseTo(0.5);
  });

  it("maps userSpaceOnUse gradients through the element transform", () => {
    const { scene, warnings } = parseSvgToScene(`
      <svg width="200" height="200">
        <defs>
          <linearGradient id="lg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0">
            <stop offset="0" stop-color="#f00"/>
            <stop offset="1" stop-color="#00f" stop-opacity="0.5"/>
          </linearGradient>
          <radialGradient id="rg" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="10">
            <stop offset="0" stop-color="white"/>
            <stop offset="1" stop-color="black"/>
          </radialGradient>
        </defs>
        <rect width="100" height="100" fill="url(#lg)"/>
        <rect width="100" height="100" fill="url(#rg)" transform="scale(2)"/>
      </svg>`);
    expect(warnings).toEqual([]);
    const [linear, radial] = fills(scene.nodes).map((node) => node.paint);
    expect(linear).toEqual({
      kind: "linear-gradient",
      from: [0, 0],
      to: [100, 0],
      stops: [
        { offset: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
        { offset: 1, color: { r: 0, g: 0, b: 1, a: 0.5 } },
      ],
    });
    if (radial?.kind !== "radial-gradient") throw new Error("expected radial paint");
    expect(radial.center).toEqual([100, 100]);
    expect(radial.radius).toBeCloseTo(20);
  });

  it("approximates objectBoundingBox gradients from the baked bbox", () => {
    const { scene } = parseSvgToScene(`
      <svg width="100" height="100">
        <linearGradient id="g">
          <stop offset="0%" stop-color="red"/>
          <stop offset="100%" stop-color="blue"/>
        </linearGradient>
        <rect x="10" y="10" width="80" height="40" fill="url(#g)"/>
      </svg>`);
    const paint = fills(scene.nodes)[0]?.paint;
    if (paint?.kind !== "linear-gradient") throw new Error("expected linear paint");
    // Default 0%..100% along x maps onto the shape bbox edge.
    expect(paint.from).toEqual([10, 10]);
    expect(paint.to).toEqual([90, 10]);
  });
});

describe("svg importer: clipPath", () => {
  it("turns clip-path references into group clips with baked coordinates", () => {
    const { scene } = parseSvgToScene(`
      <svg width="100" height="100">
        <defs>
          <clipPath id="c"><circle cx="50" cy="50" r="40"/></clipPath>
        </defs>
        <rect width="100" height="100" fill="black" clip-path="url(#c)"/>
      </svg>`);
    const group = scene.nodes[0];
    if (group?.kind !== "group") throw new Error("expected a clip group");
    expect(group.clip).not.toBeNull();
    expect(group.clip?.verbs[0]).toEqual({ v: "M", x: 90, y: 50 });
    expect(group.children[0]?.kind).toBe("fill-path");
  });

  it("transforms the clip geometry by the referencing element's CTM", () => {
    const { scene } = parseSvgToScene(`
      <svg width="100" height="100">
        <clipPath id="c"><rect x="0" y="0" width="10" height="10"/></clipPath>
        <g transform="translate(20 30)">
          <rect width="50" height="50" clip-path="url(#c)"/>
        </g>
      </svg>`);
    const outer = scene.nodes[0];
    if (outer?.kind !== "group") throw new Error("expected outer group");
    const clipGroup = outer.children[0];
    if (clipGroup?.kind !== "group") throw new Error("expected clip group");
    expect(clipGroup.clip?.verbs[0]).toEqual({ v: "M", x: 20, y: 30 });
  });

  it("drops elements whose resolved clip is empty and warns", () => {
    const { scene, warnings } = parseSvgToScene(`
      <svg width="100" height="100">
        <clipPath id="empty"></clipPath>
        <rect width="100" height="100" clip-path="url(#empty)"/>
      </svg>`);
    expect(scene.nodes).toEqual([]);
    expect(warnings.some((warning) => warning.includes("#empty"))).toBe(true);
  });
});

describe("svg importer: loss surfacing", () => {
  it("registers unsupported elements and attributes without throwing", () => {
    const { scene, unsupported } = parseSvgToScene(`
      <svg width="100" height="100">
        <text x="10" y="10">hi</text>
        <use href="#missing"/>
        <image href="a.png"/>
        <rect width="10" height="10" stroke="red" stroke-dasharray="4 2" filter="url(#f)"/>
      </svg>`);
    expect(unsupported).toEqual(
      expect.arrayContaining([
        "element:text",
        "element:use",
        "element:image",
        "attr:stroke-dasharray",
        "attr:filter",
      ]),
    );
    // The rect itself still imports (dasharray/filter are surfaced, not fatal).
    expect(fills(scene.nodes)).toHaveLength(1);
  });

  it("warns on unresolved paint and clip references", () => {
    const { scene, warnings } = parseSvgToScene(`
      <svg width="100" height="100">
        <rect width="10" height="10" fill="url(#nope)"/>
        <rect width="10" height="10" fill="url(#gone) red"/>
        <rect width="10" height="10" clip-path="url(#lost)" fill="black"/>
      </svg>`);
    expect(warnings.some((warning) => warning.includes("url(#nope)"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("url(#gone)"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("url(#lost)"))).toBe(true);
    // Unresolved fill without fallback drops the node; fallback color keeps it.
    const kept = fills(scene.nodes);
    expect(kept).toHaveLength(2);
    expect(kept[0]?.paint).toEqual({ kind: "solid", color: { r: 1, g: 0, b: 0, a: 1 } });
  });

  it("decodes the five predefined entities in attribute values", () => {
    const { scene } = parseSvgToScene(
      '<svg width="10" height="10"><rect id="a&amp;b&lt;&gt;&quot;&apos;" width="10" height="10"/></svg>',
    );
    expect(scene.nodes[0]?.id).toContain("a&b<>\"'");
  });

  it("throws SvgParseError with line/column on malformed XML", () => {
    let caught: unknown;
    try {
      parseSvgToScene('<svg width="10" height="10">\n  <rect width="10" height="10">\n</svg>');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SvgParseError);
    const parseError = caught as SvgParseError;
    expect(parseError.line).toBe(3);
    expect(parseError.column).toBeGreaterThan(0);
    expect(parseError.message).toContain("line 3");

    expect(() => parseSvgToScene('<div width="10"/>')).toThrow(/expected <svg>/);
    expect(() => parseSvgToScene('<svg width="10" height="10"><rect width=10/></svg>')).toThrow(
      SvgParseError,
    );
  });

  it("returns scenes that survive a second canonical schema parse", () => {
    const { scene } = parseSvgToScene(`
      <svg width="64" height="64" viewBox="0 0 16 16">
        <defs>
          <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="16" y2="16">
            <stop offset="0" stop-color="#ff8800"/>
            <stop offset="1" stop-color="#8800ff"/>
          </linearGradient>
        </defs>
        <g opacity="0.9">
          <path d="M8 1 L10 6 L15 6 L11 9 L12.5 14 L8 11 L3.5 14 L5 9 L1 6 L6 6 Z" fill="url(#g)" stroke="black" stroke-width="0.5"/>
        </g>
      </svg>`);
    expect(sceneIRSchema.parse(scene)).toEqual(scene);
    expect(scene.width).toBe(64);
  });
});
