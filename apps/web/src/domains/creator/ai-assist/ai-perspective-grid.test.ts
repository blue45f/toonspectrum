import { describe, expect, it } from "vitest";

import {
  generatePerspectiveGrid,
  suggestVanishingPoints,
} from "./ai-perspective-grid";

describe("generatePerspectiveGrid", () => {
  it("1점 투시는 소실점 1개에서 방사선을 만든다", () => {
    const lines = generatePerspectiveGrid({
      type: "one-point",
      width: 800,
      height: 600,
      vanishingPoints: [{ x: 400, y: 270 }],
    });
    const radial = lines.filter((l) => l.kind === "radial");
    // 360/15 = 24개 방사선
    expect(radial).toHaveLength(24);
    // 수평선 1개
    expect(lines.filter((l) => l.kind === "horizon")).toHaveLength(1);
  });

  it("2점 투시는 소실점 2개에서 방사선을 만든다", () => {
    const lines = generatePerspectiveGrid({
      type: "two-point",
      width: 800,
      height: 600,
      vanishingPoints: [
        { x: 120, y: 270 },
        { x: 680, y: 270 },
      ],
    });
    expect(lines.filter((l) => l.kind === "radial")).toHaveLength(48);
  });

  it("3점 투시는 72개 방사선을 만든다", () => {
    const lines = generatePerspectiveGrid({
      type: "three-point",
      width: 800,
      height: 600,
      vanishingPoints: suggestVanishingPoints("three-point", 800, 600),
    });
    expect(lines.filter((l) => l.kind === "radial")).toHaveLength(72);
  });

  it("모든 path가 유효한 SVG 형식이다", () => {
    const lines = generatePerspectiveGrid({
      type: "one-point",
      width: 800,
      height: 600,
      vanishingPoints: [{ x: 400, y: 270 }],
    });
    for (const line of lines) {
      expect(line.d).toMatch(/^M -?\d+(\.\d+)? -?\d+(\.\d+)? L /);
    }
  });

  it("방사선이 소실점에서 시작한다", () => {
    const lines = generatePerspectiveGrid({
      type: "one-point",
      width: 800,
      height: 600,
      vanishingPoints: [{ x: 400, y: 270 }],
    });
    const radial = lines.filter((l) => l.kind === "radial");
    expect(radial[0].d.startsWith("M 400 270")).toBe(true);
  });
});

describe("suggestVanishingPoints", () => {
  it("1점 투시는 중앙에 1개", () => {
    const vps = suggestVanishingPoints("one-point", 800, 600);
    expect(vps).toHaveLength(1);
    expect(vps[0].x).toBe(400);
  });

  it("2점 투시는 좌우에 2개", () => {
    const vps = suggestVanishingPoints("two-point", 800, 600);
    expect(vps).toHaveLength(2);
    expect(vps[0].x).toBeLessThan(vps[1].x);
  });

  it("3점 투시는 3개", () => {
    expect(suggestVanishingPoints("three-point", 800, 600)).toHaveLength(3);
  });
});
