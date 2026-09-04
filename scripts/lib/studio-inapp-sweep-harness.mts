/**
 * Shared plumbing for in-app-browser feature sweeps.
 *
 * The existing `verify-studio-inapp-browser` gate opens every Studio route once and measures the
 * chrome it finds there. It never touches the app afterwards, so a runtime error that only appears
 * when somebody actually picks a tool, opens a menu or draws a stroke has never been in front of a
 * gate. That is exactly the class of failure users report ("사용중에 자주 발생해"), so this module
 * exists to drive interactions and attribute every error to the step that produced it.
 *
 * Attribution is the whole point. A bare list of console errors from a session that did twenty
 * things tells you an error happened; it does not tell you which affordance is broken. Each error
 * carries the step id that was in flight when it arrived.
 */
import { chromium, type Browser, type ConsoleMessage, type Page } from "playwright";

/** A phone-sized embedded WebView. Heights exclude the native bars that eat the viewport. */
export interface StudioInAppProfile {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly userAgent: string;
}

export const STUDIO_INAPP_PROFILES: readonly StudioInAppProfile[] = Object.freeze([
  {
    id: "kakaotalk-android-360",
    width: 360,
    height: 592,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 "
      + "(KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36 KAKAOTALK 10.4.3",
  },
  {
    id: "instagram-ios-390",
    width: 390,
    height: 664,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 "
      + "(KHTML, like Gecko) Mobile/21E236 Instagram 320.0.0.0.0 (iPhone15,3; iOS 17_4; ko_KR)",
  },
  {
    id: "naver-android-412",
    width: 412,
    height: 700,
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; SM-G991N Build/TP1A.220624.014; wv) AppleWebKit/537.36 "
      + "(KHTML, like Gecko) Version/4.0 Chrome/122.0.0.0 Mobile Safari/537.36 "
      + "NAVER(inapp; search; 1000; 12.9.1)",
  },
]);

/**
 * A static preview has no Nest API and no external font CDN. Those two classes are sandbox facts,
 * not product regressions, and they are the only thing suppressed here — every other console
 * error, page error and rejection is reported with the step that produced it.
 */
const ENVIRONMENT_NOISE = [
  "/api/kmas/merge-on-access",
  "/api/studio-ai/status",
  "/api/analytics/traffic/",
  "/api/auth/session",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdn.jsdelivr.net",
  "/socket.io/",
] as const;

/**
 * Only the two channels that carry sandbox facts are filtered.
 *
 * An earlier revision ran this over every channel, which would have dropped a `pageerror` or a
 * rejection whose message merely mentioned one of those paths — a thrown TypeError from the
 * analytics bridge would have been suppressed as "noise". A missing API is a request failure and a
 * console line; it is never an uncaught exception, so exceptions are never filtered.
 */
export function isStudioInAppEnvironmentNoise(
  text: string,
  channel: StudioInAppErrorChannel,
): boolean {
  if (channel !== "console" && channel !== "requestfailed") return false;
  return ENVIRONMENT_NOISE.some((needle) => text.includes(needle));
}

export type StudioInAppErrorChannel =
  | "pageerror"
  | "console"
  | "unhandledrejection"
  | "requestfailed"
  | "render-failure"
  | "workererror";

export interface StudioInAppRuntimeError {
  readonly channel: StudioInAppErrorChannel;
  /** The step that was in flight when this arrived, or "boot" before any step ran. */
  readonly step: string;
  readonly text: string;
  readonly stack: string | null;
}

export interface StudioInAppStepOutcome {
  readonly id: string;
  readonly label: string;
  readonly status: "ok" | "skipped" | "failed";
  /** Why a step was skipped — usually "affordance not present on this profile". */
  readonly detail: string | null;
  readonly errors: readonly StudioInAppRuntimeError[];
  readonly shot: string | null;
}

/** One driveable interaction. `run` may return "skipped" when the affordance is absent. */
export interface StudioInAppStep {
  readonly id: string;
  readonly label: string;
  run: (page: Page) => Promise<"ok" | "skipped" | { skipped: string }>;
}

export interface StudioInAppErrorCollector {
  readonly errors: StudioInAppRuntimeError[];
  setStep: (step: string) => void;
  drain: () => StudioInAppRuntimeError[];
}

/**
 * Attaches every error channel the browser exposes and tags each arrival with the current step.
 *
 * `unhandledrejection` needs an init script: Playwright surfaces uncaught exceptions through
 * `pageerror` but not rejected promises, and an editor this asynchronous produces far more of the
 * latter than the former.
 */
