/**
 * Drives the real BG3D background editor inside Korean in-app browsers.
 *
 * The route sweep in `verify-studio-inapp-browser.mts` proves every Studio *route* survives an
 * embedded WebView. It never opens the 3D editor, which is a modal launched from inside the
 * editor, so nothing until now showed that the 3D surface itself works there — and that surface is
 * exactly where the engine-selection policy has to hold: a KakaoTalk or NAVER WebView blocks WebGPU,
 * and since ADR-0018 nothing mounts WebGL2 on its own, so the artist has to select WebGL2 in the
 * 보기 tab. This verifier makes that same explicit choice, then requires the editor to render real
 * pixels on WebGL2 and keep its engine control reachable at 360px.
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

import { chromium, type Browser, type CDPSession, type Locator, type Page } from "playwright";

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
const INAPP_CONTEXT_OPTIONS = Object.freeze({ deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const EXECUTION_ENVIRONMENT = Object.freeze({ platform: process.platform, architecture: process.arch });

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
  readonly touchScroll: {
    readonly handleWidth: number;
    readonly handleHeight: number;
    readonly scrollTopBefore: number;
    readonly scrollTopAfter: number;
    readonly touchStartTarget: string;
    readonly trustedTouchStart: boolean;
  } | null;
  readonly touchScrollDiagnostics: NativeTouchScrollDiagnostics;
  /** Visible notice/control intersections; each overlap also fails the profile. */
  readonly overlayOverlaps: readonly string[];
  /** Observation: does the left tool rail expose a 3D background entry at this width? */
  readonly railEntryVisible: boolean;
  readonly pageErrors: readonly string[];
  readonly consoleErrors: readonly string[];
  readonly failedHttpResponses: readonly {
    readonly url: string;
    readonly status: number;
    readonly method: string;
    readonly resourceType: string;
  }[];
  readonly failures: readonly string[];
}

interface FramingProfileResult {
  readonly id: string;
  readonly fitMeanPixelDelta: number | null;
  readonly undoMeanPixelDelta: number | null;
  readonly guideAspectRatio: number | null;
  readonly pageErrors: readonly string[];
  readonly failures: readonly string[];
}

async function compareCompositedFrames(page: Page, left: Buffer, right: Buffer): Promise<number> {
  return page.evaluate(async ([leftUrl, rightUrl]) => {
    const pixels = async (url: string) => {
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Could not decode framing evidence");
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
    };
    const [first, second] = await Promise.all([pixels(leftUrl), pixels(rightUrl)]);
    if (first.width !== second.width || first.height !== second.height) {
      throw new Error("Camera command changed the canvas dimensions during the comparison");
    }
    let delta = 0;
    for (let index = 0; index < first.data.length; index += 4) {
      delta += Math.abs(first.data[index] - second.data[index]);
      delta += Math.abs(first.data[index + 1] - second.data[index + 1]);
      delta += Math.abs(first.data[index + 2] - second.data[index + 2]);
    }
    return delta / (first.width * first.height * 3);
  }, [left, right].map((buffer) => `data:image/png;base64,${buffer.toString("base64")}`));
}

