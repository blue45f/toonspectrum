import { CAMPUS_GATES } from "./studio-virtual-space-campus-blueprint";
import { isStudioVirtualCampusRoom } from "./studio-virtual-space-campus-world";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioVirtualPlaceIdFromPortalHref } from "./studio-virtual-space-place-world";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

/**
 * 바로 가기 목적지와 Locate 2단계 안내 (W-2 공간 연결성).
 *
 * - 바로 가기 목적지는 기존 "걸어가기"와 같은 방이라도 스폰 지점을 쓴다:
 *   방 한가운데나 상호작용 지점은 가구와 겹칠 수 있지만 스폰은 점유 가능이 보장된다.
 * - Locate 안내는 월드 경계를 넘는 대상을 한 번에 그릴 수 없으므로 단계로 나눈다.
 *   캠퍼스 → 하위 장소: 그 장소 게이트(트리거)까지 안내하고, 장소가 바뀌면 다음 단계가
 *   자동으로 이어진다. 하위 장소 → 다른 월드: 먼저 캠퍼스로 돌아가는 포털까지 안내한다.
 */

/** 방 바로 가기·안내 목적지: 방 스폰 → 구역 상호작용 지점 → 방 중심 순으로 고른다. */
export function studioQuickTravelPointForRoom(
  manifest: StudioVirtualSpaceWorldManifest,
  roomId: string,
): StudioVirtualSpacePoint | null {
  const room = manifest.rooms.find((candidate) => candidate.id === roomId);
  if (!room) return null;
  const spawn = manifest.spawns.find((candidate) => candidate.id === roomId)?.point;
  if (spawn) return spawn;
  const interaction = manifest.interactions.find((candidate) => candidate.zoneId === roomId)?.point;
  if (interaction) return interaction;
  return { x: room.x + room.width / 2, y: room.y + room.height / 2 };
}

/** 장소 id가 속한 월드 키. 캠퍼스 구역들은 하나의 캠퍼스 월드를 공유한다. */
export function studioLocateWorldKey(placeId: string): string {
  return isStudioVirtualCampusRoom(placeId) ? "campus" : placeId;
}

export interface StudioLocateTarget {
  /** 대상이 속한 장소 id(캠퍼스 구역 id 또는 하위 장소 id). */
  readonly placeId: string;
  /** 대상 월드 좌표계에서의 목적지. */
  readonly point: StudioVirtualSpacePoint;
  readonly labelKo: string;
  readonly labelEn: string;
}

export type StudioLocateStage =
  /** 대상이 현재 월드에 있다 — 목적지까지 바로 안내한다. */
  | { readonly kind: "direct"; readonly point: StudioVirtualSpacePoint }
  /** 캠퍼스에서 하위 장소 게이트 트리거까지 안내한다. 게이트를 밟으면 다음 단계로 이어진다. */
  | { readonly kind: "to-gate"; readonly point: StudioVirtualSpacePoint; readonly gatePlaceId: string }
  /** 하위 장소에서 캠퍼스로 돌아가는 포털까지 안내한다. */
  | { readonly kind: "to-exit"; readonly point: StudioVirtualSpacePoint };

export interface StudioLocateStageInput {
  /** 현재 월드가 캠퍼스인지, 하위 장소인지, 그 밖(게시 월드 등)인지. */
  readonly currentKind: "campus" | "place" | "other";
  readonly currentPlaceId: string;
  readonly target: StudioLocateTarget;
  readonly currentManifest: StudioVirtualSpaceWorldManifest;
}

/**
 * 현재 월드에서 다음 안내 단계를 계산한다. 월드 전환이 일어나면 새 월드로 다시 호출해
 * 단계를 이어 붙인다(하위 장소 → 캠퍼스 → 다른 하위 장소도 이 반복으로 연결된다).
 * 안내할 수 없으면 null.
 */
export function resolveStudioLocateStage(input: StudioLocateStageInput): StudioLocateStage | null {
  const { currentKind, currentPlaceId, target, currentManifest } = input;
  if (!Number.isFinite(target.point.x) || !Number.isFinite(target.point.y)) return null;
  if (studioLocateWorldKey(target.placeId) === studioLocateWorldKey(currentPlaceId)) {
    return { kind: "direct", point: target.point };
  }
  if (currentKind === "campus") {
    const gate = CAMPUS_GATES.find((candidate) => candidate.placeId === target.placeId);
    if (!gate) return null;
    // 게이트 트리거를 밟으면 포털이 발동하므로, 안내 지점은 스폰이 아니라 트리거다.
    return { kind: "to-gate", point: gate.trigger, gatePlaceId: gate.placeId };
  }
  if (currentKind === "place") {
    // 하위 장소에서는 캠퍼스 구역으로 돌아가는 포털이 출구다(portal-home 우선).
    const exits = currentManifest.portals.filter((portal) => {
      const placeId = studioVirtualPlaceIdFromPortalHref(portal.href);
      return placeId !== null && isStudioVirtualCampusRoom(placeId);
    });
    const exit = exits.find((portal) => portal.id === "portal-home") ?? exits[0];
    if (!exit) return null;
    return { kind: "to-exit", point: exit.point };
  }
  return null;
}

/** 안내 종료 판정 거리(px). 목적지 스폰 근처에 닿으면 안내를 마친다. */
export const STUDIO_LOCATE_ARRIVAL_DISTANCE = 64;

export function studioLocateArrived(
  stage: StudioLocateStage | null,
  self: StudioVirtualSpacePoint,
  target: StudioLocateTarget,
): boolean {
  if (!stage || stage.kind !== "direct") return false;
  return Math.hypot(self.x - target.point.x, self.y - target.point.y) <= STUDIO_LOCATE_ARRIVAL_DISTANCE;
}
