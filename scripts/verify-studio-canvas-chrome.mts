/**
 * Production-preview browser gate for how much of the Studio canvas column the drawing
 * surface actually gets.
 *
 * The complaint this measures: the canvas was surrounded by bands that were reserved
 * whether or not they had anything to say — a permanent "저장·GPU 이상 없음" line, and on
 * mobile-immersive a notice strip that kept its floating-top-bar clearance even while
 * empty. Reserved-but-empty chrome is drawing area the artist paid for and never used.
 *
 * The verifier measures the canvas column and the stage viewport inside it at a desktop
 * and a 360px viewport, and reports the chrome the column spends above the viewport. It
 * also asserts the two structural contracts that keep that number down:
 *   - the reliability rail is out of flow (a save/GPU failure arriving mid-stroke must not
 *     move the Konva stage origin), and
 *   - the idle reliability prose row no longer exists.
 *
 * Run after `pnpm build`:
 *   pnpm verify:studio-canvas-chrome
 *
 * Reuse an already running preview (or a dev server):
 *   TOONSPECTRUM_VERIFY_ORIGIN=http://127.0.0.1:4173 pnpm verify:studio-canvas-chrome
 *
 * Artifacts (screenshots + JSON evidence):
 *   TOONSPECTRUM_CANVAS_CHROME_VERIFY_DIR=/tmp/studio-canvas-chrome pnpm verify:studio-canvas-chrome
 */
import { type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type Browser, type Page } from "playwright";

import {
  findFreePort,
  spawnVitePreview,
  stopChildProcess,
  waitForServer,
} from "./lib/studio-verify-preview-harness.mjs";

const SCRATCH =
  process.env.TOONSPECTRUM_CANVAS_CHROME_VERIFY_DIR
  ?? process.env.TOONSPECTRUM_VERIFY_DIR
  ?? join(tmpdir(), "toonspectrum-studio-canvas-chrome");
const RESULT_PATH = join(SCRATCH, "studio-canvas-chrome-evidence.json");
const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const MOBILE_HINT_KEY = "toonspectrum-studio-mobile-hint-dismissed";

interface ViewportCase {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly mobile: boolean;
}

const VIEWPORTS: readonly ViewportCase[] = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "mobile-360", width: 360, height: 640, mobile: true },
];

interface CanvasChromeMetrics {
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly columnWidth: number;
  readonly columnHeight: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  /** Column height the stage viewport does NOT get — the reserved chrome above/below it. */
  readonly chromeHeight: number;
  readonly reliabilityRailInFlow: boolean;
  readonly reliabilityIdleRowPresent: boolean;
  readonly reliabilityChipPresent: boolean;
  readonly noticeStripFlowHeight: number;
}

function measure(page: Page): Promise<CanvasChromeMetrics> {
  return page.evaluate(() => {
    const column = document.querySelector("[data-studio-logical-w]");
    const viewport = document.querySelector("[data-studio-canvas-viewport]");
    const reliability = document.querySelector("[data-studio-reliability-status-rail]");
    const strip = document.querySelector("[data-studio-canvas-status-rail]");
    const columnBox = column?.getBoundingClientRect() ?? null;
    const viewportBox = viewport?.getBoundingClientRect() ?? null;
    const reliabilityOutOfFlow =
      reliability === null
        ? false
        : globalThis.getComputedStyle(reliability).position === "absolute";
    const stripStyle = strip === null ? null : globalThis.getComputedStyle(strip);
    const stripInFlow =
      stripStyle !== null
      && stripStyle.position !== "absolute"
      && stripStyle.position !== "fixed"
      && stripStyle.display !== "none"
      && stripStyle.display !== "contents";
    return {
      innerWidth: globalThis.innerWidth,
      innerHeight: globalThis.innerHeight,
      columnWidth: Math.round(columnBox?.width ?? 0),
      columnHeight: Math.round(columnBox?.height ?? 0),
      viewportWidth: Math.round(viewportBox?.width ?? 0),
      viewportHeight: Math.round(viewportBox?.height ?? 0),
      chromeHeight: Math.round((columnBox?.height ?? 0) - (viewportBox?.height ?? 0)),
      reliabilityRailInFlow: reliability !== null && !reliabilityOutOfFlow,
      reliabilityIdleRowPresent:
        document.querySelector("[data-studio-reliability-idle]") !== null,
      reliabilityChipPresent:
        document.querySelector("[data-studio-reliability-chip]") !== null,
      noticeStripFlowHeight: stripInFlow
        ? Math.round(strip?.getBoundingClientRect().height ?? 0)
        : 0,
    };
  });
}

