import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");

describe("studio stroke object-snap cache boundary", () => {
  it("wires the pure per-stroke cache into StudioPage object-snap hot path", () => {
    expect(page).toContain('from "./studio-stroke-object-snap-cache"');
    expect(page).toContain("resolveStudioStrokeObjectSnapTargets");
    expect(page).toContain("strokeObjectSnapCacheRef");
    expect(page).toContain("strokeObjectSnapTargetsFor(");
    // Contact end must drop the frozen target list so the next stroke recollects.
    expect(page).toContain("strokeObjectSnapCacheRef.current = null");
  });
});
