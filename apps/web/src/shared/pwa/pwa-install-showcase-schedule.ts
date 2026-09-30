/**
 * 앱 설치 쇼케이스 노출 스케줄 — "언제 설치 안내를 보여줄지"를 결정하는 순수 로직.
 *
 * 원칙:
 * - 첫 방문에 바로 들이밀지 않는다. 3번째 방문부터 후보가 된다.
 * - 한 번 보여줬으면 7일간 다시 보여주지 않는다.
 * - 닫았으면 14일간 다시 보여주지 않는다.
 * - 설치가 완료되면 다시는 보여주지 않는다.
 * - 오프라인 감지 시에는 별도 쿨다운으로 한 번 더 제안할 수 있다
 *   (오프라인 = 앱 설치의 가치가 가장 와닿는 순간).
 *
 * 시간과 스토리지를 주입받아 테스트 가능하게 유지한다.
 */

export type PwaShowcaseTrigger =
  | "visit-count"
  | "offline-detected"
  | "manual";

export interface PwaShowcaseScheduleState {
  readonly visits: number;
  readonly firstVisitAt: number;
  readonly lastVisitAt: number;
  readonly lastPromptAt: number | null;
  readonly dismissedAt: number | null;
  readonly offlinePromptAt: number | null;
  readonly installedAt: number | null;
}

export interface PwaShowcaseScheduleDeps {
  readonly now: () => number;
  readonly read: () => PwaShowcaseScheduleState | null;
  readonly write: (state: PwaShowcaseScheduleState) => void;
}

export interface PwaShowcaseVisitResult {
  readonly visits: number;
  readonly shouldPrompt: boolean;
  readonly trigger: PwaShowcaseTrigger | null;
}

const VISIT_THRESHOLD = 3;
const PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1_000;
const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

function blankState(now: number): PwaShowcaseScheduleState {
  return {
    visits: 0,
    firstVisitAt: now,
    lastVisitAt: now,
    lastPromptAt: null,
    dismissedAt: null,
    offlinePromptAt: null,
    installedAt: null,
  };
}

function isSameDay(a: number, b: number): boolean {
  return Math.floor(a / DAY_MS) === Math.floor(b / DAY_MS);
}

function cooldownElapsed(since: number | null, cooldownMs: number, now: number): boolean {
  return since === null || now - since >= cooldownMs;
}

export function createPwaShowcaseScheduler(deps: PwaShowcaseScheduleDeps) {
  const { now, read, write } = deps;

  function load(): PwaShowcaseScheduleState {
    return read() ?? blankState(now());
  }

  return {
    /** 방문을 기록하고, 이번 방문에서 쇼케이스를 보여줘야 하는지 반환한다. */
    recordVisit(): PwaShowcaseVisitResult {
      const at = now();
      const state = load();
      const visits = isSameDay(state.lastVisitAt, at) && state.visits > 0
        ? state.visits
        : state.visits + 1;
      const next = {
        ...state,
        visits,
        lastVisitAt: at,
      };

      let shouldPrompt = false;
      if (
        state.installedAt === null
        && visits >= VISIT_THRESHOLD
        && cooldownElapsed(state.lastPromptAt, PROMPT_COOLDOWN_MS, at)
        && cooldownElapsed(state.dismissedAt, DISMISS_COOLDOWN_MS, at)
      ) {
        shouldPrompt = true;
        next.lastPromptAt = at;
      }
      write(next);
      return { visits, shouldPrompt, trigger: shouldPrompt ? "visit-count" : null };
    },

    /**
     * 오프라인 감지 시 호출한다. 쿨다운이 지났고 설치되지 않았다면
     * 이번 오프라인에서는 한 번 제안한다.
     */
    recordOfflineDetected(): boolean {
      const at = now();
      const state = load();
      if (state.installedAt !== null) return false;
      if (!cooldownElapsed(state.offlinePromptAt, PROMPT_COOLDOWN_MS, at)) return false;
      if (!cooldownElapsed(state.dismissedAt, DISMISS_COOLDOWN_MS, at)) return false;
      write({ ...state, offlinePromptAt: at, lastPromptAt: at });
      return true;
    },

    /** 사용자가 "나중에"를 눌렀다. */
    recordDismissed(): void {
      const at = now();
      write({ ...load(), dismissedAt: at });
    },

    /** 설치가 완료됐다. 더 이상 제안하지 않는다. */
    recordInstalled(): void {
      const at = now();
      write({ ...load(), installedAt: at });
    },

    /** 수동으로 여는 경우(설정 메뉴 등)에는 스케줄과 무관하게 허용한다. */
    manualTrigger(): PwaShowcaseTrigger {
      return "manual";
    },

    read(): PwaShowcaseScheduleState {
      return load();
    },

    reset(): void {
      write(blankState(now()));
    },
  };
}

export type PwaShowcaseScheduler = ReturnType<typeof createPwaShowcaseScheduler>;

const STORAGE_KEY = "toonstudio:pwa-showcase-schedule:v1";

function readBrowserState(): PwaShowcaseScheduleState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PwaShowcaseScheduleState>;
    if (typeof parsed.visits !== "number") return null;
    return {
      visits: parsed.visits,
      firstVisitAt: typeof parsed.firstVisitAt === "number" ? parsed.firstVisitAt : 0,
      lastVisitAt: typeof parsed.lastVisitAt === "number" ? parsed.lastVisitAt : 0,
      lastPromptAt: typeof parsed.lastPromptAt === "number" ? parsed.lastPromptAt : null,
      dismissedAt: typeof parsed.dismissedAt === "number" ? parsed.dismissedAt : null,
      offlinePromptAt: typeof parsed.offlinePromptAt === "number" ? parsed.offlinePromptAt : null,
      installedAt: typeof parsed.installedAt === "number" ? parsed.installedAt : null,
    };
  } catch {
    return null;
  }
}

function writeBrowserState(state: PwaShowcaseScheduleState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 저장 실패는 설치 제안 흐름을 막지 않는다.
  }
}

/** 브라우저(localStorage) 기반 스케줄러. SSR/테스트 환경에서는 호출하지 않는다. */
export function createBrowserPwaShowcaseScheduler(): PwaShowcaseScheduler {
  return createPwaShowcaseScheduler({
    now: () => Date.now(),
    read: readBrowserState,
    write: writeBrowserState,
  });
}

/** 수동 열기/닫기를 앱 전역에 알리는 커스텀 이벤트. */
export const PWA_INSTALL_SHOWCASE_OPEN_EVENT = "toonstudio:open-install-showcase";

export function openPwaInstallShowcase(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PWA_INSTALL_SHOWCASE_OPEN_EVENT));
}
