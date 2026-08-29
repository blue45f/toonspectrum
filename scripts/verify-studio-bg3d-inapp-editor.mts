/**
 * Drives the real BG3D background editor inside Korean in-app browsers.
 *
 * The route sweep in `verify-studio-inapp-browser.mts` proves every Studio *route* survives an
 * embedded WebView. It never opens the 3D editor, which is a modal launched from inside the
 * editor, so nothing until now showed that the 3D surface itself works there — and that surface is
 * exactly where the engine-selection policy has to hold: a KakaoTalk or NAVER WebView must open the
 * editor on WebGL2, render real pixels, and keep its engine control reachable at 360px.
 *
 * Every assertion here is about the shipped UI, not a harness reimplementation: the production
 * build is served, the routed `bg3d` surface is opened the way a shared link opens it, and the
 * composited canvas is read back.
 *
 * Run:
 *   pnpm run build && pnpm exec tsx scripts/verify-studio-bg3d-inapp-editor.mts
 *
 * Exit codes:
 *   0 = the 3D editor opened, rendered, and reported the expected engine in every profile
 *   1 = a profile failed
 */

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
  process.env.TOONSPECTRUM_BG3D_INAPP_VERIFY_DIR
  ?? process.env.TOONSPECTRUM_VERIFY_DIR
  ?? join(tmpdir(), `toonspectrum-bg3d-inapp-${Date.now()}`);

const QUICK_START_KEY = "toonspectrum-studio-quickstart-dismissed:v1";
const MOBILE_HINT_KEY = "toonspectrum-studio-mobile-hint-dismissed:v1";
const UI_DENSITY_KEY = "toonspectrum-studio-ui-density:v1";

/** The minimum comfortable touch target this repository holds mobile controls to. */
const MIN_TOUCH_TARGET_PX = 44;

interface InAppProfile {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly userAgent: string;
  /** Engine the admission policy must land on inside this host. */
  readonly expectedBackendLabel: string;
}

const PROFILES: readonly InAppProfile[] = Object.freeze([
  {
    id: "kakaotalk-android-360",
    width: 360,
    height: 640,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 "
      + "(KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36 KAKAOTALK 10.4.3",
    expectedBackendLabel: "WebGL2",
  },
  {
    id: "instagram-ios-390",
    width: 390,
    height: 720,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 "
      + "(KHTML, like Gecko) Mobile/21E236 Instagram 320.0.0.0.0 (iPhone15,3; iOS 17_4; ko_KR)",
    expectedBackendLabel: "WebGL2",
  },
  {
    id: "naver-android-412",
    width: 412,
    height: 760,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 "
      + "(KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36 "
      + "NAVER(inapp; search; 2000; 12.9.6)",
    expectedBackendLabel: "WebGL2",
  },
]);

interface ProfileResult {
  readonly id: string;
  readonly opened: boolean;
  readonly canvas: {
    readonly cssWidth: number;
    readonly cssHeight: number;
    readonly distinctColors: number;
  };
  readonly engine: {
    readonly badge: string | null;
    readonly status: string | null;
    readonly smallestTouchTargetPx: number | null;
  };
  readonly horizontalOverflowPx: number;
  /** Observation, not an assertion: how far each notice crosses the control clusters. */
  readonly overlayOverlaps: readonly string[];
  /** Observation: does the left tool rail expose a 3D background entry at this width? */
  readonly railEntryVisible: boolean;
  readonly pageErrors: readonly string[];
  readonly consoleErrors: readonly string[];
  readonly failures: readonly string[];
}

