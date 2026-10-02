import { describe, expect, it } from "vitest";
import {
  createStudioAppTimer,
  formatStudioAppTimerClock,
  pauseStudioAppTimer,
  resetStudioAppTimer,
  startStudioAppTimer,
  studioAppTimerProgress,
  tickStudioAppTimer,
} from "./studio-virtual-space-app-timer";

describe("집중 타이머 상태 머신", () => {
  it("기본 프리셋은 25분이고 깨진 입력은 기본값으로 되돌린다", () => {
    const timer = createStudioAppTimer(25);
    expect(timer.durationMs).toBe(25 * 60_000);
    expect(timer.remainingMs).toBe(timer.durationMs);
    expect(timer.running).toBe(false);
    expect(createStudioAppTimer(0).durationMs).toBe(25 * 60_000);
    expect(createStudioAppTimer(Number.NaN).durationMs).toBe(25 * 60_000);
    expect(createStudioAppTimer(-3).durationMs).toBe(25 * 60_000);
  });

  it("시작 후 tick이 경과 시간을 차감한다", () => {
    const started = startStudioAppTimer(createStudioAppTimer(1), 1_000);
    expect(started.running).toBe(true);
    const ticked = tickStudioAppTimer(started, 11_000);
    expect(ticked.remainingMs).toBe(50_000);
    expect(ticked.finished).toBe(false);
  });

  it("정지 중에는 tick이 차감하지 않는다", () => {
    const idle = createStudioAppTimer(1);
    expect(tickStudioAppTimer(idle, 99_000)).toBe(idle);
  });

  it("일시정지는 그 시점까지 차감하고 멈춘다", () => {
    const started = startStudioAppTimer(createStudioAppTimer(1), 0);
    const paused = pauseStudioAppTimer(started, 20_000);
    expect(paused.remainingMs).toBe(40_000);
    expect(paused.running).toBe(false);
    expect(tickStudioAppTimer(paused, 50_000)).toBe(paused);
  });

  it("남은 시간이 0이 되면 finished가 되고 running이 꺼진다", () => {
    const started = startStudioAppTimer(createStudioAppTimer(1), 0);
    const done = tickStudioAppTimer(started, 61_000);
    expect(done.remainingMs).toBe(0);
    expect(done.finished).toBe(true);
    expect(done.running).toBe(false);
    // 완료된 타이머는 다시 시작할 수 없다 (리셋 필요).
    expect(startStudioAppTimer(done, 100_000)).toBe(done);
  });

  it("리셋하면 전체 길이로 돌아간다", () => {
    const started = startStudioAppTimer(createStudioAppTimer(5), 0);
    const ticked = tickStudioAppTimer(started, 30_000);
    const reset = resetStudioAppTimer(ticked);
    expect(reset.remainingMs).toBe(5 * 60_000);
    expect(reset.running).toBe(false);
    expect(reset.finished).toBe(false);
  });

  it("진행률은 0~1로 clamp된다", () => {
    const fresh = createStudioAppTimer(10);
    expect(studioAppTimerProgress(fresh)).toBe(0);
    const started = startStudioAppTimer(fresh, 0);
    const half = tickStudioAppTimer(started, 5 * 60_000);
    expect(studioAppTimerProgress(half)).toBeCloseTo(0.5);
  });

  it("시계 표시는 MM:SS로 올림 처리한다", () => {
    expect(formatStudioAppTimerClock(0)).toBe("00:00");
    expect(formatStudioAppTimerClock(61_000)).toBe("01:01");
    expect(formatStudioAppTimerClock(59_500)).toBe("01:00");
    expect(formatStudioAppTimerClock(Number.NaN)).toBe("00:00");
  });
});
