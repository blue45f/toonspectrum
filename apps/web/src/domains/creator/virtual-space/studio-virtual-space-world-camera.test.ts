import { describe, expect, it, vi } from "vitest";

import { studioVirtualCampusManifest } from "./studio-virtual-space-campus-world";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";
import { applyStudioWorldCamera, studioWorldCameraPlacement } from "./studio-virtual-space-world-camera";
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
