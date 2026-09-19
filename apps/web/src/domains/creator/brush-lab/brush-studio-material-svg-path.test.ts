import { describe, expect, it } from "vitest";

import { brushStudioV6MaterialMarksToSvg } from "./brush-studio-v6-material-engine";
import type { BrushStudioV6MaterialMark } from "./brush-studio-v6-material-engine";

const mark: BrushStudioV6MaterialMark = { kind: "bristle", shape: "capsule", x: 12, y: 24,
  radiusX: 5, radiusY: 1, angle: 0, opacity: 0.03, color: "#234567", secondaryMix: 0, height: 0 };

describe("material SVG uses Canvas-equivalent closed curved paths", () => {
  it("preserves a horizontal capsule's straight edges and circular caps", () => {
    const svg = brushStudioV6MaterialMarksToSvg([mark], "canvas-paths");
    expect(svg).toContain('d="M-4 -1 H4 A1 1 0 0 1 5 0 V0 A1 1 0 0 1 4 1 H-4 A1 1 0 0 1 -5 0 V0 A1 1 0 0 1 -4 -1 Z"');
    expect(svg).toContain('opacity="0.03"');
    expect(svg).toContain('transform="translate(12 24) rotate(0)"');
    expect(svg).toContain('fill="#234567"');
    expect(svg).not.toContain("<rect");
  });

  it("uses the shorter radius for a vertical capsule too", () => {
    const svg = brushStudioV6MaterialMarksToSvg([{ ...mark, radiusX: 1, radiusY: 5 }], "canvas-paths");
    expect(svg).toContain('d="M0 -5 H0 A1 1 0 0 1 1 -4 V4 A1 1 0 0 1 0 5 H0 A1 1 0 0 1 -1 4 V-4 A1 1 0 0 1 0 -5 Z"');
  });
  it.each(["ellipse", "ring"] as const)("keeps %s geometry and fill/stroke semantics", (shape) => {
    const svg = brushStudioV6MaterialMarksToSvg([{ ...mark, shape, angle: Math.PI / 2 }], "canvas-paths");
    expect(svg).toContain('d="M5 0 A5 1 0 0 1 -5 0 A5 1 0 0 1 5 0 Z"');
    expect(svg).toContain("rotate(90)");
    expect(svg).not.toContain("<ellipse");
    if (shape === "ring") {
      expect(svg).toContain('fill="none" stroke="#234567" stroke-width="0.3"');
    } else expect(svg).toContain('fill="#234567"');
  });

  it("does not change rectangular contact output or mutate source marks", () => {
    const rect = { ...mark, shape: "rect" as const };
    const before = JSON.stringify(rect);
    expect(brushStudioV6MaterialMarksToSvg([rect], "canvas-paths")).toBe(
      '<rect transform="translate(12 24) rotate(0)" opacity="0.03" x="-5" y="-1" width="10" height="2" fill="#234567"/>',
    );
    expect(JSON.stringify(rect)).toBe(before);
  });
});
