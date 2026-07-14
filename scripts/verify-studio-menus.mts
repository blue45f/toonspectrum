/**
 * scripts/verify-studio-menus.mts
 * Desktop headless check: Studio application menus + left rail + menu-driven popovers.
 *
 * Desktop IA (Magma-style):
 * - Visible: app menubar + MainMenu (파일/편집/삽입/보기/그리기/AI) + left tool rail
 * - Toolbelt is parked off-screen on lg+ (still mounts popovers when opened via main menu)
 *
 * Run: pnpm exec tsx scripts/verify-studio-menus.mts
 * Expects production build in dist/ (vite preview).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";

import { chromium, type Page } from "playwright";

const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";

const MAIN_MENU: Record<string, string[]> = {
  파일: ["내보내기 / 다운로드", "임시저장", "게시", "프로젝트 도구…"],
  편집: ["실행취소", "다시실행", "작업 내역", "선택 도구"],
  삽입: ["템플릿 · 에셋", "말풍선", "텍스트", "이미지…", "3D 캐릭터", "참고 이미지"],
  보기: ["슈퍼심플 레이아웃", "전체 레이아웃", "패널 접어 넓게", "너비에 맞춤", "전체화면", "캔버스만"],
  그리기: ["펜", "지우개", "채우기", "스마트 도형", "배경 · 톤", "팔레트 · 브랜드"],
  AI: ["AI 어시스트", "스톡 이미지", "연동 설정"],
};

/** Left vertical rail — primary tool surface on desktop. */
const RAIL_TOOLS = [
  "선택 (V)",
  "펜 (B)",
  "지우개 (E)",
  // Fill: when no raster is selected the aria-label becomes the guard reason (still exposed).
  { anyOf: ["채우기 (G)", "래스터 이미지 레이어를 먼저 선택하세요."] },
  "스포이드 (I / Alt+클릭)",
  "스마트 도형 — 낙서를 선·원·사각형으로 다듬기",
  "사각형 도형",
  "타원 도형",
  "텍스트 추가",
  "말풍선 추가",
  "이미지 추가",
  "참고 이미지",
] as const;

/** Open via main menu → assert popover chrome appears. */
const MENU_DRIVEN_POPOVERS: {
  group: string;
  item: string;
  /** Prefer unique headers so menubar labels are not false positives. */
  expectVisible: string[];
  expectDialogName?: string;
}[] = [
  {
    group: "삽입",
    item: "템플릿 · 에셋",
    expectVisible: ["템플릿", "이메레스", "장면", "클립", "효과"],
  },
  {
    group: "그리기",
    item: "배경 · 톤",
    expectVisible: ["배경·톤", "스크린톤"],
  },
  {
    group: "그리기",
    item: "팔레트 · 브랜드",
    expectVisible: ["스타일", "팔레트", "브랜드"],
  },
  {
    group: "AI",
    item: "AI 어시스트",
    expectVisible: ["AI 연동", "어시스트", "스톡"],
  },
  {
    group: "파일",
    item: "프로젝트 도구…",
    expectVisible: ["파일 · 프로젝트", "백업 · 복구 · 검토 · 내보내기"],
    expectDialogName: "프로젝트 작업",
  },
];

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("could not allocate port"));
        return;
      }
      probe.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function waitForServer(url: string, timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok || res.status < 500) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`preview not ready: ${url}`);
}

function log(msg: string) {
  console.log(`[verify-menus] ${msg}`);
}

async function dismissOverlays(page: Page) {
  for (const text of ["나중에", "닫기", "예시로 시작", "빈 캔버스", "확인"]) {
    try {
      const el = page.getByRole("button", { name: text }).first();
      if (await el.isVisible({ timeout: 300 })) {
        await el.click({ timeout: 600 });
        await page.waitForTimeout(200);
      }
    } catch {
      /* optional */
    }
  }
  await page.keyboard.press("Escape").catch(() => undefined);
}

async function openMainMenuGroup(page: Page, label: string): Promise<void> {
  const nav = page.locator('[data-studio-main-menu="true"]');
  await nav.waitFor({ state: "visible", timeout: 15000 });
  // Close any open group first
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(80);
  const btn = nav.getByRole("button", { name: label, exact: true });
  await btn.click({ timeout: 5000 });
  await page.locator(`[role="menu"][aria-label="${label}"]`).waitFor({ state: "visible", timeout: 5000 });
}

