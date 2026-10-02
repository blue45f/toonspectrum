import { STUDIO_DIRECT_MAX_BYTES, type StudioLiveDirectPort } from "../../live/studio-live-direct-port";
import { HUDDLE_MAX_REMOTE_PEERS } from "../../live/huddle/studio-p2p-huddle-protocol";
import type { StudioVirtualSpaceActivity, StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import type { StudioWorldRect } from "../studio-virtual-space-world-manifest";

/**
 * 가까이 가면 영상(근접 영상)의 순수 규칙과 전송 채널.
 * - 미디어는 기존 무료 WebRTC P2P(Huddle 컨트롤러 + 무료 STUN)만 쓴다. 유료 TURN·미디어 서버는 쓰지 않는다.
 * - 같은 direct 포트를 쓰는 대화방(Huddle)과 신호가 섞이지 않게 전용 채널로 감싼다.
 */
export const SPACE_PROXIMITY_MEDIA_CHANNEL = "space-proximity-media-v1";
/** 이 거리(px) 안으로 들어오면 연결하고, 나갈 때는 조금 더 멀어져야 끊는다(경계에서 깜빡임 방지). */
export const SPACE_PROXIMITY_MEDIA_RADIUS = 168;
export const SPACE_PROXIMITY_MEDIA_LEAVE_RADIUS = 216;
/** 나를 뺀 최대 연결 수(나 포함 영상 버블 최대 4). Huddle 프로토콜 한도와 같다. */
export const SPACE_PROXIMITY_MEDIA_LIMIT = HUDDLE_MAX_REMOTE_PEERS;

interface SpaceChannelEnvelope {
  readonly channel: string;
  readonly payload: string;
}

/** 채널 봉투를 벗긴다. 다른 채널·형식이 틀린 값은 null. */
export function unwrapSpaceChannelPayload(raw: string, channel: string): string | null {
  if (typeof raw !== "string" || raw.length > STUDIO_DIRECT_MAX_BYTES || !raw.startsWith("{\"channel\":")) return null;
  try {
    const value = JSON.parse(raw) as Partial<SpaceChannelEnvelope> | null;
    return value && value.channel === channel && typeof value.payload === "string" ? value.payload : null;
  } catch {
    return null;
  }
}

/** direct 포트를 전용 채널로 감싼다. 다른 구독자(프레즌스·대화방)는 이 봉투를 해석하지 못해 무시한다. */
export function createSpaceChannelPort(port: StudioLiveDirectPort, channel = SPACE_PROXIMITY_MEDIA_CHANNEL): StudioLiveDirectPort {
  return {
    getPeers: () => port.getPeers(),
    send: (target, payload) => port.send(target, JSON.stringify({ channel, payload } satisfies SpaceChannelEnvelope)),
    subscribe: (listener) => port.subscribe((sender, raw) => {
      const payload = unwrapSpaceChannelPayload(raw, channel);
      if (payload !== null) listener(sender, payload);
    }),
  };
}

function rectContains(rect: StudioWorldRect, point: StudioVirtualSpacePoint): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

/** 이 지점이 들어 있는 프라이빗 음향 구역 id(없으면 null). */
export function spacePrivateZoneAt(
  zones: readonly (StudioWorldRect & { readonly id: string; readonly policy?: string })[] | undefined,
  point: StudioVirtualSpacePoint,
): string | null {
  return zones?.find((zone) => zone.policy === "private" && rectContains(zone, point))?.id ?? null;
}

export interface SpaceProximityMediaPeer {
  readonly id: string;
  readonly point: StudioVirtualSpacePoint;
  readonly activity: StudioVirtualSpaceActivity;
  readonly privateZoneId: string | null;
}

/**
 * 영상으로 연결할 팀원(가까운 순, 최대 3명).
 * - 나와 같은 프라이빗 구역끼리만(둘 다 바깥이면 바깥끼리) 연결한다.
 * - 자리 비움인 팀원과 차단한 팀원은 빼고, 내가 집중·자리 비움이면 아무도 연결하지 않는다.
 * - 이미 연결된 팀원은 LEAVE 반경까지 유지해 경계에서 깜빡이지 않게 한다.
 */
export function spaceProximityMediaScope(input: {
  readonly self: { readonly point: StudioVirtualSpacePoint; readonly activity: StudioVirtualSpaceActivity; readonly privateZoneId: string | null };
  readonly peers: readonly SpaceProximityMediaPeer[];
  readonly previous?: ReadonlySet<string>;
  readonly blockedIds?: readonly string[];
  readonly radius?: number;
  readonly leaveRadius?: number;
  readonly limit?: number;
}): readonly string[] {
  const { self, peers, previous = new Set<string>(), blockedIds = [], radius = SPACE_PROXIMITY_MEDIA_RADIUS,
    leaveRadius = SPACE_PROXIMITY_MEDIA_LEAVE_RADIUS, limit = SPACE_PROXIMITY_MEDIA_LIMIT } = input;
  if (self.activity === "focused" || self.activity === "away") return [];
  const blocked = new Set(blockedIds);
  return peers
    .filter((peer) => !blocked.has(peer.id) && peer.activity !== "away" && peer.privateZoneId === self.privateZoneId)
    .map((peer) => ({ id: peer.id, distance: Math.hypot(peer.point.x - self.point.x, peer.point.y - self.point.y) }))
    .filter(({ id, distance }) => Number.isFinite(distance) && (distance <= radius || (previous.has(id) && distance <= leaveRadius)))
    .sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id))
    .slice(0, Math.max(0, limit))
    .map(({ id }) => id);
}

/** 두 범위가 같은지(순서 무시). 같으면 컨트롤러를 다시 건드리지 않는다. */
export function sameSpaceProximityScope(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const set = new Set(left);
  return right.every((id) => set.has(id));
}