function writeJson(fileName: string, value: unknown): void {
  writeFileSync(join(SCRATCH, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

async function seedStudioPreferences(page: Page): Promise<void> {
  await page.addInitScript(({ quickStartKey, mobileHintKey, uiDensityKey }) => {
    try {
      localStorage.setItem(quickStartKey, "1");
      localStorage.setItem(mobileHintKey, "1");
      localStorage.setItem(uiDensityKey, JSON.stringify({ mode: "full" }));
    } catch {
      // The visible assertions below stay authoritative when storage is blocked.
    }
  }, { quickStartKey: QUICK_START_KEY, mobileHintKey: MOBILE_HINT_KEY, uiDensityKey: UI_DENSITY_KEY });
}

async function dismissQuickStart(page: Page): Promise<void> {
  const quickStart = page.locator('[data-studio-creative-starter="true"]');
  const mounted = await quickStart
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  if (!mounted) return;
  await quickStart.locator('[data-studio-quickstart-dismiss="true"]').click();
  await quickStart.waitFor({ state: "detached", timeout: 5_000 }).catch(() => undefined);
}

/**
 * Reads the rendered canvas back so a blank or never-painted viewport cannot pass.
 *
 * The pixels come from a Playwright element screenshot rather than `drawImage(canvas)`. R3F runs
 * WebGL without `preserveDrawingBuffer`, so the drawing buffer is already gone by the time a later
 * task tries to copy it — `drawImage` then yields one flat colour and this verifier would report a
 * blank viewport for a scene that is plainly on screen. The screenshot is the composited frame,
 * which is also exactly what the artist sees. The browser decodes it, so no image dependency.
 */
async function readCanvasSignal(page: Page): Promise<ProfileResult["canvas"]> {
  const dialog = page.locator('[data-testid="studio-bg3d-dialog"]');
  await dialog.waitFor({ state: "visible", timeout: 45_000 });
  const canvas = dialog.locator("canvas").first();
  await canvas.waitFor({ state: "visible", timeout: 45_000 });
  // Two paint boundaries: R3F mounts its View and the scene hydrates from the SceneDocument.
  await page.waitForTimeout(1_500);

  const box = await canvas.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { cssWidth: Math.round(rect.width), cssHeight: Math.round(rect.height) };
  });
  const shot = await canvas.screenshot({ type: "png" });
  const distinctColors = await page.evaluate(async (dataUrl) => {
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const probe = document.createElement("canvas");
    probe.width = Math.min(96, bitmap.width || 1);
    probe.height = Math.min(64, bitmap.height || 1);
    const context = probe.getContext("2d");
    if (!context) return 0;
    context.drawImage(bitmap, 0, 0, probe.width, probe.height);
    const { data } = context.getImageData(0, 0, probe.width, probe.height);
    const seen = new Set<number>();
    for (let index = 0; index < data.length; index += 4) {
      seen.add(((data[index] ?? 0) << 16) | ((data[index + 1] ?? 0) << 8) | (data[index + 2] ?? 0));
    }
    return seen.size;
  }, `data:image/png;base64,${shot.toString("base64")}`);

  return { ...box, distinctColors };
}

/**
 * Measures whether every floating viewport notice paints its own readable surface.
 *
 * At 360px the viewport is roughly 275 CSS px tall and the transform and camera clusters flank it,
 * so a floating notice cannot avoid crossing a control — there is no free band to put one in. What
 * broke readability was never the overlap itself: it was a notice with no surface of its own, so
 * buttons and text rendered through each other and neither could be read. The notices are
 * pointer-transparent, so taps still reach the controls beneath them; the surface is what has to
 * hold. Nothing throws when it does not, which is why it is measured.
 *
 * The overlap is still reported, as an observation, because it is the number that decides whether
 * this layout still works if the chrome grows.
 */
async function readOverlayLegibility(page: Page): Promise<{
  readonly failures: readonly string[];
  readonly overlaps: readonly string[];
}> {
  return page.evaluate(() => {
    const dialog = document.querySelector('[data-testid="studio-bg3d-dialog"]');
    if (!dialog) return { failures: [], overlaps: [] };
    const clusters = [...dialog.querySelectorAll('[data-bg3d-viewport-control="true"]')];
    const notices = [
      ["empty-scene guide", '[data-testid="studio-bg3d-empty-scene-guide"] :is(span, div)'],
      ["shared-stage status", '[data-testid="studio-bg3d-shared-stage-status"]'],
    ] as const;
    const failures: string[] = [];
    const overlaps: string[] = [];
    for (const [label, selector] of notices) {
      const notice = dialog.querySelector(selector);
      if (!notice) continue;
      const box = notice.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;

      const style = getComputedStyle(notice);
      const alpha = Number(
        /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+)\s*)?\)/u
          .exec(style.backgroundColor)?.[1] ?? "1",
      );
      if (style.backgroundColor === "transparent" || alpha < 0.85) {
        failures.push(
          `${label} paints no readable surface (background ${style.backgroundColor});`
          + " controls behind it show through the text",
        );
      }

      for (const cluster of clusters) {
        const other = cluster.getBoundingClientRect();
        if (other.width === 0 || other.height === 0) continue;
        const overlapX = Math.min(box.right, other.right) - Math.max(box.left, other.left);
        const overlapY = Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top);
        if (overlapX > 1 && overlapY > 1) {
          overlaps.push(
            `${label} crosses a control cluster by ${Math.round(overlapX)}x${Math.round(overlapY)}px`,
          );
        }
      }
    }
    return { failures, overlaps };
  });
}

