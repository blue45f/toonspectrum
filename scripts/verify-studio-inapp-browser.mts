/**
 * scripts/verify-studio-inapp-browser.mts
 * 인앱 브라우저(카카오톡·인스타그램·네이버앱) 전 라우트 스윕.
 *
 * `verify-studio-mobile-top` 이 한 라우트(/studio)의 **상단 크롬**을 정밀하게 재는 반면,
 * 이 게이트는 Studio 가 소유한 **모든 라우트**를 인앱 브라우저 조건에서 한 번씩 열어 본다.
 * 두 축이 다르다:
 *
 * - UA 가 임베디드 WebView 다. `window.open` 이 언제나 null 이라, 팝업에 의존하는 어포던스는
 *   눌러도 아무 일이 없는 죽은 컨트롤이 된다. 이 게이트는 그런 컨트롤이 렌더링되면 실패한다.
 * - 주소창도 뒤로 가기 크롬도 없다. 화면 안에 나가는 문이 없으면 사용자는 앱을 끄는 것 말고
 *   길이 없다 — 모든 라우트가 최소 하나의 인페이지 이탈 경로를 갖는지 확인한다.
 * - 인앱 브라우저는 상·하단 네이티브 바가 뷰포트를 먹는다. 그래서 같은 폭이라도 세로가
 *   짧다(390×664 등). 짧은 뷰포트에서 가로 넘침과 터치 타깃을 다시 잰다.
 *
 * 터치 타깃은 가로 스크롤 행 안의 항목을 제외한다 — 스크롤로 도달할 수 있는 UI 는 잘림이
 * 아니다(도크의 드로잉 도구 행이 그 계약으로 설계돼 있다).
 *
 * Run via: pnpm verify:studio-inapp-browser  (expects a production build in dist/)
 * Logs [verify-inapp] per route; exits 1 on hard failures.
 */
import { type ChildProcess } from "node:child_process";
import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type Browser, type Page } from "playwright";

import {
  cleanScratchDir,
  findFreePort,
  spawnVitePreview,
  stopChildProcess,
  waitForServer,
} from "./lib/studio-verify-preview-harness.mjs";

const SCRATCH = process.env.TOONSPECTRUM_INAPP_VERIFY_DIR ??
  process.env.TOONSPECTRUM_VERIFY_DIR ??
  join(tmpdir(), "toonspectrum-studio-inapp");

/** 44px 계약. 반올림 오차를 흡수하려고 0.5px 만 완화한다. */
const MIN_TAP_PX = 43.5;

interface InAppProfile {
  readonly id: string;
  /** 네이티브 상·하단 바를 뺀 실제 표시 영역. */
  readonly height: number;
  readonly userAgent: string;
  readonly width: number;
}

const PROFILES: readonly InAppProfile[] = Object.freeze([
  {
    id: "kakaotalk-android-360",
    height: 592,
    width: 360,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36 KAKAOTALK 10.4.3",
  },
  {
    id: "instagram-ios-390",
    height: 664,
    width: 390,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 " +
      "(KHTML, like Gecko) Mobile/21E236 Instagram 320.0.0.0.0 (iPhone15,3; iOS 17_4; ko_KR)",
  },
  {
    id: "naver-android-412",
    height: 700,
    width: 412,
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; SM-G991N Build/TP1A.220624.014; wv) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Version/4.0 Chrome/122.0.0.0 Mobile Safari/537.36 " +
      "NAVER(inapp; search; 1000; 12.9.1)",
  },
]);

interface RouteProbe {
  readonly id: string;
  readonly path: string;
  /** 이 라우트가 완전히 뜬 것으로 볼 selector. */
  readonly readySelector: string;
  /**
   * 특정 프로파일에서만 돌릴 라우트. 생략하면 전 프로파일.
   *
   * 폭·높이가 결과를 바꾸지 않는 검사(죽은 팝업 어포던스, 출구 유무 같은 DOM 모양)는 한
   * 프로파일이면 신호가 다 나온다. 세 프로파일로 늘려 봐야 같은 실패를 세 번 보고할 뿐이다.
   */
  readonly profiles?: readonly string[];
}

