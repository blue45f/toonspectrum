import { describe, expect, it } from "vitest";

import {
  createStudioReferenceBoardDocument,
  createStudioReferenceBoardItem,
  type StudioReferenceBoardItem,
} from "./studio-reference-board";
import { arrangeStudioReferenceCanvas } from "./studio-reference-canvas-layout";

function item(id: string, index: number): StudioReferenceBoardItem {
  const result = createStudioReferenceBoardItem({
    id,
    asset: { sha256: `sha256:${String(index + 1).repeat(64)}` },
    view: {
      centerX: 0.05 + index * 0.08,
      centerY: 0.9 - index * 0.06,
      zoom: 1.75,
      rotationDeg: index * 13,
      flipX: index % 2 === 0,
      flipY: false,
      opacity: 0.7,
      grayscale: index % 2 === 1,
    },
  });
  if (!result) throw new Error("reference fixture should be valid");
  return result;
}

describe("arrangeStudioReferenceCanvas", () => {
  it("keeps an empty canvas referentially stable", () => {
    const document = createStudioReferenceBoardDocument();
    expect(arrangeStudioReferenceCanvas(document)).toBe(document);
  });

  it("creates a centered mood-board grid while preserving identity and visual flags", () => {
    const document = createStudioReferenceBoardDocument([
      item("one", 0),
      item("two", 1),
      item("three", 2),
      item("four", 3),
      item("five", 4),
    ]);

    const arranged = arrangeStudioReferenceCanvas(document);

    expect(arranged).not.toBe(document);
    expect(arranged.items.map((candidate) => candidate.id)).toEqual([
      "one", "two", "three", "four", "five",
    ]);
    expect(arranged.items.every((candidate) => candidate.view.rotationDeg === 0)).toBe(true);
    expect(arranged.items.every((candidate) => candidate.view.zoom <= 1)).toBe(true);
    expect(arranged.items[0]?.view.flipX).toBe(true);
    expect(arranged.items[1]?.view.grayscale).toBe(true);
    expect(arranged.items[0]?.view.opacity).toBe(0.7);

    const lastRow = arranged.items.slice(3);
    const lastRowCenter = lastRow.reduce((sum, candidate) => sum + candidate.view.centerX, 0)
      / lastRow.length;
    expect(lastRowCenter).toBeCloseTo(0.5, 8);
  });
});
