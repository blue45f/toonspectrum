import { expect, test, type Page, type TestInfo } from "@playwright/test";

/** Strict production counterpart of the general 3D visual suite. No unavailable/timeout skip. */
const DIALOG = '[data-testid="studio-bg3d-dialog"]';
const VIEWPORT = '[data-testid="studio-bg3d-viewport"]';
const CANVAS = `${VIEWPORT} canvas`;
const READINESS_TIMEOUT_MS = 120_000;
const SETTLE_TIMEOUT_MS = 15_000;

interface Frame {
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly number[];
  readonly distinctColors: number;
  readonly dominantShare: number;
}
interface Surface {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly bufferWidth: number;
  readonly bufferHeight: number;
}

async function decodeFrame(page: Page, png: Buffer): Promise<Frame> {
  return page.evaluate(async (base64) => {
    const response = await fetch(`data:image/png;base64,${base64}`);
    const bitmap = await createImageBitmap(await response.blob());
    try {
      const width = Math.min(bitmap.width, 320);
      const height = Math.min(bitmap.height, 240);
      const ctx = new OffscreenCanvas(width, height).getContext("2d");
      if (!ctx) throw new Error("Cannot decode composited WebGPU frame");
      ctx.drawImage(bitmap, 0, 0, width, height);
      const { data } = ctx.getImageData(0, 0, width, height);
      const sums = new Float64Array(16 * 12);
      const counts = new Float64Array(16 * 12);
      const histogram = new Map<string, number>();
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4;
          const tile = Math.min(11, Math.floor(y / height * 12)) * 16
            + Math.min(15, Math.floor(x / width * 16));
          sums[tile] += (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
          counts[tile] += 1;
          const color = `${data[offset] >> 3},${data[offset + 1] >> 3},${data[offset + 2] >> 3}`;
          histogram.set(color, (histogram.get(color) ?? 0) + 1);
        }
      }
      return {
        width: bitmap.width,
        height: bitmap.height,
        tiles: Array.from(sums, (sum, index) => sum / Math.max(1, counts[index])),
        distinctColors: histogram.size,
        dominantShare: Math.max(...histogram.values()) / (width * height),
      };
    } finally {
      bitmap.close();
    }
  }, png.toString("base64"));
}

function peakDelta(left: Frame, right: Frame): number {
  if (left.tiles.length !== right.tiles.length) throw new Error("Different frame tile counts");
  return Math.max(...left.tiles.map((value, index) => Math.abs(value - right.tiles[index])));
}

async function readSurface(page: Page): Promise<Surface> {
  return page.locator(CANVAS).first().evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    return {
      cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight,
      bufferWidth: canvas.width, bufferHeight: canvas.height,
    };
  });
}

async function stableFrame(page: Page, info: TestInfo, label: string) {
  const canvas = page.locator(CANVAS).first();
  const started = Date.now();
  const firstPng = await canvas.screenshot();
  const first = await decodeFrame(page, firstPng);
  const firstSurface = await readSurface(page);
  let previous = first;
  let previousSurface = firstSurface;
  let png = firstPng;
  let frame = first;
  let surface = firstSurface;
  let internalDelta = Number.POSITIVE_INFINITY;
  let stableIntervals = 0;
  let samples = 1;
  while (Date.now() - started < SETTLE_TIMEOUT_MS) {
    await page.waitForTimeout(100);
    png = await canvas.screenshot();
    frame = await decodeFrame(page, png);
    surface = await readSurface(page);
    samples += 1;
    internalDelta = peakDelta(previous, frame);
    const sameSurface = frame.width === previous.width && frame.height === previous.height
      && surface.bufferWidth === previousSurface.bufferWidth
      && surface.bufferHeight === previousSurface.bufferHeight;
    stableIntervals = sameSurface && internalDelta < 2 ? stableIntervals + 1 : 0;
    if (stableIntervals >= 2) break;
    previous = frame;
    previousSurface = surface;
  }
  const metrics = {
    settleMs: Date.now() - started, timeoutMs: SETTLE_TIMEOUT_MS, samples, internalDelta,
    firstToFinalDelta: peakDelta(first, frame), firstSurface, surface,
    timedOut: stableIntervals < 2,
  };
  await info.attach(`${label}-first.png`, { body: firstPng, contentType: "image/png" });
  await info.attach(`${label}-stable.png`, { body: png, contentType: "image/png" });
  await info.attach(`${label}-settle.json`, {
    body: Buffer.from(JSON.stringify(metrics, null, 2)), contentType: "application/json",
  });
  expect(metrics.timedOut, `${label}: ${JSON.stringify(metrics)}`).toBe(false);
  expect(frame.distinctColors, "A blank framebuffer cannot prove rotation fidelity").toBeGreaterThan(4);
  expect(frame.dominantShare).toBeLessThan(0.99);
  return { frame, ...metrics };
}