/**
 * 실제 공유 링크가 달고 오는 형태의 컴패니언 세션 ID.
 *
 * `isStudioCompanionSessionId` 의 `/^[A-Za-z0-9_-]{12,96}$/` 를 통과해야 한다
 * (studio-tools-companion.ts). 통과해야 하는 이유가 핵심이다 — 형식이 유효하면 페이지는
 * "세션 없음" 에러 경로를 타지 않고 BroadcastChannel 을 열어 기본 탭을 기다린다. 그 상태가
 * 바로 인앱 브라우저 사용자가 갇혔던 곳인데, 세션 없는 URL 만 훑던 이전 게이트는 매번 에러
 * 경로로 새서 초록불을 냈다.
 */
const VALID_COMPANION_SESSION = "studio-inapp-verify-session-0001";

/**
 * Studio 가 소유한 라우트 전부. 편집기 서피스는 같은 셸을 공유하지만 각기 다른 지연 청크를
 * 마운트하므로 하나로 묶지 않는다 — 넘침과 타깃 크기는 마운트된 패널이 정한다.
 */
const ROUTES: readonly RouteProbe[] = Object.freeze([
  { id: "editor", path: "/studio", readySelector: '[data-studio-mobile-editing-dock="true"]' },
  { id: "comic", path: "/studio/comic", readySelector: '[data-studio-mobile-editing-dock="true"]' },
  { id: "animation", path: "/studio/animation", readySelector: '[data-studio-mobile-editing-dock="true"]' },
  { id: "brushes", path: "/studio/brushes", readySelector: '[data-studio-mobile-editing-dock="true"]' },
  { id: "publish", path: "/studio/publish", readySelector: "h1" },
  { id: "companion-workspace", path: "/studio/companion/workspace", readySelector: "h1" },
  { id: "companion-review", path: "/studio/companion/review", readySelector: "h1" },
  // 유효한 세션을 달고 들어오지만 응답할 기본 탭이 없는 상태 — 공유 링크를 탄 사용자가
  // 실제로 도착하는 화면이다. 위 두 항목은 세션이 없어서 에러 경로로 빠지므로 이걸 못 잡는다.
  {
    id: "companion-workspace-session",
    path: `/studio/companion/workspace?session=${VALID_COMPANION_SESSION}`,
    profiles: ["kakaotalk-android-360"],
    readySelector: "h1",
  },
  {
    id: "companion-review-session",
    path: `/studio/companion/review?session=${VALID_COMPANION_SESSION}`,
    profiles: ["kakaotalk-android-360"],
    readySelector: "h1",
  },
  { id: "lift3d", path: "/studio/lift3d", readySelector: "h1" },
  { id: "placeholder-projects", path: "/studio/projects", readySelector: "h1" },
  { id: "invalid", path: "/studio/nope", readySelector: "h1" },
]);

/**
 * 정적 프리뷰에는 Nest API 도, 외부 폰트 CDN 도 없다. 이 게이트가 잡으려는 것은 제품 회귀이지
 * 샌드박스 네트워크가 아니므로, 그 두 부류만 콘솔 실패에서 제외한다.
 */
const IGNORED_CONSOLE = [
  "/api/kmas/merge-on-access",
  "/api/studio-ai/status",
  "/api/analytics/traffic/",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdn.jsdelivr.net",
  "/socket.io/",
] as const;

interface RouteIssue {
  readonly detail: string;
  readonly label: string;
}

interface RouteMetrics {
  readonly deadPopupControls: readonly RouteIssue[];
  readonly docOverflowX: number;
  readonly exitAffordances: readonly string[];
  readonly interactiveCount: number;
  readonly overflowContributors: readonly RouteIssue[];
  readonly smallTargets: readonly RouteIssue[];
  readonly unnamedControls: readonly RouteIssue[];
  readonly viewportHeight: number;
  readonly viewportWidth: number;
}

interface RouteResult {
  readonly hardFailures: readonly string[];
  readonly metrics: RouteMetrics;
  readonly profile: string;
  readonly route: string;
  readonly ok: boolean;
  readonly shot: string;
  readonly warnings: readonly string[];
}

