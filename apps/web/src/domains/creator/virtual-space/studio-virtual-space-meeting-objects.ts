import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioVirtualSpaceDistance } from "./studio-virtual-space-model";

/**
 * O-1. 미팅 오브젝트 (방 입장 = 회의 참여)
 *
 * oVice식 "미팅 오브젝트"의 toonstudio 적용:
 * - 회의실/녹음부스 오브젝트에 들어가면 자동으로 회의에 참여
 * - 방에서 나가면 자동으로 회의 종료
 * - "방" 개념을 물리적으로 구현 — 별도 참여 버튼 불필요
 *
 * 순수 로직 모듈. 실제 RTC 세션 관리는 호출 측에서 담당한다.
 */

export type StudioMeetingObjectKind = "meeting-room" | "recording-booth";

export interface StudioMeetingObject {
  readonly id: string;
  readonly kind: StudioMeetingObjectKind;
  /** 입장 판정 반경. */
  readonly radius: number;
  readonly position: StudioVirtualSpacePoint;
  /** 최대 수용 인원. */
  readonly capacity: number;
  readonly labelKo: string;
  readonly labelEn: string;
}

export interface StudioMeetingSession {
  readonly objectId: string;
  readonly members: readonly string[]; // sessionId 목록
  readonly startedAt: number;
}

export type StudioMeetingEvent =
  | { readonly kind: "joined"; readonly objectId: string; readonly sessionId: string; readonly at: number }
  | { readonly kind: "left"; readonly objectId: string; readonly sessionId: string; readonly at: number }
  | { readonly kind: "meeting-started"; readonly objectId: string; readonly at: number }
  | { readonly kind: "meeting-ended"; readonly objectId: string; readonly at: number };

/**
 * 아바타가 속한 미팅 오브젝트를 찾는다 (입장 판정).
 * 여러 개 겹치면 가장 가까운 하나만.
 */
export function resolveMeetingObject(
  objects: readonly StudioMeetingObject[],
  avatarPoint: StudioVirtualSpacePoint,
): StudioMeetingObject | null {
  let nearest: StudioMeetingObject | null = null;
  let nearestDistance = Infinity;
  for (const object of objects) {
    const distance = studioVirtualSpaceDistance(avatarPoint, object.position);
    if (distance <= object.radius && distance < nearestDistance) {
      nearest = object;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/**
 * 본인의 미팅 오브젝트 이동을 참여/이탈 이벤트로 변환한다.
 * null → obj: joined (+ 첫 멤버면 meeting-started)
 * obj → null: left (+ 마지막 멤버면 meeting-ended)
 * objA → objB: left + joined
 */
export function diffMeetingMembership(
  previous: StudioMeetingObject | null,
  current: StudioMeetingObject | null,
  sessionId: string,
  previousMemberCount: number,
  at: number,
): readonly StudioMeetingEvent[] {
  if (previous?.id === current?.id) return Object.freeze([]);
  const events: StudioMeetingEvent[] = [];
  if (previous !== null) {
    events.push(Object.freeze({ kind: "left", objectId: previous.id, sessionId, at }));
    if (previousMemberCount <= 1) {
      events.push(Object.freeze({ kind: "meeting-ended", objectId: previous.id, at }));
    }
  }
  if (current !== null) {
    events.push(Object.freeze({ kind: "joined", objectId: current.id, sessionId, at }));
    if (previousMemberCount === 0 || previous?.id !== current.id) {
      // 새 방에 첫 입장 (또는 방 이동) — 호출 측에서 실제 멤버 수로 판단하므로
      // 첫 입장 시그널은 joined 이벤트로 충분. meeting-started는 세션 매니저가 발행.
    }
  }
  return Object.freeze(events);
}

/**
 * 미팅 세션에 멤버를 추가한다. 정원 초과 시 false 반환.
 */
export function joinMeetingSession(
  session: StudioMeetingSession | null,
  object: StudioMeetingObject,
  sessionId: string,
  at: number,
): { readonly session: StudioMeetingSession; readonly started: boolean } | null {
  const members = session !== null && session.objectId === object.id ? session.members : [];
  if (members.includes(sessionId)) {
    return session !== null
      ? { session, started: false }
      : { session: Object.freeze({ objectId: object.id, members: Object.freeze([sessionId]), startedAt: at }), started: true };
  }
  if (members.length >= object.capacity) return null; // 정원 초과
  const started = members.length === 0;
  return {
    session: Object.freeze({
      objectId: object.id,
      members: Object.freeze([...members, sessionId]),
      startedAt: session?.startedAt ?? at,
    }),
    started,
  };
}

export function leaveMeetingSession(
  session: StudioMeetingSession | null,
  sessionId: string,
): { readonly session: StudioMeetingSession | null; readonly ended: boolean } {
  if (session === null) return { session: null, ended: false };
  const members = session.members.filter((id) => id !== sessionId);
  if (members.length === session.members.length) return { session, ended: false };
  if (members.length === 0) return { session: null, ended: true };
  return {
    session: Object.freeze({ ...session, members: Object.freeze(members) }),
    ended: false,
  };
}

/** 입장/퇴장 알림 문구. */
export function meetingNoticeText(
  event: StudioMeetingEvent,
  labelKo: string,
  labelEn: string,
): { readonly ko: string; readonly en: string } | null {
  switch (event.kind) {
    case "joined":
      return {
        ko: `"${labelKo}"에 입장했어요. 회의에 자동 참여돼요.`,
        en: `You entered "${labelEn}". You've automatically joined the meeting.`,
      };
    case "left":
      return {
        ko: `"${labelKo}"에서 나왔어요. 회의에서 나갔어요.`,
        en: `You left "${labelEn}". You've left the meeting.`,
      };
    case "meeting-started":
      return {
        ko: `"${labelKo}"에서 회의가 시작됐어요.`,
        en: `A meeting started in "${labelEn}".`,
      };
    case "meeting-ended":
      return {
        ko: `"${labelKo}" 회의가 종료됐어요.`,
        en: `The meeting in "${labelEn}" has ended.`,
      };
  }
}