/** Fresh contexts preserve the original in-app profiles' scene, selection, scroll and tab state. */
async function verifyFramingProfile(
  browser: Browser,
  baseUrl: string,
  profile: { readonly id: string; readonly width: number; readonly height: number; readonly mobile: boolean },
): Promise<FramingProfileResult> {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    ...(profile.mobile ? { ...INAPP_CONTEXT_OPTIONS, userAgent: PROFILES[0].userAgent } : {}),
  });
  const page = await context.newPage();
  const failures: string[] = [];
  const pageErrors: string[] = [];
  let fitMeanPixelDelta: number | null = null;
  let undoMeanPixelDelta: number | null = null;
  let guideAspectRatio: number | null = null;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await seedStudioPreferences(page);
    await openBackground3d(page, baseUrl);
    await selectWebGl2Engine(page);
    // The backend badge reports the selected plan before R3F has created its renderer and
    // restored the initial scene. Use the same painted-canvas readiness check as the original
    // in-app profiles before building this framing fixture; otherwise late initial hydration
    // can replace the just-added subject and its history with the initial empty document.
    const initialCanvas = await readCanvasSignal(page);
    if (initialCanvas.distinctColors < 3) {
      throw new Error(`Framing fixture canvas has not painted (${initialCanvas.distinctColors} colours)`);
    }
    const dialog = page.getByTestId("studio-bg3d-dialog");
    await dialog.getByRole("tab", { name: "도형", exact: true }).click();
    await dialog.getByRole("button", { name: "상자 추가", exact: true }).first().click();
    for (const [axis, value] of [["X", "0.8"], ["Y", "6"], ["Z", "0.4"]]) {
      const field = dialog.getByRole("spinbutton", { name: `크기 ${axis}`, exact: true }).first();
      await field.fill(value);
      // Vec3Field commits onChange, including on mobile; a physical Tab key is unnecessary.
      if (Number(await field.inputValue()) !== Number(value)) {
        throw new Error(`Framing fixture did not retain scale ${axis}=${value}`);
      }
    }
    const reset = dialog.getByRole("button", { name: "시점 초기화", exact: true });
    await reset.click();
    const viewport = page.getByTestId("studio-bg3d-viewport");
    const canvas = dialog.locator("canvas").first();
    const capture = async (phase: string): Promise<Buffer> => {
      await viewport.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      await page.waitForTimeout(1_000);
      return canvas.screenshot({ path: join(SCRATCH, `${profile.id}-${phase}.png`), type: "png" });
    };
    const baseline = await capture("before-fit");
    await dialog.getByRole("button", { name: "선택 객체 화면 맞춤", exact: true }).click();
    const fitted = await capture("fitted");
    fitMeanPixelDelta = await compareCompositedFrames(page, baseline, fitted);
    if (fitMeanPixelDelta <= 0.5) failures.push(`Screen fit did not visibly change the tall subject (${fitMeanPixelDelta})`);
    await dialog.getByRole("button", { name: "실행 취소", exact: true }).click();
    const restored = await capture("undo-restored");
    undoMeanPixelDelta = await compareCompositedFrames(page, baseline, restored);
    if (undoMeanPixelDelta > 1) failures.push(`Undo did not restore the baseline camera (${undoMeanPixelDelta} mean channel delta)`);
    // none -> thirds -> verticalWebtoon. A physical SVG rect, not the normalized viewBox, is read.
    const guideToggle = page.getByTestId("bg3d-composition-guide-toggle");
    await guideToggle.click();
    await guideToggle.click();
    const guide = page.getByTestId("bg3d-vertical-webtoon-frame");
    await guide.waitFor({ state: "visible", timeout: 5_000 });
    const guideBox = await guide.boundingBox();
    if (!guideBox || guideBox.height <= 0) throw new Error("Vertical composition guide has no physical bounds");
    guideAspectRatio = guideBox.width / guideBox.height;
    if (Math.abs(guideAspectRatio - 9 / 16) > 0.003) {
      failures.push(`Vertical composition guide is ${guideAspectRatio}, expected physical 9:16`);
    }
    await viewport.screenshot({ path: join(SCRATCH, `${profile.id}-vertical-guide.png`) });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    await page.screenshot({ path: join(SCRATCH, `${profile.id}-failure.png`), timeout: 5_000 }).catch(() => undefined);
  } finally {
    await context.close();
  }
  if (pageErrors.length > 0) failures.push(`page errors: ${pageErrors.join("; ")}`);
  return { id: profile.id, fitMeanPixelDelta, undoMeanPixelDelta, guideAspectRatio, pageErrors, failures };
}

interface NativeTouchEventSample {
  type: string;
  target: string;
  onHandle: boolean;
  trusted: boolean;
  defaultPrevented: boolean;
  x: number | null;
  y: number | null;
  scrollTop: number | null;
  timestamp: number;
}

interface NativeTouchScrollDiagnostics {
  phase: "not-started" | "measure" | "reset-input" | "reset-wait"
    | "drag-input" | "drag-wait" | "complete";
  initialGeometry: Awaited<ReturnType<typeof readNativeTouchScrollGeometry>> | null;
  finalGeometry: Awaited<ReturnType<typeof readNativeTouchScrollGeometry>> | null;
  events: NativeTouchEventSample[];
  observationErrors: string[];
}

