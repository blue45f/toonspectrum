import {
  studioVirtualPlaceIdForLegacyZone,
  studioVirtualPlaceIdForMode,
} from "./studio-virtual-space-place-world";
import { STUDIO_VIRTUAL_CAMPUS_PERSONAL_DESK_POINT } from "./studio-virtual-space-campus-world";
import { findStudioWorldApproachPoint } from "./studio-virtual-space-runtime-policy";
import { studioVirtualWorldKind } from "./studio-virtual-space-world-presentation";
import {
  findStudioWorldPath,
  STUDIO_WORLD_PLAYER_RADIUS,
  studioWorldCanOccupy,
  studioWorldCanTraverse,
} from "./studio-virtual-space-world-pathfinding";

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

/** 기본 개인 작업실의 서쪽 드로잉 책상 앞. 사용자 제작 월드의 목적지에는 적용하지 않는다. */
export const STUDIO_PERSONAL_ATELIER_DESK_APPROACH_POINT: Readonly<StudioVirtualSpacePoint> = Object.freeze({
  x: 182,
  y: 422,
});

/**
 * 개인 공간의 "내 책상" 접근점. 기본 제공 장소 월드는 서쪽 드로잉 책상 앞 좌표를 쓴다.
 * 캠퍼스 월드는 STUDIO 구역 드로잉 책상 접근점을 쓴다.
 */
export function studioVirtualPersonalDeskPoint(manifest: StudioVirtualSpaceWorldManifest): StudioVirtualSpacePoint {
  if (studioVirtualWorldKind(manifest) === "campus") return { ...STUDIO_VIRTUAL_CAMPUS_PERSONAL_DESK_POINT };
  return { ...STUDIO_PERSONAL_ATELIER_DESK_APPROACH_POINT };
}

export type StudioOfficeDestination =
  | { readonly type: "move"; readonly point: StudioVirtualSpacePoint }
  | { readonly type: "place"; readonly placeId: string; readonly roomId?: string; readonly point?: StudioVirtualSpacePoint };

export interface StudioOfficeDestinationInput {
  /** Canvas와 같은 사용자 가구 충돌 정보가 포함된 navigation manifest를 전달한다. */
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly builtinPlaceWorld: boolean;
  readonly selectedPlaceId: string;
  readonly personal: boolean;
  readonly self: StudioVirtualSpacePoint;
  readonly roomId: string;
  readonly point?: StudioVirtualSpacePoint;
}

function finite(point: StudioVirtualSpacePoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function distance(left: StudioVirtualSpacePoint, right: StudioVirtualSpacePoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function reachable(
  manifest: StudioVirtualSpaceWorldManifest,
  self: StudioVirtualSpacePoint,
  point: StudioVirtualSpacePoint,
): boolean {
  if (!studioWorldCanOccupy(manifest, point)) return false;
  const last = findStudioWorldPath(manifest, self, point).at(-1);
  return Boolean(last && distance(last, point) < 1);
}

/** 다른 장소는 이동 의도만 반환한다. 도착한 장소의 manifest로 목적지를 다시 검증해야 한다. */
export function resolveStudioOfficeDestination(input: StudioOfficeDestinationInput): StudioOfficeDestination | null {
  const { manifest, self, point, personal, builtinPlaceWorld, selectedPlaceId } = input;
  if (!finite(self) || (point && !finite(point))) return null;
  const placeId = builtinPlaceWorld ? studioVirtualPlaceIdForLegacyZone(input.roomId) : null;
  // 캠퍼스는 여러 장소를 한 월드의 방으로 가진다. 개인 모드에서 프로젝트 전용 방(TALK)도 걸어서 간다.
  const campusRoom = placeId !== null && manifest.rooms.some((candidate) => candidate.id === placeId);
  if (placeId && !campusRoom && studioVirtualPlaceIdForMode(placeId, personal) !== placeId) return null;
  if (placeId && !campusRoom && placeId !== selectedPlaceId) {
    return { type: "place", placeId, roomId: placeId, ...(point ? { point: { ...point } } : {}) };
  }
  const roomId = placeId ?? input.roomId;
  const room = manifest.rooms.find((candidate) => candidate.id === roomId);
  if (!room || !studioWorldCanOccupy(manifest, self)) return null;
  const preferred = point
    ?? manifest.spawns.find((spawn) => spawn.id === roomId)?.point
    ?? { x: room.x + room.width / 2, y: room.y + room.height / 2 };
  if (!finite(preferred)) return null;
  const target = studioWorldCanOccupy(manifest, preferred)
    ? preferred
    : findStudioWorldApproachPoint(manifest, self, preferred, 48);
  return target && reachable(manifest, self, target) ? { type: "move", point: { ...target } } : null;
}

/** 같은 가구 충돌 manifest에서 몸이 겹치지 않고 대화 범위 120 안에 드는 접근점을 구한다. */
export function resolveStudioOfficePeerApproach(
  manifest: StudioVirtualSpaceWorldManifest,
  self: StudioVirtualSpacePoint,
  peerPoint: StudioVirtualSpacePoint,
): StudioVirtualSpacePoint | null {
  if (!finite(self) || !finite(peerPoint)
    || !studioWorldCanOccupy(manifest, self) || !studioWorldCanOccupy(manifest, peerPoint)) return null;
  const minimumGap = STUDIO_WORLD_PLAYER_RADIUS * 2 + 8;
  const gap = distance(self, peerPoint);
  if (gap >= minimumGap && gap <= 80 && studioWorldCanTraverse(manifest, self, peerPoint)) return { ...self };
  // 단절된 방에서는 여러 후보마다 같은 큰 경로 탐색을 반복하지 않는다.
  if (!reachable(manifest, self, peerPoint)) return null;

  const candidates: StudioVirtualSpacePoint[] = [];
  const preferred = findStudioWorldApproachPoint(manifest, self, peerPoint, 81);
  if (preferred) candidates.push(preferred);
  const toward = Math.atan2(self.y - peerPoint.y, self.x - peerPoint.x);
  for (const radius of [80, 48, 112]) {
    for (let step = 0; step < 8; step += 1) {
      const angle = toward + step * Math.PI / 4;
      candidates.push({ x: peerPoint.x + Math.cos(angle) * radius, y: peerPoint.y + Math.sin(angle) * radius });
    }
  }
  candidates.sort((left, right) => (
    Math.abs(distance(left, peerPoint) - 80) - Math.abs(distance(right, peerPoint) - 80)
  ) || distance(left, self) - distance(right, self));
  for (const candidate of candidates) {
    const separation = distance(candidate, peerPoint);
    if (separation < minimumGap || separation > 120
      || !studioWorldCanTraverse(manifest, candidate, peerPoint)) continue;
    if (reachable(manifest, self, candidate)) return { ...candidate };
  }
  return null;
}