async function assertChrome(page: Page): Promise<string[]> {
  const failures: string[] = [];
  const checks: { name: string; ok: () => Promise<boolean> }[] = [
    {
      name: "앱 메뉴바",
      ok: async () => page.locator('[data-studio-app-menubar="true"]').isVisible(),
    },
    {
      name: "메인 메뉴",
      ok: async () => page.locator('[data-studio-main-menu="true"]').isVisible(),
    },
    {
      name: "툴벨트 DOM 마운트 (데스크톱은 오프스크린)",
      ok: async () => (await page.locator('[data-studio-tool-belt="true"]').count()) > 0,
    },
    {
      name: "좌측 툴 레일",
      ok: async () =>
        (await page.locator('[data-studio-tool-rail="true"]').isVisible().catch(() => false)) ||
        (await page.getByRole("button", { name: "펜 (B)" }).isVisible().catch(() => false)),
    },
    {
      name: "다운로드",
      ok: async () => page.getByRole("button", { name: /다운로드/ }).first().isVisible(),
    },
    {
      name: "내보내기 옵션",
      ok: async () => page.getByRole("button", { name: "내보내기 옵션" }).isVisible(),
    },
  ];
  for (const c of checks) {
    if (!(await c.ok().catch(() => false))) failures.push(`크롬 미노출: ${c.name}`);
  }
  return failures;
}

