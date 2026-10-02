// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { studioVirtualCampusManifest } from "../studio-virtual-space-campus-world";
import { buildStudioMapIllustrationPlan } from "../studio-virtual-space-map-illustration";
import {
  renderStudioMapIllustration,
  studioMapIllustrationCanvasSize,
  STUDIO_MAP_ILLUSTRATION_MAX_EDGE,
} from "./space-minimap-illustration";

describe("studioMapIllustrationCanvasSize", () => {
  it("긴 변이 상한을 넘으면 비율을 유지해 축소한다", () => {
    const size = studioMapIllustrationCanvasSize(3072, 1920);
    expect(size.width).toBe(STUDIO_MAP_ILLUSTRATION_MAX_EDGE);
    expect(size.height).toBe(1000);
    expect(size.scale).toBeCloseTo(STUDIO_MAP_ILLUSTRATION_MAX_EDGE / 3072);
  });

  it("상한보다 작으면 원본 크기를 유지한다", () => {
    expect(studioMapIllustrationCanvasSize(800, 600)).toEqual({ width: 800, height: 600, scale: 1 });
  });

  it("잘못된 크기는 1px로 방어한다", () => {
    expect(studioMapIllustrationCanvasSize(0, Number.NaN)).toEqual({ width: 1, height: 1, scale: 1 });
  });
});

describe("renderStudioMapIllustration", () => {
  const plan = buildStudioMapIllustrationPlan(studioVirtualCampusManifest(false));

  it("캔버스 2D를 쓸 수 없는 환경에서는 null로 폴백한다", async () => {
    await expect(renderStudioMapIllustration(plan)).resolves.toBeNull();
  });

  it("같은 계획은 같은 합성 프라미스를 공유한다", () => {
    expect(renderStudioMapIllustration(plan)).toBe(renderStudioMapIllustration(plan));
  });
});
