import { useEffect, useRef } from "react";

import type { StudioVirtualSpaceActivity } from "../studio-virtual-space-model";
import type { StudioUserStatus } from "../studio-virtual-space-user-status";

export interface SpaceAutoMeetingInput {
  readonly inPrivateZone: boolean;
  readonly userStatus: StudioUserStatus | null;
  readonly activity: StudioVirtualSpaceActivity;
  readonly enabled: boolean;
}

export type SpaceAutoMeetingDecision = "set-meeting" | "clear-meeting" | null;

/**
 * 프라이빗(회의) 구역 출입에 따른 자동 '회의 중' 판정(main의 autoSetInMeeting·autoClearInMeeting 규칙).
 * - 들어갈 때: 대화 가능 상태이고 직접 고른 명시 상태가 없을 때만 '회의 중'으로 바꾼다.
 * - 나올 때: 자동으로 바꾼 '회의 중'이 그대로일 때만 되돌린다. 사용자가 그 사이 직접 바꾼 상태는 건드리지 않는다.
 */
export function spaceAutoMeetingDecision(
  previousInside: boolean,
  input: SpaceAutoMeetingInput,
  autoApplied: boolean,
): SpaceAutoMeetingDecision {
  if (!input.enabled) return null;
  if (!previousInside && input.inPrivateZone) {
    return input.userStatus === null && input.activity === "available" ? "set-meeting" : null;
  }
  if (previousInside && !input.inPrivateZone) {
    return autoApplied && input.userStatus === "in-meeting" ? "clear-meeting" : null;
  }
  return null;
}

/** 위 판정을 구역 변화에 맞춰 한 번씩만 적용한다. */
export function useSpaceAutoMeeting(input: SpaceAutoMeetingInput, apply: (status: "in-meeting" | null) => void): void {
  const previousInside = useRef(input.inPrivateZone);
  const autoApplied = useRef(false);
  const latest = useRef({ input, apply });
  latest.current = { input, apply };
  // 사용자가 자동 '회의 중'을 직접 다른 상태로 바꾸면 더 이상 자동으로 되돌리지 않는다.
  useEffect(() => {
    if (autoApplied.current && input.userStatus !== "in-meeting") autoApplied.current = false;
  }, [input.userStatus]);
  useEffect(() => {
    const current = latest.current.input;
    const decision = spaceAutoMeetingDecision(previousInside.current, current, autoApplied.current);
    previousInside.current = current.inPrivateZone;
    if (decision === "set-meeting") {
      autoApplied.current = true;
      latest.current.apply("in-meeting");
    } else if (decision === "clear-meeting") {
      autoApplied.current = false;
      latest.current.apply(null);
    }
  }, [input.inPrivateZone]);
}
