import { describe, expect, it } from "vitest";
import { resolveStudioBrushDockPresentation } from "./useStudioBrushDockLayout";

describe("brush dock available-space policy", () => {
  it.each([
    [1024, 88, 320, 240, "overlay"],
    [1180, 88, 320, 240, "docked"],
    [1279, 88, 320, 240, "docked"],
    [1280, 88, 320, 240, "docked"],
    [1440, 88, 600, 320, "overlay"],
    [1440, 88, 320, 240, "docked"],
  ] as const)("%ipx honors occupied panels rather than an arbitrary 1280px cutoff", (width, rail, inspector, brush, expected) => {
    expect(resolveStudioBrushDockPresentation(width, rail, inspector, brush)).toBe(expected);
  });
  it("preserves 480px of canvas at the exact available-space boundary", () => {
    expect(resolveStudioBrushDockPresentation(1139, 88, 332, 240)).toBe("overlay");
    expect(resolveStudioBrushDockPresentation(1140, 88, 332, 240)).toBe("docked");
  });
});
