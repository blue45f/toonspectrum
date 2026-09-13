import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("floating controls startup boundary", () => {
  it("keeps public controls out of the eager application entry", () => {
    expect(source).not.toMatch(/import\s+\{[^}]*FloatingControls[^}]*\}\s+from/u);
    expect(source).toContain("const FloatingControls = lazy(() =>");
    expect(source).toContain('import("@/shared/components/FloatingControls")');
    expect(source).toContain("default: mod.FloatingControls");
  });

  it("suspends only the controls and preserves the public-only route boundary", () => {
    const controls = source.split("function WebFloatingControls()")[1]?.split("function StudioRouteImmersiveBridge()")[0] ?? "";
    expect(controls).toMatch(/<Suspense fallback=\{null\}>\s*<FloatingControls/u);
    expect(controls).toContain("</Suspense>");
    expect(controls).toContain('placement="bottom-right"');
    expect(controls).toContain("showSound={false}");
    expect(controls).toContain("showBgm={false}");
    expect(source).toContain("floatingControls={isolatedChrome ? null : <WebFloatingControls />}");
  });
});
