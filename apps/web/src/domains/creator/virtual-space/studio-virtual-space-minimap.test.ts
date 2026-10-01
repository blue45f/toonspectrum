import { describe, expect, it } from "vitest";

import {
  clampToWorld,
  createMinimapViewport,
  minimapContains,
  minimapToWorld,
  minimapZoneAriaLabel,
  minimapZoneKindFor,
  minimapZonePaletteFor,
  minimapZonePolygonPoints,
  minimapZoneRect,
  officeZonesToMinimapZones,
  worldToMinimap,
} from "./studio-virtual-space-minimap";
import { STUDIO_DEFAULT_OFFICE_ZONES } from "./studio-virtual-space-office-zones";

const WORLD = { width: 1280, height: 960 };
const VIEW = { width: 260, height: 200 };

describe("createMinimapViewport", () => {
  it("종횡비를 유지하며 월드를 뷰 안에 맞춘다", () => {
    const viewport = createMinimapViewport(WORLD.width, WORLD.height, VIEW.width, VIEW.height);
    // scale = min((260-8)/1280, (200-8)/960) = min(0.196875, 0.2)
    expect(viewport.scale).toBeCloseTo(0.196875, 6);
    expect(viewport.offsetX).toBeCloseTo((VIEW.width - WORLD.width * viewport.scale) / 2, 6);
    expect(viewport.offsetY).toBeCloseTo((VIEW.height - WORLD.height * viewport.scale) / 2, 6);
    // 월드 전체가 뷰 안에 들어간다
    const bottomRight = worldToMinimap(viewport, { x: WORLD.width, y: WORLD.height });
    expect(bottomRight.x).toBeLessThanOrEqual(VIEW.width);
    expect(bottomRight.y).toBeLessThanOrEqual(VIEW.height);
  });

  it("잘못된 입력에도 안전한 기본값을 쓴다", () => {
    const viewport = createMinimapViewport(0, -10, 100, 100);
    expect(Number.isFinite(viewport.scale)).toBe(true);
    expect(viewport.scale).toBeGreaterThan(0);
  });
});

describe("worldToMinimap / minimapToWorld", () => {
  it("서로 역변환이다", () => {
    const viewport = createMinimapViewport(WORLD.width, WORLD.height, VIEW.width, VIEW.height);
    const points = [
      { x: 0, y: 0 },
      { x: 640, y: 480 },
      { x: 1280, y: 960 },
      { x: 40, y: 300 },
    ];
    for (const point of points) {
      const roundTrip = minimapToWorld(viewport, worldToMinimap(viewport, point));
      expect(roundTrip.x).toBeCloseTo(point.x, 1);
      expect(roundTrip.y).toBeCloseTo(point.y, 1);
    }
  });
});

describe("clampToWorld", () => {
  it("텔레포트 목적지를 월드 안으로 제한한다", () => {
    const viewport = createMinimapViewport(WORLD.width, WORLD.height, VIEW.width, VIEW.height);
    const clamped = clampToWorld(viewport, { x: 9999, y: -50 });
    expect(clamped.x).toBeLessThanOrEqual(WORLD.width - 20);
    expect(clamped.y).toBeGreaterThanOrEqual(20);
    const inside = clampToWorld(viewport, { x: 300, y: 300 });
    expect(inside).toEqual({ x: 300, y: 300 });
  });
});

describe("minimapZoneRect / minimapZonePolygonPoints", () => {
  it("구역 사각형을 축소 변환한다", () => {
    const viewport = createMinimapViewport(WORLD.width, WORLD.height, VIEW.width, VIEW.height);
    const rect = minimapZoneRect(viewport, { x: 40, y: 40, width: 270, height: 210 });
    expect(rect.width).toBeCloseTo(270 * viewport.scale, 2);
    expect(rect.height).toBeCloseTo(210 * viewport.scale, 2);
    const topLeft = worldToMinimap(viewport, { x: 40, y: 40 });
    expect(rect.x).toBeCloseTo(topLeft.x, 2);
    expect(rect.y).toBeCloseTo(topLeft.y, 2);
  });

  it("구역을 SVG 폴리곤 포인트 문자열로 변환한다", () => {
    const viewport = createMinimapViewport(WORLD.width, WORLD.height, VIEW.width, VIEW.height);
    const points = minimapZonePolygonPoints(viewport, { x: 0, y: 0, width: 1280, height: 960 });
    const corners = points.split(" ").map((pair) => pair.split(",").map(Number));
    expect(corners).toHaveLength(4);
    // 시계 방향 사각형: 좌상 → 우상 → 우하 → 좌하
    const [[x1, y1], [x2, y2], [x3, y3], [x4, y4]] = corners as [number, number][];
    expect(x1).toBeLessThan(x2);
    expect(y1).toBeLessThan(y3);
    expect(x2).toBeCloseTo(x3, 2);
    expect(x4).toBeCloseTo(x1, 2);
    expect(y2).toBeCloseTo(y1, 2);
    expect(y4).toBeCloseTo(y3, 2);
  });
});

describe("minimapContains", () => {
  it("월드 안팎을 구분한다", () => {
    const viewport = createMinimapViewport(WORLD.width, WORLD.height, VIEW.width, VIEW.height);
    expect(minimapContains(viewport, worldToMinimap(viewport, { x: 640, y: 480 }))).toBe(true);
    expect(minimapContains(viewport, { x: -10, y: -10 })).toBe(false);
  });
});

describe("office zone data supply", () => {
  it("존 종류별 미니맵 분류·팔레트를 제공한다", () => {
    expect(minimapZoneKindFor("focus-zone")).toBe("silent");
    expect(minimapZoneKindFor("meeting-room")).toBe("private");
    expect(minimapZoneKindFor("event-hall")).toBe("spotlight");
    expect(minimapZoneKindFor("lounge")).toBe("public");
    const palette = minimapZonePaletteFor("cafe");
    expect(palette.fill).toMatch(/^#[0-9a-f]{6}$/i);
    expect(palette.stroke).toMatch(/^#[0-9a-f]{6}$/i);
    expect(palette.text).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("오피스 존을 미니맵 존 항목으로 변환한다", () => {
    const entries = officeZonesToMinimapZones(STUDIO_DEFAULT_OFFICE_ZONES);
    expect(entries.length).toBe(STUDIO_DEFAULT_OFFICE_ZONES.length);
    const focus = entries.find((entry) => entry.id === "zone-focus")!;
    expect(focus).toMatchObject({ labelKo: "집중존", labelEn: "Focus Zone", kind: "silent" });
    expect(focus.width).toBeGreaterThan(0);
    const aria = minimapZoneAriaLabel(STUDIO_DEFAULT_OFFICE_ZONES.find((zone) => zone.id === "zone-focus")!, "ko");
    expect(aria).toContain("집중존");
  });
});
