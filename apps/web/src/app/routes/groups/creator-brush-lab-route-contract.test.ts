import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(new URL("./creator.routes.tsx", import.meta.url), "utf8");

const BRUSH_LAB_ROUTES = [
  "/brush-lab",
  "/studio/brush-lab",
  "/studio/work/:workId/brush-lab",
  "/studio/remix/:sourceWorkId/brush-lab",
] as const;

describe("Brush Studio V6 route contract", () => {
  it("keeps public, Studio, work and remix entry routes", () => {
    for (const path of BRUSH_LAB_ROUTES) {
      expect(SOURCE, path).toContain(`path: "${path}"`);
    }
  });

  it("declares the contextual Brush Studio routes before the /studio catch-all", () => {
    const catchAll = SOURCE.indexOf('path: "/studio/*"');
    expect(catchAll).toBeGreaterThan(0);
    for (const path of BRUSH_LAB_ROUTES.slice(1)) {
      expect(SOURCE.indexOf(`path: "${path}"`), path).toBeGreaterThan(0);
      expect(SOURCE.indexOf(`path: "${path}"`), path).toBeLessThan(catchAll);
    }
  });
});
