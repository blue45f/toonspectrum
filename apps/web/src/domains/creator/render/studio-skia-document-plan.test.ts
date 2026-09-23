import { describe, expect, it } from "vitest";
import type { El } from "../studio-element-model";
import { planStudioCausalInk } from "../studio-causal-ink";
import { resolveStudioCausalInkDrawContract } from "../brush/studio-draw-rendering";
import { compileStudioSkiaDocumentItem, createStudioSkiaDocumentProjector } from "./studio-skia-document-plan";

const pen = (id = "ink"): El => ({ id, type: "draw", mode: "pen", kind: "freehand", brush: "pen",
  points: [10, 10, 30, 20, 60, 40], pressures: [0.3, 0.6, 1], stroke: "#234567", strokeWidth: 12,
  sampleSpacing: 0, pressureModel: "linear-residual-path-v3", paintModel: "layered-flow-v1", opacity: 0.4,
} as El);

describe("GPU document projection", () => {
  it("uses the exact existing pressure and causal dab planner without rewriting source", () => {
    const el = pen(); const before = JSON.stringify(el);
    if (el.type !== "draw") throw new Error("fixture");
    const contract = resolveStudioCausalInkDrawContract(el);
    const expected = planStudioCausalInk({ points: contract.points, pressures: contract.pressures,
      minDistance: contract.minDistance, size: contract.strokeWidth, pressureModel: contract.pressureModel });
    const item = compileStudioSkiaDocumentItem(el)!;
    expect(item.ink?.dabs).toEqual(new Float32Array(expected.dabs.flatMap((dab) => [dab.x, dab.y, dab.radius])));
    expect(item.ink).toMatchObject({ union: true, opacity: 0.4 });
    expect(JSON.stringify(el)).toBe(before);
  });
  it("reuses stable element projections while replacing only edited strokes", () => {
    const projector = createStudioSkiaDocumentProjector(); const a = pen("a"); const b = pen("b");
    const first = projector.project([a, b]); const next = projector.project([a, { ...b, opacity: 0.7 }]);
    expect(next.items[0]).toBe(first.items[0]); expect(next.items[1]).not.toBe(first.items[1]);
  });
  it.each([
    { brush: "watercolor" }, { paintModel: "unsupported-model" }, { maskEnabled: true }, { clipBelow: true },
    { gradient: { enabled: true } }, { symmetry: { type: "vertical" } }, { points: [0, 0, NaN, 1] },
  ])("never silently omits or approximates unsupported content: %j", (patch) => {
    const projector = createStudioSkiaDocumentProjector();
    const plan = projector.project([pen(), { ...pen("other"), ...patch } as El]);
    expect(plan.supported).toBe(false); expect(plan.items).toEqual([]); expect(plan.ownedDocumentIds).toEqual([]);
  });
  it("keeps hidden unsupported elements and document IDs intact", () => {
    const projector = createStudioSkiaDocumentProjector();
    const plan = projector.project([pen("id:with:colons"), { ...pen(), brush: "watercolor", hidden: true } as El]);
    expect(plan.supported).toBe(true); expect(plan.ownedDocumentIds).toEqual(["id:with:colons"]);
  });
  it("rejects duplicated visible identifiers and clears its renderer-only cache", () => {
    const projector = createStudioSkiaDocumentProjector(); const element = pen();
    expect(projector.project([element, element]).supported).toBe(false);
    const first = projector.project([element]); projector.clear();
    expect(projector.project([element]).items[0]).not.toBe(first.items[0]);
  });
});

 it("keeps finalized eraser blend semantics without converting the original stroke", () => {
   const element = { ...pen(), mode: "eraser", brush: "eraser", paintModel: undefined } as El;
   const original = JSON.stringify(element);
   const item = compileStudioSkiaDocumentItem(element);
   expect(item?.ink).toMatchObject({ erase: true, union: false });
   expect(JSON.stringify(element)).toBe(original);
 });


it("releases removed renderer projections even when original history elements remain reachable", () => {
  const projector = createStudioSkiaDocumentProjector(); const a = pen("a"); const b = pen("b");
  const before = projector.project([a, b]);
  projector.project([b]);
  const restored = projector.project([a, b]);
  expect(restored.items[0]).not.toBe(before.items[0]);
  expect(restored.items[1]).toBe(before.items[1]);
  expect(restored.items[0]?.ink?.dabs).toEqual(before.items[0]?.ink?.dabs);
});

