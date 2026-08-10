/**
 * Heavy-feature perf lab: real-usage cost of ToonStudio's expensive subsystems
 * (3D/VRM, timeline, export, collaboration, document load, panel opens) measured
 * against a *production* build in a real Chromium — not a dev server, not a
 * bundler manifest.
 *
 * Run from repo root:
 *   pnpm run build
 *   pnpm exec vite preview --host 127.0.0.1 --port 4399 --strictPort
 *   pnpm exec tsx tests/benchmarks/harness/heavy-feature-perf.ts
 *
 * Honesty rules (same contract as tests/benchmarks/harness/main.ts):
 *  - Only real measurements are recorded. A scenario that cannot be reached in
 *    this environment is written out with status "unreachable" plus the concrete
 *    reason; it is never estimated, interpolated, or silently dropped.
 *  - Every scenario boots Studio in a FRESH BrowserContext, so lazy chunks are
 *    genuinely cold. Warm re-opens are measured separately and labelled.
 *  - "openMs" is time from the click until the feature's own DOM is actually on
 *    screen (its dialog/panel selector is visible) — not until a timer expires.
 *  - Bytes come from CDP Network.loadingFinished#encodedDataLength (real wire
 *    bytes over a gzip-enabled preview server), never from a manifest.
 *  - Long tasks come from the page's own PerformanceObserver("longtask").
 *  - Host is recorded so numbers are never mistaken for another machine's.
 *
 * This harness only reads the app; it never writes to it.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { arch, cpus, platform, totalmem } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright") as typeof import("playwright");

type Page = import("playwright").Page;
type BrowserContext = import("playwright").BrowserContext;
type Browser = import("playwright").Browser;
type CDPSession = import("playwright").CDPSession;

const REPO_ROOT = new URL("../../..", import.meta.url).pathname;
const RESULTS_DIR = join(REPO_ROOT, "tests", "benchmarks", "results");
const BASE_URL = process.env.HEAVY_PERF_BASE_URL ?? "http://127.0.0.1:4399";
const STUDIO_URL = `${BASE_URL}/studio`;

const BOOT_TIMEOUT_MS = 120_000;
/** Per-action ceiling. Slower than this is a product defect, not a measurement bug. */
const OPEN_TIMEOUT_MS = 45_000;
/** Settle ceiling for a single action, so one busy scenario cannot stall the lab. */
const SETTLE_CAP_MS = 25_000;
/** Network + main thread must be this quiet before an action counts as settled. */
const QUIET_MS = 800;
/** Strokes painted before an export so capture/encode has real content to chew on. */
const EXPORT_CONTENT_STROKES = 14;
/** Studio's own editor root; everything else mounts underneath it. */
const EDITOR_ROOT = '[data-studio-editor="true"]';
/** Top bar is fully rendered once the export trigger exists. */
const SHELL_READY = '[aria-label="내보내기 옵션"]';

// ---------------------------------------------------------------------------
// instrumentation
// ---------------------------------------------------------------------------

interface NetworkEvent {
  readonly url: string;
  readonly encodedBytes: number;
  readonly finishedAt: number;
}

interface CostSample {
  /** Click → the feature's own DOM is visible. null when there is no DOM gate. */
  readonly openMs: number | null;
  /** Click → network and main thread quiet. Always measured. */
  readonly settleMs: number;
  /** Real wire bytes downloaded during the window (gzip-encoded transfer size). */
  readonly bytes: number;
  readonly requestCount: number;
  readonly topRequests: readonly { readonly url: string; readonly bytes: number }[];
  readonly longTaskCount: number;
  readonly longTaskTotalMs: number;
  readonly longTaskMaxMs: number;
  /**
   * Sub-phase split from observable boundaries: code delivery (until the last new
   * js/wasm/css response finished) vs. everything after (execute, init, first
   * frame, encode). An honest boundary, not a profiler attribution.
   */
  readonly codeDeliveryMs: number;
  readonly postDeliveryMs: number;
}

function performanceNow(): number {
  return Number(process.hrtime.bigint() / 1000n) / 1000;
}

function round(value: number): number {
  return Number(value.toFixed(1));
}

function shortUrl(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.slice(0, 120);
  }
}

/** Windowed collector of wire bytes and main-thread long tasks for one page. */
class Probe {
  private readonly network: NetworkEvent[] = [];
  private readonly pending = new Map<string, string>();
  private windowStart = 0;
  private pageClockAtMark = 0;

  private constructor(
    private readonly page: Page,
    readonly cdp: CDPSession,
  ) {}

  static async attach(page: Page): Promise<Probe> {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    const probe = new Probe(page, cdp);
    cdp.on("Network.responseReceived", (event: { requestId: string; response: { url: string } }) => {
      probe.pending.set(event.requestId, event.response.url);
    });
    cdp.on("Network.loadingFinished", (event: { requestId: string; encodedDataLength: number }) => {
      const url = probe.pending.get(event.requestId);
      if (url === undefined) return;
      probe.pending.delete(event.requestId);
      probe.network.push({ url, encodedBytes: event.encodedDataLength, finishedAt: performanceNow() });
    });
    return probe;
  }