function log(message: string): void {
  const line = `[verify-inapp] ${message}`;
  console.log(line);
  try {
    appendFileSync(join(SCRATCH, "studio-inapp-verify.log"), `${line}\n`);
  } catch {
    // 로그 파일이 없어도 게이트 판정은 stdout 만으로 완결된다.
  }
}

async function installGuestSessionBoundary(page: Page): Promise<void> {
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

/**
 * 한 번의 DOM 패스로 라우트 전체를 잰다. 페이지 안에서 실행해야 Tailwind 의 `pointer-coarse`
 * 변형까지 반영된 실제 계산 레이아웃을 본다.
 */
const AUDIT_SCRIPT = `(() => {
  var vw = window.innerWidth, vh = window.innerHeight, EPS = 0.5, MIN = ${MIN_TAP_PX};
  function describe(el) {
    var label = el.getAttribute('aria-label') || el.getAttribute('title') ||
      (el.textContent || '').trim().slice(0, 28);
    return el.tagName.toLowerCase() + '"' + label + '"';
  }
  function visible(el) {
    if (el.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    var style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    var rect = el.getBoundingClientRect();
    return rect.width >= 2 && rect.height >= 2;
  }
  /** 가로 스크롤 행 안의 항목은 스크롤로 도달 가능하므로 넘침·크기 판정에서 뺀다. */
  function scrollRow(el) {
    var node = el.parentElement;
    while (node && node !== document.body) {
      var overflowX = getComputedStyle(node).overflowX;
      if ((overflowX === 'auto' || overflowX === 'scroll') &&
          node.scrollWidth > node.clientWidth + 1) return node;
      node = node.parentElement;
    }
    return null;
  }
  var SELECTOR = "button, a[href], input:not([type='hidden']), select, textarea, [role='button']";
  var elements = document.querySelectorAll(SELECTOR);
  var smallTargets = [], overflowContributors = [], unnamedControls = [], deadPopupControls = [];
  var exitAffordances = [], interactiveCount = 0;
  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    if (!visible(el)) continue;
    interactiveCount++;
    var rect = el.getBoundingClientRect();
    var row = scrollRow(el);
    var disabled = el.disabled === true || el.getAttribute('aria-disabled') === 'true';

    if (!row && (rect.right > vw + EPS || rect.left < -EPS)) {
      overflowContributors.push({
        label: describe(el),
        detail: 'rect=[' + rect.left.toFixed(1) + ', ' + rect.right.toFixed(1) + '] vw=' + vw
      });
    }
    if (!row && !disabled && rect.top < vh && rect.bottom > 0 &&
        (rect.height < MIN || rect.width < MIN)) {
      smallTargets.push({
        label: describe(el),
        detail: rect.width.toFixed(1) + 'x' + rect.height.toFixed(1)
      });
    }
    var wrappingLabel = el.closest('label');
    var named = (el.textContent || '').trim().length > 0 ||
      (wrappingLabel ? (wrappingLabel.textContent || '').trim().length > 0 : false) ||
      Boolean(el.getAttribute('aria-label')) ||
      Boolean(el.getAttribute('aria-labelledby')) ||
      Boolean(el.getAttribute('title'));
    if (!named) {
      unnamedControls.push({
        label: el.tagName.toLowerCase() + '.' + String(el.className).slice(0, 40),
        detail: 'icon-only control without an accessible name'
      });
    }
    // 인앱 브라우저에서 새 창을 여는 어포던스는 눌러도 아무 일이 없다.
    var target = el.getAttribute('target');
    if (target === '_blank') {
      deadPopupControls.push({ label: describe(el), detail: 'target="_blank" in an in-app browser' });
    }
    if (el.hasAttribute('data-studio-presence-companion-tab')) {
      deadPopupControls.push({ label: describe(el), detail: 'companion popup trigger' });
    }
    // 인페이지 이탈 경로. 앱 안 다른 주소로 가는 링크가 1순위이고, 몰입 셸에서는 전체화면
    // 토글이 그 문이다 — 끄면 사이트 헤더(GNB)가 돌아와 Studio 밖으로 나갈 수 있다.
    var href = el.getAttribute('href');
    if (href && href.charAt(0) === '/') exitAffordances.push(describe(el) + ' -> ' + href);
    if (el.hasAttribute('data-studio-mobile-app-mode')) exitAffordances.push(describe(el));
    if (el.hasAttribute('data-studio-route-exit')) exitAffordances.push(describe(el));
  }
  return {
    deadPopupControls: deadPopupControls.slice(0, 10),
    docOverflowX: Math.max(0,
      document.documentElement.scrollWidth - vw, document.body.scrollWidth - vw),
    exitAffordances: exitAffordances.slice(0, 6),
    interactiveCount: interactiveCount,
    overflowContributors: overflowContributors.slice(0, 10),
    smallTargets: smallTargets.slice(0, 12),
    unnamedControls: unnamedControls.slice(0, 6),
    viewportHeight: vh,
    viewportWidth: vw
  };
})()`;

/**
 * 진입 애니메이션이 끝나기를 기다린다. Studio 의 HUD·코치 배너는 `scale(0.98)` 에서 시작하므로
 * 재생 중에 재면 44px 타깃이 43.1px 로 잡힌다 — 존재하지 않는 회귀를 보고하게 된다.
 *
 * 무한 반복 애니메이션(펄스 스켈레톤, `--animate-pulse-soft`)은 제외한다. 그것들까지 기다리면
 * 조건이 영원히 참이 되지 않아 라우트마다 타임아웃을 통째로 소진하면서 정작 아무것도 안정되지
 * 않는다 — 크기를 왜곡하는 것은 한 번 재생되고 끝나는 진입 애니메이션뿐이다.
 */
async function settleAnimations(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => document.getAnimations().every((animation) => {
        if (animation.playState !== "running") return true;
        const iterations = animation.effect?.getComputedTiming().iterations ?? 1;
        return iterations === Infinity;
      }),
      undefined,
      { timeout: 5_000 },
    )
    .catch(() => undefined);
}

