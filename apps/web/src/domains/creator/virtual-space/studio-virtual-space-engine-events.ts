/**
 * Canvas(월드 엔진) → HUD 이벤트 계약.
 *
 * Canvas는 이 이벤트만 보내고 DOM 안내 문구나 버튼을 직접 그리지 않는다.
 * HUD는 이 값으로 위치 칩·진입 토스트·근접 스트립·끼임 해제 버튼을 그린다.
 */
import { studioVirtualCampusZoneMeta } from "./studio-virtual-space-campus-world";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type {
  StudioVirtualSpaceWorldManifest,
  StudioWorldInteractionDefinition,
  StudioWorldNpcDefinition,
  StudioWorldRect,
} from "./studio-virtual-space-world-manifest";

export type StudioVirtualSpaceEngineStatus = "loading" | "ready" | "error";

/**
 * 공간 UI 이벤트(이벤트 디렉터 → HUD). main 병합본과 같은 모양이다.
 * Canvas는 디렉터의 role/textKo/textEn을 kind/titleKo/titleEn으로 옮겨 이벤트마다 한 번씩 보낸다.
 * HUD: toast → 알림 토스트, banner → 스테이지 배너. highlight·dialogue는 월드가 직접 연출한다.
 */
export interface StudioSpaceUiEvent {
  readonly kind: "toast" | "banner" | "highlight" | "dialogue";
  readonly titleKo: string;
  readonly titleEn: string;
  readonly bodyKo?: string;
  readonly bodyEn?: string;
  readonly at: number;
  /** 대상 NPC·오브젝트·동료 id(있을 때). */
  readonly targetId?: string;
}

export interface StudioVirtualSpaceZoneChange {
  /** manifest.rooms id. 캠퍼스는 place id, 산책로는 "campus-commons". 방 밖이면 null. */
  readonly roomId: string | null;
  readonly labelKo: string;
  readonly labelEn: string;
  /** private acoustic zone 안이면 true. */
  readonly privateZone: boolean;
  /** "initial"은 준비 직후 1회. 토스트는 "enter"에만 띄운다. */
  readonly reason: "initial" | "enter";
}

export interface StudioVirtualSpaceNearbyNpc {
  readonly id: string;
  readonly npc: StudioWorldNpcDefinition;
  /** studioNpcLabel 결과. 항상 "NPC · " 접두어로 실제 접속자와 구분한다. */
  readonly labelKo: string;
  readonly labelEn: string;
  /** 현재 활동 문구. */
  readonly activityKo: string;
  readonly activityEn: string;
  readonly skinKey: string;
  readonly distance: number;
  /** studioNpcInteraction 결과. 대화 대상이 아니면 null. */
  readonly interaction: StudioWorldInteractionDefinition | null;
}

/** 근접 NPC 카드 반경(px)과 최대 인원. */
export const STUDIO_VIRTUAL_SPACE_NEARBY_NPC_RADIUS = 180;
export const STUDIO_VIRTUAL_SPACE_NEARBY_NPC_LIMIT = 3;
/** 방향 입력을 이 시간 동안 유지해도 거의 움직이지 못하면 끼임으로 본다. */
export const STUDIO_VIRTUAL_SPACE_STUCK_HOLD_MS = 1_500;
export const STUDIO_VIRTUAL_SPACE_STUCK_DISTANCE = 4;

function rectContains(rect: StudioWorldRect, point: StudioVirtualSpacePoint): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

/**
 * 몸이 서 있는 방과 프라이빗 구역을 추적해 바뀐 순간에만 이벤트를 만든다.
 * 방 사이 틈(출입구 바깥)에서는 직전 방을 유지해 진입 토스트가 깜빡이지 않게 한다.
 */
export class StudioZoneChangeTracker {
  private roomId: string | null | undefined = undefined;
  private privateZone = false;

  constructor(private readonly manifest: StudioVirtualSpaceWorldManifest) {}

  get currentRoomId(): string | null { return this.roomId ?? null; }