/** Opens the editor's 보기 tab and reads the engine card the artist would actually see. */
async function readEnginePanel(page: Page): Promise<ProfileResult["engine"]> {
  // `bg3d-tab-view` is the sidebar tablist's own id, so this follows the shipped control rather
  // than a label that translation could move out from under the verifier.
  const viewTab = page.locator("#bg3d-tab-view").first();
  const reachable = await viewTab
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!reachable) return { badge: null, status: null, smallestTouchTargetPx: null };
  await viewTab.click();

  const badge = page.locator('[data-testid="studio-bg3d-engine-active-backend"]').first();
  await badge.waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
  const status = page.locator('[data-testid="studio-bg3d-engine-status"]').first();

  let smallest: number | null = null;
  for (const option of ["auto", "webgpu", "webgl2"]) {
    const button = page.locator(`[data-testid="studio-bg3d-engine-preference-${option}"]`).first();
    await button.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => undefined);
    const box = await button.boundingBox().catch(() => null);
    if (!box) continue;
    const shortest = Math.min(box.width, box.height);
    smallest = smallest === null ? shortest : Math.min(smallest, shortest);
  }
  return {
    badge: await badge.textContent().catch(() => null),
    status: await status.textContent().catch(() => null),
    smallestTouchTargetPx: smallest,
  };
}

/**
 * Opens the 3D background editor through the surface the router actually owns.
 *
 * `studio-route-manifest.ts` declares `bg3d` as a routed Studio surface, and `StudioPage` opens the
 * editor when the route resolves to it. That is also how in-app traffic really arrives: a link
 * shared into KakaoTalk or NAVER lands on a deep link, not on a chain of taps. Driving the route
 * keeps this verifier measuring the 3D surface itself rather than the dock animation in front of it.
 */