  /** Must run before any navigation on the context. */
  static async installLongTaskObserver(context: BrowserContext): Promise<void> {
    await context.addInitScript(() => {
      const store: { startTime: number; duration: number }[] = [];
      (window as unknown as { __heavyPerfLongTasks: typeof store }).__heavyPerfLongTasks = store;
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            store.push({ startTime: entry.startTime, duration: entry.duration });
          }
        }).observe({ entryTypes: ["longtask"] });
      } catch {
        // longtask unsupported here — collect() then reports 0 and the doc says so.
      }
    });
  }

  async mark(): Promise<void> {
    this.windowStart = performanceNow();
    this.pageClockAtMark = await this.page.evaluate(() => performance.now()).catch(() => 0);
  }

  lastNetworkActivityAt(): number {
    let last = this.windowStart;
    for (const event of this.network) {
      if (event.finishedAt > last) last = event.finishedAt;
    }
    return last;
  }

  async collect(openMs: number | null, settleMs: number): Promise<CostSample> {
    const events = this.network.filter((event) => event.finishedAt >= this.windowStart);
    const bytes = events.reduce((sum, event) => sum + event.encodedBytes, 0);
    const topRequests = [...events]
      .sort((a, b) => b.encodedBytes - a.encodedBytes)
      .slice(0, 6)
      .map((event) => ({ url: shortUrl(event.url), bytes: event.encodedBytes }));

    const codeEvents = events.filter((event) => /\.(js|mjs|wasm|css)(\?|$)/.test(event.url));
    const lastCodeAt = codeEvents.reduce((max, event) => Math.max(max, event.finishedAt), this.windowStart);
    const codeDeliveryMs = round(lastCodeAt - this.windowStart);

    const tasks = await this.page
      .evaluate(() => {
        const store =
          (window as unknown as { __heavyPerfLongTasks?: { startTime: number; duration: number }[] })
            .__heavyPerfLongTasks ?? [];
        return store.map((task) => ({ startTime: task.startTime, duration: task.duration }));
      })
      .catch(() => [] as { startTime: number; duration: number }[]);

    const from = this.pageClockAtMark - 1;
    const to = this.pageClockAtMark + settleMs + QUIET_MS;
    const windowed = tasks.filter((task) => task.startTime >= from && task.startTime <= to);

    return {
      openMs: openMs === null ? null : round(openMs),
      settleMs: round(settleMs),
      bytes,
      requestCount: events.length,
      topRequests,
      longTaskCount: windowed.length,
      longTaskTotalMs: round(windowed.reduce((sum, task) => sum + task.duration, 0)),
      longTaskMaxMs: round(windowed.reduce((max, task) => Math.max(max, task.duration), 0)),
      codeDeliveryMs,
      postDeliveryMs: round(Math.max(0, settleMs - codeDeliveryMs)),
    };
  }
}

// ---------------------------------------------------------------------------
// page helpers
// ---------------------------------------------------------------------------

/**
 * Waits until neither the network nor the main thread produced anything for
 * QUIET_MS. Returns active time (total minus the trailing quiet window).
 */
async function settle(page: Page, probe: Probe, startedAt: number, capMs = OPEN_TIMEOUT_MS): Promise<number> {
  const deadline = startedAt + capMs;
  let lastBusyAt = startedAt;
  for (;;) {
    await page.waitForTimeout(100);
    const netActivity = probe.lastNetworkActivityAt();
    if (netActivity > lastBusyAt) lastBusyAt = netActivity;
    const frameMs = await page
      .evaluate(
        () =>
          new Promise<number>((resolve) => {
            const t0 = performance.now();
            requestAnimationFrame(() => resolve(performance.now() - t0));
          }),
      )
      .catch(() => 0);
    // A frame longer than two vsyncs means the main thread is still loaded.
    if (frameMs > 34) lastBusyAt = performanceNow();
    const now = performanceNow();
    if (now - lastBusyAt >= QUIET_MS) return Math.max(0, lastBusyAt - startedAt);
    if (now > deadline) return now - startedAt;
  }
}

async function dismissQuickStart(page: Page): Promise<void> {
  const dismiss = page.locator('[data-studio-quickstart-dismiss="true"]').first();
  if ((await dismiss.count()) > 0) {
    await dismiss.click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(400);
    return;
  }
  for (const label of ["빠른 시작 닫기 (Esc)", "빠른 시작 닫기"]) {
    const button = page.locator(`[aria-label="${label}"]`).first();
    if ((await button.count()) > 0) {
      await button.click({ timeout: 5_000 }).catch(() => undefined);
      await page.waitForTimeout(400);
      return;
    }
  }
}

