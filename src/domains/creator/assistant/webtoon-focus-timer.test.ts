import { describe, expect, it } from "vitest";

import {
  WebtoonFocusTimerEngine,
  PRODUCTION_STAGES,
  POMODORO_CONFIGS,
} from "./webtoon-focus-timer";

describe("WebtoonFocusTimerEngine", () => {
  it("initializes with 6 production stages and standard 25min mode", () => {
    const engine = new WebtoonFocusTimerEngine();
    const state = engine.getState();

    expect(PRODUCTION_STAGES.length).toBe(6);
    expect(state.activeStage).toBe("storyboard");
    expect(state.pomodoroMode).toBe("standard-25");
    expect(state.currentSecondsRemaining).toBe(25 * 60);
    expect(state.isRunning).toBe(false);
  });

  it("switches stage and pomodoro mode correctly", () => {
    const engine = new WebtoonFocusTimerEngine();

    engine.setStage("lineart");
    expect(engine.getState().activeStage).toBe("lineart");

    engine.setPomodoroMode("deep-flow-50");
    expect(engine.getState().pomodoroMode).toBe("deep-flow-50");
    expect(engine.getState().currentSecondsRemaining).toBe(50 * 60);
  });

  it("advances active stage time on tick while running", () => {
    const engine = new WebtoonFocusTimerEngine("flat-color", "sprint-15");
    engine.start();

    engine.tick(60); // 1 minute
    const state = engine.getState();

    expect(state.stageSecondsMap["flat-color"]).toBe(60);
    expect(state.currentSecondsRemaining).toBe(15 * 60 - 60);
  });

  it("transitions to rest cycle upon timer expiry", () => {
    const engine = new WebtoonFocusTimerEngine("storyboard", "sprint-15");
    engine.start();

    // Fast-forward full focus cycle (15 min = 900s)
    engine.tick(900);
    const state = engine.getState();

    expect(state.isResting).toBe(true);
    expect(state.completedPomodoros).toBe(1);
    expect(state.currentSecondsRemaining).toBe(
      POMODORO_CONFIGS["sprint-15"].restMinutes * 60,
    );
  });

  it("calculates total work hours correctly", () => {
    const engine = new WebtoonFocusTimerEngine();
    engine.start();
    engine.tick(3600); // 1 hour

    expect(engine.getTotalWorkHours()).toBeCloseTo(1.0, 1);
  });

  it("computes deadline countdown accurately", () => {
    const engine = new WebtoonFocusTimerEngine();
    const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const countdown = engine.calculateDeadlineToHours(futureDate);
    expect(countdown.isPastDeadline).toBe(false);
    expect(countdown.daysRemaining).toBeGreaterThanOrEqual(1);
  });
});
