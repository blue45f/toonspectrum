import { describe, expect, it } from "vitest";

import {
  mapStudioDocumentPointToAutoColorSeed,
  studioAutoColorCanvasSeedId,
} from "./studio-auto-color-hints-canvas-seed";

const FRAME = { x: 100, y: 50, width: 200, height: 100 } as const;

describe("mapStudioDocumentPointToAutoColorSeed", () => {
  it("maps the top-left corner of an axis-aligned image to planner origin", () => {
    expect(
      mapStudioDocumentPointToAutoColorSeed({
        documentX: 100,
        documentY: 50,
        image: FRAME,
        pixelWidth: 40,
        pixelHeight: 20,
      }),
    ).toEqual({ x: 0, y: 0 });
  });

  it("maps the interior proportionally into pixel space", () => {
    const sample = mapStudioDocumentPointToAutoColorSeed({
      documentX: 200, // mid X of frame
      documentY: 100, // mid Y of frame
      image: FRAME,
      pixelWidth: 40,
      pixelHeight: 20,
    });
    expect(sample).not.toBeNull();
    expect(sample!.x).toBeCloseTo(20, 5);
    expect(sample!.y).toBeCloseTo(10, 5);
  });

  it("returns null outside the image frame", () => {
    expect(
      mapStudioDocumentPointToAutoColorSeed({
        documentX: 50,
        documentY: 50,
        image: FRAME,
        pixelWidth: 40,
        pixelHeight: 20,
      }),
    ).toBeNull();
  });

  it("fails closed for non-trivial rotation and flips", () => {
    expect(
      mapStudioDocumentPointToAutoColorSeed({
        documentX: 150,
        documentY: 80,
        image: { ...FRAME, rotation: 45 },
        pixelWidth: 40,
        pixelHeight: 20,
      }),
    ).toBeNull();
    expect(
      mapStudioDocumentPointToAutoColorSeed({
        documentX: 150,
        documentY: 80,
        image: { ...FRAME, flipped: true },
        pixelWidth: 40,
        pixelHeight: 20,
      }),
    ).toBeNull();
  });

  it("supports 180° rotation as an axis-aligned special case", () => {
    const sample = mapStudioDocumentPointToAutoColorSeed({
      documentX: 100,
      documentY: 50,
      image: { ...FRAME, rotation: 180 },
      pixelWidth: 40,
      pixelHeight: 20,
    });
    // 180° maps frame origin to the opposite planner corner.
    expect(sample).not.toBeNull();
    expect(sample!.x).toBeCloseTo(40 - 1e-6, 4);
    expect(sample!.y).toBeCloseTo(20 - 1e-6, 4);
  });
});

describe("studioAutoColorCanvasSeedId", () => {
  it("builds a stable ordered id", () => {
    expect(studioAutoColorCanvasSeedId(0)).toBe("canvas-scribble-0");
    expect(studioAutoColorCanvasSeedId(3)).toBe("canvas-scribble-3");
  });
});