async function openReadyWebGpu(page: Page, info: TestInfo, label: string): Promise<void> {
  await page.locator('[data-studio-rail-tool-id="bg3d"]').first().click();
  await expect(page.locator(DIALOG)).toBeVisible({ timeout: READINESS_TIMEOUT_MS });
  await expect(page.locator(VIEWPORT)).toBeVisible({ timeout: READINESS_TIMEOUT_MS });
  await page.getByRole("tab", { name: "보기", exact: true }).click();
  const preference = page.getByTestId("studio-bg3d-engine-preference-webgpu").first();
  const backend = page.getByTestId("studio-bg3d-engine-active-backend").first();
  await expect(preference).toBeVisible();
  if (await preference.getAttribute("aria-pressed") !== "true") {
    await expect(preference).toBeEnabled({ timeout: READINESS_TIMEOUT_MS });
    await preference.click();
  }
  await expect(preference).toHaveAttribute("aria-pressed", "true");
  try {
    // A three-second UI response deadline is not proof of missing hardware. The same native
    // request may still complete and update the real capability result. Wait for positive proof,
    // not merely the disappearance of the probing indicator or a transient unavailable alert.
    await expect(backend).toHaveText(/WebGPU 사용 중/u, { timeout: READINESS_TIMEOUT_MS });
    await expect(page.getByTestId("studio-bg3d-engine-unavailable")).toHaveCount(0);
    await expect(page.locator(CANVAS)).toHaveCount(1);
    await expect(page.locator(CANVAS).first()).toBeVisible();
    await expect.poll(async () => {
      const surface = await readSurface(page);
      return surface.bufferWidth > 300 && surface.bufferHeight > 150;
    }, { timeout: READINESS_TIMEOUT_MS, message: "Renderer must own a resized canvas" }).toBe(true);
  } finally {
    await info.attach(`${label}-engine-readiness.json`, {
      body: Buffer.from(JSON.stringify({
        backend: await backend.textContent().catch(() => null),
        unavailable: await page.getByTestId("studio-bg3d-engine-unavailable").allTextContents(),
        canvasCount: await page.locator(CANVAS).count(),
      }, null, 2)),
      contentType: "application/json",
    });
  }
  await page.getByRole("tab", { name: "도형", exact: true }).click();
  await page.locator('[aria-label="상자 추가"]').first().click();
  // A selected object must actually survive restoration before the renderer test can begin.
  await expect(page.getByRole("spinbutton", { name: "회전 Y", exact: true }).first())
    .toBeVisible({ timeout: READINESS_TIMEOUT_MS });
  await page.getByRole("button", { name: "회전", exact: true }).first().click();
  await page.waitForTimeout(1_000);
}

async function dragRing(page: Page, info: TestInfo, label: "continuous" | "direct", steps: 1 | 24) {
  const box = await page.locator(VIEWPORT).boundingBox();
  if (!box) throw new Error("No BG3D viewport bounds");
  const start = { x: box.x + box.width * 0.618, y: box.y + box.height * 0.507 };
  const end = { x: box.x + box.width * 0.499, y: box.y + box.height * 0.555 };
  const readValues = () => Promise.all(["X", "Y", "Z"].map((axis) =>
    page.getByRole("spinbutton", { name: `회전 ${axis}`, exact: true }).first().inputValue()));
  const initial = await readValues();
  let values = initial;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.mouse.move(start.x, start.y);
    await page.waitForTimeout(300);
    await page.mouse.down();
    try {
      if (steps === 1) await page.waitForTimeout(80 * 23);
      for (let step = 1; step <= steps; step += 1) {
        await page.mouse.move(start.x + (end.x - start.x) * step / steps,
          start.y + (end.y - start.y) * step / steps);
        await page.waitForTimeout(80);
      }
      values = await readValues();
      if (values.every((value, index) => value === initial[index])) continue;
      // Capture while still pointer-down, exactly like the original accumulation regression.
      return { values, capture: await stableFrame(page, info, label) };
    } finally {
      await page.mouse.up();
    }
  }
  throw new Error(`${label}: rotation ring missed 3 times (${initial.join()} -> ${values.join()})`);
}

test("WebGPU 기즈모 연속 회전은 이전 실루엣을 누적하지 않는다", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  expect(process.env.STUDIO_BG3D_WEBGPU_GIZMO).toBe("1");
  const fatal: string[] = [];
  page.on("pageerror", (error) => fatal.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    const gpuError = /GPUValidationError|invalid command buffer|different.*GPUDevice|depth stencil attachment/iu.test(text);
    if (gpuError || (message.type() === "error"
      && !text.includes("Failed to load resource") && !text.includes("/api/"))) fatal.push(text);
  });
  await page.addInitScript((session) => {
    localStorage.setItem("toonspectrum-auth-session-v1", JSON.stringify(session));
  }, {
    user: { id: "11111111-2222-4333-8444-555555555555", name: "테스트 크리에이터",
      email: "creator-test@toonspectrum.dev", image: null, role: "creator" },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  });
  await page.setViewportSize({ width: 1_440, height: 1_000 });
  await page.goto("/studio", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-studio-rail-tool-id="bg3d"]').first())
    .toBeVisible({ timeout: READINESS_TIMEOUT_MS });
  try {
    await openReadyWebGpu(page, testInfo, "continuous");
    const continuous = await dragRing(page, testInfo, "continuous", 24);
    await page.getByRole("button", { name: "3D 배경 편집기 닫기" }).click();
    await expect(page.locator(DIALOG)).toHaveCount(0);
    await openReadyWebGpu(page, testInfo, "direct");
    const direct = await dragRing(page, testInfo, "direct", 1);
    const finalPeakTileDelta = peakDelta(continuous.capture.frame, direct.capture.frame);
    const metrics = { threshold: 8, finalPeakTileDelta, continuous, direct };
    await testInfo.attach("bg3d-webgpu-rotation-metrics.json", {
      body: Buffer.from(JSON.stringify(metrics, null, 2)), contentType: "application/json",
    });
    console.info(`[bg3d-webgpu-rotation] ${JSON.stringify(metrics)}`);
    expect(continuous.values).toEqual(direct.values);
    expect(Math.abs(Number(continuous.values[1]))).toBeGreaterThan(10);
    expect(finalPeakTileDelta).toBeLessThan(8);
    expect(fatal).toEqual([]);
  } finally {
    await testInfo.attach("bg3d-browser-errors.json", {
      body: Buffer.from(JSON.stringify(fatal, null, 2)), contentType: "application/json",
    });
  }
});
