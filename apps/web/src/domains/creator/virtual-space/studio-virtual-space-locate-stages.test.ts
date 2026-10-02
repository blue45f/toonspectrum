import { describe, expect, it } from "vitest";

import { CAMPUS_GATES } from "./studio-virtual-space-campus-blueprint";
import { studioVirtualCampusManifest } from "./studio-virtual-space-campus-world";
import {
  resolveStudioLocateStage,
  studioLocateArrived,
  studioLocateWorldKey,
  studioQuickTravelPointForRoom,
  type StudioLocateTarget,
} from "./studio-virtual-space-locate-stages";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";
import { studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";

const campus = studioVirtualCampusManifest(false);
const library = studioVirtualPlaceWorldManifest("tree-library", false);

const libraryTarget: StudioLocateTarget = {
  placeId: "tree-library", point: { x: 480, y: 320 }, labelKo: "트리 라이브러리", labelEn: "Tree Library",
};
const cafeTarget: StudioLocateTarget = {
  placeId: "creator-cafe", point: { x: 2688, y: 600 }, labelKo: "크리에이터 카페", labelEn: "Creator Cafe",
};

describe("quick travel points", () => {
  it("방 바로 가기는 점유 가능한 방 스폰을 쓴다", () => {
    const point = studioQuickTravelPointForRoom(campus, "creator-cafe");
    expect(point).toEqual({ x: 2688, y: 600 });
    expect(studioWorldCanOccupy(campus, point!)).toBe(true);
  });

  it("없는 방은 null이다", () => {
    expect(studioQuickTravelPointForRoom(campus, "no-such-room")).toBeNull();
  });

  it("캠퍼스 구역은 하나의 월드 키를 공유하고 하위 장소는 따로다", () => {
    expect(studioLocateWorldKey("skyport")).toBe("campus");
    expect(studioLocateWorldKey("creator-cafe")).toBe("campus");
    expect(studioLocateWorldKey("tree-library")).toBe("tree-library");
  });
});

describe("locate stages", () => {
  it("같은 월드의 대상은 바로 안내한다", () => {
    const stage = resolveStudioLocateStage({
      currentKind: "campus", currentPlaceId: "skyport", target: cafeTarget, currentManifest: campus,
    });
    expect(stage).toEqual({ kind: "direct", point: cafeTarget.point });
  });

  it("캠퍼스에서 하위 장소는 게이트 트리거까지 안내한다", () => {
    const stage = resolveStudioLocateStage({
      currentKind: "campus", currentPlaceId: "skyport", target: libraryTarget, currentManifest: campus,
    });
    const gate = CAMPUS_GATES.find((candidate) => candidate.placeId === "tree-library")!;
    expect(stage).toEqual({ kind: "to-gate", point: gate.trigger, gatePlaceId: "tree-library" });
    // 안내 지점에 실제로 설 수 있어야 한다(벽 속이면 안내가 성립하지 않는다).
    expect(studioWorldCanOccupy(campus, gate.trigger)).toBe(true);
  });

  it("네 게이트 모두 캠퍼스에서 점유 가능한 트리거를 가진다", () => {
    for (const gate of CAMPUS_GATES) {
      expect(studioWorldCanOccupy(campus, gate.trigger), gate.placeId).toBe(true);
      expect(studioWorldCanOccupy(campus, gate.spawn), gate.placeId).toBe(true);
    }
  });

  it("하위 장소에서는 먼저 캠퍼스로 돌아가는 포털까지 안내한다", () => {
    const stage = resolveStudioLocateStage({
      currentKind: "place", currentPlaceId: "tree-library", target: cafeTarget, currentManifest: library,
    });
    expect(stage).toEqual({ kind: "to-exit", point: { x: 480, y: 604 } });
  });

  it("하위 장소에서 다른 하위 장소는 출구 → 게이트 순으로 단계가 이어진다", () => {
    const gardenTarget: StudioLocateTarget = {
      placeId: "garden", point: { x: 480, y: 320 }, labelKo: "창작 정원", labelEn: "Creator Garden",
    };
    const exitStage = resolveStudioLocateStage({
      currentKind: "place", currentPlaceId: "tree-library", target: gardenTarget, currentManifest: library,
    });
    expect(exitStage?.kind).toBe("to-exit");
    const gateStage = resolveStudioLocateStage({
      currentKind: "campus", currentPlaceId: "skyport", target: gardenTarget, currentManifest: campus,
    });
    expect(gateStage?.kind).toBe("to-gate");
    const arrivedStage = resolveStudioLocateStage({
      currentKind: "place", currentPlaceId: "garden", target: gardenTarget,
      currentManifest: studioVirtualPlaceWorldManifest("garden", false),
    });
    expect(arrivedStage?.kind).toBe("direct");
  });

  it("게시 월드 같은 그 밖의 월드에서는 안내하지 않는다", () => {
    expect(resolveStudioLocateStage({
      currentKind: "other", currentPlaceId: "skyport", target: libraryTarget, currentManifest: campus,
    })).toBeNull();
  });

  it("도착 판정은 direct 단계에서 목적지 근처일 때만 성립한다", () => {
    const direct = resolveStudioLocateStage({
      currentKind: "campus", currentPlaceId: "skyport", target: cafeTarget, currentManifest: campus,
    });
    expect(studioLocateArrived(direct, { x: 2690, y: 605 }, cafeTarget)).toBe(true);
    expect(studioLocateArrived(direct, { x: 1000, y: 1000 }, cafeTarget)).toBe(false);
    const gateStage = resolveStudioLocateStage({
      currentKind: "campus", currentPlaceId: "skyport", target: libraryTarget, currentManifest: campus,
    });
    expect(studioLocateArrived(gateStage, { x: 480, y: 320 }, libraryTarget)).toBe(false);
  });
});
