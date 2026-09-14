import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("public floating controls startup boundary", () => {
  it("keeps public-only settings out of the static app and Studio graph", () => {
    expect(source).not.toMatch(/^import\s+.*from "@\/shared\/components\/FloatingControls"/mu);
    expect(source).toContain("const FloatingControls = lazy(() =>");
    expect(source).toContain('import("@/shared/components/FloatingControls")');
    expect(source).toContain("default: mod.FloatingControls");
  });

  it("loads only in public chrome with a local suspense boundary", () => {
    expect(source).toContain("const isolatedChrome = studioImmersive || adminChrome;");
    expect(source).toContain("floatingControls={isolatedChrome ? null : <WebFloatingControls />}");
    const controls = source.split("function WebFloatingControls()")[1]?.split("/**")[0];
    expect(controls).toMatch(/<Suspense fallback=\{null\}>\s*<FloatingControls/u);
    expect(controls).toContain("</Suspense>");
    expect(controls).toContain('placement="bottom-right"');
  });
});
