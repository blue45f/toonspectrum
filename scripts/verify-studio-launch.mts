/**
 * scripts/verify-studio-launch.mts
 * Committed, reproducible harness for Verification plan step 2.
 * - Spawns `vite preview`
 * - Two successive headless runs via Playwright API
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

  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

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
  }
  return { ok, stageInfo: { logicalW, hasKonvaSurface, pageDelta }, errCount: consoleErrors.length, shot };
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

    await browser.close();
    browser = null;

    log("BOTH RUNS OK");
    log(`screenshots: ${results.map(r => r.shot).join(" ")}`);
    console.log(JSON.stringify({ runs: results }, null, 2));
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    try { server.kill("SIGKILL"); } catch {}
  }
}

main().catch((error: unknown) => {
  log(`FATAL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
