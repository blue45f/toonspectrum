import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  pickObjectIdAtPoint,
  selectIdsByMarquee,
} from "./studio-selection";

describe("RBush product hit path (selectIdsByMarquee / pickObjectIdAtPoint)", () => {
  it("selects marquee hits through the RBush-backed selectIdsByMarquee used by StudioPage", () => {
    const items = [
      { id: "a", x: 0, y: 0, w: 10, h: 10 },
      { id: "b", x: 20, y: 20, w: 10, h: 10 },
      { id: "c", x: 5, y: 5, w: 10, h: 10 },
      { id: "far", x: 200, y: 200, w: 5, h: 5 },
    ];
    const hits = selectIdsByMarquee(
      items,
      (item) => ({ x: item.x, y: item.y, w: item.w, h: item.h }),
      { x: 0, y: 0, w: 18, h: 18 },
    );
    expect(hits.sort()).toEqual(["a", "c"]);
  });

  it("picks the topmost document object at a point through RBush", () => {
    const items = [
      { id: "back", x: 0, y: 0, w: 100, h: 100 },
      { id: "front", x: 10, y: 10, w: 20, h: 20 },
      { id: "side", x: 80, y: 80, w: 10, h: 10 },
    ];
    // Higher zOrder is later in the list for our rebuild mapping (index as zOrder).
    const id = pickObjectIdAtPoint(
      items,
      (item) => ({ x: item.x, y: item.y, w: item.w, h: item.h }),
      { x: 15, y: 15 },
    );
    expect(id).toBe("front");
    expect(pickObjectIdAtPoint(
      items,
      (item) => ({ x: item.x, y: item.y, w: item.w, h: item.h }),
      { x: 500, y: 500 },
    )).toBeNull();
  });

  it("StudioPage marquee completion calls selectIdsByMarquee (RBush primary path)", () => {
    const page = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");
    expect(page).toContain("selectIdsByMarquee");
    expect(page).toMatch(/const hitIds = selectIdsByMarquee\(/u);
    const selection = readFileSync(new URL("./studio-selection.ts", import.meta.url), "utf8");
    expect(selection).toContain('from "./studio-engine-scene-spatial-index"');
    expect(selection).toContain("createStudioEngineSceneSpatialIndex");
    expect(selection).toContain("index.search");
    expect(selection).toContain("index.hitTestPoint");
  });
});