  next(point: StudioVirtualSpacePoint): StudioVirtualSpaceZoneChange | null {
    const room = this.manifest.rooms.find((candidate) => rectContains(candidate, point));
    const roomId = room?.id ?? this.roomId ?? null;
    const privateZone = (this.manifest.acousticZones ?? []).some((zone) => zone.policy === "private" && rectContains(zone, point));
    if (roomId === this.roomId && privateZone === this.privateZone) return null;
    const reason = this.roomId === undefined ? "initial" : "enter";
    this.roomId = roomId;
    this.privateZone = privateZone;
    const meta = roomId ? studioVirtualCampusZoneMeta(roomId) : null;
    const labelRoom = roomId ? this.manifest.rooms.find((candidate) => candidate.id === roomId) : undefined;
    return Object.freeze({
      roomId,
      labelKo: meta?.labelKo ?? labelRoom?.labelKo ?? "야외",
      labelEn: meta?.labelEn ?? labelRoom?.labelEn ?? "Outdoors",
      privateZone,
      reason,
    });
  }
}

/** 반경 안 NPC를 가까운 순으로 최대 limit명 고른다. */
export function studioNearbyNpcCandidates<T extends { readonly id: string; readonly point: StudioVirtualSpacePoint }>(
  views: readonly T[],
  point: StudioVirtualSpacePoint,
  radius = STUDIO_VIRTUAL_SPACE_NEARBY_NPC_RADIUS,
  limit = STUDIO_VIRTUAL_SPACE_NEARBY_NPC_LIMIT,
): readonly { readonly view: T; readonly distance: number }[] {
  const candidates: { readonly view: T; readonly distance: number }[] = [];
  for (const view of views) {
    const distance = Math.hypot(view.point.x - point.x, view.point.y - point.y);
    if (distance <= radius) candidates.push({ view, distance });
  }
  candidates.sort((left, right) => left.distance - right.distance || left.view.id.localeCompare(right.view.id));
  return candidates.slice(0, Math.max(0, limit));
}

/** id 집합이 같으면 같은 목록으로 본다(순서·거리 변화는 무시). */
export function studioNearbyNpcIdsKey(npcs: readonly Pick<StudioVirtualSpaceNearbyNpc, "id">[]): string {
  return npcs.map((npc) => npc.id).sort().join("|");
}

/**
 * 방향 입력 유지 시간과 이동량으로 끼임 여부를 판정한다.
 * - 방향 입력을 1.5초 유지했는데 4px 미만 움직였으면 끼임이다.
 * - 점유 불가 위치를 보정했으면 즉시 끼임이다.
 * - 끼임 뒤 몸이 4px 이상 움직이면(키·클릭 이동 모두) 다시 풀린다.
 */
export class StudioStuckDetector {
  private holdStartedAt: number | null = null;
  private origin: { x: number; y: number } | null = null;
  private stuckPoint: { x: number; y: number } | null = null;

  get value(): boolean { return this.stuckPoint !== null; }

  /** 반환값은 상태가 바뀌었는지 여부다. */
  markCorrected(point: { readonly x: number; readonly y: number }): boolean {
    const changed = this.stuckPoint === null;
    this.stuckPoint = { x: point.x, y: point.y };
    this.holdStartedAt = null;
    this.origin = null;
    return changed;
  }

  /** 반환값은 상태가 바뀌었는지 여부다. */
  sample(input: { readonly time: number; readonly directional: boolean; readonly point: { readonly x: number; readonly y: number } }): boolean {
    const previous = this.value;
    const { point } = input;
    if (this.stuckPoint && Math.hypot(point.x - this.stuckPoint.x, point.y - this.stuckPoint.y) >= STUDIO_VIRTUAL_SPACE_STUCK_DISTANCE) {
      this.stuckPoint = null;
    }
    if (!input.directional) {
      this.holdStartedAt = null;
      this.origin = null;
    } else if (this.holdStartedAt === null || this.origin === null) {
      this.holdStartedAt = input.time;
      this.origin = { x: point.x, y: point.y };
    } else if (Math.hypot(point.x - this.origin.x, point.y - this.origin.y) >= STUDIO_VIRTUAL_SPACE_STUCK_DISTANCE) {
      this.holdStartedAt = input.time;
      this.origin = { x: point.x, y: point.y };
    } else if (!this.stuckPoint && input.time - this.holdStartedAt >= STUDIO_VIRTUAL_SPACE_STUCK_HOLD_MS) {
      this.stuckPoint = { x: point.x, y: point.y };
    }
    return previous !== this.value;
  }

  /** 순간이동·끼임 해제 뒤에는 새 위치에서 다시 판정한다. 반환값은 상태가 바뀌었는지 여부다. */
  reset(): boolean {
    const changed = this.stuckPoint !== null;
    this.stuckPoint = null;
    this.holdStartedAt = null;
    this.origin = null;
    return changed;
  }
}