function writeJson(fileName: string, value: unknown): void {
  writeFileSync(join(SCRATCH, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

async function seedStudioPreferences(page: Page): Promise<void> {
  // tsx names nested helpers with __name when serializing this file's page callbacks.
  await page.addInitScript("globalThis.__name ??= (target) => target;");
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
  // Since 4583af11 the coach is non-modal and no longer yields to a foreign modal. On the routed
  // `/studio/bg3d` entry the editor dialog is already stacked above it, so a click on the card's
  // close button only ever hits the dialog and times out. The card underneath changes nothing this
  // verifier measures, so leave it and drive the dialog; on a plain `/studio` visit it still closes.
  const editorOpen = await page
    .locator('[data-testid="studio-bg3d-dialog"]')
    .isVisible()
    .catch(() => false);
  if (editorOpen) return;
  await quickStart
    .locator('[data-studio-quickstart-dismiss="true"]')
    .click({ timeout: 10_000 })
    .catch(() => undefined);
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
 * Notices must have a readable surface and leave actual viewport controls unobscured.
 * Pointer transparency only preserves hit testing: a painted card can still hide its button.
 * Clip both geometries to the window and scrolling ancestors so offscreen controls and empty
 * space between a cluster's buttons cannot produce an overlap failure.
 */
async function readOverlayLegibility(page: Page): Promise<{
  readonly failures: readonly string[];
  readonly overlaps: readonly string[];
}> {
  return page.evaluate(() => {
    const dialog = document.querySelector('[data-testid="studio-bg3d-dialog"]');
    if (!dialog) return { failures: [], overlaps: [] };
    interface VisibleRect { left: number; top: number; right: number; bottom: number }
    const clipsOverflow = (overflow: string) => /^(?:auto|scroll|hidden|clip|overlay)$/u.test(overflow);
    const visibleRects = (element: Element): VisibleRect[] => {
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.visibility === "collapse") return [];
      const clip: VisibleRect = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        const ancestorStyle = getComputedStyle(ancestor);
        if (ancestorStyle.display === "none" || ancestorStyle.contentVisibility === "hidden"
          || Number(ancestorStyle.opacity) === 0) return [];
        if (ancestor === element) continue;
        const clipX = clipsOverflow(ancestorStyle.overflowX);
        const clipY = clipsOverflow(ancestorStyle.overflowY);
        if (!clipX && !clipY) continue;
        const box = ancestor.getBoundingClientRect();
        // client bounds exclude borders and scrollbars; preserve CSS scaling in the screen rect.
        const scaleX = ancestor instanceof HTMLElement && ancestor.offsetWidth > 0
          ? box.width / ancestor.offsetWidth : 1;
        const scaleY = ancestor instanceof HTMLElement && ancestor.offsetHeight > 0
          ? box.height / ancestor.offsetHeight : 1;
        const left = box.left + ancestor.clientLeft * scaleX;
        const top = box.top + ancestor.clientTop * scaleY;
        if (clipX) {
          clip.left = Math.max(clip.left, left);
          clip.right = Math.min(clip.right, left + ancestor.clientWidth * scaleX);
        }
        if (clipY) {
          clip.top = Math.max(clip.top, top);
          clip.bottom = Math.min(clip.bottom, top + ancestor.clientHeight * scaleY);
        }
      }
      return [...element.getClientRects()].map((box) => ({
        left: Math.max(box.left, clip.left), top: Math.max(box.top, clip.top),
        right: Math.min(box.right, clip.right), bottom: Math.min(box.bottom, clip.bottom),
      })).filter((box) => box.right > box.left && box.bottom > box.top);
    };
    const controls = [...dialog.querySelectorAll(
      '[data-testid="studio-bg3d-viewport"] :is(button, input, select, textarea, a[href], [role="button"], [role="slider"])',
    )].map((element) => ({
      label: element.getAttribute("aria-label") || element.getAttribute("title")
        || element.textContent?.trim() || element.tagName.toLowerCase(),
      rects: visibleRects(element),
    })).filter((control) => control.rects.length > 0);
    const notices = [
      ["empty-scene guide", '[data-testid="studio-bg3d-empty-scene-guide"] > :is(span, div)'],
      ["shared-character status", '[data-testid="studio-bg3d-shared-characters-status"]'],
      ["shared-stage status", '[data-testid="studio-bg3d-shared-stage-status"]'],
      ["measurement status", '[data-testid="bg3d-measurement-status"]'],
      ["surface-snap status", '[data-testid="bg3d-surface-snap-status"]'],
    ] as const;
    const failures: string[] = [];
    const overlaps: string[] = [];
    for (const [label, selector] of notices) {
      for (const notice of dialog.querySelectorAll(selector)) {
        // A linked stage message is text inside the character card already checked above.
        if (label === "shared-stage status"
          && notice.closest('[data-testid="studio-bg3d-shared-characters-status"]')) continue;
        const boxes = visibleRects(notice);
        if (boxes.length === 0) continue;
        const background = getComputedStyle(notice).backgroundColor;
        const slashAlpha = /\/\s*([\d.]+)(%)?\s*\)$/u.exec(background);
        const rgbaAlpha = /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+)\s*)?\)/u.exec(background);
        const alpha = slashAlpha
          ? Number(slashAlpha[1]) / (slashAlpha[2] ? 100 : 1)
          : Number(rgbaAlpha?.[1] ?? "1");
        if (background === "transparent" || alpha < 0.85) {
          failures.push(`${label} paints no readable surface (background ${background});`
            + " controls behind it show through the text");
        }
        for (const control of controls) {
          let intersection: { width: number; height: number } | null = null;
          for (const box of boxes) {
            for (const other of control.rects) {
              const width = Math.min(box.right, other.right) - Math.max(box.left, other.left);
              const height = Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top);
              if (width > 1 && height > 1) intersection = { width, height };
            }
          }
          if (!intersection) continue;
          const message = `${label} obscures viewport control "${control.label}" by `
            + `${Math.round(intersection.width)}x${Math.round(intersection.height)}px`;
          overlaps.push(message);
          failures.push(message);
        }
      }
    }
    return { failures, overlaps };
  });
}

