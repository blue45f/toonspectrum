import { describe, expect, it } from "vitest";

import { createStudioSkiaDocumentHitIndex } from "./studio-skia-document-hit-index";

import type { El } from "../studio-element-model";

function image(
  id: string,
  x: number,
  y: number,
  width = 40,
  height = 30,
  rotation = 0,
): El {
  return {
    id,
    type: "image",
    src: `data:image/png;base64,${id}`,
    x,
    y,
    width,
    height,
    rotation,
  } as El;
}

function stroke(id: string, points: number[], width = 2): El {
  return {
    id,
    type: "draw",
    kind: "freehand",
    points,
    stroke: "#000000",
    strokeWidth: width,
  } as El;
}

describe("retained Skia document hit index", () => {
  it("resolves the topmost exact element and ignores hidden content", () => {
    const runtime = createStudioSkiaDocumentHitIndex();
    const back = image("back", 10, 10);
    const front = image("front", 10, 10);
    runtime.sync([back, { ...front, hidden: true }]);
    expect(runtime.resolve({ x: 20, y: 20 }, 1)?.id).toBe("back");
    runtime.sync([back, front]);
    expect(runtime.resolve({ x: 20, y: 20 }, 1)?.id).toBe("front");
    runtime.dispose();
  });

  it("does not accept empty space inside a diagonal stroke bounding box", () => {
    const runtime = createStudioSkiaDocumentHitIndex();
    runtime.sync([stroke("diagonal", [0, 0, 100, 100])]);
    expect(runtime.resolve({ x: 50, y: 50 }, 1)?.id).toBe("diagonal");
    expect(runtime.resolve({ x: 50, y: 0 }, 1)).toBeNull();
    runtime.dispose();
  });

  it("uses the element rotation when resolving box geometry", () => {
    const runtime = createStudioSkiaDocumentHitIndex();
    runtime.sync([image("rotated", 100, 100, 100, 20, 90)]);
    expect(runtime.resolve({ x: 90, y: 150 }, 1)?.id).toBe("rotated");
    expect(runtime.resolve({ x: 150, y: 110 }, 1)).toBeNull();
    runtime.dispose();
  });

  it("keeps one index for ten thousand elements and updates changed references", () => {
    const runtime = createStudioSkiaDocumentHitIndex();
    const elements = Array.from({ length: 10_000 }, (_, index) =>
      image(`image-${index}`, index * 2, 0, 1, 1)
    );
    const firstRegions = runtime.sync(elements);
    expect(firstRegions).toHaveLength(10_000);
    expect(runtime.stats()).toEqual({ size: 10_000, mutationSequence: 1 });
    expect(runtime.resolve({ x: 19_999, y: 0.5 }, 1)?.id).toBe("image-9999");

    expect(runtime.sync(elements)).toBe(firstRegions);
    expect(runtime.stats().mutationSequence).toBe(1);

    const replacement = image("image-9999", 40_000, 0, 1, 1);
    runtime.sync([...elements.slice(0, -1), replacement]);
    expect(runtime.stats()).toEqual({ size: 10_000, mutationSequence: 2 });
    expect(runtime.resolve({ x: 40_000.5, y: 0.5 }, 1)).toBe(replacement);

    runtime.sync([...elements.slice(0, -2), replacement]);
    // One removal plus one z-order update keeps deterministic topmost ordering.
    expect(runtime.stats()).toEqual({ size: 9_999, mutationSequence: 4 });
    runtime.dispose();
  });

  it("fails closed after disposal", () => {
    const runtime = createStudioSkiaDocumentHitIndex();
    runtime.sync([image("image", 0, 0)]);
    runtime.dispose();
    expect(runtime.sync([image("other", 0, 0)])).toEqual([]);
    expect(runtime.resolve({ x: 1, y: 1 }, 1)).toBeNull();
  });
});
