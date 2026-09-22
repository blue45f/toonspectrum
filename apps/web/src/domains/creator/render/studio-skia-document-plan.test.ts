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

it("does not bypass invisible frame clipping when only the frame paint has zero opacity", () => {
  const frame = { id: "panel", type: "frame", x: 0, y: 0, width: 20, height: 20, opacity: 0 } as El;
  const projector = createStudioSkiaDocumentProjector();
  expect(projector.project([frame, pen()])).toMatchObject({ supported: false, ownedDocumentIds: [], reason: "frame-clip-requires-compatibility" });
  expect(projector.project([{ ...frame, hidden: true }, pen()]).supported).toBe(true);
});
