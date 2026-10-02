import { describe, expect, it, vi } from "vitest";

import { studioVirtualCampusManifest } from "./studio-virtual-space-campus-world";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";
import { applyStudioWorldCamera, studioCameraEdgeLerpFactor, studioWorldCameraPlacement, STUDIO_CAMERA_EDGE_MIN_LERP_FACTOR, STUDIO_CAMERA_EDGE_SOFT_ZONE_PX } from "./studio-virtual-space-world-camera";
import { studioCampusCameraZoom } from "./studio-virtual-space-world-presentation";

describe("월드 카메라 배치", () => {
  it("캠퍼스는 데스크톱·모바일 모두 월드 전체를 경계로 하는 추종 카메라다", () => {
    const campus = studioVirtualCampusManifest(true);
    for (const [width, height] of [[1440, 900], [390, 844]] as const) {
      const placement = studioWorldCameraPlacement(campus, width, height, 1);
      expect(placement.mode).toBe("follow");
      expect(placement.zoom).toBeCloseTo(studioCampusCameraZoom(width, height, 1, campus));
      expect(placement.bounds).toEqual({ x: 0, y: 0, width: campus.width, height: campus.height });
    }
  });

  it("내장 장소는 데스크톱에서 fit 프레임으로 가운데를 보고, 모바일에서는 추종한다", () => {
    const garden = studioVirtualPlaceWorldManifest("garden", true);
    const camera = { setZoom: vi.fn(), setBounds: vi.fn(), centerOn: vi.fn() };
    expect(applyStudioWorldCamera(camera, garden, 1440, 900, 1)).toBe("fit");
    expect(camera.centerOn).toHaveBeenCalledWith(garden.width / 2, garden.height / 2);
    camera.centerOn.mockClear();
    expect(applyStudioWorldCamera(camera, garden, 390, 844, 1)).toBe("follow");
    expect(camera.centerOn).not.toHaveBeenCalled();
    expect(camera.setBounds).toHaveBeenLastCalledWith(0, 0, garden.width, garden.height);
  });
});

describe("카메라 경계 소프트 클램프", () => {
  // 뷰 800px, 월드 3,072px → 중심 허용 범위는 400~2,672.
  const view = 800;
  const world = 3_072;
  const minCenter = view / 2;
  const maxCenter = world - view / 2;

  it("월드 중앙에서는 추종을 늦추지 않는다", () => {
    expect(studioCameraEdgeLerpFactor(world / 2, view, world)).toBe(1);
    expect(studioCameraEdgeLerpFactor(minCenter + STUDIO_CAMERA_EDGE_SOFT_ZONE_PX, view, world)).toBe(1);
    expect(studioCameraEdgeLerpFactor(maxCenter - STUDIO_CAMERA_EDGE_SOFT_ZONE_PX, view, world)).toBe(1);
  });

  it("경계에 붙을수록 최소 배율까지 부드럽게 감속한다", () => {
    expect(studioCameraEdgeLerpFactor(minCenter, view, world)).toBeCloseTo(STUDIO_CAMERA_EDGE_MIN_LERP_FACTOR);
    expect(studioCameraEdgeLerpFactor(maxCenter, view, world)).toBeCloseTo(STUDIO_CAMERA_EDGE_MIN_LERP_FACTOR);
    const halfway = studioCameraEdgeLerpFactor(minCenter + STUDIO_CAMERA_EDGE_SOFT_ZONE_PX / 2, view, world);
    expect(halfway).toBeGreaterThan(STUDIO_CAMERA_EDGE_MIN_LERP_FACTOR);
    expect(halfway).toBeLessThan(1);
    // 경계에서 멀어질수록 단조 증가한다.
    let previous = -1;
    for (let d = 0; d <= STUDIO_CAMERA_EDGE_SOFT_ZONE_PX; d += 16) {
      const factor = studioCameraEdgeLerpFactor(minCenter + d, view, world);
      expect(factor).toBeGreaterThanOrEqual(previous);
      previous = factor;
    }
  });

  it("월드가 화면보다 작거나 잘못된 입력이면 감속하지 않는다", () => {
    expect(studioCameraEdgeLerpFactor(100, 800, 640)).toBe(1);
    expect(studioCameraEdgeLerpFactor(100, 800, 800)).toBe(1);
    expect(studioCameraEdgeLerpFactor(100, 0, 3_072)).toBe(1);
  });
});