async function dismissCoachSurfaces(page: Page): Promise<void> {
  const quickStart = page.locator('[data-studio-creative-starter="true"]');
  const mounted = await quickStart
    .waitFor({ state: "visible", timeout: 4_000 })
    .then(() => true)
    .catch(() => false);
  if (!mounted) return;
  await quickStart.locator('[data-studio-quickstart-dismiss="true"]').click().catch(() => undefined);
  await quickStart.waitFor({ state: "detached", timeout: 3_000 }).catch(() => undefined);
}

async function runRoute(
  browser: Browser,
  baseUrl: string,
  profile: InAppProfile,
  route: RouteProbe,
): Promise<RouteResult> {
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    locale: "ko-KR",
    userAgent: profile.userAgent,
    viewport: { height: profile.height, width: profile.width },
  });
  const page = await context.newPage();
  await installGuestSessionBoundary(page);

  const consoleErrors: string[] = [];
  // A failed subresource logs "Failed to load resource: …" with the URL only in the message's
  // location, never in its text — filtering on the text alone would let every sandboxed font
  // fetch fail the gate and drown the product signal it exists to surface.
  const record = (text: string, url = "") => {
    const subject = `${text} @ ${url}`;
    if (IGNORED_CONSOLE.some((ignored) => subject.includes(ignored))) return;
    consoleErrors.push(subject);
  };
  page.on("console", (message) => {
    if (message.type() === "error") record(message.text(), message.location().url);
  });
  page.on("pageerror", (error) => record(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    record(`request failed: ${request.failure()?.errorText ?? "unknown"}`, request.url());
  });

  const hardFailures: string[] = [];
  const warnings: string[] = [];
  await page.goto(`${baseUrl}${route.path}`, {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  });
  const ready = await page
    .waitForSelector(route.readySelector, { timeout: 45_000 })
    .then(() => true)
    .catch(() => false);
  if (!ready) hardFailures.push(`route never reached ${route.readySelector}`);
  await page.waitForTimeout(1_500);
  await dismissCoachSurfaces(page);
  await settleAnimations(page);

  const metrics = await page.evaluate(AUDIT_SCRIPT) as RouteMetrics;
  const shot = join(SCRATCH, `studio-inapp-${profile.id}-${route.id}.png`);
  await page.screenshot({ path: shot });

  if (metrics.docOverflowX > 0) {
    hardFailures.push(`document overflows horizontally by ${metrics.docOverflowX}px`);
  }
  for (const issue of metrics.overflowContributors) {
    hardFailures.push(`offscreen control: ${issue.label} ${issue.detail}`);
  }
  for (const issue of metrics.deadPopupControls) {
    hardFailures.push(`dead popup affordance: ${issue.label} ${issue.detail}`);
  }
  if (metrics.exitAffordances.length === 0) {
    hardFailures.push(
      "no in-page exit — an in-app browser has no address bar or back chrome",
    );
  }
  if (consoleErrors.length > 0) {
    hardFailures.push(`console errors: ${consoleErrors.length}`);
  }
  for (const issue of metrics.smallTargets) {
    warnings.push(`small tap target: ${issue.label} ${issue.detail}`);
  }
  for (const issue of metrics.unnamedControls) {
    warnings.push(`unnamed control: ${issue.label} ${issue.detail}`);
  }

  const ok = hardFailures.length === 0;
  log(
    `${profile.id}/${route.id}: ${metrics.viewportWidth}x${metrics.viewportHeight} ` +
    `interactive=${metrics.interactiveCount} overflowX=${metrics.docOverflowX} ` +
    `offscreen=${metrics.overflowContributors.length} ` +
    `deadPopups=${metrics.deadPopupControls.length} ` +
    `exits=${metrics.exitAffordances.length} small=${metrics.smallTargets.length} ` +
    `errs=${consoleErrors.length} ok=${ok}`,
  );
  for (const failure of hardFailures) log(`${profile.id}/${route.id} FAIL: ${failure}`);
  for (const warning of warnings) log(`${profile.id}/${route.id} warn: ${warning}`);
  for (const [index, message] of consoleErrors.slice(0, 5).entries()) {
    log(`${profile.id}/${route.id} consoleError[${index}]: ${message.slice(0, 220)}`);
  }

  await context.close();
  return { hardFailures, metrics, ok, profile: profile.id, route: route.id, shot, warnings };
}

