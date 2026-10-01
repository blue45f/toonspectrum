import { describe, expect, it } from "vitest";

import { studioVirtualCampusManifest } from "./studio-virtual-space-campus-world";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";
import { studioRenderViewport } from "./studio-virtual-space-presentation";
import {
  linkStudioVirtualDerivedWorld,
  studioCampusCameraZoom,
  studioClampCameraCenter,
  studioVirtualWorldKind,
  studioVirtualWorldPresentation,
} from "./studio-virtual-space-world-presentation";

const campus = studioVirtualCampusManifest(true);

describe("월드 표현 힌트와 캠퍼스 추종 카메라", () => {
  it("캠퍼스는 follow·0.65, 장소 월드는 fit·0.65, 파일에서 불러온 사본은 custom이다", () => {
    expect(studioVirtualWorldPresentation(campus)).toMatchObject({ kind: "campus", camera: "follow", actorScale: 0.65 });
    expect(studioVirtualWorldPresentation(studioVirtualPlaceWorldManifest("garden"))).toMatchObject({ kind: "place", camera: "fit" });
    expect(studioVirtualWorldKind(structuredClone(campus))).toBe("custom");
  });

  it("꾸미기 충돌을 더한 경로 탐색 사본도 원본의 힌트를 따른다", () => {
    const derived = linkStudioVirtualDerivedWorld({ ...campus, colliders: [...campus.colliders] }, campus);
    expect(studioVirtualWorldKind(derived)).toBe("campus");
    const twice = linkStudioVirtualDerivedWorld({ ...derived }, derived);
    expect(studioVirtualWorldPresentation(twice)?.camera).toBe("follow");
  });

  it("1440×900 데스크톱 줌은 0.8~1.35이고 세로 약 12타일이 보인다", () => {
    const zoom = studioCampusCameraZoom(1440, 900, 1, campus);
    expect(zoom).toBeGreaterThanOrEqual(0.8);
    expect(zoom).toBeLessThanOrEqual(1.35);
    expect(900 / zoom / 64).toBeCloseTo(12, 0);
    const ratio = studioRenderViewport(1440, 900, 2).ratio;
    expect(studioCampusCameraZoom(1440, 900, 2, campus) / ratio).toBeCloseTo(zoom);
  });

  it("390×844에서 캠퍼스 줌은 월드가 스테이지를 채운다(보이는 월드 크기 ≤ 월드 크기)", () => {
    const zoom = studioCampusCameraZoom(390, 844, 1, campus);
    expect(390 / zoom).toBeLessThanOrEqual(campus.width);
    expect(844 / zoom).toBeLessThanOrEqual(campus.height);
    // 세로형 모바일은 가로 약 6.5~7타일이 보인다.
    expect(390 / zoom / 64).toBeGreaterThanOrEqual(6.5);
    expect(390 / zoom / 64).toBeLessThanOrEqual(7);
    // 아주 큰 화면에서도 월드 밖 빈 띠가 생기지 않게 최소 배율을 지킨다.
    const huge = studioCampusCameraZoom(5000, 3000, 1, campus) / studioRenderViewport(5000, 3000, 1).ratio;
    expect(5000 / huge).toBeLessThanOrEqual(campus.width + 0.001);
    expect(3000 / huge).toBeLessThanOrEqual(campus.height + 0.001);
  });

  it("카메라 중심은 월드 안에 머문다", () => {
    expect(studioClampCameraCenter({ x: 0, y: 0 }, 1200, 760, campus)).toEqual({ x: 600, y: 380 });
    expect(studioClampCameraCenter({ x: 5000, y: 5000 }, 1200, 760, campus)).toEqual({ x: campus.width - 600, y: campus.height - 380 });
  });
});