/**
 * Clicks a locator, falling back to a direct DOM dispatch for collapsed rails.
 *
 * The real-click timeout is deliberately short: some Studio triggers live in a
 * host that is `display:none` at this viewport (the tool belt is `lg:hidden` on
 * desktop), and Playwright's actionability wait would otherwise burn its full
 * timeout before the fallback runs — inflating the measured open latency by
 * exactly that timeout. Keep it well under the numbers being measured.
 */
async function forceClick(page: Page, selector: string): Promise<boolean> {
  const locator = page.locator(selector).first();
  if ((await locator.count()) === 0) return false;
  await locator.scrollIntoViewIfNeeded({ timeout: 1_000 }).catch(() => undefined);
  const clicked = await locator
    .click({ timeout: 1_200 })
    .then(() => true)
    .catch(() => false);
  if (clicked) return true;
  return locator
    .evaluate((node) => {
      (node as HTMLElement).click();
      return true;
    })
    .catch(() => false);
}

/**
 * Draws real strokes on the canvas with the pen tool.
 *
 * Export cost is dominated by capture + encode, both of which scale with what is
 * actually on the page. Measuring an export of the empty default document would
 * report a number no user ever experiences, so every export scenario paints
 * first and records how much content it managed to create.
 */
async function paintStrokes(page: Page, strokeCount: number): Promise<number> {
  await page.keyboard.press("b").catch(() => undefined);
  await page.waitForTimeout(600);
  const viewport = page.locator("[data-studio-canvas-viewport]").first();
  const box =
    (await viewport.boundingBox().catch(() => null)) ??
    (await page
      .locator("canvas")
      .first()
      .boundingBox()
      .catch(() => null));
  if (box === null) return 0;

  const left = box.x + box.width * 0.3;
  const top = box.y + box.height * 0.25;
  const width = box.width * 0.4;
  const height = box.height * 0.5;
  let drawn = 0;
  for (let index = 0; index < strokeCount; index += 1) {
    const t = index / Math.max(1, strokeCount - 1);
    const y = top + height * t;
    await page.mouse.move(left, y);
    await page.mouse.down();
    for (let step = 1; step <= 6; step += 1) {
      await page.mouse.move(left + (width * step) / 6, y + Math.sin(step + index) * 12);
    }
    await page.mouse.up();
    drawn += 1;
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(1_200);
  return drawn;
}

// ---------------------------------------------------------------------------
// scenarios
// ---------------------------------------------------------------------------

interface ScenarioResult {
  readonly id: string;
  readonly feature: string;
  readonly description: string;
  readonly status: "ok" | "unreachable";
  readonly reason?: string;
  readonly cold?: CostSample;
  readonly warm?: CostSample;
  readonly extra?: Readonly<Record<string, unknown>>;
}

interface Ctx {
  readonly page: Page;
  readonly probe: Probe;
}

interface OpenScenario {
  readonly id: string;
  readonly feature: string;
  readonly description: string;
  /** Runs before the measured window (menu opening, tool arming, ...). */
  readonly setup?: (ctx: Ctx) => Promise<boolean>;
  /** The measured action. Returns false when the trigger is absent. */
  readonly open: (ctx: Ctx) => Promise<boolean>;
  /** Selector that proves the feature's own DOM is on screen. */
  readonly readySelector: string;
  /** Closes it again so a warm re-open can be measured. */
  readonly close?: (ctx: Ctx) => Promise<void>;
  /** Extra facts recorded after the measurement. */
  readonly report?: (ctx: Ctx) => Promise<Record<string, unknown>>;
}

const clickScenario =
  (selector: string) =>
  ({ page }: Ctx): Promise<boolean> =>
    forceClick(page, selector);

const escapeClose = async ({ page }: Ctx): Promise<void> => {
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(900);
};

const SCENARIOS: readonly OpenScenario[] = [
  // ---- 3D / VRM -----------------------------------------------------------
  {
    id: "bg3d-open",
    feature: "3D/VRM",
    description: "3D 배경 (3D 장면 스튜디오) 최초 진입 — three.js + R3F",
    open: clickScenario('[data-studio-rail-tool-id="bg3d"]'),
    readySelector: '[data-testid="studio-bg3d-viewport"] canvas',
    close: escapeClose,
  },
  {
    id: "mannequin-open",
    feature: "3D/VRM",
    description: "3D 데생 인형 최초 진입 — three.js (R3F 없음)",
    open: clickScenario('[data-studio-rail-tool-id="mannequin3d"]'),
    readySelector: '[data-studio-mannequin-viewport="true"]',
    close: escapeClose,
  },
  {
    id: "vrm-poser-open",
    feature: "3D/VRM",
    description: "3D 캐릭터 VRM 포저 최초 진입 — three.js + @pixiv/three-vrm",
    open: clickScenario('[data-studio-rail-tool-id="vrm3d"]'),
    readySelector: '[data-studio-vrm-dialog="true"]',
    close: escapeClose,
  },
  {
    id: "hybrid-dcc-open",
    feature: "3D/VRM",
    description: "Hybrid 3D DCC 최초 진입 — three.js + OCCT/IFC 계열",
    open: clickScenario('[data-studio-rail-tool-id="hybrid-dcc"]'),
    readySelector: '[data-studio-hybrid-dcc-panel="true"]',
    close: escapeClose,
  },

  // ---- 타임라인 -----------------------------------------------------------
  {
    id: "animatic-timeline-open",
    feature: "타임라인",
    description: "애니매틱 타임라인 다이얼로그 최초 오픈",
    setup: async ({ page }) => {
      const opened = await forceClick(page, '[aria-label="프로젝트 작업"]');
      if (!opened) return false;
      await page.waitForSelector('[data-studio-project-actions-menu="true"]', { timeout: 10_000 }).catch(() => null);
      await page.waitForTimeout(300);
      return true;
    },
    open: async ({ page }) => {
      const item = page
        .locator('[data-studio-project-actions-menu="true"] button')
        .filter({ hasText: "애니매틱" })
        .first();
      if ((await item.count()) === 0) return false;
      return item
        .click({ timeout: 8_000 })
        .then(() => true)
        .catch(() => false);
    },
    readySelector: '[data-studio-animatic-dialog="true"]',
    close: async ({ page }) => {
      await forceClick(page, '[aria-label="웹툰 애니매틱 닫기"]');
      await page.waitForTimeout(900);
    },
    report: async ({ page }) => {
      // Frame scrub responsiveness on the real playhead range input.
      const scrub = page.locator('input[aria-label="애니매틱 재생헤드"]').first();
      if ((await scrub.count()) === 0) return { scrub: null, scrubNote: "재생헤드 입력이 없음(플랜 길이 0일 수 있음)" };
      const max = Number((await scrub.getAttribute("max")) ?? "0");
      if (!Number.isFinite(max) || max <= 0) return { scrub: null, scrubNote: `max=${max} — 스크럽 대상 없음` };
      const samples: number[] = [];
      for (let index = 1; index <= 8; index += 1) {
        const value = Math.round((max * index) / 9);
        const t0 = performanceNow();
        await scrub.fill(String(value)).catch(() => undefined);
        await page
          .evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
          .catch(() => undefined);
        samples.push(performanceNow() - t0);
      }
      const sorted = [...samples].sort((a, b) => a - b);
      return {
        scrub: {
          samplesMs: samples.map(round),
          p50Ms: round(sorted[Math.floor(sorted.length * 0.5)] ?? 0),
          p95Ms: round(sorted[sorted.length - 1] ?? 0),
          totalDurationMsOfPlan: max,
        },
      };
    },
  },
  {
    id: "multilayer-timeline-open",
    feature: "타임라인",
    description: "다중 레이어 타임라인 패널 최초 오픈",
    // The trigger button and the panel section share an aria-label, so both
    // sides of this scenario must be tag-qualified.
    open: clickScenario('button[aria-label="다중 레이어 타임라인"]'),
    readySelector: 'section[aria-label="다중 레이어 타임라인"]',
    close: async ({ page }) => {
      await forceClick(page, '[aria-label="다중 레이어 타임라인 패널 닫기"]');
      await page.waitForTimeout(900);
    },
  },

  // ---- 패널 오픈 ----------------------------------------------------------
  {
    id: "brush-library-open",
    feature: "패널 오픈",
    description: "브러시 전체 라이브러리 시트 최초 오픈 (lazy 청크 2개 경계)",
    setup: async ({ page }) => {
      // The library pill only exists while the pen tool is armed.
      await page.keyboard.press("b").catch(() => undefined);
      await page.waitForTimeout(700);
      return true;
    },
    open: async ({ page }) => {
      for (const selector of [
        '[data-studio-open-brush-library="true"]',
        '[data-studio-brush-active-pill="true"]',
      ]) {
        if (await forceClick(page, selector)) return true;
      }
      return false;
    },
    readySelector: '[data-studio-brush-library="true"]',
    close: async ({ page }) => {
      await forceClick(page, '[data-studio-brush-library-close="true"]');
      await page.waitForTimeout(900);
    },
  },
  {
    id: "filter-dialog-open",
    feature: "패널 오픈",
    description: "필터 다이얼로그 최초 오픈 (⌘⇧1 가우시안 블러)",
    open: async ({ page }) => {
      await page.keyboard.press("Meta+Shift+Digit1").catch(() => undefined);
      await page.waitForTimeout(150);
      if ((await page.locator('[aria-labelledby="studio-filter-dialog-title"]').count()) > 0) return true;
      await page.keyboard.press("Control+Shift+Digit1").catch(() => undefined);
      return true;
    },
    readySelector: '[aria-labelledby="studio-filter-dialog-title"]',
    close: escapeClose,
  },
  {
    id: "inspector-reopen",
    feature: "패널 오픈",
    description: "인스펙터(속성) 패널 닫았다 재오픈 — 콜드 비용은 부팅에 포함됨",
    // Both toggles expose their text through `title`, not `aria-label`.
    setup: async ({ page }) => {
      const collapsed = await forceClick(page, '[title="속성 패널 접기"]');
      await page.waitForTimeout(900);
      return collapsed;
    },
    open: async ({ page }) => {
      for (const selector of ['[title="속성 패널 펼치기"]', '[aria-label="레이어 패널 열기"]']) {
        if (await forceClick(page, selector)) return true;
      }
      return false;
    },
    readySelector: '[data-studio-sheet-id="props"]',
  },
  {
    id: "export-panel-open",
    feature: "내보내기",
    description: "내보내기 옵션 패널 최초 오픈 (프리셋·규격 UI 렌더)",
    open: clickScenario('[aria-label="내보내기 옵션"]'),
    readySelector: '[data-studio-export-menu-panel="true"] button',
    close: escapeClose,
  },
  {
    id: "templates-assets-open",
    feature: "패널 오픈",
    description: "템플릿·에셋 시트 최초 오픈",
    open: clickScenario('[aria-label="템플릿·에셋"]'),
    readySelector: '[role="dialog"], [data-studio-mobile-sheet="true"]',
    close: escapeClose,
  },

  // ---- 협업 ---------------------------------------------------------------
  {
    id: "team-panel-open",
    feature: "협업",
    description: "팀 작업 공간 패널 최초 오픈",
    open: async ({ page }) => {
      for (const selector of [
        '[aria-label="팀 작업 공간 열기"]',
        '[data-studio-team-share-btn="true"]',
        '[aria-label="팀 작업 공간"]',
      ]) {
        if (await forceClick(page, selector)) return true;
      }
      return false;
    },
    readySelector: '[data-testid="studio-team-panel"]',
    close: async ({ page }) => {
      await forceClick(page, '[aria-label="팀 작업 공간 닫기"]');
      await page.waitForTimeout(900);
    },
    report: async ({ page }) => ({
      liveMode: await page
        .locator("[data-studio-live-mode]")
        .first()
        .getAttribute("data-studio-live-mode")
        .catch(() => null),
      liveCollaborationPanelPresent:
        (await page.locator('[aria-labelledby="studio-live-collaboration-title"]').count()) > 0,
    }),
  },
];

// ---------------------------------------------------------------------------
// export scenarios (need a download listener)
// ---------------------------------------------------------------------------

interface ExportScenario {
  readonly id: string;
  readonly description: string;
  readonly openPanel: boolean;
  /** Preset chip clicked inside the panel before exporting. */
  readonly presetText?: string;
  /** Selector or panel-button text of the export trigger. */
  readonly triggerSelector?: string;
  readonly triggerText?: string;
}

const EXPORT_SCENARIOS: readonly ExportScenario[] = [
  {
    id: "export-png-current-page",
    description: "PNG 현재 페이지 다운로드 (capture → encode → save)",
    openPanel: false,
    triggerSelector: '[aria-label="현재 페이지 다운로드"]',
  },
  {
    id: "export-psd-layered",
    description: "PSD (레이어별) 내보내기",
    openPanel: true,
    triggerText: "PSD (레이어별)",
  },
  {
    id: "export-spec-slice-naver",
    description: "규격 슬라이스 — 네이버 도전만화 프리셋 후 '규격으로 저장'",
    openPanel: true,
    presetText: "네이버 도전만화",
    triggerText: "규격으로 저장",
  },
  {
    id: "export-svg-vector",
    description: "SVG (벡터, 현재 페이지) 내보내기",
    openPanel: true,
    triggerText: "SVG (벡터, 현재 페이지)",
  },
];

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

interface BootResult {
  readonly sample: CostSample;
  readonly editorRootMs: number;
  readonly shellReadyMs: number;
}

async function bootStudio(page: Page, probe: Probe, url = STUDIO_URL): Promise<BootResult> {
  await probe.mark();
  const startedAt = performanceNow();
  await page.goto(url, { waitUntil: "commit", timeout: BOOT_TIMEOUT_MS });
  await page.waitForSelector(EDITOR_ROOT, { state: "attached", timeout: BOOT_TIMEOUT_MS });
  const editorRootMs = performanceNow() - startedAt;
  await page.waitForSelector(SHELL_READY, { state: "attached", timeout: BOOT_TIMEOUT_MS });
  const shellReadyMs = performanceNow() - startedAt;
  const settleMs = await settle(page, probe, startedAt, BOOT_TIMEOUT_MS);
  const sample = await probe.collect(round(shellReadyMs), settleMs);
  return { sample, editorRootMs: round(editorRootMs), shellReadyMs: round(shellReadyMs) };
}

async function withFreshStudio<T>(
  browser: Browser,
  body: (ctx: Ctx, boot: BootResult) => Promise<T>,
  url = STUDIO_URL,
): Promise<T> {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    acceptDownloads: true,
    // dist/sw.js is cache-first over /assets/, and a service-worker-mediated
    // response reports encodedDataLength 0 on the page target — which would
    // silently zero out every lazy chunk's real cost. Blocking the worker keeps
    // byte accounting truthful and matches a genuine first visit.
    serviceWorkers: "block",
  });
  await Probe.installLongTaskObserver(context);
  const page = await context.newPage();
  const probe = await Probe.attach(page);
  try {
    const boot = await bootStudio(page, probe, url);
    await dismissQuickStart(page);
    await page.waitForTimeout(600);
    return await body({ page, probe }, boot);
  } finally {
    await context.close().catch(() => undefined);
  }
}

