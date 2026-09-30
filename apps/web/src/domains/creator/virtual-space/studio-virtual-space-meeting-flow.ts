import type { StudioMeetingEvent, StudioMeetingSession } from "./studio-virtual-space-meeting-objects";
import { STUDIO_SPEAKER_THRESHOLD, type StudioSpeakerLevel } from "./studio-virtual-space-collaboration";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";
import { studioVirtualSpaceDistance, type StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/**
 * 자연스러운 회의 플로우
 *
 * 회의실에 들어가면 별도 조작 없이 회의가 되도록 돕는 로직:
 * - 입장/퇴장 이벤트 → 사용자 상태 자동 전이 ("회의 중" ↔ 복구)
 * - 회의 참여자 목록 (로스터) 구성 — 누가 있는지 한눈에
 * - X키 → 협업 보드 열기 단축키 (회의 중이거나 화이트보드 근처에서)
 * - 박수 이모지 파동 — 주변 참여자에게 전파
 *
 * meeting-objects.ts(입장 판정·세션)와 collaboration.ts(발화·이모지)를
 * 회의 UX 관점에서 엮는다. 순수 로직 모듈이다.
 */

/** 회의 참여자 목록 항목. */
export interface StudioMeetingRosterEntry {
  readonly sessionId: string;
  readonly displayName: string;
  /** 발화 중인지 (오디오 레벨 기반). */
  readonly speaking: boolean;
  readonly isSelf: boolean;
}

/**
 * 회의 세션 + 멤버 정보로 로스터를 만든다.
 * 본인이 맨 앞에 오고, 나머지는 이름순으로 정렬한다.
 */
export function buildMeetingRoster(input: {
  readonly session: StudioMeetingSession;
  readonly members: readonly { readonly sessionId: string; readonly displayName: string }[];
  readonly speakerLevels: readonly StudioSpeakerLevel[];
  readonly selfSessionId: string;
}): readonly StudioMeetingRosterEntry[] {
  const levels = new Map(input.speakerLevels.map((snapshot) => [snapshot.sessionId, snapshot.level]));
  const entries = input.session.members.map((sessionId) => {
    const member = input.members.find((candidate) => candidate.sessionId === sessionId);
    const level = levels.get(sessionId) ?? 0;
    return Object.freeze({
      sessionId,
      displayName: member?.displayName ?? sessionId.slice(0, 8),
      speaking: level >= STUDIO_SPEAKER_THRESHOLD,
      isSelf: sessionId === input.selfSessionId,
    });
  });
  return Object.freeze([...entries].sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    return a.displayName.localeCompare(b.displayName, "ko");
  }));
}

/**
 * 회의 이벤트에 따른 사용자 상태 전이 제안.
 * - joined/meeting-started → "in-meeting"
 * - left/meeting-ended → "available" (호출 측에서 이전 상태를 복원해도 됨)
 */
export function meetingStatusForEvent(event: StudioMeetingEvent): StudioUserStatus | null {
  switch (event.kind) {
    case "joined":
    case "meeting-started":
      return "in-meeting";
    case "left":
    case "meeting-ended":
      return "available";
  }
}

/** 협업 보드 열기 단축키 결과. */
export interface StudioMeetingBoardShortcut {
  readonly kind: "open-meeting-board";
  /** 회의 중이면 회의실 id, 화이트보드만 가까우면 null. */
  readonly objectId: string | null;
}

/**
 * X키 단축키: 회의 중이거나 화이트보드 근처에서 협업 보드를 연다.
 * 입력 필드에 포커스가 있을 때는 호출 측에서 호출하지 않는다.
 */
export function meetingBoardShortcut(input: {
  readonly key: string;
  readonly session: StudioMeetingSession | null;
  readonly nearWhiteboard: boolean;
}): StudioMeetingBoardShortcut | null {
  if (input.key !== "x" && input.key !== "X") return null;
  if (input.session === null && !input.nearWhiteboard) return null;
  return Object.freeze({
    kind: "open-meeting-board",
    objectId: input.session?.objectId ?? null,
  });
}

/** 참여자 수 요약 문구. */
export function meetingRosterSummaryText(count: number): { readonly ko: string; readonly en: string } {
  if (count <= 0) return { ko: "회의실이 비어 있어요.", en: "The meeting room is empty." };
  if (count === 1) return { ko: "혼자 회의 중이에요.", en: "You're alone in the meeting." };
  return {
    ko: `${count}명이 회의 중이에요.`,
    en: `${count} people are in the meeting.`,
  };
}

/** 박수 파동 전파 반경. */
export const STUDIO_APPLAUSE_WAVE_RADIUS = 320;

/**
 * 박수 이모지 파동: 발신자 주변 반경 안의 참여자에게 전파된다.
 * collaboration.ts의 플로팅 이모지와 함께 사용한다 (👏).
 */
export function applauseWaveTargets(input: {
  readonly fromSessionId: string;
  readonly fromPoint: StudioVirtualSpacePoint;
  readonly members: readonly { readonly sessionId: string; readonly point: StudioVirtualSpacePoint }[];
  readonly radius?: number;
}): { readonly targets: readonly string[] } {
  const radius = Number.isFinite(input.radius) && (input.radius ?? 0) > 0
    ? (input.radius as number)
    : STUDIO_APPLAUSE_WAVE_RADIUS;
  const targets = input.members
    .filter((member) => member.sessionId !== input.fromSessionId)
    .filter((member) => studioVirtualSpaceDistance(input.fromPoint, member.point) <= radius)
    .map((member) => member.sessionId);
  return { targets: Object.freeze(targets) };
}