async function readNativeTouchScrollGeometry(handle: Locator) {
  return handle.evaluate((element) => {
    const section = element.closest("section");
    if (!section) throw new Error("3D scroll handle has no viewport section");
    const box = element.getBoundingClientRect();
    const clip = section.getBoundingClientRect();
    const left = Math.max(box.left, clip.left, 0);
    const top = Math.max(box.top, clip.top, 0);
    const right = Math.min(box.right, clip.right, innerWidth);
    const bottom = Math.min(box.bottom, clip.bottom, innerHeight);
    return {
      width: right - left, height: bottom - top,
      x: (left + right) / 2, y: (top + bottom) / 2,
      scrollTop: section.scrollTop, scrollHeight: section.scrollHeight, clientHeight: section.clientHeight,
      viewportWidth: innerWidth, viewportHeight: innerHeight, deviceScaleFactor: devicePixelRatio,
      visualViewportScale: visualViewport?.scale ?? 1,
      touchAction: getComputedStyle(element).touchAction,
      sectionTouchAction: getComputedStyle(section).touchAction,
      sectionOverflowY: getComputedStyle(section).overflowY,
    };
  });
}

/** Send every native touch point; the scroll assertions still decide whether the page consumed it. */
async function dispatchNativeTouchDrag(
  cdp: CDPSession,
  { x, y, yDistance, speed }: { x: number; y: number; yDistance: number; speed: number },
): Promise<void> {
  const steps = Math.max(1, Math.ceil(Math.abs(yDistance) / speed * 60));
  const intervalMs = Math.abs(yDistance) / speed * 1_000 / steps;
  const point = (nextY: number) => ({ id: 1, x, y: nextY });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(y)] });
  try {
    for (let step = 1; step <= steps; step += 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove", touchPoints: [point(y + yDistance * step / steps)],
      });
    }
  } finally {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
}

