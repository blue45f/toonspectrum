import { describe, expect, it } from "vitest";
import {
  createStudioFocusSession,
  formatStudioFocusClock,
  pauseStudioFocusSession,
  resumeStudioFocusSession,
  startStudioFocusSession,
  stopStudioFocusSession,
  studioFocusProgress,
  studioFocusRemainingMs,
  studioFocusSessionActive,
  studioFocusStatusForPhase,
  tickStudioFocusSession,
  STUDIO_FOCUS_BREAK_MS,
  STUDIO_FOCUS_DEFAULT_MS,
} from "./studio-virtual-space-focus-session";

const T0 = 1_000_000;

describe("createStudioFocusSession", () => {
  it("기본 25분 idle 세션을 만든다", () => {
    const session = createStudioFocusSession();
    expect(session.phase).toBe("idle");
    expect(session.durationMs).toBe(STUDIO_FOCUS_DEFAULT_MS);
    expect(studioFocusRemainingMs(session, T0)).toBe(STUDIO_FOCUS_DEFAULT_MS);
    expect(studioFocusProgress(session, T0)).toBe(0);
    expect(studioFocusSessionActive(session)).toBe(false);
  });

  it("잘못된 길이는 기본값으로 되돌린다", () => {
    expect(createStudioFocusSession(-5).durationMs).toBe(STUDIO_FOCUS_DEFAULT_MS);
    expect(createStudioFocusSession(Number.NaN).durationMs).toBe(STUDIO_FOCUS_DEFAULT_MS);
    expect(createStudioFocusSession(90_000).durationMs).toBe(90_000);
  });
});

describe("집중 전이", () => {
  it("시작하면 running이 되고 종료 예정이 잡힌다", () => {
    const session = startStudioFocusSession(createStudioFocusSession(60_000), T0);
    expect(session.phase).toBe("running");
    expect(session.endsAt).toBe(T0 + 60_000);
    expect(studioFocusSessionActive(session)).toBe(true);
    expect(studioFocusStatusForPhase(session.phase)).toBe("focusing");
  });

  it("running에서 다시 시작해도 그대로다", () => {
    const running = startStudioFocusSession(createStudioFocusSession(60_000), T0);
    expect(startStudioFocusSession(running, T0 + 1000)).toBe(running);
  });

  it("일시정지하면 남은 시간을 들고, 재개하면 이어진다", () => {
    const running = startStudioFocusSession(createStudioFocusSession(60_000), T0);
    const paused = pauseStudioFocusSession(running, T0 + 20_000);
    expect(paused.phase).toBe("paused");
    expect(studioFocusRemainingMs(paused, T0 + 999_000)).toBe(40_000);
    const resumed = resumeStudioFocusSession(paused, T0 + 100_000);
    expect(resumed.phase).toBe("running");
    expect(resumed.endsAt).toBe(T0 + 140_000);
    // paused에서 start를 눌러도 재개와 같다
    expect(startStudioFocusSession(paused, T0 + 100_000)).toEqual(resumed);
  });

  it("중단하면 idle로 돌아가고 마친 횟수는 유지된다", () => {
    const running = startStudioFocusSession(createStudioFocusSession(60_000), T0);
    const { session: onBreak } = tickStudioFocusSession(running, T0 + 60_000);
    const stopped = stopStudioFocusSession(onBreak);
    expect(stopped.phase).toBe("idle");
    expect(stopped.completedCount).toBe(1);
  });
});

describe("tickStudioFocusSession", () => {
  it("집중이 끝나면 휴식 구간과 focus-completed 이벤트가 온다", () => {
    const running = startStudioFocusSession(createStudioFocusSession(60_000), T0);
    const before = tickStudioFocusSession(running, T0 + 59_999);
    expect(before.event).toBeNull();
    expect(before.session).toBe(running);
    const after = tickStudioFocusSession(running, T0 + 60_000);
    expect(after.event).toBe("focus-completed");
    expect(after.session.phase).toBe("break");
    expect(after.session.completedCount).toBe(1);
    expect(after.session.endsAt).toBe(T0 + 60_000 + STUDIO_FOCUS_BREAK_MS);
    expect(studioFocusStatusForPhase(after.session.phase)).toBe("break");
  });

  it("휴식이 끝나면 done과 break-completed 이벤트가 온다", () => {
    const running = startStudioFocusSession(createStudioFocusSession(60_000), T0);
    const { session: onBreak } = tickStudioFocusSession(running, T0 + 60_000);
    const done = tickStudioFocusSession(onBreak, T0 + 60_000 + STUDIO_FOCUS_BREAK_MS);
    expect(done.event).toBe("break-completed");
    expect(done.session.phase).toBe("done");
    expect(studioFocusSessionActive(done.session)).toBe(false);
    // done에서 새 세션을 시작할 수 있다
    const again = startStudioFocusSession(done.session, T0 + 500_000);
    expect(again.phase).toBe("running");
    expect(again.completedCount).toBe(1);
  });

  it("paused에서는 시간이 흘러도 전이하지 않는다", () => {
    const running = startStudioFocusSession(createStudioFocusSession(60_000), T0);
    const paused = pauseStudioFocusSession(running, T0 + 10_000);
    const ticked = tickStudioFocusSession(paused, T0 + 999_000);
    expect(ticked.event).toBeNull();
    expect(ticked.session).toBe(paused);
  });
});

describe("진행률과 시계 표시", () => {
  it("진행률은 남은 시간에 반비례하고 0~1로 clamp된다", () => {
    const running = startStudioFocusSession(createStudioFocusSession(60_000), T0);
    expect(studioFocusProgress(running, T0)).toBe(0);
    expect(studioFocusProgress(running, T0 + 30_000)).toBeCloseTo(0.5);
    expect(studioFocusProgress(running, T0 + 120_000)).toBe(1);
  });

  it("mm:ss로 표시하고 초는 올림한다", () => {
    expect(formatStudioFocusClock(25 * 60_000)).toBe("25:00");
    expect(formatStudioFocusClock(61_000)).toBe("1:01");
    expect(formatStudioFocusClock(59_001)).toBe("1:00");
    expect(formatStudioFocusClock(0)).toBe("0:00");
    expect(formatStudioFocusClock(-100)).toBe("0:00");
  });
});