/** Measures one open action: click → visible → quiet. */
async function measureOpen(ctx: Ctx, scenario: OpenScenario): Promise<CostSample | "no-trigger"> {
  const { page, probe } = ctx;
  await probe.mark();
  const startedAt = performanceNow();
  const triggered = await scenario.open(ctx);
  if (!triggered) return "no-trigger";
  const appeared = await page
    .waitForSelector(scenario.readySelector, { state: "visible", timeout: OPEN_TIMEOUT_MS })
    .then(() => performanceNow() - startedAt)
    .catch(() => null);
  const settleMs = await settle(page, probe, startedAt, SETTLE_CAP_MS);
  return probe.collect(appeared, Math.max(settleMs, appeared ?? 0));
}

async function runOpenScenario(browser: Browser, scenario: OpenScenario): Promise<ScenarioResult> {
  try {
    return await withFreshStudio(browser, async (ctx) => {
      const { page } = ctx;
      if (scenario.setup !== undefined) {
        const ok = await scenario.setup(ctx);
        if (!ok) {
          return {
            id: scenario.id,
            feature: scenario.feature,
            description: scenario.description,
            status: "unreachable" as const,
            reason: "사전 단계(메뉴/도구 활성화)를 프로덕션 DOM에서 수행하지 못함",
          };
        }
      }

      const cold = await measureOpen(ctx, scenario);
      if (cold === "no-trigger") {
        return {
          id: scenario.id,
          feature: scenario.feature,
          description: scenario.description,
          status: "unreachable" as const,
          reason: "프로덕션 /studio DOM에 해당 트리거 셀렉터가 존재하지 않음",
        };
      }

      const extra = scenario.report !== undefined ? await scenario.report(ctx) : undefined;

      let warm: CostSample | undefined;
      if (scenario.close !== undefined) {
        await scenario.close(ctx);
        if (scenario.setup !== undefined) await scenario.setup(ctx);
        await page.waitForTimeout(400);
        const second = await measureOpen(ctx, scenario);
        if (second !== "no-trigger") warm = second;
      }

      return {
        id: scenario.id,
        feature: scenario.feature,
        description: scenario.description,
        status: "ok" as const,
        cold,
        warm,
        extra,
      };
    });
  } catch (error) {
    return {
      id: scenario.id,
      feature: scenario.feature,
      description: scenario.description,
      status: "unreachable",
      reason: `측정 중 예외: ${String(error).slice(0, 300)}`,
    };
  }
}

