/**
 * 문 열기/닫기 상태 머신
 *
 * 회의실·개인 작업실 같은 비공개 공간의 문:
 * - 닫힘 ↔ 열림 사이를 여닫는 애니메이션 상태로 전이
 * - 문이 닫히면 해당 음향 구역이 비공개로 전환 (호출 측에서 acoustic 정책과 연동)
 * - reduced-motion에서는 애니메이션 없이 즉시 전이
 *
 * 순수 로직 모듈. 실제 렌더링·충돌 판정은 호출 측에서 담당한다.
 */

export type StudioDoorVisualState = "closed" | "opening" | "open" | "closing";

/** 문 여닫는 애니메이션 시간(ms). */
export const STUDIO_DOOR_TRANSITION_MS = 600;

export interface StudioDoor {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly state: StudioDoorVisualState;
  /** 상태 전이 시작 시각. */
  readonly transitionStartedAt: number;
  readonly lastTime: number;
}

export function createStudioDoor(input: {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly open?: boolean;
}): StudioDoor {
  return Object.freeze({
    id: input.id,
    labelKo: input.labelKo,
    labelEn: input.labelEn,
    state: input.open ? "open" : "closed",
    transitionStartedAt: 0,
    lastTime: 0,
  });
}

function safeTime(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * 문 토글 (X키·클릭).
 * - closed → opening → open, open → closing → closed
 * - 전이 중 다시 토글하면 반대 방향으로 전환
 * - reducedMotion이면 즉시 open/closed로 전이
 */
export function toggleStudioDoor(
  door: StudioDoor,
  input: { readonly time: number; readonly reducedMotion: boolean },
): StudioDoor {
  const time = safeTime(input.time);
  const next = (state: StudioDoorVisualState): StudioDoor =>
    Object.freeze({ ...door, state, transitionStartedAt: time, lastTime: time });
  switch (door.state) {
    case "closed":
    case "closing":
      return input.reducedMotion ? next("open") : next("opening");
    case "open":
    case "opening":
      return input.reducedMotion ? next("closed") : next("closing");
  }
}

/**
 * 시간 경과에 따라 전이 상태를 완료한다.
 * opening → open, closing → closed (TRANSITION_MS 경과 시).
 */
export function stepStudioDoor(door: StudioDoor, time: number): StudioDoor {
  const safe = safeTime(time);
  if (safe < door.lastTime) return door;
  if (door.state === "opening" && safe - door.transitionStartedAt >= STUDIO_DOOR_TRANSITION_MS) {
    return Object.freeze({ ...door, state: "open", lastTime: safe });
  }
  if (door.state === "closing" && safe - door.transitionStartedAt >= STUDIO_DOOR_TRANSITION_MS) {
    return Object.freeze({ ...door, state: "closed", lastTime: safe });
  }
  return Object.freeze({ ...door, lastTime: safe });
}

/** 문이 열린 것으로 취급하는지 (opening 포함). */
export function studioDoorIsOpen(door: StudioDoor): boolean {
  return door.state === "open" || door.state === "opening";
}

/** 문이 닫힌 것으로 취급하는지 (closing 포함). */
export function studioDoorIsClosed(door: StudioDoor): boolean {
  return door.state === "closed" || door.state === "closing";
}

/** 여닫이 진행률 0~1 (closed=0, open=1). 렌더링 보간용. */
export function studioDoorOpenRatio(door: StudioDoor): number {
  switch (door.state) {
    case "closed": return 0;
    case "open": return 1;
    case "opening": {
      const ratio = (door.lastTime - door.transitionStartedAt) / STUDIO_DOOR_TRANSITION_MS;
      return Math.min(1, Math.max(0, ratio));
    }
    case "closing": {
      const ratio = (door.lastTime - door.transitionStartedAt) / STUDIO_DOOR_TRANSITION_MS;
      return Math.min(1, Math.max(0, 1 - ratio));
    }
  }
}

/** 문 상태 라벨 (UI 프롬프트용). */
export function studioDoorActionLabel(door: StudioDoor): { readonly ko: string; readonly en: string } {
  return studioDoorIsOpen(door)
    ? { ko: "문 닫기", en: "Close door" }
    : { ko: "문 열기", en: "Open door" };
}
