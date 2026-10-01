import { describe, expect, it, vi } from "vitest";

import {
  createPlaceModeDirector,
  type PlaceModeDirectorOptions,
} from "./studio-virtual-space-place-mode-director";
import type { StudioOfficeZone } from "./studio-virtual-space-office-zones";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";

function zone(
  id: string,
  type: StudioOfficeZone["type"],
  workMode: StudioOfficeZone["workMode"],
  x: number, y: number, width: number, height: number,
): StudioOfficeZone {
  return Object.freeze({
    id, type, labelKo: `${id}-ko`, labelEn: `${id}-en`,
    shape: Object.freeze({ kind: "rect", x, y, width, height }),
    rules: Object.freeze([]),
    ...(workMode ? { workMode } : {}),
  });
}

const MEETING = zone("zone-meeting", "meeting-room", "conference", 950, 590, 290, 260);
const LOUNGE = zone("zone-lounge", "lounge", "lounge", 370, 590, 240, 180);
const FOCUS = zone("zone-focus", "focus-zone", "focus-desk", 40, 40, 270, 210);
const STAGE = zone("zone-stage", "event-hall", "stage", 640, 590, 280, 220);

const IN_MEETING = { x: 1000, y: 650 };
const IN_LOUNGE = { x: 400, y: 650 };
const IN_FOCUS = { x: 100, y: 100 };
const IN_STAGE = { x: 700, y: 650 };
const OUTSIDE = { x: 10, y: 900 };

function harness(partial: Partial<PlaceModeDirectorOptions> = {}) {
  let t = 0;
  const readCurrentStatus = vi.fn<() => StudioUserStatus | null>(() => "available");
  const director = createPlaceModeDirector({
    zones: [MEETING, LOUNGE, FOCUS, STAGE],
    now: () => t,
    readCurrentStatus,
    ...partial,
  });
  const advance = (ms: number, point = IN_MEETING): void => {
    t += ms;
    director.update(point);
  };
  const drain = () => director.consumeEvents();
  const setTime = (ms: number): void => { t = ms; };
  return { director, advance, drain, setTime, readCurrentStatus, now: () => t };
}

describe("진입 디바운스", () => {
  it("600ms 머물러야 진입한다", () => {
    const { advance, drain } = harness();
    advance(0, IN_MEETING);
    expect(drain()).toEqual([]);
    advance(599, IN_MEETING);
    expect(drain()).toEqual([]);
    advance(1, IN_MEETING);
    const kinds = drain().map((event) => event.kind);
    expect(kinds).toEqual(["mode-entered", "join-prompt"]);
  });

  it("경계를 스치면 진입하지 않는다 (깜빡임 방지)", () => {
    const { advance, drain, setTime } = harness();
    setTime(0);
    advance(0, IN_MEETING);
    advance(300, OUTSIDE);
    advance(300, IN_MEETING);
    advance(300, OUTSIDE);
    advance(2000, OUTSIDE);
    expect(drain()).toEqual([]);
  });

  it("workMode가 없는 존은 존 종류 폴백 매핑을 쓴다", () => {
    const fallbackZone = zone("zone-mr2", "meeting-room", undefined, 0, 0, 100, 100);
    let t = 0;
    const director = createPlaceModeDirector({ zones: [fallbackZone], now: () => t });
    director.update({ x: 50, y: 50 });
    t += 600;
    director.update({ x: 50, y: 50 });
    const events = director.consumeEvents();
    expect(events[0]!.kind).toBe("mode-entered");
    expect(events[0]!.mode).toBe("conference");
  });
});