function invariant(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  mkdirSync(SCRATCH, { recursive: true });

  const externalOrigin = process.env.TOONSPECTRUM_VERIFY_ORIGIN?.trim();
  const port = externalOrigin ? null : await findFreePort();
  const origin = externalOrigin
    ? `${externalOrigin.replace(/\/+$/u, "")}/`
    : `http://127.0.0.1:${port ?? 0}/`;
  const studioUrl = `${origin}studio`;
  const server: ChildProcess | null =
    port === null ? null : spawnVitePreview({ port, runner: "pnpm-exec" });

  let browser: Browser | null = null;
  try {
    await waitForServer(studioUrl, {
      timeoutMs: 30_000,
      notReadyMessage: "preview server did not become ready",
    });
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

    const results: { viewport: string; metrics: CanvasChromeMetrics }[] = [];
    for (const testCase of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: testCase.width, height: testCase.height },
        locale: "ko-KR",
        deviceScaleFactor: 1,
        ...(testCase.mobile ? { hasTouch: true, isMobile: true } : {}),
      });
      const page = await context.newPage();
      await page.route("**/api/auth/session", async (route) => {
        if (route.request().method() !== "GET") {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({ authenticated: false, user: null }),
        });
      });
      await page.addInitScript(() => {
        // tsx/esbuild `keepNames` injects a `__name` helper that does not exist in the page.
        (globalThis as unknown as { __name: (fn: unknown) => unknown }).__name = (fn) => fn;
      });
      await page.addInitScript(
        ({ quickStartKey, mobileHintKey }) => {
          try {
            globalThis.localStorage.setItem(quickStartKey, "1");
            globalThis.localStorage.setItem(mobileHintKey, "1");
            globalThis.localStorage.setItem(
              "toonspectrum-lang",
              JSON.stringify({ state: { lang: "ko" }, version: 0 }),
            );
            globalThis.localStorage.setItem(
              "toonspectrum-studio-ui-density:v1",
              JSON.stringify({ mode: "full" }),
            );
          } catch {
            // A storage-partitioned context still renders the chrome this verifier measures.
          }
        },
        { quickStartKey: QUICKSTART_KEY, mobileHintKey: MOBILE_HINT_KEY },
      );

      await page.goto(studioUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.locator("[data-studio-canvas-viewport]").waitFor({
        state: "visible",
        timeout: 60_000,
      });
      const quickStart = page.locator('[data-studio-creative-starter="true"]');
      if (await quickStart.isVisible({ timeout: 1_500 }).catch(() => false)) {
        await quickStart
          .locator('[data-studio-quickstart-dismiss="true"]')
          .click()
          .catch(() => undefined);
      }
      await page.waitForTimeout(2_500);

      const metrics = await measure(page);
      results.push({ viewport: testCase.name, metrics });
      await page.screenshot({
        path: join(SCRATCH, `studio-canvas-chrome-${testCase.name}.png`),
      });
      await context.close();
    }

    for (const { viewport, metrics } of results) {
      invariant(
        metrics.viewportHeight > 0 && metrics.columnHeight > 0,
        `${viewport}: could not measure the canvas column`,
      );
      invariant(
        !metrics.reliabilityIdleRowPresent,
        `${viewport}: the idle "저장·GPU 이상 없음" row is back in the layout`,
      );
      invariant(
        !metrics.reliabilityRailInFlow,
        `${viewport}: the reliability rail is back in the canvas flow — a failure arriving mid-stroke would move the stage origin`,
      );
      invariant(
        metrics.reliabilityChipPresent,
        `${viewport}: the on-demand reliability chip is missing — save/GPU/storage state became unreachable`,
      );
    }

    const mobile = results.find((entry) => entry.viewport === "mobile-360");
    invariant(
      mobile !== undefined && mobile.metrics.noticeStripFlowHeight === 0,
      "mobile-360: the empty notice strip still reserves drawing area",
    );

    writeFileSync(RESULT_PATH, `${JSON.stringify({ results }, null, 2)}\n`);
    console.log(JSON.stringify({ results }, null, 2));
    console.log(`evidence: ${RESULT_PATH}`);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (server) await stopChildProcess(server).catch(() => undefined);
  }
}

void main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
