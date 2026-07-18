/**
 * scripts/verify-studio-launch.mts
 * Committed, reproducible harness for Verification plan step 2.
 * - Spawns `vite preview`
 * - Two successive desktop headless runs plus one mobile drawing run via Playwright API
 * - addInitScript to dismiss quick-start overlay
 * - Asserts Konva/canvas surface present with target webtoon dims
 * - Performs a driven interaction using shipped UI (click "예시로 시작" or "추가")
 * - Logs stageInfo JSON + consoleErrors count
 * - Writes screenshots to {SCRATCH}
 * - Exits 1 on any failure
 *
 * Run via: tsx scripts/verify-studio-launch.mts
 * Output is captured by caller to {SCRATCH}/studio-launch-*.log
 */
import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type Browser, type Page } from "playwright";

const SCRATCH = process.env.TOONSPECTRUM_VERIFY_DIR ?? join(tmpdir(), "toonspectrum-studio-launch");
const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
// 이 검증기는 `vite preview`만 띄우므로 Nest API를 의도적으로 기동하지 않는다. 아래 두 요청은
// UI 부트에 필수가 아닌 best-effort 작업(카탈로그 병합·AI 제공자 상태)이고, API 부재가 Studio
// 렌더/상호작용 회귀처럼 strict gate를 막아서는 안 된다. 다른 console error는 계속 실패 처리한다.
const OPTIONAL_STATIC_PREVIEW_API_PATHS = [
  "/api/kmas/merge-on-access",
  "/api/studio-ai/status",
] as const;

function isExpectedStaticPreviewApiError(message: string): boolean {
  return OPTIONAL_STATIC_PREVIEW_API_PATHS.some((path) => message.includes(path));
}

interface RunResult {
  ok: boolean;
  stageInfo: {
    logicalW: string | null;
    hasKonvaSurface: boolean;
    pageDelta: number;
  };
  errCount: number;
  shot: string;
}

interface MobileRunResult {
  ok: boolean;
  immersive: boolean;
  controlsReady: boolean;
  dynamicBrushReady: boolean;
  noPanelDockOverlap: boolean;
  noHorizontalOverflow: boolean;
  categoryTargetsReady: boolean;
  rootInert: boolean;
  launcherFocusRestored: boolean;
  dotRecorded: boolean;
  dotRendered: boolean;
  errCount: number;
  shot: string;
  dotShot: string;
}

interface MobileDockLayoutResult {
  width: number;
  ok: boolean;
  primaryTargetCount: number;
  secondaryTargetCount: number;
  targetsReady: boolean;
  primaryScrollable: boolean;
  noDocumentOverflow: boolean;
  historyFocusReady: boolean;
  errCount: number;
  shot: string;
}

function log(msg: string) {
  const line = `[verify-studio] ${msg}`;
  console.log(line);
  try { appendFileSync(join(SCRATCH, "studio-launch-verify.log"), line + "\n"); } catch {}
}

