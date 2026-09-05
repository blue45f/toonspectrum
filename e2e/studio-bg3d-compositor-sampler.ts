import type { Page } from "@playwright/test";

export interface Bg3dSampleSurface {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly bufferWidth: number;
  readonly bufferHeight: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly dpr: number;
}

/** Refuse clipping, resizing and target drift instead of sampling a different rectangle. */
export function assertBg3dSampleSurface(
  actual: Bg3dSampleSurface,
  expected?: Bg3dSampleSurface,
): void {
  if (Object.values(actual).some((value) => !Number.isFinite(value))
    || actual.width <= 0 || actual.height <= 0
    || actual.cssWidth <= 0 || actual.cssHeight <= 0
    || actual.bufferWidth <= 0 || actual.bufferHeight <= 0
    || actual.dpr !== 1 || actual.x < 0 || actual.y < 0
    || actual.x + actual.width > actual.viewportWidth + 0.01
    || actual.y + actual.height > actual.viewportHeight + 0.01) {
    throw new Error(`BG3D capture requires a fully visible, nonempty 1x surface: ${JSON.stringify(actual)}`);
  }
  if (expected && (Object.keys(expected) as (keyof Bg3dSampleSurface)[])
    .some((key) => Math.abs(actual[key] - expected[key]) > 0.01)) {
    throw new Error(`BG3D capture surface changed: ${JSON.stringify({ expected, actual })}`);
  }
}

/**
 * Sample the same visible Chromium compositor surface without repeating locator.screenshot's
 * scroll/actionability/font/animation-frame preparation for every observation. No renderer calls,
 * paused animations, synthetic frames, viewport changes or image edits are performed here.
 * The runtime separately cross-checks a settled sample with the original locator screenshot.
 */
export async function createBg3dCompositorSampler(page: Page, selector: string) {
  const read = () => page.locator(selector).evaluate((element): Bg3dSampleSurface => {
    const canvas = element as HTMLCanvasElement;
    if (!canvas.isConnected) throw new Error("BG3D canvas detached during capture");
    const rect = canvas.getBoundingClientRect();
    return {
      cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight,
      bufferWidth: canvas.width, bufferHeight: canvas.height,
      x: rect.x + window.scrollX, y: rect.y + window.scrollY,
      width: rect.width, height: rect.height,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
      dpr: window.devicePixelRatio,
    };
  });
  const initial = await read();
  assertBg3dSampleSurface(initial);
  const session = await page.context().newCDPSession(page);
  let disposed = false;
  return {
    async capture() {
      if (disposed) throw new Error("BG3D compositor sampler has been disposed");
      const before = await read();
      assertBg3dSampleSurface(before, initial);
      const started = Date.now();
      const result = await session.send("Page.captureScreenshot", {
        format: "png", fromSurface: true, captureBeyondViewport: false, optimizeForSpeed: true,
        clip: { x: before.x, y: before.y, width: before.width, height: before.height, scale: 1 },
      });
      const captureMs = Date.now() - started;
      const surface = await read();
      assertBg3dSampleSurface(surface, before);
      return { png: Buffer.from(result.data, "base64"), surface, captureMs };
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      await session.detach();
    },
  };
}
