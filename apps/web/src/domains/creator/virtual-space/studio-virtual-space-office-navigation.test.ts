import { describe, expect, it } from "vitest";

import { resolveStudioOfficeDestination, resolveStudioOfficePeerApproach } from "./studio-virtual-space-office-navigation";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";
import { findStudioWorldPath, studioWorldCanOccupy, studioWorldCanTraverse } from "./studio-virtual-space-world-pathfinding";

import type { StudioOfficeDestinationInput } from "./studio-virtual-space-office-navigation";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

function world(colliders: StudioVirtualSpaceWorldManifest["colliders"] = []): StudioVirtualSpaceWorldManifest {
  return {
    id: "office-navigation-test", version: 1, width: 500, height: 400,
    backgroundAssetKey: "office", backgroundUrl: "/office.webp",
    rooms: [{ id: "office", x: 20, y: 20, width: 460, height: 360, labelKo: "작업실", labelEn: "Office" }],
    spawns: [{ id: "main", point: { x: 60, y: 60 } }, { id: "office", point: { x: 300, y: 180 } }],
    colliders, interactions: [], portals: [], props: [], npcs: [],
  };
}

function request(patch: Partial<StudioOfficeDestinationInput> = {}): StudioOfficeDestinationInput {
  return {
    manifest: world(), builtinPlaceWorld: false, selectedPlaceId: "creator-plaza", personal: false,
    self: { x: 80, y: 180 }, roomId: "office", ...patch,
  };
}

describe("사무실 목적지", () => {
  it("이미 방문한 기본 장소도 실제 걷기 목적지로 해석한다", () => {
    const manifest = studioVirtualPlaceWorldManifest("personal-atelier");
    const result = resolveStudioOfficeDestination(request({
      manifest, builtinPlaceWorld: true, selectedPlaceId: "personal-atelier", roomId: "drawing",
      self: { x: 110, y: 320 },
    }));
    expect(result).toEqual({ type: "move", point: { x: 480, y: 540 } });
  });

  it("같은 장소의 좌석 접근점은 입구 위치로 바꾸지 않는다", () => {
    const manifest = studioVirtualPlaceWorldManifest("personal-atelier");
    const point = { x: 850, y: 320 };
    expect(resolveStudioOfficeDestination(request({
      manifest, builtinPlaceWorld: true, selectedPlaceId: "personal-atelier", roomId: "personal-atelier",
      self: { x: 480, y: 540 }, point,
    }))).toEqual({ type: "move", point });
  });

  it("다른 장소로 가는 의도는 도착 후 재검증할 목적지를 보존한다", () => {
    const point = { x: 850, y: 320 };
    expect(resolveStudioOfficeDestination(request({
      builtinPlaceWorld: true, roomId: "drawing", point,
    }))).toEqual({ type: "place", placeId: "personal-atelier", roomId: "personal-atelier", point });
  });

  it.each(["teams", "production-control"])("개인 모드에서 프로젝트 전용 %s로 이동하지 않는다", (roomId) => {
    expect(resolveStudioOfficeDestination(request({ builtinPlaceWorld: true, personal: true, roomId }))).toBeNull();
  });

  it("발행된 사용자 월드에서는 이름이 같은 기본 장소로 이탈하지 않는다", () => {
    expect(resolveStudioOfficeDestination(request({ roomId: "drawing" }))).toBeNull();
    expect(resolveStudioOfficeDestination(request())).toEqual({ type: "move", point: { x: 300, y: 180 } });
  });

  it("존재하지 않는 방이나 spawn 이름을 첫 spawn으로 치환하지 않는다", () => {
    expect(resolveStudioOfficeDestination(request({ roomId: "missing" }))).toBeNull();
    expect(resolveStudioOfficeDestination(request({ roomId: "main" }))).toBeNull();
  });

  it("방 전용 spawn이 없으면 해당 방의 중심으로 이동한다", () => {
    expect(resolveStudioOfficeDestination(request({ manifest: { ...world(), spawns: [] } })))
      .toEqual({ type: "move", point: { x: 250, y: 200 } });
  });

  it("사용자 가구가 추가된 navigation manifest에서 가까운 안전 지점을 선택한다", () => {
    const manifest = world([{ x: 290, y: 170, width: 20, height: 20 }]);
    const input = request({ manifest, point: { x: 300, y: 180 } });
    const result = resolveStudioOfficeDestination(input);
    expect(result?.type).toBe("move");
    if (result?.type !== "move") throw new Error("안전한 접근점이 필요하다");
    expect(result.point).not.toEqual(input.point);
    expect(studioWorldCanOccupy(manifest, result.point)).toBe(true);
    expect(findStudioWorldPath(manifest, input.self, result.point).at(-1)).toEqual(result.point);
  });

  it("닫힌 벽 너머나 유효하지 않은 좌표로 이동을 예약하지 않는다", () => {
    const manifest = world([{ x: 240, y: 0, width: 20, height: 400 }]);
    expect(resolveStudioOfficeDestination(request({ manifest }))).toBeNull();
    expect(resolveStudioOfficeDestination(request({ point: { x: Number.NaN, y: 20 } }))).toBeNull();
    expect(resolveStudioOfficeDestination(request({ self: { x: 10, y: Number.POSITIVE_INFINITY } }))).toBeNull();
    expect(resolveStudioOfficeDestination(request({ point: { x: 5000, y: 5000 } }))).toBeNull();
  });
});

