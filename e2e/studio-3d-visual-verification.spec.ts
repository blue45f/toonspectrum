import { expect, test, type Page, type TestInfo } from "@playwright/test";

/**
 * 실 브라우저에서 렌더된 프레임을 근거로 하는 Studio 3D 표면 전수 검증.
 *
 * 기존 3D E2E는 DOM만 확인해서, 뷰포트가 완전히 비어 있어도, 3D 배경이 캔버스에 전혀 붙지
 * 않아도 통과했다. 이 스위트는 대신 실제 합성된 픽셀을 읽는다.
 *
 * WebGL 캔버스는 `preserveDrawingBuffer: false`로 만들어지므로 페이지 안에서 `drawImage`로
 * 되읽으면 항상 비어 있다. 그래서 Playwright가 합성 프레임을 PNG로 찍고, 그 PNG를 다시
 * 페이지에 넣어 브라우저가 디코딩하게 한 뒤 픽셀 통계를 낸다.
 */

const TEST_CREATOR_SESSION = {
  user: {
    id: "11111111-2222-4333-8444-555555555555",
    name: "테스트 크리에이터",
    email: "creator-test@toonspectrum.dev",
    image: null,
    role: "creator",
  },
  expires: new Date(Date.now() + 86_400_000).toISOString(),
};

const BG3D_DIALOG = '[data-testid="studio-bg3d-dialog"]';
const BG3D_VIEWPORT = '[data-testid="studio-bg3d-viewport"]';
const BG3D_RENDER_CANVAS = `${BG3D_VIEWPORT} canvas`;
const STUDIO_DOCUMENT_SCOPE = "[data-studio-post-processing-scope]";
const BG3D_WEBGPU_GIZMO_GATE = process.env.STUDIO_BG3D_WEBGPU_GIZMO === "1";

interface FrameStats {
  readonly width: number;
  readonly height: number;
  /** 5비트로 양자화한 서로 다른 색의 수. 단색 프레임은 1이다. */
  readonly distinctColors: number;
  /** 가장 흔한 색이 차지하는 비율. 빈 뷰포트는 1에 가깝다. */
  readonly dominantShare: number;
  readonly meanLuma: number;
  /**
   * 16×12 칸의 평균 휘도. 프레임 비교의 근거는 이쪽이다 — 화면 한쪽에만 생긴 변화(작은
   * 오브젝트 하나)는 전체 평균을 거의 움직이지 않지만 해당 칸은 크게 움직인다.
   */
  readonly tiles: readonly number[];
  /** 16×12 칸의 R/G/B 평균을 차례로 편 배열. 같은 밝기의 색 변화도 검출한다. */
  readonly colorTiles: readonly number[];
}

interface Bg3dRenderSurface {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly bufferWidth: number;
  readonly bufferHeight: number;
}

interface StableFrameCapture {
  readonly frame: FrameStats;
  readonly settleMs: number;
  readonly samples: number;
  readonly finalInternalPeakTileDelta: number;
  readonly firstToFinalPeakTileDelta: number;
  readonly firstSurface: Bg3dRenderSurface;
  readonly finalSurface: Bg3dRenderSurface;
}

