import { STUDIO_DIRECT_MAX_BYTES, type StudioLiveDirectPort } from "../../live/studio-live-direct-port";
import { HUDDLE_MAX_REMOTE_PEERS } from "../../live/huddle/studio-p2p-huddle-protocol";
import { studioProximityGain } from "../studio-virtual-space-acoustics";
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
 * 근접 음성 범위 모드(Gather Quiet 대응).
 * - standard: 기본 반경. quiet: 바로 옆 사람만(상태 점이 빨간색으로 바뀐다). off: 근접 연결 자체를 하지 않는다.
 */
export type SpaceProximityRangeMode = "standard" | "quiet" | "off";

export interface SpaceProximityRangeRadii {
  /** 새로 연결하는 거리(px). */
  readonly radius: number;
  /** 이미 연결된 팀원을 유지하는 거리(px). */
  readonly leaveRadius: number;
  /** 이 거리(px) 안에서는 최대 볼륨. */
  readonly fullRadius: number;
}

const SPACE_PROXIMITY_RANGE_RADII: Readonly<Record<SpaceProximityRangeMode, SpaceProximityRangeRadii | null>> = {
  standard: { radius: SPACE_PROXIMITY_MEDIA_RADIUS, leaveRadius: SPACE_PROXIMITY_MEDIA_LEAVE_RADIUS, fullRadius: 64 },
  quiet: { radius: 80, leaveRadius: 112, fullRadius: 32 },
  off: null,
};

/** 범위 모드의 반경 묶음. off면 null(연결하지 않는다). */
export function spaceProximityRangeRadii(mode: SpaceProximityRangeMode): SpaceProximityRangeRadii | null {
  return SPACE_PROXIMITY_RANGE_RADII[mode] ?? null;
}

/**
 * 거리→피어 음성 게인(0~1). 앰비언트 오디오와 같은 smoothstep 곡선 패턴을 미디어 반경에 맞춘 값이다.
 * - fullRadius 안에서는 1, leaveRadius에서 0으로 연속 하강한다. 진입 경계(168px)에서는 0이 아닌
 *   낮은 값(약 0.24)이라 소리가 갑자기 붙지 않고, 경계를 오가도 볼륨이 튀지 않는다.
 * - 프라이빗 구역 안에서는 Gather처럼 페이드 없이 연결 범위 안이면 1이다.
 * - 범위 모드가 off거나 거리가 유효하지 않으면 0.
 */
export function spaceProximityMediaGain(distance: number, options?: {
  readonly range?: SpaceProximityRangeMode;
  readonly inPrivateZone?: boolean;
}): number {
  const radii = spaceProximityRangeRadii(options?.range ?? "standard");
  if (!radii || !Number.isFinite(distance) || distance < 0) return 0;
  if (options?.inPrivateZone) return distance <= radii.leaveRadius ? 1 : 0;
  return studioProximityGain(distance, { nearRadius: radii.fullRadius, farRadius: radii.leaveRadius, curve: "smoothstep" });
}

export interface SpaceProximityMediaScopePeer {
  readonly id: string;
  /** 나와의 거리(px). */
  readonly distance: number;
  /** 이 거리에서의 음성 게인(0~1). 영상 카드 투명도에도 같은 값을 쓴다. */
  readonly gain: number;
}

export interface SpaceProximityMediaScopeInput {
  readonly self: { readonly point: StudioVirtualSpacePoint; readonly activity: StudioVirtualSpaceActivity; readonly privateZoneId: string | null };
  readonly peers: readonly SpaceProximityMediaPeer[];
  readonly previous?: ReadonlySet<string>;
  readonly blockedIds?: readonly string[];
  readonly radius?: number;
  readonly leaveRadius?: number;
  readonly limit?: number;
  /** 범위 모드. 반경을 직접 주지 않으면 모드의 반경을 쓰고, off면 아무도 연결하지 않는다. */
  readonly range?: SpaceProximityRangeMode;
}

/**
 * 연결 대상을 거리·게인과 함께 고른다(가까운 순, 최대 3명).
 * - 나와 같은 프라이빗 구역끼리만(둘 다 바깥이면 바깥끼리) 연결한다.
 * - 자리 비움인 팀원과 차단한 팀원은 빼고, 내가 집중·자리 비움이면 아무도 연결하지 않는다.
 * - 이미 연결된 팀원은 LEAVE 반경까지 유지해 경계에서 깜빡이지 않게 한다.
 */
export function spaceProximityMediaScopePeers(input: SpaceProximityMediaScopeInput): readonly SpaceProximityMediaScopePeer[] {
  const { self, peers, previous = new Set<string>(), blockedIds = [] } = input;
  const range = input.range ?? "standard";
  const rangeRadii = spaceProximityRangeRadii(range);
  if (!rangeRadii) return [];
  const radius = input.radius ?? rangeRadii.radius;
  const leaveRadius = input.leaveRadius ?? rangeRadii.leaveRadius;
  const limit = input.limit ?? SPACE_PROXIMITY_MEDIA_LIMIT;
  if (self.activity === "focused" || self.activity === "away") return [];
  const blocked = new Set(blockedIds);
  const inPrivateZone = self.privateZoneId !== null;
  return peers
    .filter((peer) => !blocked.has(peer.id) && peer.activity !== "away" && peer.privateZoneId === self.privateZoneId)
    .map((peer) => ({ id: peer.id, distance: Math.hypot(peer.point.x - self.point.x, peer.point.y - self.point.y) }))
    .filter(({ id, distance }) => Number.isFinite(distance) && (distance <= radius || (previous.has(id) && distance <= leaveRadius)))
    .sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id))
    .slice(0, Math.max(0, limit))
    .map(({ id, distance }) => ({
      id,
      distance,
      gain: spaceProximityMediaGain(distance, { range, inPrivateZone }),
    }));
}

/** 영상으로 연결할 팀원 id(가까운 순, 최대 3명). 판정 규칙은 spaceProximityMediaScopePeers와 같다. */
export function spaceProximityMediaScope(input: SpaceProximityMediaScopeInput): readonly string[] {
  return spaceProximityMediaScopePeers(input).map((peer) => peer.id);
}

/** 두 범위가 같은지(순서 무시). 같으면 컨트롤러를 다시 건드리지 않는다. */
export function sameSpaceProximityScope(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const set = new Set(left);
  return right.every((id) => set.has(id));
}