describe("동료에게 다가가기", () => {
  function expectApproach(manifest: StudioVirtualSpaceWorldManifest, self: StudioVirtualSpacePoint, peer: StudioVirtualSpacePoint) {
    const target = resolveStudioOfficePeerApproach(manifest, self, peer);
    expect(target).not.toBeNull();
    if (!target) throw new Error("접근점이 필요하다");
    const gap = Math.hypot(target.x - peer.x, target.y - peer.y);
    expect(gap).toBeGreaterThanOrEqual(26);
    expect(gap).toBeLessThanOrEqual(120);
    expect(studioWorldCanOccupy(manifest, target)).toBe(true);
    expect(studioWorldCanTraverse(manifest, target, peer)).toBe(true);
    expect(findStudioWorldPath(manifest, self, target).at(-1)).toEqual(target);
    return target;
  }

  it("멀리 있는 동료와 약 80만큼 떨어진 대화 위치로 걷는다", () => {
    const peer = { x: 380, y: 180 };
    const target = expectApproach(world(), { x: 60, y: 180 }, peer);
    expect(Math.hypot(target.x - peer.x, target.y - peer.y)).toBeCloseTo(80);
  });

  it("이미 가까우면 몸을 겹치거나 불필요하게 뒤로 물러서지 않는다", () => {
    expect(resolveStudioOfficePeerApproach(world(), { x: 340, y: 180 }, { x: 380, y: 180 }))
      .toEqual({ x: 340, y: 180 });
  });

  it("같은 위치에서 시작해도 서로 겹치지 않는 접근점을 구한다", () => {
    expectApproach(world(), { x: 250, y: 180 }, { x: 250, y: 180 });
  });

  it("가구를 통과하거나 벽 너머에서 대화를 시작할 위치를 선택하지 않는다", () => {
    expectApproach(world([{ x: 170, y: 150, width: 100, height: 60 }]), { x: 80, y: 180 }, { x: 380, y: 180 });
    expect(resolveStudioOfficePeerApproach(world([{ x: 240, y: 0, width: 20, height: 400 }]),
      { x: 80, y: 180 }, { x: 380, y: 180 })).toBeNull();
  });

  it("월드 밖·벽 안·유효하지 않은 동료 위치를 거절한다", () => {
    const manifest = world([{ x: 350, y: 150, width: 60, height: 60 }]);
    for (const peer of [{ x: 380, y: 180 }, { x: -100, y: 180 }, { x: Number.NaN, y: 180 }]) {
      expect(resolveStudioOfficePeerApproach(manifest, { x: 80, y: 180 }, peer)).toBeNull();
    }
  });
});