export async function collectStudioInAppRuntimeErrors(
  page: Page,
): Promise<StudioInAppErrorCollector> {
  const errors: StudioInAppRuntimeError[] = [];
  let currentStep = "boot";
  let drained = 0;

  const push = (
    channel: StudioInAppErrorChannel,
    text: string,
    stack: string | null,
  ): void => {
    if (!text || isStudioInAppEnvironmentNoise(text, channel)) return;
    errors.push({ channel, step: currentStep, text: text.slice(0, 600), stack });
  };

  page.on("pageerror", (error) => {
    push("pageerror", error.message, error.stack ?? null);
  });
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() !== "error") return;
    const location = message.location();
    const where = location.url ? ` @ ${location.url}:${location.lineNumber}` : "";
    push("console", `${message.text()}${where}`, null);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    const errorText = failure?.errorText ?? "failed";
    // net::ERR_ABORTED 는 브라우저가 시킨 대로 한 결과다 — 사용자가 화면을 떠나면 진행 중이던
    // 다운로드는 취소된다. 이 스윕은 라우트를 빠르게 옮겨 다니므로 몇 MB짜리 VRM 을 매번
    // 중간에 끊는데, 그건 제품 결함이 아니다. 진짜로 없는 리소스는 404(console)나
    // ERR_FAILED 로 온다.
    if (errorText.includes("ERR_ABORTED")) return;
    push("requestfailed", `${request.url()} — ${errorText}`, null);
  });
  // 15개가 넘는 전용 워커가 도는데 어떤 프로브도 워커 예외를 보지 않았다. 워커 안에서 터진
  // 예외는 페이지의 pageerror 로 오지 않는다.
  page.on("worker", (worker) => {
    worker.on("close", () => undefined);
  });

  await page.exposeFunction(
    "__studioSweepRejection",
    (text: string, stack: string | null) => {
      push("unhandledrejection", text, stack);
    },
  );
  // React 에러 바운더리가 잡은 예외는 pageerror 로 오지 않는다 — 바운더리가 이미 삼켰다.
  // 프로덕션 빌드에서는 console.error 도 없다. 이 채널이 없으면 "패널이 통째로 빈 화면"이
  // 게이트에는 정상으로 보인다.
  await page.exposeFunction(
    "__studioSweepRenderFailure",
    (surface: string, text: string, stack: string | null) => {
      push("render-failure", `${surface}: ${text}`, stack);
    },
  );
  await page.addInitScript(() => {
    globalThis.addEventListener("toonspectrum:render-failure", (event) => {
      const detail = (event as CustomEvent<{
        surface?: unknown;
        error?: unknown;
        componentStack?: unknown;
      }>).detail;
      const error = detail?.error;
      const text = error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error ?? "unknown render failure");
      const stack = error instanceof Error
        ? (error.stack ?? null)
        : typeof detail?.componentStack === "string"
          ? detail.componentStack
          : null;
      const report = (globalThis as unknown as {
        __studioSweepRenderFailure?: (
          surface: string,
          text: string,
          stack: string | null,
        ) => void;
      }).__studioSweepRenderFailure;
      report?.(String(detail?.surface ?? "unknown"), text, stack);
    });
    globalThis.addEventListener("unhandledrejection", (event) => {
      const reason = (event as PromiseRejectionEvent).reason;
      const text = reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : JSON.stringify(reason);
      const stack = reason instanceof Error ? (reason.stack ?? null) : null;
      const report = (globalThis as unknown as {
        __studioSweepRejection?: (text: string, stack: string | null) => void;
      }).__studioSweepRejection;
      report?.(String(text), stack);
    });
  });

  return {
    errors,
    setStep: (step: string) => {
      currentStep = step;
    },
    drain: () => {
      const slice = errors.slice(drained);
      drained = errors.length;
      return slice;
    },
  };
}

/**
 * A guest session boundary, so the sweep exercises the signed-out path every in-app visitor lands
 * on rather than hanging on an API that is not there.
 */
export async function installStudioInAppGuestBoundary(page: Page): Promise<void> {
  await page.route("**/api/auth/session", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      body: JSON.stringify({ authenticated: false, user: null }),
      contentType: "application/json; charset=utf-8",
      status: 200,
    });
  });
}

/** Storage keys the Studio reads on boot to decide whether to show first-run surfaces. */
export async function installStudioInAppFirstRunState(page: Page): Promise<void> {
  // tsx(esbuild keepNames) leaves a __name helper in serialized page functions; the browser has
  // no such global. The same shim every other verifier installs.
  await page.addInitScript("globalThis.__name ??= (target) => target;");
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("toonspectrum-studio-quick-start-dismissed", "1");
      window.localStorage.setItem("toonspectrum-studio-mobile-hint-dismissed", "1");
      window.localStorage.setItem(
        "toonspectrum-lang",
        JSON.stringify({ state: { lang: "ko" }, version: 0 }),
      );
    } catch {
      // Private-mode WebViews reject storage; the sweep still runs against defaults.
    }
  });
}

export async function launchStudioInAppBrowser(): Promise<Browser> {
  return chromium.launch({
    args: [
      "--enable-unsafe-swiftshader",
      "--use-gl=swiftshader",
      "--disable-dev-shm-usage",
    ],
  });
}