async function main(): Promise<void> {
  cleanScratchDir({
    directory: SCRATCH,
    extensions: [".png", ".log"],
    filePrefix: "studio-inapp",
    ignoreListingErrors: true,
  });
  const port = await findFreePort({
    unavailableMessage: "could not allocate an in-app-browser preview port",
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  const server: ChildProcess = spawnVitePreview({ port, runner: "pnpm-exec" });

  let browser: Browser | null = null;
  try {
    await waitForServer(`${baseUrl}/studio`, {
      notReadyMessage: "preview server did not become ready",
      timeoutMs: 30_000,
    });
    browser = await chromium.launch({ args: ["--no-sandbox"], headless: true });

    const results: RouteResult[] = [];
    let skipped = 0;
    for (const profile of PROFILES) {
      for (const route of ROUTES) {
        if (route.profiles && !route.profiles.includes(profile.id)) {
          skipped += 1;
          continue;
        }
        results.push(await runRoute(browser, baseUrl, profile, route));
      }
    }
    // 조용한 축소는 "전부 훑었다"로 읽힌다. 건너뛴 수를 남긴다.
    if (skipped > 0) log(`skipped ${skipped} profile-scoped route runs`);

    await browser.close();
    browser = null;

    const failed = results.filter((result) => !result.ok);
    log(`screenshots in ${SCRATCH}`);
    if (failed.length > 0) {
      log(`RESULT: FAIL (${failed.length}/${results.length} runs)`);
      process.exitCode = 1;
    } else {
      log(`RESULT: OK (${results.length} runs green)`);
    }
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    await stopChildProcess(server).catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  log(`FATAL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
