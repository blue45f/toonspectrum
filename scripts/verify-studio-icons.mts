/**
 * scripts/verify-studio-icons.mts
 * Desktop headless check: Studio chrome icons, rail tools, draw options, and menu chevrons.
 *
 * Run: pnpm exec tsx scripts/verify-studio-icons.mts
 * Expects production build in dist/.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";

import { chromium, type Page } from "playwright";

const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("port"));
        return;
      }
      probe.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function waitForServer(url: string) {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok || res.status < 500) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("preview not ready");
}

function log(msg: string) {
  console.log(`[verify-icons] ${msg}`);
}

interface IconAudit {
  region: string;
  buttons: number;
  withSvg: number;
  withoutSvg: number;
  unlabeledIconOnly: number;
  tinySvg: number;
  samplesMissing: string[];
}

async function auditRegion(page: Page, region: string, rootSelector: string): Promise<IconAudit> {
  return page.locator(rootSelector).first().evaluate((root, regionName) => {
    const buttons = Array.from(
      root.querySelectorAll("button, a[role='button'], [role='option'], label.cursor-pointer")
    ) as HTMLElement[];
    let withSvg = 0;
    let withoutSvg = 0;
    let unlabeledIconOnly = 0;
    let tinySvg = 0;
    const samplesMissing: string[] = [];

    for (const el of buttons) {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      // Off-screen toolbelt on desktop
      if (rect.right < 0 || rect.bottom < 0 || rect.left > window.innerWidth + 40) continue;

      const svgs = Array.from(el.querySelectorAll("svg"));
      const visibleSvgs = svgs.filter((svg) => {
        const r = svg.getBoundingClientRect();
        const s = window.getComputedStyle(svg);
        return (
          r.width > 0 &&
          r.height > 0 &&
          s.display !== "none" &&
          s.visibility !== "hidden" &&
          s.opacity !== "0"
        );
      });

      const label =
        el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        (el.textContent || "").replace(/\s+/g, " ").trim();

      if (visibleSvgs.length > 0) {
        withSvg += 1;
        for (const svg of visibleSvgs) {
          const r = svg.getBoundingClientRect();
          if (r.width < 10 || r.height < 10) tinySvg += 1;
        }
        // Icon-only control without accessible name
        const textOnly = (el.textContent || "").replace(/\s+/g, " ").trim();
        const hasName =
          Boolean(el.getAttribute("aria-label")) ||
          Boolean(el.getAttribute("title")) ||
          textOnly.length > 0;
        if (!hasName) {
          unlabeledIconOnly += 1;
          if (samplesMissing.length < 6) samplesMissing.push(`${regionName}: (unnamed icon button)`);
        }
      } else {
        // Text-only is OK for main menu triggers; flag empty controls
        withoutSvg += 1;
        if (!label && samplesMissing.length < 6) {
          samplesMissing.push(`${regionName}: empty control`);
        }
      }
    }

    return {
      region: regionName,
      buttons: withSvg + withoutSvg,
      withSvg,
      withoutSvg,
      unlabeledIconOnly,
      tinySvg,
      samplesMissing,
    };
  }, region);
}

async function countVisibleSvgs(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluateAll((nodes) => {
    let n = 0;
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      if (
        r.width >= 10 &&
        r.height >= 10 &&
        r.right > 0 &&
        r.bottom > 0 &&
        r.left < window.innerWidth &&
        s.display !== "none" &&
        s.visibility !== "hidden" &&
        s.opacity !== "0"
      ) {
        n += 1;
      }
    }
    return n;
  });
}

async function main() {
  const port = await findFreePort();
  let child: ChildProcess | null = null;
  let exitCode = 1;

  try {
    child = spawn(
      "pnpm",
      ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
      { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] }
    );
    child.stderr?.on("data", (d) => {
      const s = String(d);
      if (!s.includes("ECONNREFUSED") && !s.includes("proxy error")) process.stderr.write(d);
    });
    await waitForServer(`http://127.0.0.1:${port}/`);
    log(`preview @ http://127.0.0.1:${port}/studio`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.addInitScript(({ key }) => {
      try {
        localStorage.setItem(key, "1");
        localStorage.setItem("toonspectrum-studio-ui-density:v1", JSON.stringify({ mode: "full" }));
      } catch {
        /* ignore */
      }
    }, { key: QUICKSTART_KEY });

    await page.goto(`http://127.0.0.1:${port}/studio`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(1000);
    for (const text of ["나중에", "닫기", "예시로 시작", "빈 캔버스"]) {
      try {
        const el = page.getByRole("button", { name: text }).first();
        if (await el.isVisible({ timeout: 300 })) await el.click({ timeout: 500 });
      } catch {
        /* optional */
      }
    }

    await page.locator('[data-studio-main-menu="true"]').waitFor({ state: "visible", timeout: 20000 });
    await page.locator('[data-studio-tool-rail="true"]').waitFor({ state: "visible", timeout: 10000 });

    // Activate pen so draw options bar mounts with icons
    await page.getByRole("button", { name: "펜 (B)" }).click({ timeout: 4000 });
    await page.locator('[data-studio-draw-options="true"]').waitFor({ state: "visible", timeout: 8000 });
    await page.waitForTimeout(300);

    const failures: string[] = [];

    // Hard requirements: minimum visible SVG counts per chrome region
    const menubarSvgs = await countVisibleSvgs(page, '[data-studio-app-menubar="true"] svg');
    const railSvgs = await countVisibleSvgs(page, '[data-studio-tool-rail="true"] svg');
    const drawOptSvgs = await countVisibleSvgs(page, '[data-studio-draw-options="true"] svg');
    const mainMenuChevrons = await countVisibleSvgs(
      page,
      '[data-studio-main-menu="true"] button svg'
    );

    log(`menubar svgs=${menubarSvgs}, rail svgs=${railSvgs}, draw-options svgs=${drawOptSvgs}, main-menu chevrons=${mainMenuChevrons}`);

    if (menubarSvgs < 3) failures.push(`앱 메뉴바 아이콘 부족: ${menubarSvgs} (expect ≥3 Download/chevron/etc)`);
    if (railSvgs < 8) failures.push(`좌측 레일 아이콘 부족: ${railSvgs} (expect ≥8 tool icons)`);
    if (drawOptSvgs < 3) failures.push(`그리기 옵션바 아이콘 부족: ${drawOptSvgs} (expect pen/eraser/etc)`);
    if (mainMenuChevrons < 6) {
      failures.push(`메인 메뉴 그룹 chevron 부족: ${mainMenuChevrons} (expect 6 groups)`);
    }

    // Rail tools must each have an SVG (icon-first IA)
    const railButtons = page.locator('[data-studio-tool-rail="true"] button');
    const railCount = await railButtons.count();
    let railMissingIcon = 0;
    for (let i = 0; i < railCount; i++) {
      const btn = railButtons.nth(i);
      if (!(await btn.isVisible().catch(() => false))) continue;
      const svgCount = await btn.locator("svg").count();
      const label = (await btn.getAttribute("aria-label")) || (await btn.getAttribute("title")) || "";
      if (svgCount === 0) {
        railMissingIcon += 1;
        failures.push(`레일 버튼 아이콘 없음: ${label || `#${i}`}`);
      } else {
        // aria-label required for icon-only rail
        if (!label) failures.push(`레일 아이콘 접근성 이름 없음: #${i}`);
      }
    }
    log(`rail buttons scanned=${railCount}, missingIcon=${railMissingIcon}`);

    // Draw options: pen/eraser icons when mode switch present
    const penBtn = page.locator('[data-studio-draw-options="true"] button[title="펜"]');
    if (await penBtn.count()) {
      if ((await penBtn.locator("svg").count()) < 1) failures.push("펜 모드 버튼에 아이콘 없음");
    }
    const eraserBtn = page.locator('[data-studio-draw-options="true"] button[title="지우개"]');
    if (await eraserBtn.count()) {
      if ((await eraserBtn.locator("svg").count()) < 1) failures.push("지우개 모드 버튼에 아이콘 없음");
    }

    // Brush tray uses stroke previews (not lucide) — ensure listbox options visible
    const brushOpts = page.locator('[data-studio-brush-tray="true"] [role="option"]');
    const brushCount = await brushOpts.count();
    if (brushCount < 3) failures.push(`브러시 트레이 옵션 부족: ${brushCount}`);
    else log(`brush tray options=${brushCount}`);

    // Open a main menu and ensure chevron + items layout (items are text; chevron on trigger)
    await page.locator('[data-studio-main-menu="true"]').getByRole("button", { name: "그리기", exact: true }).click();
    const drawMenu = page.locator('[role="menu"][aria-label="그리기"]');
    await drawMenu.waitFor({ state: "visible", timeout: 4000 });
    const menuItems = await drawMenu.getByRole("menuitem").count();
    if (menuItems < 4) failures.push(`그리기 메뉴 항목 부족: ${menuItems}`);
    // Optional icons on menu items are fine either way; ensure readable text
    const penItem = drawMenu.getByRole("menuitem", { name: "펜" });
    if (!(await penItem.isVisible())) failures.push("그리기 메뉴 펜 항목 미노출");
    await page.keyboard.press("Escape");

    // Dual color / flip / smart shape icon buttons when present
    for (const name of ["색 교체", "캔버스 좌우 반전", "스마트 도형", "브러시 스튜디오"]) {
      const btn = page.getByRole("button", { name: new RegExp(name) }).first();
      if (await btn.isVisible().catch(() => false)) {
        const hasSvg = (await btn.locator("svg").count()) > 0;
        if (!hasSvg) failures.push(`옵션 버튼 아이콘 없음: ${name}`);
        else log(`  icon ok: ${name}`);
      }
    }

    // Region audits (informational + unlabeled failures)
    for (const [region, sel] of [
      ["menubar", '[data-studio-app-menubar="true"]'],
      ["tool-rail", '[data-studio-tool-rail="true"]'],
      ["draw-options", '[data-studio-draw-options="true"]'],
    ] as const) {
      const audit = await auditRegion(page, region, sel);
      log(
        `audit ${audit.region}: buttons=${audit.buttons} withSvg=${audit.withSvg} withoutSvg=${audit.withoutSvg} unlabeled=${audit.unlabeledIconOnly} tiny=${audit.tinySvg}`
      );
      if (audit.unlabeledIconOnly > 0) {
        failures.push(`${region}: 이름 없는 아이콘 버튼 ${audit.unlabeledIconOnly}개`);
        for (const s of audit.samplesMissing) failures.push(`  sample: ${s}`);
      }
      if (audit.tinySvg > 2) {
        failures.push(`${region}: 너무 작은 SVG ${audit.tinySvg}개 (<10px) — 터치/가독성 위험`);
      }
    }

    // Status / density chips should not look broken (optional)
    const density = page.getByRole("button", { name: /전체|심플|슈퍼심플/ }).first();
    if (await density.isVisible().catch(() => false)) log("density control visible");

    if (failures.length === 0) {
      log("PASS: icons exposed across menubar, rail, draw options, main menu");
      exitCode = 0;
    } else {
      log(`FAIL (${failures.length}):`);
      for (const f of failures) log(`  - ${f}`);
      exitCode = 1;
    }

    await browser.close();
  } catch (err) {
    console.error("[verify-icons] fatal:", err);
    exitCode = 1;
  } finally {
    if (child && !child.killed) {
      child.kill("SIGTERM");
      setTimeout(() => {
        try {
          child?.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, 400).unref?.();
    }
  }
  process.exit(exitCode);
}

void main();
