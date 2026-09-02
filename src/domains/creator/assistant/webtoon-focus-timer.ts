/**
 * webtoon-focus-timer.ts
 *
 * Webtoon Production Stage Pomodoro Tracker & Deadline Manager.
 * Benchmarks Acon3D FocusFlow and specialized webtoon deadline trackers.
 *
 * - Tracks work duration across 6 core production stages (Storyboard, Draft, Lineart, Color, BG/3D, Finishing/SFX).
 * - Implements 3 Pomodoro intervals (Standard 25/5, Deep Flow 50/10, Sprint 15/3).
 * - Calculates total episode burn time and deadline countdown.
 */

export type WebtoonProductionStage =
  | "storyboard" // 콘티 / 연출 계획
  | "draft" // 데생 / 러프 스케치
  | "lineart" // 펜선 / 선화
  | "flat-color" // 밑색 / 채색
  | "background-3d" // 배경 / 3D 소품
  | "finishing-sfx"; // 식자 / 효과음 / 후가공

export type PomodoroMode = "standard-25" | "deep-flow-50" | "sprint-15";

export interface ProductionStageMeta {
  readonly id: WebtoonProductionStage;
  readonly label: string;
  readonly defaultTargetHours: number;
  readonly iconName: string;
}

export interface PomodoroConfig {
  readonly focusMinutes: number;
  readonly restMinutes: number;
}

export interface ProductionSessionState {
  readonly activeStage: WebtoonProductionStage;
  readonly isRunning: boolean;
  readonly isResting: boolean;
  readonly pomodoroMode: PomodoroMode;
  readonly currentSecondsRemaining: number;
  readonly completedPomodoros: number;
  readonly stageSecondsMap: Record<WebtoonProductionStage, number>;
  readonly deadlineIsoString?: string;
}

export const PRODUCTION_STAGES: readonly ProductionStageMeta[] = [
  { id: "storyboard", label: "콘티 / 연출", defaultTargetHours: 8, iconName: "NotebookPen" },
  { id: "draft", label: "데생 / 러프", defaultTargetHours: 12, iconName: "Pencil" },
  { id: "lineart", label: "펜선 / 선화", defaultTargetHours: 16, iconName: "Paintbrush" },
  { id: "flat-color", label: "밑색 / 채색", defaultTargetHours: 18, iconName: "Palette" },
  { id: "background-3d", label: "배경 / 3D", defaultTargetHours: 10, iconName: "Layers" },
  { id: "finishing-sfx", label: "식자 / 효과", defaultTargetHours: 6, iconName: "Type" },
];

export const POMODORO_CONFIGS: Record<PomodoroMode, PomodoroConfig> = {
  "standard-25": { focusMinutes: 25, restMinutes: 5 },
  "deep-flow-50": { focusMinutes: 50, restMinutes: 10 },
  "sprint-15": { focusMinutes: 15, restMinutes: 3 },
};

export class WebtoonFocusTimerEngine {
  private state: ProductionSessionState;

  constructor(initialStage: WebtoonProductionStage = "storyboard", mode: PomodoroMode = "standard-25") {
    const config = POMODORO_CONFIGS[mode];
    this.state = {
      activeStage: initialStage,
      isRunning: false,
      isResting: false,
      pomodoroMode: mode,
      currentSecondsRemaining: config.focusMinutes * 60,
      completedPomodoros: 0,
      stageSecondsMap: {
        storyboard: 0,
        draft: 0,
        lineart: 0,
        "flat-color": 0,
        "background-3d": 0,
        "finishing-sfx": 0,
      },
    };
  }

  public getState(): ProductionSessionState {
    return { ...this.state };
  }

  public setStage(stage: WebtoonProductionStage): void {
    this.state = { ...this.state, activeStage: stage };
  }

  public setPomodoroMode(mode: PomodoroMode): void {
    const config = POMODORO_CONFIGS[mode];
    this.state = {
      ...this.state,
      pomodoroMode: mode,
      isResting: false,
      isRunning: false,
      currentSecondsRemaining: config.focusMinutes * 60,
    };
  }

  public start(): void {
    this.state = { ...this.state, isRunning: true };
  }

  public pause(): void {
    this.state = { ...this.state, isRunning: false };
  }

  /**
   * Advances timer by deltaSeconds (normally 1s per tick).
   */
  public tick(deltaSeconds = 1): void {
    if (!this.state.isRunning) return;

    // Track active work time
    if (!this.state.isResting) {
      const currentSpent = this.state.stageSecondsMap[this.state.activeStage];
      this.state.stageSecondsMap[this.state.activeStage] = currentSpent + deltaSeconds;
    }

    const nextRemaining = this.state.currentSecondsRemaining - deltaSeconds;

    if (nextRemaining <= 0) {
      // Transition between focus and rest
      const config = POMODORO_CONFIGS[this.state.pomodoroMode];
      if (!this.state.isResting) {
        // Switch to rest
        this.state = {
          ...this.state,
          isResting: true,
          completedPomodoros: this.state.completedPomodoros + 1,
          currentSecondsRemaining: config.restMinutes * 60,
        };
      } else {
        // Switch back to focus
        this.state = {
          ...this.state,
          isResting: false,
          currentSecondsRemaining: config.focusMinutes * 60,
        };
      }
    } else {
      this.state = {
        ...this.state,
        currentSecondsRemaining: nextRemaining,
      };
    }
  }

  /**
   * Calculates total elapsed time in hours across all stages.
   */
  public getTotalWorkHours(): number {
    const totalSec = Object.values(this.state.stageSecondsMap).reduce((acc, s) => acc + s, 0);
    return Number((totalSec / 3600).toFixed(2));
  }

  /**
   * Calculates countdown to deadline in days/hours.
   */
  public calculateDeadlineToHours(deadlineIso: string): {
    daysRemaining: number;
    hoursRemaining: number;
    isPastDeadline: boolean;
  } {
    const deadlineMs = new Date(deadlineIso).getTime();
    const nowMs = Date.now();
    const diffMs = deadlineMs - nowMs;

    if (diffMs <= 0) {
      return { daysRemaining: 0, hoursRemaining: 0, isPastDeadline: true };
    }

    const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;

    return {
      daysRemaining: days,
      hoursRemaining: hours,
      isPastDeadline: false,
    };
  }
}