async function openBackground3d(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/studio/bg3d`, { waitUntil: "domcontentloaded" });
  await dismissQuickStart(page);
}

/**
 * Records whether the left tool rail offers a 3D background entry at this width.
 *
 * The desktop menubar is `md:flex`, so it does not exist on a phone. The rail is the entry an
 * artist would reach for; when it is absent the surface is still reachable, but only through the
 * quick-start panel or a deep link. This is an observation, not an assertion — the deep link above
 * is what the engine policy has to survive, while this says how discoverable the surface is.
 */
async function probeRailEntryVisible(page: Page, baseUrl: string): Promise<boolean> {
  await page.goto(`${baseUrl}/studio`, { waitUntil: "domcontentloaded" });
  await dismissQuickStart(page);
  const dock = page.locator('[data-studio-mobile-editing-dock="true"]');
  const docked = await dock
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!docked) return false;
  const expand = page.getByRole("button", { name: "Expand workspace tools" }).first();
  if (await expand.isVisible().catch(() => false)) {
    await expand.click();
    await page.waitForTimeout(800);
  }
  return page
    .locator('[data-studio-rail-tool-id="bg3d"]')
    .first()
    .isVisible()
    .catch(() => false);
}

async function runProfile(
  browser: Browser,
  baseUrl: string,
  profile: InAppProfile,
): Promise<ProfileResult> {
  const context = await browser.newContext({
    userAgent: profile.userAgent,
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const failures: string[] = [];
  let opened = false;
  let canvas: ProfileResult["canvas"] = { cssWidth: 0, cssHeight: 0, distinctColors: 0 };
  let engine: ProfileResult["engine"] = { badge: null, status: null, smallestTouchTargetPx: null };
  let horizontalOverflowPx = 0;
  let overlayLegibility: { failures: readonly string[]; overlaps: readonly string[] } =
    { failures: [], overlaps: [] };
  let railEntryVisible = false;

  try {
    await seedStudioPreferences(page);
    await openBackground3d(page, baseUrl);

    canvas = await readCanvasSignal(page);
    opened = true;
    overlayLegibility = await readOverlayLegibility(page);
    engine = await readEnginePanel(page);

    horizontalOverflowPx = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    await page.screenshot({ path: join(SCRATCH, `${profile.id}.png`), fullPage: false });

    railEntryVisible = await probeRailEntryVisible(page, baseUrl);
  } catch (error) {
    failures.push(`could not drive the 3D editor: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await context.close();
  }

  if (opened) {
    // A canvas that painted only its clear colour is not a rendered scene.
    if (canvas.distinctColors < 3) {
      failures.push(`3D canvas rendered ${canvas.distinctColors} distinct colours; the scene did not paint`);
    }
    if (engine.badge === null) {
      failures.push("engine status card was unreachable from the 보기 tab");
    } else if (!engine.badge.includes(profile.expectedBackendLabel)) {
      failures.push(`engine badge read "${engine.badge}", expected ${profile.expectedBackendLabel}`);
    }
    if (engine.smallestTouchTargetPx !== null && engine.smallestTouchTargetPx < MIN_TOUCH_TARGET_PX) {
      failures.push(
        `engine preference control is ${engine.smallestTouchTargetPx}px, under the ${MIN_TOUCH_TARGET_PX}px touch target`,
      );
    }
    if (horizontalOverflowPx > 0) {
      failures.push(`document overflows horizontally by ${horizontalOverflowPx}px`);
    }
    failures.push(...overlayLegibility.failures);
  }
  if (pageErrors.length > 0) failures.push(`page errors: ${pageErrors.join("; ")}`);

  return {
    id: profile.id,
    opened,
    canvas,
    engine,
    horizontalOverflowPx,
    overlayOverlaps: overlayLegibility.overlaps,
    railEntryVisible,
    pageErrors,
    consoleErrors,
    failures,
  };
}

async function main(): Promise<void> {
  mkdirSync(SCRATCH, { recursive: true });
  const port = await findFreePort();
  const preview = spawnVitePreview({ port, runner: "node-vite-bin", logPath: join(SCRATCH, "preview.log") });
  const baseUrl = `http://127.0.0.1:${port}`;
  let browser: Browser | null = null;
  try {
    await waitForServer(`${baseUrl}/studio`, { timeoutMs: 60_000, requestInit: { method: "GET" } });
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox"],
    });
    const results: ProfileResult[] = [];
    for (const profile of PROFILES) results.push(await runProfile(browser, baseUrl, profile));

    const failures = results.flatMap((result) => result.failures.map((f) => `${result.id}: ${f}`));
    const summary = {
      status: failures.length === 0 ? "ok" : "failed",
      profiles: results,
      failures,
      evidenceDirectory: SCRATCH,
    };
    writeJson("summary.json", summary);
    console.log(JSON.stringify(summary, null, 2));
    if (failures.length > 0) process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await stopChildProcess(preview);
  }
}

main().catch((error: unknown) => {
  mkdirSync(SCRATCH, { recursive: true });
  const failure = {
    status: "error",
    message: error instanceof Error ? error.message : String(error),
    evidenceDirectory: SCRATCH,
  };
  writeJson("summary.json", failure);
  console.error(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
});