it("keeps legacy frame-opacity semantics on the compatibility boundary", () => {
  const frame = { id: "panel", type: "frame", x: 0, y: 0, width: 80, height: 80, opacity: 0 } as El;
  const projector = createStudioSkiaDocumentProjector();
  expect(projector.project([frame, pen()])).toMatchObject({
    supported: false,
    ownedDocumentIds: [],
    reason: "unsupported-frame:panel",
  });
  const hidden = projector.project([{ ...frame, hidden: true }, pen()]);
  expect(hidden.supported).toBe(true);
  expect(hidden.items[0]?.clip).toBeUndefined();
});

it("preserves transparent frame paint as a child clipping boundary", () => {
  const frame = { id: "panel", type: "frame", x: 0, y: 0, width: 80, height: 80,
    bgColor: "#ffffff00", stroke: "#00000000", strokeWidth: 0 } as El;
  const clipped = createStudioSkiaDocumentProjector().project([frame, pen()]);
  expect(clipped.supported).toBe(true);
  expect(clipped.items[0]?.panel?.fill.a).toBe(0);
  expect(clipped.items[1]?.clip).toEqual({ x: 0, y: 0, width: 80, height: 80 });
});

it("admits only exact static image semantics and preserves transform metadata", () => {
  const image = {
    id: "image", type: "image", src: "data:image/png;base64,AA==",
    x: 12, y: 34, width: 50, height: 60, rotation: 15, opacity: 0.75,
    flipped: true, flippedY: false,
  } as El;
  const item = compileStudioSkiaDocumentItem(image);
  expect(item?.image).toEqual({
    src: image.type === "image" ? image.src : "", x: 12, y: 34, width: 50, height: 60,
    rotation: 15, opacity: 0.75, flipX: true, flipY: false,
    skewX: 0, skewY: 0, cornerRadius: 0, blendMode: "source-over",
  });
  expect(createStudioSkiaDocumentProjector().project([{ ...image, blur: 2 } as El]).supported).toBe(false);
  expect(createStudioSkiaDocumentProjector().project([{ ...image, isAnimatedGif: true } as El]).supported).toBe(false);
  expect(createStudioSkiaDocumentProjector().project([{ ...image, src: "data:image/webp;base64,AA==" } as El]).supported).toBe(false);
});

it("preserves exact image blend, skew, rounded clip and shadow metadata", () => {
  const image = {
    id: "effect-image", type: "image", src: "data:image/png;base64,AA==",
    x: 12, y: 34, width: 80, height: 60, rotation: 15, opacity: 0.75,
    blendMode: "multiply", cornerRadius: 12, skewX: 15, skewY: -10,
    shadowColor: "#11223380", shadowBlur: 8,
    shadowOffsetX: 4, shadowOffsetY: -3, shadowOpacity: 0.6,
  } as El;
  expect(compileStudioSkiaDocumentItem(image)?.image).toMatchObject({
    blendMode: "multiply",
    cornerRadius: 12,
    skewX: expect.closeTo(Math.tan(15 * Math.PI / 180)),
    skewY: expect.closeTo(Math.tan(-10 * Math.PI / 180)),
    shadow: {
      blur: 8,
      offsetX: 4,
      offsetY: -3,
      opacity: 0.6,
      color: { r: expect.any(Number), g: expect.any(Number), b: expect.any(Number), a: expect.any(Number) },
    },
  });
});

it.each([
  { blendMode: "linear-dodge" },
  { cornerRadius: -1 },
  { skewX: 61 },
  { shadowColor: "not-a-color" },
  { shadowColor: "#000000", shadowOpacity: 2 },
])("keeps unsupported image effects on compatibility: %j", (patch) => {
  const image = {
    id: "image", type: "image", src: "data:image/png;base64,AA==",
    x: 0, y: 0, width: 20, height: 20, rotation: 0, ...patch,
  } as El;
  expect(createStudioSkiaDocumentProjector().project([image]).supported).toBe(false);
});