/** Proves a finger gesture reaches the scrolling surface instead of the canvas's touch:none. */
async function verifyNativeTouchScroll(
  page: Page,
  diagnostics: NativeTouchScrollDiagnostics,
): Promise<NonNullable<ProfileResult["touchScroll"]>> {
  const selector = '[data-testid="bg3d-scroll-handle"]';
  const handle = page.locator(selector);
  diagnostics.phase = "measure";
  await handle.waitFor({ state: "visible", timeout: 10_000 });
  const geometry = await readNativeTouchScrollGeometry(handle);
  diagnostics.initialGeometry = geometry;
  if (Math.min(geometry.width, geometry.height) < MIN_TOUCH_TARGET_PX) {
    throw new Error(`3D scroll handle exposes ${geometry.width}x${geometry.height}px; requires 44x44px`);
  }
  if (geometry.scrollHeight <= geometry.clientHeight + 1) {
    throw new Error("3D touch-scroll fixture has no overflow to exercise");
  }

  const observation = await page.evaluateHandle((selector) => {
    const events: NativeTouchEventSample[] = [];
    const kinds = ["touchstart", "touchmove", "touchend", "touchcancel", "pointerdown", "pointercancel"];
    const record = (event: Event) => {
      if (events.length >= 128) return;
      const target = event.target instanceof Element ? event.target : null;
      const point = event instanceof TouchEvent ? event.changedTouches[0]
        : event instanceof PointerEvent ? event : null;
      const sample: NativeTouchEventSample = {
        type: event.type, target: target?.getAttribute("data-testid") ?? target?.tagName ?? "unknown",
        onHandle: target !== null && target.closest(selector) !== null,
        trusted: event.isTrusted, defaultPrevented: event.defaultPrevented,
        x: point?.clientX ?? null, y: point?.clientY ?? null,
        scrollTop: document.querySelector(selector)?.closest("section")?.scrollTop ?? null,
        timestamp: performance.now(),
      };
      events.push(sample);
      // A task runs after dispatch; a microtask can precede later event handlers.
      setTimeout(() => { sample.defaultPrevented = event.defaultPrevented; }, 0);
    };
    for (const kind of kinds) document.addEventListener(kind, record, { capture: true, passive: true });
    return {
      stop() {
        for (const kind of kinds) document.removeEventListener(kind, record, true);
        return events;
      },
    };
  }, selector);
  const cdp = await page.context().newCDPSession(page);
  try {
    // The earlier canvas screenshot may reveal its bottom edge. Reset through real touch input,
    // never a scrollTop assignment or wheel event, before measuring the required upward drag.
    if (geometry.scrollTop > 1) {
      diagnostics.phase = "reset-input";
      await dispatchNativeTouchDrag(cdp, {
        x: geometry.x, y: geometry.y,
        yDistance: geometry.scrollTop + geometry.clientHeight,
        speed: 400,
      });
      diagnostics.phase = "reset-wait";
      await page.waitForFunction((selector) => (
        document.querySelector(selector)?.closest("section")?.scrollTop === 0
      ), selector, { timeout: 5_000 });
    }
    const scrollTopBefore = await handle.evaluate((element) => element.closest("section")!.scrollTop);
    const touchStarted = page.evaluate((selector) => new Promise<{
      target: string; onHandle: boolean; trusted: boolean;
    } | null>((resolve) => {
      const record = (event: TouchEvent) => {
        clearTimeout(timer);
        document.removeEventListener("touchstart", record, true);
        const target = event.target instanceof Element ? event.target : null;
        resolve({
          target: target?.getAttribute("data-testid") ?? target?.tagName ?? "unknown",
          onHandle: target !== null && target.closest(selector) !== null,
          trusted: event.isTrusted,
        });
      };
      const timer = setTimeout(() => {
        document.removeEventListener("touchstart", record, true);
        resolve(null);
      }, 5_000);
      document.addEventListener("touchstart", record, { capture: true, passive: true });
    }), selector);
    let touchStart: Awaited<typeof touchStarted>;
    try {
      // This second evaluation also completes after the observation listener is installed.
      const hitHandle = await handle.evaluate((element, { x, y }) => (
        element.contains(document.elementFromPoint(x, y))
      ), geometry);
      if (!hitHandle) throw new Error("3D scroll handle center is covered by another element");
      diagnostics.phase = "drag-input";
      await dispatchNativeTouchDrag(cdp, {
        x: geometry.x, y: geometry.y, yDistance: -180,
        speed: 400,
      });
      diagnostics.phase = "drag-wait";
      await page.waitForFunction(({ selector, before }) => (
        (document.querySelector(selector)?.closest("section")?.scrollTop ?? 0) > before + 1
      ), { selector, before: scrollTopBefore }, { timeout: 5_000 });
    } finally {
      touchStart = await touchStarted;
    }
    if (!touchStart?.onHandle || !touchStart.trusted) {
      throw new Error(`Native touch was not delivered to the 3D scroll handle: ${JSON.stringify(touchStart)}`);
    }
    diagnostics.phase = "complete";
    return {
      handleWidth: geometry.width, handleHeight: geometry.height, scrollTopBefore,
      scrollTopAfter: await handle.evaluate((element) => element.closest("section")!.scrollTop),
      touchStartTarget: touchStart.target, trustedTouchStart: touchStart.trusted,
    };
  } finally {
    const [finalGeometry, events] = await Promise.allSettled([
      readNativeTouchScrollGeometry(handle),
      observation.evaluate((observer) => observer.stop()),
    ]);
    if (finalGeometry.status === "fulfilled") diagnostics.finalGeometry = finalGeometry.value;
    else diagnostics.observationErrors.push(`final geometry: ${String(finalGeometry.reason)}`);
    if (events.status === "fulfilled") diagnostics.events = events.value;
    else diagnostics.observationErrors.push(`touch events: ${String(events.reason)}`);
    await observation.dispose()
      .catch((error) => { diagnostics.observationErrors.push(`observation cleanup: ${String(error)}`); });
    await cdp.detach();
  }
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
  for (const option of ["webgpu", "webgl2"]) {
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
 * Selects the WebGL2 engine the way an artist inside this host has to.
 *
 * ADR-0018 §6: BG3D never mounts WebGL2 on its own. In an in-app WebView the admission policy
 * blocks WebGPU (`inapp-browser-blocked`), so the routed editor opens on the "WebGPU 사용 불가"
 * gate with no canvas until WebGL2 is chosen in the 보기 tab. Driving that choice here keeps the
 * verifier on the shipped path: everything read back afterwards is the engine the artist selected,
 * not a fallback the product no longer performs. The sidebar returns to whichever tab was active.
 */
async function selectWebGl2Engine(page: Page): Promise<void> {
  const previousTabId = await page
    .locator('[id^="bg3d-tab-"][role="tab"][aria-selected="true"]')
    .first()
    .getAttribute("id")
    .catch(() => null);
  const viewTab = page.locator("#bg3d-tab-view").first();
  await viewTab.waitFor({ state: "visible", timeout: 30_000 });
  await viewTab.click();

  const webgl2Selector = '[data-testid="studio-bg3d-engine-preference-webgl2"]';
  const webgl2 = page.locator(webgl2Selector).first();
  await webgl2.waitFor({ state: "visible", timeout: 15_000 });
  if ((await webgl2.getAttribute("aria-pressed")) !== "true") {
    // Both preference buttons stay disabled while the capability probe is still running.
    await page.waitForFunction((selector) => {
      const button = document.querySelector<HTMLButtonElement>(selector);
      return button !== null && !button.disabled;
    }, webgl2Selector, { timeout: 30_000 });
    await webgl2.click();
  }
  await page.waitForFunction(() => (
    document
      .querySelector('[data-testid="studio-bg3d-engine-active-backend"]')
      ?.textContent
      ?.includes("WebGL2 사용 중") ?? false
  ), null, { timeout: 60_000 });

  if (previousTabId && previousTabId !== "bg3d-tab-view") {
    await page.locator(`#${previousTabId}`).first().click().catch(() => undefined);
  }
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
    ...INAPP_CONTEXT_OPTIONS,
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedHttpResponses: Array<ProfileResult["failedHttpResponses"][number]> = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  page.on("response", (response) => {
    if (response.status() < 400) return;
    const request = response.request();
    const url = new URL(response.url());
    failedHttpResponses.push({
      url: `${url.origin}${url.pathname}`,
      status: response.status(),
      method: request.method(),
      resourceType: request.resourceType(),
    });
  });

  const failures: string[] = [];
  let opened = false;
  let canvas: ProfileResult["canvas"] = { cssWidth: 0, cssHeight: 0, distinctColors: 0 };
  let engine: ProfileResult["engine"] = { badge: null, status: null, smallestTouchTargetPx: null };
  let horizontalOverflowPx = 0;
  let touchScroll: ProfileResult["touchScroll"] = null;
  const touchScrollDiagnostics: NativeTouchScrollDiagnostics = {
    phase: "not-started", initialGeometry: null, finalGeometry: null, events: [], observationErrors: [],
  };
  let overlayLegibility: { failures: readonly string[]; overlaps: readonly string[] } =
    { failures: [], overlaps: [] };
  let railEntryVisible = false;

  try {
    await seedStudioPreferences(page);
    await openBackground3d(page, baseUrl);
    await selectWebGl2Engine(page);

    canvas = await readCanvasSignal(page);
    opened = true;
    overlayLegibility = await readOverlayLegibility(page);
    engine = await readEnginePanel(page);

    horizontalOverflowPx = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    await page.screenshot({ path: join(SCRATCH, `${profile.id}.png`), fullPage: false });
    touchScroll = await verifyNativeTouchScroll(page, touchScrollDiagnostics);

    railEntryVisible = await probeRailEntryVisible(page, baseUrl);
  } catch (error) {
    failures.push(`could not drive the 3D editor: ${error instanceof Error ? error.message : String(error)}`);
    await page.screenshot({ path: join(SCRATCH, `${profile.id}-failure.png`), timeout: 5_000 })
      .catch((cause) => { touchScrollDiagnostics.observationErrors.push(`failure screenshot: ${String(cause)}`); });
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
    touchScroll,
    touchScrollDiagnostics,
    overlayOverlaps: overlayLegibility.overlaps,
    railEntryVisible,
    pageErrors,
    consoleErrors,
    failedHttpResponses,
    failures,
  };
}

async function main(): Promise<void> {
  mkdirSync(SCRATCH, { recursive: true });
  const externalOrigin = process.env.TOONSPECTRUM_BG3D_INAPP_VERIFY_ORIGIN?.trim().replace(/\/+$/u, "") || null;
  const port = externalOrigin ? null : await findFreePort();
  const preview = port === null ? null
    : spawnVitePreview({ port, runner: "node-vite-bin", logPath: join(SCRATCH, "preview.log") });
  const baseUrl = externalOrigin ?? `http://127.0.0.1:${port}`;
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
    const framingProfiles: FramingProfileResult[] = [];
    for (const profile of [
      { id: "framing-desktop", width: 1_440, height: 1_000, mobile: false },
      { id: "framing-mobile", width: 390, height: 844, mobile: true },
    ]) framingProfiles.push(await verifyFramingProfile(browser, baseUrl, profile));

    const failures = [...results, ...framingProfiles].flatMap((result) => result.failures.map((f) => `${result.id}: ${f}`));
    const summary = {
      status: failures.length === 0 ? "ok" : "failed",
      browserVersion: browser.version(),
      execution: EXECUTION_ENVIRONMENT,
      contextOptions: INAPP_CONTEXT_OPTIONS,
      profiles: results,
      framingProfiles,
      failures,
      evidenceDirectory: SCRATCH,
    };
    writeJson("summary.json", summary);
    console.log(JSON.stringify(summary, null, 2));
    if (failures.length > 0) process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (preview) await stopChildProcess(preview);
  }
}

main().catch((error: unknown) => {
  mkdirSync(SCRATCH, { recursive: true });
  const failure = {
    status: "error",
    execution: EXECUTION_ENVIRONMENT,
    contextOptions: INAPP_CONTEXT_OPTIONS,
    message: error instanceof Error ? error.message : String(error),
    evidenceDirectory: SCRATCH,
  };
  writeJson("summary.json", failure);
  console.error(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
});