async function runExportScenario(browser: Browser, scenario: ExportScenario): Promise<ScenarioResult> {
  const base = { id: scenario.id, feature: "내보내기", description: scenario.description };
  try {
    return await withFreshStudio(browser, async ({ page, probe }) => {
      const strokesDrawn = await paintStrokes(page, EXPORT_CONTENT_STROKES);
      if (scenario.openPanel) {
        if (!(await forceClick(page, '[aria-label="내보내기 옵션"]'))) {
          return { ...base, status: "unreachable" as const, reason: "내보내기 옵션 트리거 없음" };
        }
        const panelReady = await page
          .waitForSelector('[data-studio-export-menu-panel="true"] button', { state: "visible", timeout: 30_000 })
          .catch(() => null);
        if (panelReady === null) {
          return { ...base, status: "unreachable" as const, reason: "내보내기 패널이 30초 안에 렌더되지 않음" };
        }
        await page.waitForTimeout(500);
      }

      if (scenario.presetText !== undefined) {
        const preset = page
          .locator('[data-studio-export-menu-panel="true"] button')
          .filter({ hasText: scenario.presetText })
          .first();
        if ((await preset.count()) === 0) {
          return { ...base, status: "unreachable" as const, reason: `규격 프리셋 '${scenario.presetText}' 없음` };
        }
        await preset.click({ timeout: 8_000 }).catch(() => undefined);
        await page.waitForTimeout(700);
      }

      const trigger =
        scenario.triggerSelector !== undefined
          ? page.locator(scenario.triggerSelector).first()
          : page
              .locator('[data-studio-export-menu-panel="true"] button')
              .filter({ hasText: scenario.triggerText ?? "" })
              .first();
      if ((await trigger.count()) === 0) {
        return {
          ...base,
          status: "unreachable" as const,
          reason: `내보내기 트리거(${scenario.triggerSelector ?? scenario.triggerText})를 찾지 못함`,
        };
      }

      await probe.mark();
      const startedAt = performanceNow();
      const downloadPromise = page.waitForEvent("download", { timeout: OPEN_TIMEOUT_MS }).catch(() => null);
      await trigger.click({ timeout: 10_000 }).catch(() => undefined);
      const download = await downloadPromise;
      const downloadMs = download === null ? null : performanceNow() - startedAt;
      const settleMs = await settle(page, probe, startedAt, SETTLE_CAP_MS);
      const cold = await probe.collect(downloadMs, Math.max(settleMs, downloadMs ?? 0));

      let savedBytes: number | null = null;
      if (download !== null) {
        const path = await download.path().catch(() => null);
        if (path !== null) {
          const { stat } = await import("node:fs/promises");
          savedBytes = await stat(path)
            .then((stats: { size: number }) => stats.size)
            .catch(() => null);
        }
      }

      return {
        ...base,
        status: "ok" as const,
        cold,
        extra: {
          strokesDrawnBeforeExport: strokesDrawn,
          downloadFired: download !== null,
          timeToDownloadMs: downloadMs === null ? null : round(downloadMs),
          suggestedFilename: download?.suggestedFilename() ?? null,
          savedBytes,
          phaseNote:
            "openMs = 클릭→다운로드 이벤트(캡처+인코딩+저장 완료), codeDeliveryMs = 내보내기 청크·워커 코드 도착까지",
        },
      };
    });
  } catch (error) {
    return { ...base, status: "unreachable", reason: `측정 중 예외: ${String(error).slice(0, 300)}` };
  }
}