describe("회의실 플로우", () => {
  it("참여 확인 → 세션 시작 (presence 자동 상태 포함)", () => {
    const { advance, drain, director, readCurrentStatus } = harness();
    advance(0, IN_MEETING);
    advance(600, IN_MEETING);
    expect(drain().map((e) => e.kind)).toEqual(["mode-entered", "join-prompt"]);
    expect(director.snapshot()?.stage).toBe("prompt");

    director.confirmJoin();
    const started = drain();
    expect(started.map((e) => e.kind)).toEqual(["session-started"]);
    expect(started[0]!.autoStatus).toBe("in-meeting");
    expect(readCurrentStatus).toHaveBeenCalled();
    expect(director.snapshot()?.stage).toBe("engaged");
  });

  it("거절하면 같은 존 방문 동안 다시 묻지 않는다", () => {
    const { advance, drain, director } = harness();
    advance(0, IN_MEETING);
    advance(600, IN_MEETING);
    drain();
    director.declineJoin();
    expect(director.snapshot()?.stage).toBe("idle");
    // 존 안에 계속 있어도 프롬프트가 다시 안 뜬다.
    advance(5000, IN_MEETING);
    expect(drain()).toEqual([]);
    // 나갔다가 다시 들어오면 다시 묻는다.
    advance(0, OUTSIDE);
    advance(1300, OUTSIDE);
    drain();
    advance(0, IN_MEETING);
    advance(600, IN_MEETING);
    expect(drain().map((e) => e.kind)).toEqual(["mode-entered", "join-prompt"]);
  });

  it("이탈 디바운스 후 세션 종료", () => {
    const { advance, drain, director } = harness();
    advance(0, IN_MEETING);
    advance(600, IN_MEETING);
    drain();
    director.confirmJoin();
    drain();
    // 문 앞에서 왔다갔다해도 1200ms 안에는 세션이 유지된다.
    advance(0, OUTSIDE);
    advance(1000, OUTSIDE);
    expect(drain()).toEqual([]);
    expect(director.snapshot()?.stage).toBe("engaged");
    advance(200, OUTSIDE);
    expect(drain().map((e) => e.kind)).toEqual(["session-ended", "mode-exited"]);
  });

  it("session-ended에 복원할 이전 상태가 실린다", () => {
    const { advance, drain, director, readCurrentStatus } = harness();
    readCurrentStatus.mockReturnValue("break");
    advance(0, IN_MEETING);
    advance(600, IN_MEETING);
    drain();
    director.confirmJoin();
    const started = drain();
    expect(started[0]!.kind).toBe("session-started");
    advance(0, OUTSIDE);
    advance(1200, OUTSIDE);
    const events = drain();
    const ended = events.find((e) => e.kind === "session-ended")!;
    expect(ended.restoreStatus).toBe("break");
  });

  it("수동 이탈하면 같은 존에 머물러도 세션이 다시 열리지 않는다", () => {
    const { advance, drain, director } = harness();
    advance(0, IN_MEETING);
    advance(600, IN_MEETING);
    drain();
    director.confirmJoin();
    drain();
    director.leaveSession();
    const kinds = drain().map((e) => e.kind);
    expect(kinds).toContain("session-ended");
    advance(5000, IN_MEETING);
    expect(drain()).toEqual([]);
    expect(director.snapshot()?.stage).toBe("idle");
  });

  it("프롬프트 대기 중 나가면 조용히 정리된다", () => {
    const { advance, drain } = harness();
    advance(0, IN_MEETING);
    advance(600, IN_MEETING);
    drain();
    advance(0, OUTSIDE);
    advance(1200, OUTSIDE);
    // session-started가 없었으므로 session-ended도 없다.
    expect(drain()).toEqual([]);
  });
});

describe("책상·휴게실 자동 진입", () => {
  it("책상은 확인 없이 바로 집중 세션이 열린다", () => {
    const { advance, drain, director } = harness();
    advance(0, IN_FOCUS);
    advance(600, IN_FOCUS);
    const kinds = drain().map((e) => e.kind);
    expect(kinds).toEqual(["mode-entered", "session-started"]);
    expect(drain()[0]).toBeUndefined();
    const started = director.snapshot();
    expect(started?.stage).toBe("engaged");
    expect(started?.mode).toBe("focus-desk");
  });

  it("휴게실은 자동 음성방 세션이 열린다", () => {
    const { advance, drain } = harness();
    advance(0, IN_LOUNGE);
    advance(600, IN_LOUNGE);
    const kinds = drain().map((e) => e.kind);
    expect(kinds).toEqual(["mode-entered", "session-started"]);
  });

  it("스테이지는 참여 확인을 거친다", () => {
    const { advance, drain } = harness();
    advance(0, IN_STAGE);
    advance(600, IN_STAGE);
    expect(drain().map((e) => e.kind)).toEqual(["mode-entered", "join-prompt"]);
  });
});

describe("모드 전환", () => {
  it("회의실 → 휴게실 이동은 exit→enter로 처리된다", () => {
    const { advance, drain, director } = harness();
    advance(0, IN_MEETING);
    advance(600, IN_MEETING);
    drain();
    director.confirmJoin();
    drain();
    // 휴게실로 이동: 이탈 디바운스(1200ms) 후 전환.
    advance(0, IN_LOUNGE);
    advance(1199, IN_LOUNGE);
    expect(drain()).toEqual([]);
    advance(1, IN_LOUNGE);
    const kinds = drain().map((e) => e.kind);
    expect(kinds).toEqual(["session-ended", "mode-exited", "mode-entered", "session-started"]);
    expect(director.snapshot()?.mode).toBe("lounge");
  });
});

describe("트랙2 확장점", () => {
  it("화이트보드 포트가 있으면 회의 engaged 시 제안을 낸다", () => {
    const open = vi.fn();
    const { advance, drain, director } = harness({
      ports: { whiteboard: { isAvailable: () => true, open } },
    });
    advance(0, IN_MEETING);
    advance(600, IN_MEETING);
    drain();
    director.confirmJoin();
    const kinds = drain().map((e) => e.kind);
    expect(kinds).toEqual(["session-started", "whiteboard-suggestion"]);
  });

  it("포트가 없으면 제안을 내지 않는다", () => {
    const { advance, drain, director } = harness();
    advance(0, IN_MEETING);
    advance(600, IN_MEETING);
    drain();
    director.confirmJoin();
    expect(drain().map((e) => e.kind)).toEqual(["session-started"]);
  });
});

describe("snapshot", () => {
  it("존 밖에서는 null이다", () => {
    const { director } = harness();
    expect(director.snapshot()).toBeNull();
  });
});