async function waitForServer(url: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok || res.status < 500) return;
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error("preview server did not become ready");
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("could not allocate a preview port"));
        return;
      }
      probe.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function runOne(browser: Browser, run: number, url: string): Promise<RunResult> {
  const shot = join(SCRATCH, `studio-launch-${run}.png`);
  const ctx = await browser.newContext();
  const page: Page = await ctx.newPage();
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];

  page.on("console", (m) => {
    if (m.type() === "error") {
      const location = m.location().url;
      const message = location ? `${m.text()} @ ${location}` : m.text();
      if (!isExpectedStaticPreviewApiError(message)) consoleErrors.push(message);
    }
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("response", (response) => {
    const message = `${response.status()} ${response.url()}`;
    if (response.status() >= 500 && !isExpectedStaticPreviewApiError(message)) failedResponses.push(message);
  });

  // Dismiss quick-start before any navigation / storage init
  await page.addInitScript(({ key }) => {
    try { window.localStorage.setItem(key, "1"); } catch {}
  }, { key: QUICKSTART_KEY });

  // Wide viewport
  await page.setViewportSize({ width: 1400, height: 2000 });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(500);

  // Population drive first to ensure the editor and page list sidebar/cards are rendered
  try {
    const ex = page.getByText("예시로 시작").first();
    if (await ex.isVisible({ timeout: 1200 })) {
      await ex.click({ timeout: 800 });
      await page.waitForTimeout(400);
      log(`run${run}: population via example`);
    }
  } catch {}

  // Stable shipped observables + reliable card count for delta (page cards)
  const pageCards = page.locator('[data-testid="studio-page-item"]');
  const shell = page.locator('[data-studio-logical-w]');

  // 페이지 사이드바는 leftPanelOpen 기본 true 라 보통 열려 있다. add 버튼(testid)이 안 보일 때만
  // 명시적 "페이지 목록 펼치기" 버튼으로 연다. (기존 `button:has-text("페이지")` 토글은 접기/닫기
  // 버튼까지 매칭해 열린 패널을 되레 닫아 run2 가 fallback 을 타던 취약성이 있어 쓰지 않는다.)
  const addBtn = page.locator('[data-testid="studio-add-page"]');
  if (!(await addBtn.isVisible({ timeout: 1000 }).catch(() => false))) {
    try {
      const expand = page.locator('button[title="페이지 목록 펼치기"]').first();
      if (await expand.isVisible({ timeout: 800 }).catch(() => false)) {
        await expand.click({ timeout: 600 });
        await page.waitForTimeout(300);
        log(`run${run}: expanded pages panel`);
      }
    } catch {}
  }
  // 항상 안정적인 testid 로 페이지 추가한다(모호한 텍스트 fallback 제거 — "패널 추가" 등 오클릭 방지).
  await addBtn.waitFor({ state: "visible", timeout: 4000 });

  const beforeCount = await pageCards.count().catch(() => 0);
  log(`run${run}: beforeCount=${beforeCount}`);

  // Drive the add (shipped command) multiple times to guarantee observable page increase
  await addBtn.click({ timeout: 3000 });
  log(`run${run}: clicked add button`);
  await page.waitForTimeout(300);
  await addBtn.click({ timeout: 2000 });
  log(`run${run}: clicked add button (2nd)`);

  // Wait for structural change (more page cards)
  await page.waitForTimeout(800);
  const afterCount = await pageCards.count().catch(() => beforeCount);
  const pageDelta = afterCount - beforeCount;
  log(`run${run}: afterCount=${afterCount} pageDelta=${pageDelta}`);

  // Editor shell carries exact logical width (shipped attr)
  const logicalW = await shell.getAttribute("data-studio-logical-w").catch(() => null);
  log(`run${run}: data-studio-logical-w=${logicalW}`);

  const hasKonvaSurface = (await page.locator(".konvajs-content, canvas").count().catch(() => 0)) > 0;

  const dimOk = logicalW === "720" && hasKonvaSurface;
  log(`run${run}: hasKonvaSurface=${hasKonvaSurface} dimOk=${dimOk} (target 720) consoleErrors=${consoleErrors.length}`);

  await page.screenshot({ path: shot, fullPage: true });

  await ctx.close();

  // Strict gate: driven action performed (click logged) + konva surface + target logical noted
  const ok = pageDelta >= 2 && dimOk && consoleErrors.length === 0;
  if (!ok) {
    log(`run${run} FAIL (delta=${pageDelta}, dimOk=${dimOk}, errs=${consoleErrors.length})`);
    if (consoleErrors.length > 0) {
      // 실패 시 원인을 출력해야 실제 Studio 회귀와 무해한 네트워크 경고를 구별할 수 있다.
      // 메시지는 길어질 수 있어 최대 8건만 로그에 남기되, strict gate 자체는 그대로 유지한다.
      for (const [index, message] of consoleErrors.slice(0, 8).entries()) {
        log(`run${run} consoleError[${index}]: ${message}`);
      }
    }
    for (const [index, response] of failedResponses.slice(0, 8).entries()) {
      log(`run${run} failedResponse[${index}]: ${response}`);
    }
  }
  return { ok, stageInfo: { logicalW, hasKonvaSurface, pageDelta }, errCount: consoleErrors.length, shot };
}

async function runMobileDrawing(browser: Browser, url: string): Promise<MobileRunResult> {
  const shot = join(SCRATCH, "studio-launch-mobile-drawing.png");
  const dotShot = join(SCRATCH, "studio-launch-mobile-dot.png");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location().url;
    const text = location ? `${message.text()} @ ${location}` : message.text();
    if (!isExpectedStaticPreviewApiError(text)) consoleErrors.push(text);
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  await page.addInitScript(({ quickStartKey, mobileHintKey }) => {
    try {
      window.localStorage.setItem(quickStartKey, "1");
      window.localStorage.setItem(mobileHintKey, "1");
    } catch {}
  }, {
    quickStartKey: QUICKSTART_KEY,
    mobileHintKey: "toonspectrum-studio-mobile-hint-dismissed",
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  const dock = page.getByRole("navigation", { name: "스튜디오 모바일 도구막대" });
  await dock.waitFor({ state: "visible", timeout: 8000 });
  const editorRoot = page.locator('[data-studio-editor="true"]');
  await page
    .locator('[data-studio-editor="true"][data-studio-mobile-immersive="true"]')
    .waitFor({ state: "attached", timeout: 3000 });

  await page.getByRole("button", { name: "브러시 설정 (굵기·색·프리셋)" }).click();
  const sheet = page.getByRole("dialog", { name: "브러시 설정" });
  await sheet.waitFor({ state: "visible", timeout: 3000 });

  const lineCorrection = sheet.getByRole("region", { name: "선 보정" });
  await lineCorrection.scrollIntoViewIfNeeded();
  // The unified picker intentionally keeps only starter/favorite/recent presets in the quick row.
  // Exercise the shipped catalog path for an expressive brush instead of depending on tray order.
  await sheet.getByRole("button", { name: "전체 브러시 보기", exact: true }).click();
  const builtInBrushCatalog = page.getByRole("dialog", { name: "기본 브러시 카탈로그" });
  await builtInBrushCatalog.waitFor({ state: "visible", timeout: 3000 });
  await builtInBrushCatalog.getByRole("tab", { name: "페인트", exact: true }).click();
  await builtInBrushCatalog.getByRole("button", { name: "소프트 에어브러시 선택", exact: true }).click();
  await builtInBrushCatalog.waitFor({ state: "detached", timeout: 3000 });
  const airbrushPreset = sheet.locator('[data-studio-brush-chip="airbrush"]');
  await airbrushPreset.waitFor({ state: "visible", timeout: 3000 });
  const dynamicBrushReady = await airbrushPreset.getAttribute("aria-selected") === "true";
  const brushStudioLaunchers = sheet
    .locator('button[aria-haspopup="dialog"]')
    .filter({ hasText: /^\s*브러시 스튜디오/ });
  const exactBrushStudioLauncher = (await brushStudioLaunchers.count()) === 1;
  const brushStudioLauncher = brushStudioLaunchers.first();
  await brushStudioLauncher.scrollIntoViewIfNeeded();
  await brushStudioLauncher.click();

  const brushStudio = page.getByRole("dialog", { name: "브러시 스튜디오", exact: true });
  await brushStudio.waitFor({ state: "visible", timeout: 3000 });
  // `visible` becomes true at the first frame of the global dialog materialize animation. Measuring
  // touch targets while its scale is still below 1 would report a transient ~41.6px box for a
  // steady-state 44px control, so wait for the dialog's own entrance animation to settle first.
  await brushStudio.evaluate(async (dialog) => {
    await Promise.all(dialog.getAnimations().map(async (animation) => {
      try { await animation.finished; } catch {}
    }));
  });
  const brushStudioPanel = brushStudio.locator(":scope > div").first();
  const categoryTabs = brushStudio.getByRole("tab");
  const categoryTabHeights = await categoryTabs.evaluateAll((tabs) =>
    tabs.map((tab) => tab.getBoundingClientRect().height)
  );
  const categoryTargetsReady =
    categoryTabHeights.length === 5 &&
    categoryTabHeights.every((height) => height >= 44);
  const rootInert = await page.locator("#root").evaluate((root) => root.hasAttribute("inert"));

  await brushStudio.getByRole("tab", { name: "입력", exact: true }).click();
  const globalPressureHeading = brushStudio.getByRole("heading", {
    name: "전역 입력 보정",
    exact: true,
  });
  const pressureInput = brushStudio.getByRole("region", { name: "필압 입력" });
  await globalPressureHeading.waitFor({ state: "visible", timeout: 3000 });
  await pressureInput.waitFor({ state: "visible", timeout: 3000 });
  const controlsReady =
    dynamicBrushReady &&
    exactBrushStudioLauncher &&
    (await lineCorrection.count()) === 1 &&
    (await pressureInput.count()) === 1 &&
    await sheet.getByRole("combobox", { name: "보정 방식" }).isEnabled() &&
    await brushStudio.getByRole("slider", { name: "필압 반응 강도" }).isEnabled();

  const mobileImmersiveValue = await editorRoot.getAttribute("data-studio-mobile-immersive");
  const mobileImmersivePreference = await page.evaluate(() =>
    window.sessionStorage.getItem("toonspectrum-studio-mobile-immersive:v1")
  );
  const immersiveRootReady = mobileImmersiveValue === "true";
  const siteBrandVisible = await page
    .locator('header a[href="/"]')
    .filter({ hasText: "툰스펙트럼" })
    .isVisible()
    .catch(() => false);
  const siteFooterVisible = await page.getByRole("contentinfo").isVisible().catch(() => false);
  const immersive =
    immersiveRootReady &&
    !siteBrandVisible &&
    !siteFooterVisible;
  const panelBox = await brushStudioPanel.boundingBox();
  const dockBox = await dock.boundingBox();
  const noPanelDockOverlap = Boolean(
    panelBox && dockBox && panelBox.y + panelBox.height <= dockBox.y + 1
  );
  const horizontalOverflow = await page.evaluate(() => ({
    document: Math.max(
      0,
      document.documentElement.scrollWidth - window.innerWidth,
      document.body.scrollWidth - window.innerWidth
    ),
  }));
  const panelHorizontalOverflow = await brushStudioPanel.evaluate((panel) =>
    Math.max(0, panel.scrollWidth - panel.clientWidth)
  );
  const noHorizontalOverflow =
    horizontalOverflow.document === 0 && panelHorizontalOverflow === 0;

  await page.screenshot({ path: shot, fullPage: false });

  await brushStudio.getByRole("button", { name: "브러시 스튜디오 닫기", exact: true }).click();
  await brushStudio.waitFor({ state: "detached", timeout: 3000 });
  await page.waitForFunction(() => {
    const active = document.activeElement;
    return active instanceof HTMLButtonElement &&
      active.getAttribute("aria-haspopup") === "dialog" &&
      active.textContent?.includes("브러시 스튜디오");
  });
  const launcherFocusRestored = await brushStudioLauncher.evaluate(
    (launcher) => document.activeElement === launcher
  );

  await sheet.getByRole("button", { name: "브러시 설정 닫기" }).click();
  const stage = page.locator(".konvajs-content").first();
  const stageBox = await stage.boundingBox();
  const stageBeforeDot = stageBox ? await stage.screenshot() : null;
  if (stageBox) {
    await page.mouse.click(
      stageBox.x + stageBox.width * 0.5,
      stageBox.y + Math.min(stageBox.height * 0.35, 240)
    );
    await page.waitForTimeout(200);
  }
  const dotRecorded = await dock.getByRole("button", { name: "실행취소" }).isEnabled();
  const stageAfterDot = stageBox ? await stage.screenshot() : null;
  const dotRendered = Boolean(
    stageBeforeDot && stageAfterDot && !stageBeforeDot.equals(stageAfterDot)
  );
  await page.screenshot({ path: dotShot, fullPage: false });

  const ok =
    immersive &&
    controlsReady &&
    noPanelDockOverlap &&
    noHorizontalOverflow &&
    categoryTargetsReady &&
    rootInert &&
    launcherFocusRestored &&
    dotRecorded &&
    dotRendered &&
    consoleErrors.length === 0;
  log(
    `mobile: immersive=${immersive} root=${immersiveRootReady} ` +
    `rootValue=${mobileImmersiveValue} preference=${mobileImmersivePreference} ` +
    `siteBrand=${siteBrandVisible} siteFooter=${siteFooterVisible} controlsReady=${controlsReady} ` +
    `dynamicBrushReady=${dynamicBrushReady} ` +
    `noPanelDockOverlap=${noPanelDockOverlap} noHorizontalOverflow=${noHorizontalOverflow} ` +
    `categoryTargetsReady=${categoryTargetsReady} categoryTabHeights=${categoryTabHeights.join(",")} ` +
    `rootInert=${rootInert} ` +
    `launcherFocusRestored=${launcherFocusRestored} dotRecorded=${dotRecorded} dotRendered=${dotRendered} ` +
    `consoleErrors=${consoleErrors.length}`
  );
  if (!ok) {
    for (const [index, message] of consoleErrors.slice(0, 8).entries()) {
      log(`mobile consoleError[${index}]: ${message}`);
    }
  }

  await ctx.close();
  return {
    ok,
    immersive,
    controlsReady,
    dynamicBrushReady,
    noPanelDockOverlap,
    noHorizontalOverflow,
    categoryTargetsReady,
    rootInert,
    launcherFocusRestored,
    dotRecorded,
    dotRendered,
    errCount: consoleErrors.length,
    shot,
    dotShot,
  };
}

async function runMobileDockLayout(
  browser: Browser,
  url: string,
  width: 320 | 360 | 390,
): Promise<MobileDockLayoutResult> {
  const shot = join(SCRATCH, `studio-launch-mobile-dock-${width}.png`);
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location().url;
    const value = location ? `${message.text()} @ ${location}` : message.text();
    if (!isExpectedStaticPreviewApiError(value)) consoleErrors.push(value);
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  await page.addInitScript(({ quickStartKey, mobileHintKey }) => {
    try {
      window.localStorage.setItem(quickStartKey, "1");
      window.localStorage.setItem(mobileHintKey, "1");
    } catch {}
  }, {
    quickStartKey: QUICKSTART_KEY,
    mobileHintKey: "toonspectrum-studio-mobile-hint-dismissed",
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  const dock = page.getByRole("navigation", { name: "스튜디오 모바일 도구막대" });
  await dock.waitFor({ state: "visible", timeout: 8000 });
  const primary = dock.locator('[data-studio-mobile-dock-scroll="primary"]');
  const secondary = dock.locator('[data-studio-mobile-dock-scroll="secondary"]');
  const primaryTargets = primary.locator(
    ':scope > button, :scope > [data-studio-tool-hint-target="true"]',
  );
  const secondaryTargets = secondary.locator(":scope > button, :scope > div > button");
  const primaryWidths = await primaryTargets.evaluateAll((targets) =>
    targets.map((target) => target.getBoundingClientRect().width)
  );
  const secondaryWidths = await secondaryTargets.evaluateAll((targets) =>
    targets.map((target) => target.getBoundingClientRect().width)
  );
  const primaryTargetCount = primaryWidths.length;
  const secondaryTargetCount = secondaryWidths.length;
  const targetsReady =
    primaryTargetCount === 7 &&
    secondaryTargetCount === 7 &&
    [...primaryWidths, ...secondaryWidths].every((targetWidth) => targetWidth >= 44);
  const scrollGeometry = await primary.evaluate((toolbar) => ({
    clientWidth: toolbar.clientWidth,
    scrollWidth: toolbar.scrollWidth,
  }));
  const primaryScrollable = scrollGeometry.scrollWidth > scrollGeometry.clientWidth;
  const noDocumentOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth === window.innerWidth &&
    document.body.scrollWidth <= window.innerWidth
  );

  let historyFocusReady = true;
  for (const label of ["실행취소", "다시실행"] as const) {
    // Fresh documents expose the disabled-reason coach wrapper as the keyboard target while the
    // native button is aria-hidden. Locate that wrapper through its stable child command label.
    const target = primary.locator(
      `[data-studio-tool-hint-target="true"]:has(> button[aria-label="${label}"])`,
    );
    await target.scrollIntoViewIfNeeded();
    await target.focus();
    const visible = await target.evaluate((element) => {
      const targetRect = element.getBoundingClientRect();
      const toolbarRect = element
        .closest("[data-studio-mobile-dock-scroll]")
        ?.getBoundingClientRect();
      return Boolean(
        toolbarRect &&
        targetRect.left >= toolbarRect.left - 0.5 &&
        targetRect.right <= toolbarRect.right + 0.5
      );
    });
    historyFocusReady &&= visible;
  }

  await page.screenshot({ path: shot, fullPage: false });
  const ok =
    targetsReady &&
    (width !== 320 || primaryScrollable) &&
    noDocumentOverflow &&
    historyFocusReady &&
    consoleErrors.length === 0;
  log(
    `mobile-dock-${width}: targets=${primaryTargetCount}+${secondaryTargetCount} ` +
    `widths=${[...primaryWidths, ...secondaryWidths].join(",")} ` +
    `primaryScrollable=${primaryScrollable} documentOverflow=${!noDocumentOverflow} ` +
    `historyFocusReady=${historyFocusReady} consoleErrors=${consoleErrors.length}`,
  );
  if (!ok) {
    for (const [index, message] of consoleErrors.slice(0, 8).entries()) {
      log(`mobile-dock-${width} consoleError[${index}]: ${message}`);
    }
  }
  await ctx.close();
  return {
    width,
    ok,
    primaryTargetCount,
    secondaryTargetCount,
    targetsReady,
    primaryScrollable,
    noDocumentOverflow,
    historyFocusReady,
    errCount: consoleErrors.length,
    shot,
  };
}

async function main() {
  mkdirSync(SCRATCH, { recursive: true });
  const port = await findFreePort();
  const url = `http://127.0.0.1:${port}/studio`;

  // Clean stale artifacts at start of harness run (per strict gate)
  try {
    const files = readdirSync(SCRATCH).filter(
      (file) => file.startsWith("studio-launch-") && (file.endsWith(".png") || file.endsWith(".log"))
    );
    for (const f of files) {
      try { unlinkSync(join(SCRATCH, f)); } catch {}
    }
  } catch {}

  const server: ChildProcess = spawn(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "vite", "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
    { stdio: "ignore" }
  );

  let browser: Browser | null = null;
  try {
    await waitForServer(url, 20000);

    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const results: RunResult[] = [];

    for (let i = 1; i <= 2; i++) {
      const r = await runOne(browser, i, url);
      results.push(r);
      if (!r.ok) {
        throw new Error(`studio launch verification failed on run ${i}`);
      }
    }

    const mobile = await runMobileDrawing(browser, url);
    if (!mobile.ok) {
      throw new Error("studio mobile drawing verification failed");
    }

    const mobileDocks: MobileDockLayoutResult[] = [];
    for (const width of [320, 360, 390] as const) {
      const result = await runMobileDockLayout(browser, url, width);
      mobileDocks.push(result);
      if (!result.ok) {
        throw new Error(`studio mobile dock verification failed at ${width}px`);
      }
    }

    await browser.close();
    browser = null;

    log("DESKTOP AND MOBILE RUNS OK");
    log(
      `screenshots: ${[
        ...results.map(r => r.shot),
        mobile.shot,
        mobile.dotShot,
        ...mobileDocks.map((result) => result.shot),
      ].join(" ")}`,
    );
    console.log(JSON.stringify({ runs: results, mobile, mobileDocks }, null, 2));
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    try { server.kill("SIGKILL"); } catch {}
  }
}

main().catch((error: unknown) => {
  log(`FATAL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