async function decodeFrameStats(page: Page, base64: string): Promise<FrameStats> {
  return page.evaluate(async (encodedPng) => {
    const response = await fetch(`data:image/png;base64,${encodedPng}`);
    const bitmap = await createImageBitmap(await response.blob());
    // 통계는 축소본으로 충분하고, 큰 뷰포트에서 훨씬 싸다.
    const width = Math.min(bitmap.width, 320);
    const height = Math.min(bitmap.height, 240);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D 컨텍스트를 만들지 못했습니다.");
    context.drawImage(bitmap, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);
    const histogram = new Map<string, number>();
    let lumaSum = 0;
    for (let i = 0; i < data.length; i += 4) {
      histogram.set(
        `${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`,
        (histogram.get(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`) ?? 0) + 1,
      );
      lumaSum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    const total = width * height;
    const dominant = Math.max(...histogram.values());
    const tileCols = 16;
    const tileRows = 12;
    const tileSums = new Float64Array(tileCols * tileRows);
    const colorTileSums = new Float64Array(tileCols * tileRows * 3);
    const tileCounts = new Float64Array(tileCols * tileRows);
    for (let y = 0; y < height; y += 1) {
      const row = Math.min(tileRows - 1, Math.floor((y / height) * tileRows));
      for (let x = 0; x < width; x += 1) {
        const column = Math.min(tileCols - 1, Math.floor((x / width) * tileCols));
        const offset = (y * width + x) * 4;
        const tile = row * tileCols + column;
        tileSums[tile] += (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
        colorTileSums[tile * 3] += data[offset];
        colorTileSums[tile * 3 + 1] += data[offset + 1];
        colorTileSums[tile * 3 + 2] += data[offset + 2];
        tileCounts[tile] += 1;
      }
    }
    return {
      width: bitmap.width,
      height: bitmap.height,
      distinctColors: histogram.size,
      dominantShare: dominant / total,
      meanLuma: lumaSum / total,
      tiles: Array.from(tileSums, (sum, index) => sum / Math.max(1, tileCounts[index])),
      colorTiles: Array.from(
        colorTileSums,
        (sum, index) => sum / Math.max(1, tileCounts[Math.floor(index / 3)]),
      ),
    };
  }, base64);
}

/** 렌더된 프레임의 픽셀 통계. 디코딩은 브라우저가 한다(Node 측 이미지 의존성 없음). */
async function frameStats(page: Page, selector: string): Promise<FrameStats> {
  const shot = await page.locator(selector).first().screenshot();
  return decodeFrameStats(page, shot.toString("base64"));
}

/** 두 프레임이 가장 크게 달라진 칸의 휘도 차. 안티에일리어싱 잡음은 한 자리를 넘지 않는다. */
function peakTileDelta(a: FrameStats, b: FrameStats): number {
  let peak = 0;
  for (let index = 0; index < a.tiles.length; index += 1) {
    peak = Math.max(peak, Math.abs(a.tiles[index] - (b.tiles[index] ?? 0)));
  }
  return peak;
}

/** 밝기가 같은 재질/색 변화도 놓치지 않는 타일별 최대 RGB 채널 차. */
function peakColorTileDelta(a: FrameStats, b: FrameStats): number {
  let peak = 0;
  for (let index = 0; index < a.colorTiles.length; index += 1) {
    peak = Math.max(peak, Math.abs(a.colorTiles[index] - (b.colorTiles[index] ?? 0)));
  }
  return peak;
}

async function readBg3dRenderSurface(page: Page): Promise<Bg3dRenderSurface> {
  return page.locator(BG3D_RENDER_CANVAS).first().evaluate((canvas) => ({
    cssWidth: canvas.clientWidth,
    cssHeight: canvas.clientHeight,
    bufferWidth: canvas.width,
    bufferHeight: canvas.height,
  }));
}

/**
 * 마지막 pointer move 뒤 WebGPU queue와 browser compositor가 같은 자세를 present할 때까지
 * 기다린다. 실제 ghost는 안정된 continuous/direct 프레임 사이에도 남으므로 바깥의 <8 판정은
 * 그대로 유지한다. 여기서는 동일 경로 내부의 캡처 타이밍만 제거한다.
 */
async function waitForStableBg3dFrame(
  page: Page,
  testInfo: TestInfo,
  label: string,
  timeoutMs = 15_000,
): Promise<StableFrameCapture> {
  // DOM 상태 overlay와 toolbar의 글자 anti-aliasing은 framebuffer 잔상과 무관하므로 실제
  // R3F render canvas만 캡처한다.
  const viewport = page.locator(BG3D_RENDER_CANVAS).first();
  const startedAt = Date.now();
  const firstPng = await viewport.screenshot();
  const firstFrame = await decodeFrameStats(page, firstPng.toString("base64"));
  const firstSurface = await readBg3dRenderSurface(page);
  let previousFrame = firstFrame;
  let previousSurface = firstSurface;
  let finalPng = firstPng;
  let finalFrame = firstFrame;
  let finalSurface = firstSurface;
  let finalInternalPeakTileDelta = Number.POSITIVE_INFINITY;
  let stableIntervals = 0;
  let samples = 1;

  while (Date.now() - startedAt < timeoutMs) {
    await page.waitForTimeout(100);
    finalPng = await viewport.screenshot();
    finalFrame = await decodeFrameStats(page, finalPng.toString("base64"));
    finalSurface = await readBg3dRenderSurface(page);
    samples += 1;
    finalInternalPeakTileDelta = peakTileDelta(previousFrame, finalFrame);
    const sameSurface = finalFrame.width === previousFrame.width
      && finalFrame.height === previousFrame.height
      && finalSurface.bufferWidth === previousSurface.bufferWidth
      && finalSurface.bufferHeight === previousSurface.bufferHeight;
    stableIntervals = sameSurface && finalInternalPeakTileDelta < 2
      ? stableIntervals + 1
      : 0;
    if (stableIntervals >= 2) break;
    previousFrame = finalFrame;
    previousSurface = finalSurface;
  }

  const settleMs = Date.now() - startedAt;
  const metrics = {
    timeoutMs,
    settleMs,
    samples,
    timedOut: stableIntervals < 2,
    finalInternalPeakTileDelta,
    firstToFinalPeakTileDelta: peakTileDelta(firstFrame, finalFrame),
    firstSurface,
    finalSurface,
  };
  await testInfo.attach(`${label}-first.png`, { body: firstPng, contentType: "image/png" });
  await testInfo.attach(`${label}-stable.png`, { body: finalPng, contentType: "image/png" });
  await testInfo.attach(`${label}-settle.json`, {
    body: Buffer.from(JSON.stringify(metrics, null, 2)),
    contentType: "application/json",
  });
  if (metrics.timedOut) {
    // Stability needs a matching surface AND a small delta. A near-zero delta with a timeout
    // therefore means the frames agreed while the surface kept changing, so the dimensions are
    // the only thing that explains the stall — and the run log is all this job keeps.
    throw new Error(
      `${label}: 같은 자세의 WebGPU 프레임이 ${timeoutMs}ms 안에 안정되지 않았습니다 `
      + `(최종 내부 칸 최대 휘도차 ${finalInternalPeakTileDelta.toFixed(2)}, `
      + `버퍼 ${firstSurface.bufferWidth}×${firstSurface.bufferHeight}`
      + ` → ${finalSurface.bufferWidth}×${finalSurface.bufferHeight}, `
      + `프레임 ${firstFrame.width}×${firstFrame.height}`
      + ` → ${finalFrame.width}×${finalFrame.height}, 샘플 ${samples}).`,
    );
  }
  return { frame: finalFrame, ...metrics };
}

/** 두 PNG를 흰 배경에 같은 크기로 합성해 실제 보이는 RGB 차이를 잰다. */
async function visiblePngDelta(page: Page, left: string, right: string): Promise<{
  readonly changedPixels: number;
  readonly peakChannelDelta: number;
}> {
  return page.evaluate(async ([leftUrl, rightUrl]) => {
    const decode = async (url: string) => {
      const response = await fetch(url);
      return createImageBitmap(await response.blob());
    };
    const [leftBitmap, rightBitmap] = await Promise.all([decode(leftUrl), decode(rightUrl)]);
    const width = 320;
    const height = 240;
    const pixels = (bitmap: ImageBitmap) => {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("2D 컨텍스트를 만들지 못했습니다.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      return context.getImageData(0, 0, width, height).data;
    };
    const leftPixels = pixels(leftBitmap);
    const rightPixels = pixels(rightBitmap);
    let changedPixels = 0;
    let peakChannelDelta = 0;
    for (let offset = 0; offset < leftPixels.length; offset += 4) {
      let changed = false;
      for (let channel = 0; channel < 3; channel += 1) {
        const delta = Math.abs(leftPixels[offset + channel] - rightPixels[offset + channel]);
        peakChannelDelta = Math.max(peakChannelDelta, delta);
        if (delta > 3) changed = true;
      }
      if (changed) changedPixels += 1;
    }
    return { changedPixels, peakChannelDelta };
  }, [left, right] as const);
}

/** 전용 headed browser lane에서 실제 native/SwiftShader WebGPU renderer를 고정한다. */
async function forceBg3dWebGpu(page: Page): Promise<void> {
  const backend = page.locator('[data-testid="studio-bg3d-engine-active-backend"]').first();
  await page.getByRole("tab", { name: "보기", exact: true }).click();
  const webgpuPreference = page
    .locator('[data-testid="studio-bg3d-engine-preference-webgpu"]')
    .first();
  await expect(webgpuPreference).toBeVisible();
  // The dedicated CI lane can launch directly in WebGPU. The selected engine button is disabled
  // by design, so clicking it would wait for five minutes before the actual rotation assertion.
  if (await webgpuPreference.getAttribute("aria-pressed") !== "true") {
    await expect(webgpuPreference).toBeEnabled();
    await webgpuPreference.click();
  }
  await expect(webgpuPreference).toHaveAttribute("aria-pressed", "true");
  await expect(backend).toContainText("WebGPU", { timeout: 120_000 });
  await page.getByRole("tab", { name: "도형", exact: true }).click();
  await page.waitForTimeout(1_000);
}

/**
 * ADR-0018 §6: BG3D never mounts WebGL2 on its own. The software-GPU lane (ANGLE over
 * SwiftShader, no WebGPU adapter) therefore sits behind the "WebGPU 사용 불가" gate with no
 * canvas until the artist selects WebGL2 in the 보기 tab — exactly what a browser without WebGPU
 * shows. Selecting it here is the explicit choice the policy requires, not a fallback. Asserting
 * the active-backend badge and the absence of the gate keeps every frame assertion that follows
 * from passing vacuously against the alert chrome of an unmounted viewport.
 */
async function ensureBg3dWebGl2(page: Page): Promise<void> {
  const backend = page.locator('[data-testid="studio-bg3d-engine-active-backend"]').first();
  await page.getByRole("tab", { name: "보기", exact: true }).click();
  const webgl2Preference = page
    .locator('[data-testid="studio-bg3d-engine-preference-webgl2"]')
    .first();
  await expect(webgl2Preference).toBeVisible();
  // The preference persists per profile, so a reopened editor may already be on WebGL2.
  if (await webgl2Preference.getAttribute("aria-pressed") !== "true") {
    await expect(webgl2Preference).toBeEnabled({ timeout: 120_000 });
    await webgl2Preference.click();
  }
  await expect(webgl2Preference).toHaveAttribute("aria-pressed", "true");
  await expect(backend).toHaveText(/WebGL2 사용 중/, { timeout: 120_000 });
  await expect(page.locator('[data-testid="studio-bg3d-engine-unavailable"]')).toHaveCount(0);
  await page.getByRole("tab", { name: "도형", exact: true }).click();
  await page.waitForTimeout(1_000);
}

/**
 * 같은 시작/끝과 같은 총 시간을 쓰되, 하나는 24개 중간 자세를 실제로 그리고 다른 하나는
 * 최종 자세만 그린다. mouse-up 뒤 WebGPU compositor가 버퍼를 정리하므로 반드시 누른 채 캡처한다.
 */
async function dragBg3dRotationRing(
  page: Page,
  testInfo: TestInfo,
  label: "continuous" | "direct",
  steps: 1 | 24,
): Promise<{ capture: StableFrameCapture; values: readonly string[] }> {
  const box = await page.locator(BG3D_VIEWPORT).boundingBox();
  if (!box) throw new Error("BG3D viewport 좌표를 읽지 못했습니다.");
  const point = ([x, y]: readonly [number, number]) => ({
    x: box.x + box.width * x,
    y: box.y + box.height * y,
  });
  const start = point([0.618, 0.507]);
  const end = point([0.499, 0.555]);
  const readRotationValues = () => Promise.all(
    ["X", "Y", "Z"].map((axis) =>
      page.getByRole("spinbutton", { name: `회전 ${axis}` }).first().inputValue()
    ),
  );
  const initialValues = await readRotationValues();
  let lastValues = initialValues;

  // WebGPU canvas가 다시 mount된 직후에는 DOM 상의 선택/회전 상태가 먼저 보이고
  // TransformControls의 픽 장면이 한 두 프레임 뒤에 준비될 수 있다. 고정 좌표 pointer-down이 그
  // 틈에 링을 놓치면 직접 경로만 0°에 머물러 ghost 판정 자체가 무효해진다. 값이
  // 변한 실제 hit만 캡처에 사용하고, miss는 같은 좌표·시간 경로로 유한하게 재시도한다.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.mouse.move(start.x, start.y);
    await page.waitForTimeout(300);
    await page.mouse.down();
    try {
      // 직접 경로도 마지막 move 전까지 같은 pointer-down 시간을 보내게 해, 두 경로 모두 마지막
      // 자세를 present할 시간은 정확히 80ms로 맞춘다. 기존에는 연속 80ms, 직접 1,920ms였다.
      if (steps === 1) await page.waitForTimeout(80 * 23);
      for (let step = 1; step <= steps; step += 1) {
        const progress = step / steps;
        await page.mouse.move(
          start.x + (end.x - start.x) * progress,
          start.y + (end.y - start.y) * progress,
        );
        await page.waitForTimeout(80);
      }
      lastValues = await readRotationValues();
      const hitRotationRing = lastValues.some((value, index) => value !== initialValues[index]);
      if (!hitRotationRing) continue;

      const capture = await waitForStableBg3dFrame(page, testInfo, label);
      return { capture, values: lastValues };
    } finally {
      await page.mouse.up();
    }
  }

  throw new Error(
    `${label}: 회전 링이 3회 연속 pointer hit를 받지 못했습니다 `
      + `(${initialValues.join(",")} → ${lastValues.join(",")}).`,
  );
}

/**
 * 프레임이 실제로 달라질 때까지 폴링한다.
 *
 * 두 가지를 함께 고친다. 고정 대기 뒤에 한 번 재는 방식은 이 스위트가 판정하려는 것("장면을
 * 바꾸면 그림이 바뀐다")을 러너 속도에 걸어 버린다 — GitHub 러너의 소프트웨어 래스터라이저는
 * 로컬보다 2~3배 느리다. 그리고 판정 자체를 전체 평균 휘도로 하면 안 된다: 이미 상자가 있는
 * 장면에 원기둥을 더해도 평균은 200.5 → 199.9로 거의 그대로다. 실제로 바뀐 것은 그 오브젝트가
 * 덮은 칸이므로, 가장 크게 움직인 칸을 본다.
 */
async function waitForFrameChange(
  page: Page,
  selector: string,
  baseline: FrameStats,
  label: string,
  timeoutMs = 90_000,
  metric: "luma" | "color" = "luma",
): Promise<FrameStats> {
  const deadline = Date.now() + timeoutMs;
  let latest = baseline;
  let peak = 0;
  while (Date.now() < deadline) {
    latest = await frameStats(page, selector);
    peak = metric === "color"
      ? peakColorTileDelta(latest, baseline)
      : peakTileDelta(latest, baseline);
    if (peak > 3) return latest;
    await page.waitForTimeout(2_000);
  }
  throw new Error(
    `${label}: 프레임이 바뀌지 않았습니다 `
    + `(칸 최대 ${metric === "color" ? "RGB 채널차" : "휘도차"} ${peak.toFixed(1)}, `
    + `색 ${baseline.distinctColors} → ${latest.distinctColors}).`,
  );
}

/**
 * 상태 레일의 알림을 닫아 문서 캡처의 레이아웃을 고정한다.
 *
 * 실시간 룸의 병합 알림은 `[data-studio-global-status-rail]`(문서 흐름, `empty:hidden`)에 뜨므로
 * 알림이 있고 없음에 따라 작업 영역 높이가 달라지고, 문서 스코프 스크린샷의 크기와 칸 배치가
 * 함께 움직인다. 알림의 존재 자체는 호출 전에 단언하고, 캡처 전에는 항상 같은 레이아웃으로 되돌린다.
 * 오류 배너는 닫지 않는다 — 그것은 실패 증거다.
 */
async function dismissStudioStatusNotices(page: Page): Promise<void> {
  const dismiss = page.locator("[data-studio-status-notice-dismiss]");
  for (let attempt = 0; attempt < 5 && (await dismiss.count()) > 0; attempt += 1) {
    await dismiss.first().click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(300);
}

/**
 * 문서 스코프 프레임이 안정될 때까지 폴링한 뒤 그 프레임을 돌려준다.
 *
 * `waitForFrameChange`는 기준과 달라진 첫 프레임을 돌려주므로, 러너가 느리면 Transformer 제거와
 * raster 교체 사이의 과도기 프레임이 잡힌다. 그 프레임을 뒤의 "유지되어야 한다" 비교의 기준으로
 * 쓰면 실제 회귀가 없어도 한 자리 칸 차이가 난다. 연속 두 구간이 같은 크기·1 미만 채널차이면 정착이다.
 */
async function waitForStableDocumentFrame(
  page: Page,
  label: string,
  timeoutMs = 20_000,
): Promise<FrameStats> {
  const startedAt = Date.now();
  let previous = await frameStats(page, STUDIO_DOCUMENT_SCOPE);
  let latest = previous;
  let stableIntervals = 0;
  let delta = Number.POSITIVE_INFINITY;
  while (Date.now() - startedAt < timeoutMs) {
    await page.waitForTimeout(300);
    latest = await frameStats(page, STUDIO_DOCUMENT_SCOPE);
    delta = peakColorTileDelta(latest, previous);
    const sameSurface = latest.width === previous.width && latest.height === previous.height;
    stableIntervals = sameSurface && delta < 1 ? stableIntervals + 1 : 0;
    if (stableIntervals >= 2) return latest;
    previous = latest;
  }
  throw new Error(
    `${label}: 문서 프레임이 ${timeoutMs}ms 안에 안정되지 않았습니다 `
    + `(마지막 칸 최대 RGB 채널차 ${delta.toFixed(2)}, `
    + `프레임 ${previous.width}×${previous.height} → ${latest.width}×${latest.height}).`,
  );
}

/** 3D 표면은 치명적 런타임 오류 없이 렌더되어야 한다. */
function collectFatalErrors(page: Page): string[] {
  const fatal: string[] = [];
  page.on("pageerror", (error) => fatal.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // 이 하네스에는 Studio API 서버가 없다. 그 fetch 실패는 3D 렌더링에 대한 판정이 아니다.
    if (text.includes("Failed to load resource")) return;
    if (text.includes("/api/")) return;
    fatal.push(`console: ${text.slice(0, 300)}`);
  });
  return fatal;
}

async function openStudio(page: Page): Promise<void> {
  await page.goto("/studio", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("button").length > 20, null, {
    timeout: 180_000,
  });
  await page.waitForTimeout(2_500);
}

async function openBg3d(page: Page): Promise<void> {
  await page.locator('[data-studio-rail-tool-id="bg3d"]').first().click();
  await expect(page.locator(BG3D_DIALOG)).toBeVisible({ timeout: 120_000 });
  await expect(page.locator(BG3D_VIEWPORT)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(6_000);
}

test.describe("Studio 3D 표면 실 브라우저 시각 검증", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((session) => {
      localStorage.setItem("toonspectrum-auth-session-v1", JSON.stringify(session));
      window.__studioRasterImagePresentationProbe = {
        version: 1,
        expectationEpoch: 0,
        expected: null,
        receiptEpoch: 0,
        receipt: null,
      };
    }, TEST_CREATOR_SESSION);
  });

  test("3D 배경 편집기가 실제 3D 프레임을 그린다", async ({ page }) => {
    test.setTimeout(300_000);
    const fatal = collectFatalErrors(page);
    await openStudio(page);
    await openBg3d(page);

    // 엔진은 직접 선택한 백엔드로 정착해야 한다. WebGPU가 없어도 WebGL2로 내려가지 않으므로
    // (ADR-0018) 이 레인은 WebGL2를 명시적으로 고른다. 능력 probe가 끝나기 전 배지는 "확인 중"
    // 이므로 정착할 때까지 폴링한다 — 영원히 "확인 중"에 머무는 것 자체가 잡아야 할 회귀다.
    await ensureBg3dWebGl2(page);

    // 빈 장면에도 접지 그리드가 있어 완전한 단색이 아니다 — 즉 렌더 루프가 살아 있다.
    const empty = await frameStats(page, BG3D_VIEWPORT);
    expect(empty.width).toBeGreaterThan(200);
    expect(empty.distinctColors).toBeGreaterThan(1);

    // 도형을 넣으면 프레임이 실제로 달라져야 한다. 여기가 "3D 배경이 깨진다"를 잡는 지점이다.
    await page.locator('[aria-label="상자 추가"]').first().click();
    const withBox = await waitForFrameChange(page, BG3D_VIEWPORT, empty, "상자 추가");
    expect(withBox.distinctColors).toBeGreaterThan(1);

    await page.locator('[aria-label="원기둥 추가"]').first().click();
    const withCylinder = await waitForFrameChange(page, BG3D_VIEWPORT, withBox, "원기둥 추가");
    expect(withCylinder.distinctColors).toBeGreaterThan(1);
    // 셰이딩된 솔리드는 뷰포트를 한 색으로 덮지 않는다.
    expect(withCylinder.dominantShare).toBeLessThan(0.95);

    expect(fatal).toEqual([]);
  });

  test("WebGPU 기즈모 연속 회전은 이전 실루엣을 누적하지 않는다", async ({ page }, testInfo) => {
    test.skip(
      !BG3D_WEBGPU_GIZMO_GATE,
      "headed native/SwiftShader WebGPU 전용 회귀는 별도 package gate에서 실행합니다.",
    );
    test.setTimeout(300_000);
    const fatal = collectFatalErrors(page);
    await page.setViewportSize({ width: 1_440, height: 1_000 });
    await openStudio(page);
    await openBg3d(page);
    await forceBg3dWebGpu(page);

    await page.locator('[aria-label="상자 추가"]').first().click();
    await page.getByRole("button", { name: "회전", exact: true }).first().click();
    const continuous = await dragBg3dRotationRing(page, testInfo, "continuous", 24);

    await page.getByRole("button", { name: "3D 배경 편집기 닫기" }).click();
    await expect(page.locator(BG3D_DIALOG)).toHaveCount(0);
    await openBg3d(page);
    await forceBg3dWebGpu(page);
    await page.locator('[aria-label="상자 추가"]').first().click();
    await page.getByRole("button", { name: "회전", exact: true }).first().click();
    const direct = await dragBg3dRotationRing(page, testInfo, "direct", 1);

    // 두 입력은 같은 최종 자세와 같은 pointer-down 시간을 갖는다. 수정 전 WebGPU에서는 24개
    // 중간 실루엣이 남아 peak가 37.68이었고, 매 frame clear 뒤에는 2.93으로 내려왔다.
    const finalPeakTileDelta = peakTileDelta(continuous.capture.frame, direct.capture.frame);
    const metrics = {
      threshold: 8,
      finalPeakTileDelta,
      continuous: continuous.capture,
      direct: direct.capture,
    };
    await testInfo.attach("bg3d-webgpu-rotation-metrics.json", {
      body: Buffer.from(JSON.stringify(metrics, null, 2)),
      contentType: "application/json",
    });
    console.info(`[bg3d-webgpu-rotation] ${JSON.stringify({
      finalPeakTileDelta,
      continuous: {
        settleMs: continuous.capture.settleMs,
        samples: continuous.capture.samples,
        internalDelta: continuous.capture.finalInternalPeakTileDelta,
        firstToFinalDelta: continuous.capture.firstToFinalPeakTileDelta,
        firstSurface: continuous.capture.firstSurface,
        surface: continuous.capture.finalSurface,
      },
      direct: {
        settleMs: direct.capture.settleMs,
        samples: direct.capture.samples,
        internalDelta: direct.capture.finalInternalPeakTileDelta,
        firstToFinalDelta: direct.capture.firstToFinalPeakTileDelta,
        firstSurface: direct.capture.firstSurface,
        surface: direct.capture.finalSurface,
      },
    })}`);
    expect(continuous.values).toEqual(direct.values);
    expect(Math.abs(Number(continuous.values[1]))).toBeGreaterThan(10);
    expect(finalPeakTileDelta).toBeLessThan(8);
    expect(fatal).toEqual([]);
  });

  test("절차형 에셋과 선화 미리보기가 프레임을 바꾼다", async ({ page }) => {
    test.setTimeout(300_000);
    const fatal = collectFatalErrors(page);
    await openStudio(page);
    await openBg3d(page);
    await ensureBg3dWebGl2(page);

    const roomShell = page.locator(`${BG3D_DIALOG} [aria-label="오픈 룸 셸 장면에 추가"]`).first();
    await roomShell.scrollIntoViewIfNeeded();
    const beforeAsset = await frameStats(page, BG3D_VIEWPORT);
    await roomShell.click();
    const withRoom = await waitForFrameChange(page, BG3D_VIEWPORT, beforeAsset, "오픈 룸 셸 추가");

    // 선화(LT) 미리보기는 웹툰 산출물의 절반이다. 켜면 같은 장면이 다르게 래스터화된다.
    const linePreview = page.locator('[aria-label*="선화 미리보기"]').first();
    await linePreview.click();
    const lineArt = await waitForFrameChange(page, BG3D_VIEWPORT, withRoom, "선화 미리보기");
    expect(lineArt.distinctColors).toBeGreaterThan(1);

    expect(fatal).toEqual([]);
  });

  /**
   * 이 회귀가 이 스위트를 만든 이유다. `/studio`는 저장된 작품 id가 없는 모든 세션에
   * `?room=work-instant-…` 잼을 발행하므로 `isRealtimeTeamSession`이 참이고, 그 분기가 실패로
   * 닫혀 있는 동안에는 3D 배경을 캔버스에 붙이는 경로가 어디에도 없었다.
   */
  test("3D 배경이 기본 진입 경로에서 캔버스에 실제로 붙는다", async ({ page }) => {
    // This case walks the whole round trip — insert, update, reopen, update again — while every
    // frame is rendered by SwiftShader. On the CI runner the other 3D cases in this file each
    // take 1.5–2.5 minutes, and this one does several times their work, so the 300s it inherited
    // from the far smaller original expired mid-flight at whatever step the clock reached first.
    test.setTimeout(600_000);
    const fatal = collectFatalErrors(page);
    // Konva Stage는 브라우저 viewport에 보이는 문서 구간만 backing canvas로 만든다. 기본
    // 1280×720에서는 삽입된 3D 배경의 하단 변화가 clip 아래에 있어, 실제 PNG와 presentation
    // receipt가 갱신돼도 문서 screenshot 비교가 그 픽셀을 관찰하지 못한다.
    await page.setViewportSize({ width: 1_440, height: 1_000 });
    await openStudio(page);
    const emptyCanvas = await frameStats(page, STUDIO_DOCUMENT_SCOPE);
    await openBg3d(page);
    // 진입 경로 자체는 엔진과 무관하다. 다만 렌더된 프레임이 없으면 "컬러 배경 추가"가
    // "캡처할 3D 장면이 아직 준비되지 않았습니다"로 닫히지 않고 남으므로 먼저 엔진을 고른다.
    await ensureBg3dWebGl2(page);

    const emptyScene = await frameStats(page, BG3D_VIEWPORT);
    await page.locator('[aria-label="상자 추가"]').first().click();
    // 빈 장면을 캡처해 놓고 삽입하면 이 테스트가 무엇도 증명하지 못한다.
    await waitForFrameChange(page, BG3D_VIEWPORT, emptyScene, "상자 추가");
    await page.getByRole("button", { name: /컬러 배경 추가/ }).first().click();

    // 삽입이 성공하면 편집기가 닫힌다. 실패로 닫히는 분기에서는 열린 채 오류만 남았다.
    await expect(page.locator(BG3D_DIALOG)).toHaveCount(0, { timeout: 120_000 });
    await page.waitForFunction(() => {
      const probe = window.__studioRasterImagePresentationProbe;
      return probe?.expected !== null
        && probe?.receipt?.expectationEpoch === probe.expected.epoch
        && probe.receipt.src === probe.expected.src;
    }, null, { timeout: 30_000 });
    const initialCompositeSrc = await page.evaluate(() => (
      window.__studioRasterImagePresentationProbe?.expected?.src ?? ""
    ));
    expect(initialCompositeSrc).toMatch(/^data:image\/png;base64,/);
    await page.waitForTimeout(4_000);

    // 캔버스에 3D 배경 레이어가 선택된 채로 존재해야 한다.
    await expect(page.getByText("3D LT 배경", { exact: false }).first()).toBeVisible({
      timeout: 30_000,
    });
    // 실시간 룸에서는 병합 합성이 들어간다는 사실을 중립 알림으로 알려야 한다 — 오류가 아니다.
    const notice = page.locator("[data-studio-status-notice-dismiss]").first();
    if (await notice.count()) {
      await expect(notice.locator("xpath=..")).toHaveAttribute("role", "status");
    }
    // 성공한 삽입이 빨간 오류 배너를 남겨서는 안 된다.
    await expect(page.locator("[data-studio-status-error-dismiss]")).toHaveCount(0);
    // 알림은 상태 레일 높이를 바꾸므로, 빈 캔버스 기준과 같은 레이아웃으로 되돌린 뒤 캡처한다.
    await dismissStudioStatusNotices(page);

    // 삽입 직후 자동 선택된 Transformer/핸들을 제거하고 실제 문서 raster만 비교한다. 전체
    // scroll viewport나 선택 테두리 변화는 빈/깨진 PNG도 성공으로 오판할 수 있다.
    await page.getByRole("button", { name: "해제", exact: true }).click();
    await waitForFrameChange(
      page,
      STUDIO_DOCUMENT_SCOPE,
      emptyCanvas,
      "3D 배경 캔버스 합성",
      30_000,
    );
    const insertedCanvas = await waitForStableDocumentFrame(page, "3D 배경 캔버스 합성 정착");
    expect(insertedCanvas.distinctColors).toBeGreaterThan(1);

    // 레이어 트리에서 방금 삽입한 원본을 다시 선택하고 ID를 기록한다. 업데이트가 delete +
    // reinsert로 바뀌어도 단순 count=1은 통과하므로 동일 identity를 직접 고정한다.
    await page.getByRole("tab", { name: "레이어 1" }).click();
    // The complete LT metadata path creates a dedicated "3D LT 배경" group. Match the child
    // raster row explicitly so the group treeitem cannot be mistaken for the persisted element.
    const layerTree = page.getByRole("tree", { name: "레이어 트리" });
    const insertedLayer = layerTree.locator(
      '[data-studio-layer-row="true"][aria-label^="3D LT 배경 · 병합,"]',
    );
    await expect(insertedLayer).toHaveCount(1);
    const insertedLayerId = await insertedLayer.getAttribute("id");
    expect(insertedLayerId).toMatch(/^studio-layer-.+/);
    // The navigator paints rows with `content-visibility:auto`. A row outside the panel's
    // rendered window keeps its accessible name — so the role query and the id read above still
    // resolve — but its label gets no layout box, and a click on that label can never settle.
    // The row itself always has a box (`contain-intrinsic-size:44px`) and owns the selection
    // handler, so select through the row and land the click on the aria-hidden marker at its
    // left edge, clear of the row's own controls.
    await insertedLayer.scrollIntoViewIfNeeded();
    await insertedLayer.click({ position: { x: 12, y: 18 } });
    await expect(insertedLayer).toHaveAttribute("aria-selected", "true");

    // 선택된 병합 레이어의 canonical bg3dScene을 메인 레일에서도 다시 열 수 있어야 한다.
    // 원본 전달이 빠지면 빈 insert 장면과 "컬러 배경 추가" footer가 나타난다.
    await page.locator('[data-studio-rail-tool-id="bg3d"]').first().click();
    await expect(page.locator(BG3D_DIALOG)).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole("button", { name: "3D 배경 업데이트" })).toBeVisible();
    // 선택은 프로필에 저장되므로 보통 이미 WebGL2다; 아니면 여기서 다시 고른다.
    await ensureBg3dWebGl2(page);
    await page.getByRole("tab", { name: "레이어" }).click();
    await expect(page.getByRole("button", { name: "상자 1", exact: true })).toBeVisible();
    const restoredViewport = await frameStats(page, BG3D_VIEWPORT);

    // 실제 장면 변경도 update source에 반영되는지 확인한다. 기존 장면을 그대로 다시 저장하면
    // no-op update나 stale source도 ID/count assertion만으로는 통과할 수 있다.
    await page.getByRole("tab", { name: "도형", exact: true }).click();
    await page.locator('[aria-label="구 추가"]').first().click();
    const overlappedSphereViewport = await waitForFrameChange(
      page,
      BG3D_VIEWPORT,
      restoredViewport,
      "재편집 장면의 구 렌더",
      30_000,
    );
    // 두 번째 도형은 기존 상자 가까이에 생긴다. 상자에 가려진 구는 편집 뷰포트의 선택 기즈모만
    // 바꾸고 최종 LT PNG의 가시 픽셀은 충분히 바꾸지 않을 수 있다. 구를 옆으로 옮겨 실제 문서
    // raster가 달라져야 하는 장면을 만든 뒤 업데이트한다.
    const spherePositionX = page.getByRole("spinbutton", { name: "위치 X" }).first();
    await spherePositionX.fill("2.5");
    await expect(spherePositionX).toHaveValue("2.5");
    await waitForFrameChange(
      page,
      BG3D_VIEWPORT,
      overlappedSphereViewport,
      "재편집 장면의 구 위치 이동",
      30_000,
    );
    await page.getByRole("tab", { name: "레이어" }).click();
    await expect(page.getByRole("button", { name: "구 1", exact: true })).toBeVisible();

    // 업데이트는 선택한 레이어를 교체해야 하며 새 레이어를 하나 더 만들면 안 된다.
    await page.getByRole("button", { name: "3D 배경 업데이트" }).click();
    await expect(page.locator(BG3D_DIALOG)).toHaveCount(0, { timeout: 120_000 });
    await page.waitForFunction(() => {
      const probe = window.__studioRasterImagePresentationProbe;
      return probe?.expected !== null
        && probe?.receipt?.expectationEpoch === probe.expected.epoch
        && probe.receipt.elementId === probe.expected.elementId
        && probe.receipt.src === probe.expected.src;
    }, null, { timeout: 30_000 });
    const updatedCompositeSrc = await page.evaluate(() => (
      window.__studioRasterImagePresentationProbe?.expected?.src ?? ""
    ));
    const compositeDelta = await visiblePngDelta(
      page,
      initialCompositeSrc,
      updatedCompositeSrc,
    );
    expect(compositeDelta.peakChannelDelta).toBeGreaterThan(3);
    expect(compositeDelta.changedPixels).toBeGreaterThan(100);
    await expect(page.getByRole("tab", { name: "레이어 1" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "레이어 2" })).toHaveCount(0);
    await page.getByRole("tab", { name: "레이어 1" }).click();
    const updatedLayer = layerTree.locator(
      '[data-studio-layer-row="true"][aria-label^="3D LT 배경 · 병합,"]',
    );
    await expect(updatedLayer).toHaveCount(1);
    await expect(updatedLayer).toHaveAttribute("id", insertedLayerId!);
    await expect(updatedLayer).toHaveAttribute("aria-selected", "true");

    // 먼저 재열기와 무관한 update 자체의 가시 결과를 고정한다. 이 지점에서 새 raster가 보이지
    // 않으면 캡처/patch/이미지 디코드 경로 결함이고, 여기서는 보이는데 아래 재열기 뒤 사라지면
    // route/modal 전환이 문서 화면을 되돌린 결함이다.
    // 업데이트가 병합 알림을 다시 띄우므로 삽입 때와 같은 레이아웃으로 되돌린 뒤 캡처한다.
    await dismissStudioStatusNotices(page);
    await page.getByRole("button", { name: "해제", exact: true }).click();
    await waitForFrameChange(
      page,
      STUDIO_DOCUMENT_SCOPE,
      insertedCanvas,
      "3D 배경 업데이트 캔버스 합성",
      30_000,
      "color",
    );
    const updatedCanvas = await waitForStableDocumentFrame(page, "3D 배경 업데이트 캔버스 정착");
    expect(updatedCanvas.distinctColors).toBeGreaterThan(1);
    // Same row, same `content-visibility:auto` caveat as the first selection above.
    await updatedLayer.scrollIntoViewIfNeeded();
    await updatedLayer.click({ position: { x: 12, y: 18 } });
    await expect(updatedLayer).toHaveAttribute("aria-selected", "true");

    // 저장된 canonical scene도 다시 열어 추가한 구가 남아 있는지 먼저 확인한다. 이 검증이
    // 통과하고 아래 raster만 같다면 metadata update와 image capture 사이 결함이다.
    await page.locator('[data-studio-rail-tool-id="bg3d"]').first().click();
    await expect(page.locator(BG3D_DIALOG)).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole("button", { name: "3D 배경 업데이트" })).toBeVisible();
    // 선택은 프로필에 저장되므로 보통 이미 WebGL2다; 아니면 여기서 다시 고른다.
    await ensureBg3dWebGl2(page);
    await page.getByRole("tab", { name: "레이어" }).click();
    await expect(page.getByRole("button", { name: "상자 1", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "구 1", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "구 1", exact: true }).click();
    await page.getByRole("tab", { name: "도형", exact: true }).click();
    await expect(page.getByRole("spinbutton", { name: "위치 X" }).first()).toHaveValue("2.5");
    await page.getByRole("button", { name: "3D 배경 편집기 닫기" }).click();
    await expect(page.locator(BG3D_DIALOG)).toHaveCount(0);

    // 선택 장식을 다시 제거한 뒤에도 재열기 전의 업데이트 raster가 유지되어야 한다. 고정 대기는
    // 러너 속도에 판정을 거는 셈이므로 프레임이 정착할 때까지 폴링한다.
    await dismissStudioStatusNotices(page);
    await page.getByRole("button", { name: "해제", exact: true }).click();
    const reopenedCanvas = await waitForStableDocumentFrame(page, "재열기 뒤 캔버스 정착");
    expect(peakColorTileDelta(reopenedCanvas, insertedCanvas)).toBeGreaterThan(3);
    expect(peakColorTileDelta(reopenedCanvas, updatedCanvas)).toBeLessThan(3);

    expect(fatal).toEqual([]);
  });

  test("3D 캐릭터가 렌더되고 포즈가 캔버스에 붙는다", async ({ page }) => {
    test.setTimeout(600_000);
    const fatal = collectFatalErrors(page);
    await openStudio(page);

    await page.locator('[data-studio-rail-tool-id="vrm3d"]').first().click();
    const insert = page.getByRole("button", { name: /이 포즈로 추가/ }).first();
    await expect(insert).toBeVisible({ timeout: 120_000 });

    // 캐릭터가 실제로 그려졌는지를 뷰포트 프레임으로 판정한다. 다이얼로그 전체를 재면 사이드바
    // 색이 섞여 빈 뷰포트도 통과하므로, 캔버스만 본다. 투명 배경은 체커보드 두 색이고 MToon
    // 캐릭터는 그보다 훨씬 다양하다. 이 대기가 곧 캡처 준비 신호이기도 하다 — 소프트웨어
    // 래스터라이저에서는 VRM 로드와 첫 프레임이 느리고, 그 전에 누른 삽입은 거절된다.
    const poserViewport = '[aria-label="3D 캐릭터 편집 뷰포트"]';
    await expect(page.locator(poserViewport)).toBeVisible({ timeout: 180_000 });
    let rendered: FrameStats | null = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const stats = await frameStats(page, poserViewport);
      if (stats.distinctColors > 24) {
        rendered = stats;
        break;
      }
      await page.waitForTimeout(5_000);
    }
    expect(rendered, "VRM 캐릭터가 뷰포트에 렌더되지 않았습니다.").not.toBeNull();

    await expect(insert).toBeEnabled({ timeout: 120_000 });
    // 삽입은 캡처 파이프라인과 체형·표면 페인트 상태가 모두 정착한 뒤에만 받아들여지고,
    // 거절은 다이얼로그 안 메시지로만 남는다. 그래서 한 번 눌러 보고, 닫히지 않으면 다시
    // 누른다 — 끝내 닫히지 않으면 그때의 다이얼로그 문구를 실패 메시지에 담는다.
    const poserDialog = page.locator('[role="dialog"]');
    let inserted = false;
    for (let attempt = 0; attempt < 3 && !inserted; attempt += 1) {
      await insert.click();
      for (let waited = 0; waited < 12; waited += 1) {
        await page.waitForTimeout(5_000);
        if ((await poserDialog.count()) === 0) {
          inserted = true;
          break;
        }
      }
    }
    if (!inserted) {
      const reason = (await poserDialog.first().innerText().catch(() => "")).replace(/\s+/g, " ");
      expect(inserted, `포즈 삽입이 캔버스에 반영되지 않았습니다: ${reason.slice(0, 400)}`).toBe(true);
    }

    expect(fatal).toEqual([]);
  });

  test("3D 데생 인형이 렌더되고 캔버스로 캡처된다", async ({ page }) => {
    test.setTimeout(420_000);
    const fatal = collectFatalErrors(page);
    await openStudio(page);

    const mannequinDialog = page.locator('[data-studio-mannequin-dialog="true"]');
    await page.locator('[data-studio-rail-tool-id="mannequin3d"]').first().click();
    await expect(mannequinDialog).toBeVisible({ timeout: 120_000 });

    // 인형이 실제로 그려졌는지는 뷰포트 캔버스로만 판정한다 — 다이얼로그 전체를 재면 사이드바
    // 색이 섞여 빈 뷰포트도 통과한다.
    const mannequinViewport = '[aria-label^="3D 데생 인형 뷰포트"]';
    await expect(page.locator(mannequinViewport)).toBeVisible({ timeout: 120_000 });
    let rendered = false;
    for (let attempt = 0; attempt < 30 && !rendered; attempt += 1) {
      const stats = await frameStats(page, mannequinViewport);
      rendered = stats.distinctColors > 16;
      if (!rendered) await page.waitForTimeout(5_000);
    }
    expect(rendered, "데생 인형이 뷰포트에 렌더되지 않았습니다.").toBe(true);

    // 캔버스 삽입은 "카메라·캡처" 섹션이 소유한다.
    await page.getByRole("button", { name: /카메라·캡처/ }).first().click();
    await page.waitForTimeout(4_000);
    const capture = page.getByRole("button", { name: /캔버스로 캡처/ }).first();
    await expect(capture).toBeEnabled({ timeout: 60_000 });
    await capture.click();
    await expect(mannequinDialog).toHaveCount(0, { timeout: 120_000 });

    expect(fatal).toEqual([]);
  });

  /**
   * DCC 라우트는 권한이 확정되기 전에는 열리지 않는다. 그 자체는 계약이지만, 거부 사유가
   * aria-live 안내로만 나가던 동안에는 버튼을 눌러도 화면에 아무 변화가 없어 죽은 버튼처럼
   * 보였다. 열리든 막히든, 반드시 보이는 결과가 있어야 한다.
   */
  test("Hybrid 3D DCC 진입은 언제나 보이는 결과를 남긴다", async ({ page }) => {
    test.setTimeout(300_000);
    const fatal = collectFatalErrors(page);
    await openStudio(page);

    await page.locator('[data-studio-rail-tool-id="hybrid-dcc"]').first().click();
    await page.waitForTimeout(6_000);

    const enteredDccRoute = page.url().includes("/dcc") || page.url().includes("surface=dcc");
    const notice = page.locator("[data-studio-status-notice-dismiss]").first();
    const explained = (await notice.count()) > 0;

    expect(enteredDccRoute || explained).toBe(true);
    if (!enteredDccRoute) {
      await expect(notice.locator("xpath=..")).toContainText(/3D/);
    }

    expect(fatal).toEqual([]);
  });
});