async function runDocumentScenario(browser: Browser, targetPages: number): Promise<ScenarioResult> {
  const base = {
    id: `document-${targetPages}-pages`,
    feature: "문서 로드",
    description: `${targetPages}페이지 문서 구성 → 임시저장 → 페이지 전환`,
  };
  try {
    return await withFreshStudio(browser, async ({ page, probe }) => {
      const add = page.getByTestId("studio-add-page").first();
      if ((await add.count()) === 0) {
        return { ...base, status: "unreachable" as const, reason: "studio-add-page 트리거 없음" };
      }

      await probe.mark();
      const startedAt = performanceNow();
      const perPage: number[] = [];
      for (let index = 1; index < targetPages; index += 1) {
        const t0 = performanceNow();
        await add.click({ timeout: 15_000 }).catch(() => undefined);
        await page
          .evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
          .catch(() => undefined);
        perPage.push(performanceNow() - t0);
      }
      const settleMs = await settle(page, probe, startedAt, BOOT_TIMEOUT_MS);
      const growth = await probe.collect(null, settleMs);
      const achieved = await page
        .locator('[aria-label$="페이지 선택"]')
        .count()
        .catch(() => -1);

      // Explicit draft save — the same handleSave("draft") path the 45s server
      // autosave timer drives, so its cost is the autosave cycle's cost.
      await probe.mark();
      const saveStart = performanceNow();
      const saved = await forceClick(page, '[aria-label="임시저장"]');
      const saveSettle = saved ? await settle(page, probe, saveStart, SETTLE_CAP_MS) : 0;
      const save = saved ? await probe.collect(null, saveSettle) : null;

      // Page switch responsiveness on the grown document.
      const midIndex = Math.max(2, Math.floor(targetPages / 2));
      const target = page.locator(`[aria-label="${midIndex}페이지 선택"]`).first();
      let pageSwitch: CostSample | null = null;
      if ((await target.count()) > 0) {
        await probe.mark();
        const switchStart = performanceNow();
        await target.click({ timeout: 15_000 }).catch(() => undefined);
        const switchSettle = await settle(page, probe, switchStart, SETTLE_CAP_MS);
        pageSwitch = await probe.collect(null, switchSettle);
      }

      const sorted = [...perPage].sort((a, b) => a - b);
      return {
        ...base,
        status: "ok" as const,
        cold: growth,
        extra: {
          achievedPageCount: achieved,
          pageAddMs: {
            p50: round(sorted[Math.floor(sorted.length * 0.5)] ?? 0),
            p95: round(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
            max: round(sorted[sorted.length - 1] ?? 0),
            samples: perPage.map(round),
          },
          autosaveDraftSave: save,
          pageSwitch,
        },
      };
    });
  } catch (error) {
    return { ...base, status: "unreachable", reason: `측정 중 예외: ${String(error).slice(0, 300)}` };
  }
}

/**
 * `?room=<id>` is the cheapest way to force the live provider into its
 * server-backed path without a saved work, so the CRDT connect cost is real
 * rather than skipped.
 */
async function runLiveRoomScenario(browser: Browser): Promise<ScenarioResult> {
  const base = {
    id: "collab-live-room-boot",
    feature: "협업",
    description: "?room= 라이브 룸으로 /studio 부팅 — CRDT/소켓 초기 연결 비용",
  };
  try {
    return await withFreshStudio(
      browser,
      async ({ page }, boot) => ({
        ...base,
        status: "ok" as const,
        cold: boot.sample,
        extra: {
          editorRootMs: boot.editorRootMs,
          shellReadyMs: boot.shellReadyMs,
          liveMode: await page
            .locator("[data-studio-live-mode]")
            .first()
            .getAttribute("data-studio-live-mode")
            .catch(() => null),
          note:
            "VITE_STUDIO_LIVE_ORIGIN / VITE_STUDIO_REALTIME_ORIGIN 미설정 + 로컬 실시간 서버 없음 — 서버 왕복이 아니라 '연결 실패까지'의 비용",
        },
      }),
      `${STUDIO_URL}?room=heavy-perf-probe`,
    );
  } catch (error) {
    return { ...base, status: "unreachable", reason: `측정 중 예외: ${String(error).slice(0, 300)}` };
  }
}

function logLine(result: ScenarioResult): void {
  const mark = result.status === "ok" ? "ok" : "--";
  const detail =
    result.cold === undefined
      ? (result.reason ?? "")
      : `open=${result.cold.openMs ?? "n/a"}ms settle=${result.cold.settleMs}ms bytes=${result.cold.bytes} lt=${result.cold.longTaskTotalMs}ms`;
  process.stdout.write(`${mark} ${result.id}: ${detail}\n`);
}

async function main(): Promise<void> {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    headless: true,
    args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan"],
  });

  const results: ScenarioResult[] = [];

  const boot = await withFreshStudio(browser, async (_ctx, bootResult) => bootResult);
  results.push({
    id: "studio-cold-boot",
    feature: "문서 로드",
    description: "/studio 콜드 부팅 — 네비게이션부터 상단 바 렌더까지",
    status: "ok",
    cold: boot.sample,
    extra: { editorRootMs: boot.editorRootMs, shellReadyMs: boot.shellReadyMs },
  });
  logLine(results[0] as ScenarioResult);

  for (const scenario of SCENARIOS) {
    const result = await runOpenScenario(browser, scenario);
    results.push(result);
    logLine(result);
  }
  for (const scenario of EXPORT_SCENARIOS) {
    const result = await runExportScenario(browser, scenario);
    results.push(result);
    logLine(result);
  }
  results.push(await runLiveRoomScenario(browser));
  logLine(results[results.length - 1] as ScenarioResult);

  for (const pageCount of [10, 30]) {
    const result = await runDocumentScenario(browser, pageCount);
    results.push(result);
    logLine(result);
  }

  await browser.close();

  const payload = {
    generatedAt: new Date().toISOString(),
    host: {
      platform: platform(),
      arch: arch(),
      cpuModel: cpus()[0]?.model ?? "unknown",
      cpuCount: cpus().length,
      totalMemGb: Number((totalmem() / 1024 ** 3).toFixed(1)),
      node: process.version,
    },
    target: {
      baseUrl: BASE_URL,
      build: "production (pnpm run build), served by vite preview with gzip",
      browser: "Chromium via Playwright channel=chrome, headless, 1600x1000",
      crossOriginIsolated: true,
    },
    method: {
      coldContext: "모든 시나리오가 새 BrowserContext에서 /studio 를 다시 부팅 — lazy 청크가 실제로 콜드",
      serviceWorker:
        "차단(serviceWorkers:'block'). dist/sw.js 가 /assets/ 를 cache-first 로 가로채면 CDP 가 해당 응답을 0 바이트로 보고해 lazy 청크 비용이 통째로 사라진다. 최초 방문 사용자 기준과도 일치.",
      openMs: "클릭 → 해당 기능의 DOM(다이얼로그·뷰포트)이 실제로 화면에 보일 때까지",
      settleMs: `클릭 → 네트워크와 메인스레드가 ${QUIET_MS}ms 동안 조용해질 때까지의 활성 시간`,
      bytes: "CDP Network.loadingFinished#encodedDataLength — gzip 전송 실측 바이트",
      longTasks: 'PerformanceObserver({entryTypes:["longtask"]}) — 페이지 자체 관측, 50ms 초과 태스크',
      phases: "codeDeliveryMs = 마지막 js/wasm/css 응답 종료까지, postDeliveryMs = 그 이후(실행·초기화·첫 프레임·인코딩)",
      honesty: "도달 불가 시나리오는 status=unreachable 과 사유만 기록하며 추정치를 넣지 않음",
    },
    results,
  };

  await mkdir(RESULTS_DIR, { recursive: true });
  const outPath = join(RESULTS_DIR, "heavy-feature-perf.json");
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`wrote ${outPath}\n`);
}

await main();
