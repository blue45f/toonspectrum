import type { StudioWorldAcousticZoneDefinition } from "./studio-virtual-space-acoustics";
import { resolveStudioAcousticZone } from "./studio-virtual-space-acoustics";

/**
 * G-2. 프라이빗 스페이스 (Private Spaces)
 *
 * Gather Town식 "시끄러운 구역": 지정 구역 내에서는 거리와 무관하게
 * 전원이 음성/영상을 공유한다. ZEP식 silent zone(조용한 구역)과 반대 개념.
 * 콘티 토론 테이블, 녹음부스 주변에 배치한다.
 *
 * - 진입/이탈 시 알림 이벤트 (UI 토스트·구역 하이라이트 트리거용)
 * - 구역 내에서는 거리 감쇠 없이 풀 게인
 * - 기하(오버레이 도형)는 studio-virtual-space-private-zone-overlay가 담당,
 *   이 모듈은 멤버십·알림·오디오 정책을 담당한다.
 */

export interface StudioPrivateSpaceMember {
  readonly sessionId: string;
  /** 구역 진입 시각 (ms epoch). 체류 시간 표시에 사용. */
  readonly enteredAt: number;
}

export interface StudioPrivateSpaceSnapshot {
  readonly zoneId: string;
  readonly members: readonly StudioPrivateSpaceMember[];
}

export type StudioPrivateSpaceEvent =
  | { readonly kind: "entered"; readonly zoneId: string; readonly sessionId: string; readonly at: number }
  | { readonly kind: "exited"; readonly zoneId: string; readonly sessionId: string; readonly at: number };

/**
 * private 정책 구역 중 해당 좌표가 속한 구역을 찾는다.
 * 겹치는 구역 정의는 검증 단계에서 이미 배제되므로 단일 매칭만 허용.
 */
export function resolvePrivateSpace(
  zones: readonly StudioWorldAcousticZoneDefinition[],
  point: { x: number; y: number },
): StudioWorldAcousticZoneDefinition | null {
  const matched = resolveStudioAcousticZone(zones, point);
  return matched !== null && matched.policy === "private" ? matched : null;
}

/**
 * 본인의 구역 이동을 진입/이탈 이벤트로 변환한다.
 * null → zone: entered, zone → null: exited, zoneA → zoneB: exited + entered.
 */
export function diffPrivateSpaceMembership(
  previous: StudioWorldAcousticZoneDefinition | null,
  current: StudioWorldAcousticZoneDefinition | null,
  sessionId: string,
  at: number,
): readonly StudioPrivateSpaceEvent[] {
  if (previous?.id === current?.id) return Object.freeze([]);
  const events: StudioPrivateSpaceEvent[] = [];
  if (previous !== null) {
    events.push(Object.freeze({ kind: "exited", zoneId: previous.id, sessionId, at }));
  }
  if (current !== null) {
    events.push(Object.freeze({ kind: "entered", zoneId: current.id, sessionId, at }));
  }
  return Object.freeze(events);
}

/**
 * 프라이빗 스페이스 내 오디오 게인: 거리 무관 풀 볼륨(1).
 * 구역 밖 피어에 대해서는 proximityAudioGain()을 그대로 사용한다.
 */
export function privateSpaceAudioGain(
  inSamePrivateSpace: boolean,
): number {
  return inSamePrivateSpace ? 1 : 0;
}

/**
 * 진입 알림 문구. UI 토스트용 한/영 문구를 함께 제공한다.
 */
export function privateSpaceNoticeText(
  event: StudioPrivateSpaceEvent,
  zoneLabelKo: string,
  zoneLabelEn: string,
): { readonly ko: string; readonly en: string } {
  if (event.kind === "entered") {
    return {
      ko: `프라이빗 스페이스 "${zoneLabelKo}"에 입장했어요. 구역 내 전원과 음성·영상이 공유돼요.`,
      en: `You entered private space "${zoneLabelEn}". Voice and video are shared with everyone inside.`,
    };
  }
  return {
    ko: `프라이빗 스페이스 "${zoneLabelKo}"에서 나왔어요.`,
    en: `You left private space "${zoneLabelEn}".`,
  };
}

/**
 * 스냅샷에 멤버를 추가/제거한다. 같은 sessionId 중복 진입은 무시.
 */
export function addPrivateSpaceMember(
  snapshot: StudioPrivateSpaceSnapshot | null,
  zoneId: string,
  sessionId: string,
  at: number,
): StudioPrivateSpaceSnapshot {
  const members = snapshot !== null && snapshot.zoneId === zoneId ? snapshot.members : [];
  if (members.some((member) => member.sessionId === sessionId)) {
    return snapshot ?? Object.freeze({ zoneId, members: Object.freeze([]) });
  }
  return Object.freeze({
    zoneId,
    members: Object.freeze([...members, Object.freeze({ sessionId, enteredAt: at })]),
  });
}

export function removePrivateSpaceMember(
  snapshot: StudioPrivateSpaceSnapshot | null,
  sessionId: string,
): StudioPrivateSpaceSnapshot | null {
  if (snapshot === null) return null;
  const members = snapshot.members.filter((member) => member.sessionId !== sessionId);
  if (members.length === snapshot.members.length) return snapshot;
  if (members.length === 0) return null;
  return Object.freeze({ zoneId: snapshot.zoneId, members: Object.freeze(members) });
}