it("renders static frame paint and reprojects a child only when its panel changes", () => {
  const frame = { id: "panel", type: "frame", x: 0, y: 0, width: 80, height: 80, bgColor: "#fefefe" } as El;
  const child = { ...pen("child"), points: [10, 10, 20, 20, 30, 30] } as El;
  const projector = createStudioSkiaDocumentProjector();
  const first = projector.project([frame, child], "vivid");
  expect(first.supported).toBe(true);
  expect(first.items[0]?.panel).toMatchObject({ radius: 6, strokeWidth: 1.2, dashed: false });
  expect(first.items[1]?.clip).toEqual({ x: 0, y: 0, width: 80, height: 80 });
  const second = projector.project([frame, child], "vivid");
  expect(second.items[1]).toBe(first.items[1]);
  const rethemed = projector.project([frame, child], "soft");
  expect(rethemed.items[0]).not.toBe(first.items[0]);
  expect(rethemed.items[1]).toBe(first.items[1]);
  const resizedFrame = { ...frame, width: 60 };
  const third = projector.project([resizedFrame, child], "vivid");
  expect(third.items[1]).not.toBe(first.items[1]);
  expect(third.items[1]?.clip?.width).toBe(60);
});

it("admits exact horizontal solid text and preserves paragraph metadata", () => {
  const element = {
    id: "text",
    type: "text",
    text: "안녕하세요\nGPU 텍스트",
    x: 12,
    y: 34,
    width: 240,
    fontSize: 28,
    fill: "#224466",
    font: "Pretendard, sans-serif",
    fontStyle: "bold italic",
    align: "center",
    letterSpacing: 1.5,
    lineHeight: 1.25,
    rotation: 10,
    opacity: 0.8,
  } as El;
  expect(compileStudioSkiaDocumentItem(element)?.text).toMatchObject({
    text: element.type === "text" ? element.text : "",
    x: 12,
    y: 34,
    width: 240,
    fontSize: 28,
    rotation: 10,
    opacity: 0.8,
    align: "center",
    letterSpacing: 1.5,
    lineHeight: 1.25,
    weight: 700,
    italic: true,
    font: { family: "Pretendard" },
  });
});

it.each([
  { vertical: true },
  { rubySpans: [{ start: 0, end: 1, ruby: "안" }] },
  { rangeFormats: [{ start: 0, end: 1, style: {} }] },
  { fillType: "gradient", gradient: { enabled: true } },
  { stroke: "#000000", strokeWidth: 1 },
  { shadowColor: "#000000", shadowOpacity: 0.5 },
  { textPath: { type: "arc", bend: 0.5 } },
  { skewX: 10 },
  { text: "مرحبا بالعالم" },
])("keeps advanced text semantics on compatibility: %j", (patch) => {
  const element = {
    id: "text",
    type: "text",
    text: "텍스트",
    x: 0,
    y: 0,
    width: 120,
    fontSize: 20,
    fill: "#000000",
    rotation: 0,
    ...patch,
  } as El;
  const plan = createStudioSkiaDocumentProjector().project([element]);
  expect(plan.supported).toBe(false);
  expect(plan.items).toEqual([]);
});

it("projects an exact prepared specialist raster without moving its transform frame", () => {
  const image = {
    id: "filtered-image",
    type: "image",
    src: "data:image/png;base64,source",
    x: 12,
    y: 34,
    width: 80,
    height: 60,
    rotation: 15,
    opacity: 0.75,
    brightness: 0.2,
    cornerRadius: 12,
    flipped: true,
    skewX: 10,
  } as El;
  const prepared = {
    key: "specialist:v1",
    src: "blob:prepared",
    capturesLiveFrame: false,
    rasterBounds: { x: -4, y: -4, width: 88, height: 68 },
  };
  expect(compileStudioSkiaDocumentItem(image)).toBeNull();
  expect(compileStudioSkiaDocumentItem(image, "classic", prepared)?.image).toMatchObject({
    src: "blob:prepared",
    x: 12,
    y: 34,
    width: 80,
    height: 60,
    rotation: 15,
    opacity: 0.75,
    flipX: true,
    cornerRadius: 0,
    rasterBounds: { x: -4, y: -4, width: 88, height: 68 },
  });

  const projector = createStudioSkiaDocumentProjector();
  const first = projector.project([image], "classic", new Map([[image.id, prepared]]));
  expect(first.supported).toBe(true);
  expect(first.ownedDocumentIds).toEqual([image.id]);
  const cached = projector.project([image], "classic", new Map([[image.id, prepared]]));
  expect(cached.items[0]).toBe(first.items[0]);
  const changed = projector.project([image], "classic", new Map([[
    image.id,
    { ...prepared, key: "specialist:v2", src: "blob:prepared-v2" },
  ]]));
  expect(changed.items[0]).not.toBe(first.items[0]);
  expect(changed.items[0]?.image?.src).toBe("blob:prepared-v2");
});