async function assertMainMenus(page: Page): Promise<string[]> {
  const failures: string[] = [];
  const nav = page.locator('[data-studio-main-menu="true"]');
  if (!(await nav.isVisible().catch(() => false))) {
    failures.push("메인 메뉴 nav 미노출 (lg 이상 뷰포트 필요)");
    return failures;
  }

  // Top-level group labels always visible
  for (const group of Object.keys(MAIN_MENU)) {
    if (!(await nav.getByRole("button", { name: group, exact: true }).isVisible().catch(() => false))) {
      failures.push(`메인 메뉴 그룹 버튼 미노출: ${group}`);
    }
  }

  for (const [group, items] of Object.entries(MAIN_MENU)) {
    try {
      await openMainMenuGroup(page, group);
      const menu = page.locator(`[role="menu"][aria-label="${group}"]`);
      for (const item of items) {
        const row = menu.getByRole("menuitem", { name: item });
        const visible =
          (await row.isVisible().catch(() => false)) ||
          (await menu.getByText(item, { exact: true }).first().isVisible().catch(() => false));
        if (!visible) failures.push(`메인 메뉴 [${group}] 항목 없음: ${item}`);
      }
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
    } catch (err) {
      failures.push(`메인 메뉴 [${group}] 열기 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return failures;
}

async function assertRailTools(page: Page): Promise<string[]> {
  const failures: string[] = [];
  for (const entry of RAIL_TOOLS) {
    if (typeof entry === "string") {
      const byLabel = page.getByRole("button", { name: entry }).first();
      const byTitle = page.locator(`[title="${entry}"]`).first();
      const visible =
        (await byLabel.isVisible().catch(() => false)) ||
        (await byTitle.isVisible().catch(() => false));
      if (!visible) {
        if (entry === "이미지 추가") {
          const img = page.getByText("이미지 추가", { exact: true }).first();
          if ((await img.count().catch(() => 0)) > 0) continue;
        }
        failures.push(`좌측 레일 도구 미노출: ${entry}`);
      }
      continue;
    }
    const ok = await Promise.any(
      entry.anyOf.map(async (label) => {
        const visible =
          (await page.getByRole("button", { name: label }).first().isVisible().catch(() => false)) ||
          (await page.locator(`[title="${label}"]`).first().isVisible().catch(() => false));
        if (!visible) throw new Error("miss");
        return true;
      })
    ).catch(() => false);
    if (!ok) failures.push(`좌측 레일 도구 미노출: ${entry.anyOf.join(" | ")}`);
  }
  return failures;
}

async function closeFloatingUi(page: Page) {
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(80);
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.mouse.click(24, 120);
  await page.waitForTimeout(120);
}

async function assertMenuDrivenPopovers(page: Page): Promise<string[]> {
  const failures: string[] = [];
  for (const entry of MENU_DRIVEN_POPOVERS) {
    try {
      await closeFloatingUi(page);
      await openMainMenuGroup(page, entry.group);
      const menu = page.locator(`[role="menu"][aria-label="${entry.group}"]`);
      await menu.getByRole("menuitem", { name: entry.item }).click({ timeout: 4000 });
      // Lazy panels + fixed popovers need a beat after main-menu close
      await page.waitForTimeout(700);

      if (entry.expectDialogName) {
        const dialog = page.getByRole("dialog", { name: entry.expectDialogName });
        await dialog.waitFor({ state: "visible", timeout: 5000 });
      }

      let matched = 0;
      for (const text of entry.expectVisible) {
        const loc = page.getByText(text).first();
        if (await loc.isVisible({ timeout: 2500 }).catch(() => false)) matched += 1;
      }
      if (matched === 0) {
        failures.push(
          `메뉴 연동 팝오버 내용 없음: ${entry.group} → ${entry.item} (expected ${entry.expectVisible.join(", ")})`
        );
      } else {
        log(`  popover ok: ${entry.group} → ${entry.item} (${matched}/${entry.expectVisible.length} markers)`);
      }
      await closeFloatingUi(page);
    } catch (err) {
      failures.push(
        `메뉴 연동 팝오버 실패 (${entry.group}/${entry.item}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return failures;
}

async function assertDrawOptionsBar(page: Page): Promise<string[]> {
  const failures: string[] = [];
  try {
    await page.getByRole("button", { name: "펜 (B)" }).click({ timeout: 4000 });
    await page.waitForTimeout(400);
    const bar =
      (await page.locator('[data-studio-draw-options="true"]').isVisible().catch(() => false)) ||
      (await page.getByText(/안정화|브러시|크기|불투명/).first().isVisible().catch(() => false)) ||
      (await page.getByRole("slider").first().isVisible().catch(() => false));
    if (!bar) failures.push("펜 선택 후 드로잉 옵션 바 미노출");
    else log("  draw options bar ok");
  } catch (err) {
    failures.push(`드로잉 옵션 바: ${err instanceof Error ? err.message : String(err)}`);
  }
  return failures;
}

async function assertExportOptions(page: Page): Promise<string[]> {
  const failures: string[] = [];
  try {
    await page.getByRole("button", { name: "내보내기 옵션" }).click({ timeout: 4000 });
    await page.waitForTimeout(350);
    const ok =
      (await page.getByText(/배율|포맷|PNG|JPG|WebP|투명/).first().isVisible().catch(() => false)) ||
      (await page.locator("text=PNG").first().isVisible().catch(() => false));
    if (!ok) failures.push("내보내기 옵션 패널 미노출");
    else log("  export options ok");
    await page.keyboard.press("Escape");
  } catch (err) {
    failures.push(`내보내기 옵션: ${err instanceof Error ? err.message : String(err)}`);
  }
  return failures;
}

async function main() {
  const port = await findFreePort();
  const url = `http://127.0.0.1:${port}/studio`;
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
    log(`preview ready @ ${url}`);

    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await ctx.newPage();
    await page.addInitScript(({ key }) => {
      try {
        window.localStorage.setItem(key, "1");
        // Full density so every main-menu → toolbar popover host is mounted.
        window.localStorage.setItem(
          "toonspectrum-studio-ui-density:v1",
          JSON.stringify({ mode: "full" })
        );
      } catch {
        /* ignore */
      }
    }, { key: QUICKSTART_KEY });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(900);
    await dismissOverlays(page);

    await page.locator('[data-studio-editor="true"], [data-studio-app-shell="true"]').first().waitFor({
      state: "attached",
      timeout: 20000,
    });
    await page.locator('[data-studio-main-menu="true"]').waitFor({ state: "visible", timeout: 20000 });

    const failures = [
      ...(await assertChrome(page)),
      ...(await assertMainMenus(page)),
      ...(await assertRailTools(page)),
      ...(await assertMenuDrivenPopovers(page)),
      ...(await assertDrawOptionsBar(page)),
      ...(await assertExportOptions(page)),
    ];

    if (failures.length === 0) {
      log("PASS: all menus exposed (main menu + rail + popovers + draw options + export)");
      exitCode = 0;
    } else {
      log(`FAIL (${failures.length}):`);
      for (const f of failures) log(`  - ${f}`);
      const menubar = await page.locator('[data-studio-app-menubar="true"]').innerText().catch(() => "(none)");
      log(`menubar text:\n${menubar}`);
      exitCode = 1;
    }

    await browser.close();
  } catch (err) {
    console.error("[verify-menus] fatal:", err);
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
      }, 500).unref?.();
    }
  }
  process.exit(exitCode);
}

void main();
