/**
 * scripts/verify-studio-inapp-feature-sweep.mts
 * 인앱 브라우저에서 스튜디오를 실제로 **사용하면서** 런타임 에러를 잡는 게이트.
 *
 * `verify-studio-inapp-browser` 는 라우트를 한 번씩 열어 보고 크롬 모양을 잰다. 열고 나서
 * 아무것도 누르지 않으므로, 도구를 고르고 메뉴를 열고 획을 긋는 도중에만 나는 에러는 어떤
 * 게이트 앞에도 선 적이 없다. 사용자가 보고한 "사용중에 자주 발생"하는 런타임 에러가 정확히
 * 그 부류다.
 *
 * 이 게이트의 두 가지 설계 결정:
 *
 * 1. **귀속.** 에러마다 그때 진행 중이던 스텝 id 를 붙인다. 스무 가지를 한 세션에서 한 뒤
 *    나온 에러 목록은 "에러가 났다"만 말할 뿐 어느 어포던스가 깨졌는지는 말하지 않는다.
 * 2. **없는 어포던스는 실패가 아니다.** 프로파일마다 화면이 다르다 — 없으면 skipped 로 남기고
 *    계속 간다. 그래야 한 프로파일의 레이아웃 차이가 전체 스윕을 끊지 않는다.
 *
 * Run: pnpm verify:studio-inapp-feature-sweep   (dist/ 프로덕션 빌드 필요)
 * Env:
 *   TOONSPECTRUM_SWEEP_PROFILES=kakaotalk-android-360,...   기본: 전체
 *   TOONSPECTRUM_SWEEP_STEPS=tool-pen,menu-file,...          기본: 전체
 *   TOONSPECTRUM_SWEEP_BASE_URL=https://…                    프리뷰 대신 이 오리진을 검사
 *   TOONSPECTRUM_VERIFY_DIR                                  산출물 루트
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";


import {
  collectStudioInAppRuntimeErrors,
  installStudioInAppFirstRunState,
  installStudioInAppGuestBoundary,
  launchStudioInAppBrowser,
  STUDIO_INAPP_PROFILES,
  type StudioInAppProfile,
  type StudioInAppRuntimeError,
  type StudioInAppStep,
  type StudioInAppStepOutcome,
} from "./lib/studio-inapp-sweep-harness.mjs";
import {
  findFreePort,
  spawnVitePreview,
  stopChildProcess,
  waitForServer,
} from "./lib/studio-verify-preview-harness.mjs";

import type { Locator, Page } from "playwright";

const SCRATCH = process.env.TOONSPECTRUM_SWEEP_VERIFY_DIR
  ?? process.env.TOONSPECTRUM_VERIFY_DIR
  ?? join(tmpdir(), "toonspectrum-studio-inapp-sweep");

const REQUESTED_PROFILES = (process.env.TOONSPECTRUM_SWEEP_PROFILES ?? "")
  .split(",").map((value) => value.trim()).filter(Boolean);
const REQUESTED_STEPS = (process.env.TOONSPECTRUM_SWEEP_STEPS ?? "")
  .split(",").map((value) => value.trim()).filter(Boolean);

function log(message: string): void {
  console.log(`[verify-inapp-sweep] ${message}`);
}

/** Settle time after an interaction, long enough for a lazy chunk to mount and throw. */
const SETTLE_MS = 700;

async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(SETTLE_MS);
}

/** Dismiss whatever surface the previous step opened, so steps stay independent. */
async function dismissOverlays(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.waitForTimeout(120);
  }
  const close = page.getByRole("button", { name: /닫기$/u });
  const count = await close.count().catch(() => 0);
  for (let index = 0; index < Math.min(count, 3); index += 1) {
    const button = close.nth(index);
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 2_000, force: true }).catch(() => undefined);
      await page.waitForTimeout(120);
    }
  }
}

/** Draw a real stroke across the canvas with pointer events the editor accepts. */
async function drawStroke(page: Page, sample = 24): Promise<"ok" | { skipped: string }> {
  const viewport = page.locator('[data-studio-canvas-viewport="true"]').first();
  if (await viewport.count() === 0) return { skipped: "no canvas viewport" };
  const box = await viewport.boundingBox();
  if (!box) return { skipped: "canvas viewport has no box" };
  const startX = box.x + box.width * 0.2;
  const startY = box.y + box.height * 0.35;
  const endX = box.x + box.width * 0.8;
  const endY = box.y + box.height * 0.6;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let index = 1; index <= sample; index += 1) {
    const amount = index / sample;
    await page.mouse.move(
      startX + (endX - startX) * amount,
      startY + (endY - startY) * amount,
    );
  }
  await page.mouse.up();
  await settle(page);
  return "ok";
}

/** 도크 루트. 거의 모든 스텝이 여기서 출발한다. */
function dock(page: Page) {
  return page.locator('[data-studio-mobile-editing-dock="true"]');
}

/** 작업 메뉴(2행)를 펼친다. 이미 펼쳐져 있으면 그대로 둔다. */
async function expandWorkRow(page: Page): Promise<boolean> {
  const expanded = page.locator(
    '[data-studio-mobile-editing-dock="true"][data-studio-mobile-dock-expanded="true"]',
  );
  if (await expanded.count() > 0) return true;
  const toggle = dock(page).locator('[data-studio-mobile-workspace-toggle="true"]');
  if (await toggle.count() === 0) return false;
  await toggle.click({ timeout: 5_000, force: true }).catch(() => undefined);
  await settle(page);
  return await expanded.count() > 0;
}

/** 클릭 가능한 로케이터를 눌러 본다. 없으면 skipped — 프로파일마다 화면이 다르다. */
async function clickLocator(
  page: Page,
  locator: Locator,
  what: string,
): Promise<"ok" | { skipped: string }> {
  const count = await locator.count();
  if (count === 0) return { skipped: `${what} not present` };
  // 같은 셀렉터가 여러 셸(몰입형/윈도우드, 데스크톱 잔재)에 걸쳐 존재하고 그중 하나만 보인다.
  // 무조건 first() 를 누르면 "present but hidden" 으로 스텝이 깨지는데, 그건 제품 결함이 아니라
  // 이 프로파일에 그 어포던스가 없다는 뜻이다.
  for (let index = 0; index < Math.min(count, 6); index += 1) {
    const candidate = locator.nth(index);
    if (!(await candidate.isVisible().catch(() => false))) continue;
    await candidate.click({ timeout: 5_000, force: true });
    await settle(page);
    return "ok";
  }
  return { skipped: `${what} present but not visible on this profile` };
}

const STEPS: readonly StudioInAppStep[] = Object.freeze([
  {
    id: "boot-editor",
    label: "에디터 부팅",
    run: async (page) => {
      await dock(page).waitFor({ state: "visible", timeout: 25_000 });
      await settle(page);
      return "ok";
    },
  },

  // ── 도크 1행: 드로잉 도구 ────────────────────────────────────────────────
  {
    id: "tool-select",
    label: "선택 도구",
    run: (page) => clickLocator(
      page,
      dock(page).getByRole("button", { name: "선택", exact: true }),
      "select tool",
    ),
  },
  {
    id: "tool-pen",
    label: "펜 도구",
    run: (page) => clickLocator(
      page,
      dock(page).locator('button[data-studio-primary-action="draw"]'),
      "pen tool",
    ),
  },
  {
    id: "draw-stroke-pen",
    label: "펜으로 획 긋기",
    run: (page) => drawStroke(page),
  },
  {
    id: "tool-pixel",
    label: "픽셀 펜",
    run: (page) => clickLocator(
      page,
      dock(page).getByRole("button", { name: "픽셀", exact: true }),
      "pixel tool",
    ),
  },
  {
    id: "draw-stroke-pixel",
    label: "픽셀로 획 긋기",
    run: (page) => drawStroke(page, 12),
  },
  {
    id: "tool-eraser",
    label: "지우개",
    run: (page) => clickLocator(
      page,
      dock(page).locator('button[data-studio-mobile-tool="eraser"]'),
      "eraser tool",
    ),
  },
  {
    id: "draw-stroke-eraser",
    label: "지우개로 지우기",
    run: (page) => drawStroke(page, 12),
  },
  {
    id: "tool-fill",
    label: "채우기 도구",
    run: (page) => clickLocator(
      page,
      dock(page).getByRole("button", { name: "채우기", exact: true }),
      "fill tool",
    ),
  },
  {
    id: "tool-shape",
    label: "도형 도구",
    run: (page) => clickLocator(
      page,
      dock(page).getByRole("button", { name: "도형", exact: true }),
      "shape tool",
    ),
  },
  {
    id: "draw-shape",
    label: "도형 그리기",
    run: (page) => drawStroke(page, 6),
  },
  {
    id: "undo-redo-dock",
    label: "도크 되돌리기·다시실행",
    run: async (page) => {
      const undo = dock(page).locator('button[data-studio-primary-action="undo"]');
      const redo = dock(page).locator('button[data-studio-primary-action="redo"]');
      const undone = await clickLocator(page, undo, "undo");
      if (undone !== "ok") return undone;
      return clickLocator(page, redo, "redo");
    },
  },

  // ── 브러시 설정 시트 ─────────────────────────────────────────────────────
  {
    id: "brush-settings-open",
    label: "브러시 설정 시트",
    run: async (page) => {
      await clickLocator(
        page,
        dock(page).locator('button[data-studio-primary-action="draw"]'),
        "pen tool",
      );
      const opened = await clickLocator(
        page,
        dock(page).locator('button[aria-label="브러시 설정 (굵기·색·프리셋)"]'),
        "brush settings chip",
      );
      if (opened !== "ok") return opened;
      const sheet = page.locator("#studio-mobile-draw-settings");
      if (await sheet.count() === 0) return { skipped: "draw settings sheet did not mount" };
      return "ok";
    },
  },
  {
    id: "brush-size-and-opacity",
    label: "굵기·투명도 조절",
    run: async (page) => {
      const sheet = page.locator("#studio-mobile-draw-settings");
      if (await sheet.count() === 0) return { skipped: "sheet not open" };
      let touched = 0;
      for (const name of ["브러시 굵기 슬라이더", "브러시 투명도 슬라이더", "지우기 강도 슬라이더"]) {
        const slider = sheet.getByRole("slider", { name });
        if (await slider.count() === 0) continue;
        await slider.first().fill("40").catch(() => undefined);
        touched += 1;
        await page.waitForTimeout(200);
      }
      await settle(page);
      return touched > 0 ? "ok" : { skipped: "no sliders in the sheet" };
    },
  },
  {
    id: "brush-colour-swatch",
    label: "색상 선택",
    run: async (page) => {
      const sheet = page.locator("#studio-mobile-draw-settings");
      if (await sheet.count() === 0) return { skipped: "sheet not open" };
      return clickLocator(page, sheet.getByRole("button", { name: /^색상 #/u }), "colour swatch");
    },
  },
  {
    id: "brush-draw-mode-group",
    label: "그리기 모드 전환",
    run: async (page) => {
      const sheet = page.locator("#studio-mobile-draw-settings");
      if (await sheet.count() === 0) return { skipped: "sheet not open" };
      const group = sheet.getByRole("group", { name: "그리기 모드" });
      if (await group.count() === 0) return { skipped: "no draw mode group" };
      const buttons = group.getByRole("button");
      const count = await buttons.count();
      for (let index = 0; index < Math.min(count, 4); index += 1) {
        await buttons.nth(index).click({ timeout: 3_000, force: true }).catch(() => undefined);
        await page.waitForTimeout(250);
      }
      await settle(page);
      return "ok";
    },
  },
  {
    id: "brush-quick-tray",
    label: "빠른 브러시 트레이",
    run: async (page) => {
      const tray = page.locator('[data-studio-brush-tray="true"]');
      if (await tray.count() === 0) return { skipped: "no brush tray" };
      return clickLocator(page, tray.locator('[role="option"]'), "brush tray option");
    },
  },
  {
    id: "brush-library-open",
    label: "브러시 전체 라이브러리",
    run: async (page) => {
      const opened = await clickLocator(
        page,
        page.locator('[data-studio-open-brush-library="true"]'),
        "brush library trigger",
      );
      if (opened !== "ok") return opened;
      const library = page.locator('[data-studio-brush-library="true"]');
      if (await library.count() === 0) return { skipped: "library did not mount" };
      return "ok";
    },
  },
  {
    id: "brush-library-search-and-pick",
    label: "브러시 검색·선택",
    run: async (page) => {
      const library = page.locator('[data-studio-brush-library="true"]').first();
      if (await library.count() === 0) return { skipped: "library not open" };
      const search = library.getByRole("searchbox");
      if (await search.count() > 0) {
        await search.first().fill("펜").catch(() => undefined);
        await settle(page);
      }
      return clickLocator(
        page,
        library.getByRole("button", { name: /선택$/u }),
        "selectable brush",
      );
    },
  },

  // ── 작업 메뉴(2행) 서피스 ────────────────────────────────────────────────
  {
    id: "work-row-expand",
    label: "작업 메뉴 펼치기",
    run: async (page) => (await expandWorkRow(page) ? "ok" : { skipped: "no workspace toggle" }),
  },
  {
    id: "pages-sheet",
    label: "페이지 시트 · 추가·전환",
    run: async (page) => {
      await expandWorkRow(page);
      const opened = await clickLocator(
        page,
        page.locator('button[data-studio-primary-action="pages"]'),
        "pages trigger",
      );
      if (opened !== "ok") return opened;
      const sheet = page.locator("#studio-mobile-pages-sheet");
      if (await sheet.count() === 0) return { skipped: "pages sheet did not mount" };
      await clickLocator(page, sheet.locator('[data-testid="studio-add-page"]'), "add page");
      await clickLocator(page, sheet.getByRole("button", { name: /^2페이지 선택$/u }), "page 2");
      return "ok";
    },
  },
  {
    id: "inspector-sheet-tabs",
    label: "작업 패널 · 세 탭",
    run: async (page) => {
      await expandWorkRow(page);
      const opened = await clickLocator(
        page,
        page.getByRole("button", { name: "작업 패널", exact: true }),
        "work panel trigger",
      );
      if (opened !== "ok") return opened;
      const sheet = page.locator('[data-studio-sheet-id="props"]');
      if (await sheet.count() === 0) return { skipped: "inspector sheet did not mount" };
      for (const tab of ["properties", "layers", "document"]) {
        const target = sheet.locator(`[data-studio-inspector-primary-tab="${tab}"]`);
        if (await target.count() === 0) continue;
        await target.first().click({ timeout: 3_000, force: true }).catch(() => undefined);
        await page.waitForTimeout(400);
      }
      await settle(page);
      return "ok";
    },
  },
  {
    id: "layer-navigator",
    label: "레이어 내비게이터",
    run: async (page) => {
      const navigator = page.locator('[aria-label="전문 레이어 내비게이터"]');
      if (await navigator.count() === 0) return { skipped: "layer navigator not open" };
      const rows = navigator.locator('[data-studio-layer-row="true"]');
      if (await rows.count() === 0) return { skipped: "no layer rows" };
      await rows.first().click({ timeout: 3_000, force: true }).catch(() => undefined);
      await page.waitForTimeout(300);
      for (const action of ["visibility", "lock", "menu"]) {
        const button = rows.first().locator(`[data-studio-layer-row-action="${action}"]`);
        if (await button.count() === 0) continue;
        await button.first().click({ timeout: 3_000, force: true }).catch(() => undefined);
        await page.waitForTimeout(300);
        await page.keyboard.press("Escape").catch(() => undefined);
      }
      await settle(page);
      return "ok";
    },
  },
  {
    id: "command-search",
    label: "기능·설정 찾기",
    run: async (page) => {
      await expandWorkRow(page);
      const opened = await clickLocator(
        page,
        page.locator('[data-studio-mobile-search-trigger="true"]'),
        "search trigger",
      );
      if (opened !== "ok") return opened;
      const combobox = page.locator('input[role="combobox"]');
      if (await combobox.count() === 0) return { skipped: "search dialog did not mount" };
      await combobox.first().fill("레이어");
      await settle(page);
      await page.keyboard.press("ArrowDown").catch(() => undefined);
      await page.waitForTimeout(250);
      await page.keyboard.press("Enter").catch(() => undefined);
      await settle(page);
      return "ok";
    },
  },
  {
    id: "filter-dialog",
    label: "필터 다이얼로그",
    run: async (page) => {
      await expandWorkRow(page);
      const select = page.locator('[data-studio-mobile-filter-select="workspace"] select');
      if (await select.count() === 0) return { skipped: "no workspace filter select" };
      await select.first().selectOption({ index: 1 }).catch(() => undefined);
      await settle(page);
      const dialog = page.locator('[aria-labelledby="studio-filter-dialog-title"]');
      if (await dialog.count() === 0) return { skipped: "filter dialog did not mount" };
      const range = dialog.locator('input[type="range"]:visible');
      if (await range.count() > 0) {
        await range.first().fill("30").catch(() => undefined);
        await settle(page);
      }
      await clickLocator(page, dialog.getByRole("button", { name: "원본 비교" }), "compare");
      return "ok";
    },
  },
  {
    id: "quick-actions-wheel",
    label: "퀵 액션 휠",
    run: async (page) => {
      await expandWorkRow(page);
      const opened = await clickLocator(
        page,
        page.locator('[data-studio-mobile-quick-actions-slot="right"] button'),
        "quick actions slot",
      );
      if (opened !== "ok") return opened;
      const menu = page.getByRole("menu", { name: "캔버스 퀵 액션" });
      if (await menu.count() === 0) return { skipped: "wheel did not open" };
      await clickLocator(page, menu.getByRole("menuitem").first(), "wheel slot");
      return "ok";
    },
  },
  {
    id: "canvas-comments",
    label: "캔버스 위치 댓글",
    run: async (page) => {
      await expandWorkRow(page);
      const armed = await clickLocator(
        page,
        page.locator('[data-studio-mobile-comment-trigger="true"]'),
        "comment trigger",
      );
      if (armed !== "ok") return armed;
      const viewport = page.locator('[data-studio-canvas-viewport="true"]').first();
      const box = await viewport.boundingBox();
      if (!box) return { skipped: "no canvas box" };
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.4);
      await settle(page);
      return "ok";
    },
  },
  {
    id: "quick-start-panel",
    label: "빠른 시작 패널",
    run: async (page) => {
      await expandWorkRow(page);
      return clickLocator(
        page,
        page.getByRole("button", { name: "빠른 시작 · 새 작업 열기" }),
        "quick start",
      );
    },
  },
  {
    id: "colour-vision-review",
    label: "색각·명암 검수",
    run: async (page) => {
      await expandWorkRow(page);
      return clickLocator(page, page.getByRole("button", { name: /색각/u }), "colour vision");
    },
  },
  {
    id: "dock-zoom-controls",
    label: "도크 확대·축소·맞춤",
    run: async (page) => {
      await expandWorkRow(page);
      let touched = 0;
      for (const name of ["축소", "화면 폭에 맞춤", "확대"]) {
        const result = await clickLocator(
          page,
          page.getByRole("button", { name, exact: true }),
          name,
        );
        if (result === "ok") touched += 1;
      }
      return touched > 0 ? "ok" : { skipped: "no dock zoom controls" };
    },
  },

  // ── 몰입형 상단 크롬 ─────────────────────────────────────────────────────
  {
    id: "top-export-menu",
    label: "내보내기 옵션",
    run: (page) => clickLocator(
      page,
      page.getByRole("button", { name: "내보내기 옵션" }),
      "export options",
    ),
  },
  {
    id: "top-project-actions",
    label: "프로젝트 작업",
    run: (page) => clickLocator(
      page,
      page.getByRole("button", { name: "프로젝트 작업" }),
      "project actions",
    ),
  },
  {
    id: "top-save-draft",
    label: "초안 저장",
    run: (page) => clickLocator(
      page,
      page.getByRole("button", { name: /^(초안 저장|공동 저장)$/u }),
      "save draft",
    ),
  },
  {
    id: "toggle-immersive",
    label: "전체 화면 전환",
    run: async (page) => {
      const toggled = await clickLocator(
        page,
        page.locator("[data-studio-mobile-app-mode]"),
        "immersive toggle",
      );
      if (toggled !== "ok") return toggled;
      await clickLocator(page, page.locator("[data-studio-mobile-app-mode]"), "immersive toggle");
      return "ok";
    },
  },
  {
    id: "windowed-tool-belt",
    label: "도구 벨트(윈도우드)",
    run: async (page) => {
      const belt = page.locator('[data-studio-tool-belt="true"]');
      if (await belt.count() === 0) return { skipped: "tool belt hidden in this shell" };
      const buttons = belt.getByRole("button");
      const count = await buttons.count();
      for (let index = 0; index < Math.min(count, 8); index += 1) {
        const button = buttons.nth(index);
        if (!(await button.isVisible().catch(() => false))) continue;
        await button.click({ timeout: 3_000, force: true }).catch(() => undefined);
        await page.waitForTimeout(400);
        await page.keyboard.press("Escape").catch(() => undefined);
        await page.waitForTimeout(150);
      }
      await settle(page);
      return "ok";
    },
  },

  // ── 라우팅된 에디터 서피스 ───────────────────────────────────────────────
  ...(["/studio/comic", "/studio/animation", "/studio/brushes", "/studio/bg3d", "/studio/poser", "/studio/character"] as const)
    .map((path) => ({
      id: `route-${path.split("/").pop()}`,
      label: `${path} 라우트`,
      run: async (page: Page) => {
        await page.goto(new URL(path, page.url()).toString(), {
          waitUntil: "domcontentloaded",
          timeout: 25_000,
        });
        await dock(page).waitFor({ state: "visible", timeout: 25_000 }).catch(() => undefined);
        await settle(page);
        await settle(page);
        return "ok" as const;
      },
    })),
  ...(["/studio/publish", "/studio/lift3d", "/studio/projects", "/studio/nope"] as const)
    .map((path) => ({
      id: `route-${path.split("/").pop()}`,
      label: `${path} 라우트`,
      run: async (page: Page) => {
        await page.goto(new URL(path, page.url()).toString(), {
          waitUntil: "domcontentloaded",
          timeout: 25_000,
        });
        await page.locator("h1").first().waitFor({ state: "visible", timeout: 25_000 })
          .catch(() => undefined);
        await settle(page);
        return "ok" as const;
      },
    })),
]);

interface ProfileReport {
  readonly profile: string;
  readonly steps: readonly StudioInAppStepOutcome[];
  readonly errors: readonly StudioInAppRuntimeError[];
}

async function sweepProfile(
  profile: StudioInAppProfile,
  baseUrl: string,
  browser: Awaited<ReturnType<typeof launchStudioInAppBrowser>>,
  steps: readonly StudioInAppStep[],
): Promise<ProfileReport> {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    userAgent: profile.userAgent,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ko-KR",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const collector = await collectStudioInAppRuntimeErrors(page);
  await installStudioInAppFirstRunState(page);
  // 로컬 프리뷰에는 Nest API 가 없어 게스트 경계를 세워 준다. 실제 배포본에는 API 가 있으므로
  // 가로채면 오히려 제품과 다른 경로를 재게 된다.
  if (!process.env.TOONSPECTRUM_SWEEP_BASE_URL) {
    await installStudioInAppGuestBoundary(page);
  }

  const outcomes: StudioInAppStepOutcome[] = [];
  await page.goto(`${baseUrl}/studio`, { waitUntil: "domcontentloaded", timeout: 30_000 });

  for (const step of steps) {
    collector.setStep(step.id);
    let status: StudioInAppStepOutcome["status"] = "ok";
    let detail: string | null = null;
    try {
      const result = await step.run(page);
      if (result !== "ok") {
        status = "skipped";
        detail = typeof result === "string" ? result : result.skipped;
      }
    } catch (error) {
      status = "failed";
      detail = error instanceof Error ? error.message.slice(0, 300) : String(error);
    }
    await dismissOverlays(page).catch(() => undefined);
    const stepErrors = collector.drain();
    const shot = join(SCRATCH, `${profile.id}-${step.id}.png`);
    await page.screenshot({ path: shot, fullPage: false }).catch(() => undefined);
    outcomes.push({ id: step.id, label: step.label, status, detail, errors: stepErrors, shot });
    const errorNote = stepErrors.length > 0 ? ` errors=${stepErrors.length}` : "";
    const detailNote = detail ? ` (${detail})` : "";
    log(`${profile.id}/${step.id}: ${status}${errorNote}${detailNote}`);
    for (const error of stepErrors) {
      log(`  ${error.channel}: ${error.text}`);
    }
  }

  await context.close();
  return { profile: profile.id, steps: outcomes, errors: collector.errors };
}

async function main(): Promise<void> {
  mkdirSync(SCRATCH, { recursive: true });
  const profiles = REQUESTED_PROFILES.length > 0
    ? STUDIO_INAPP_PROFILES.filter((entry) => REQUESTED_PROFILES.includes(entry.id))
    : STUDIO_INAPP_PROFILES;
  const steps = REQUESTED_STEPS.length > 0
    ? STEPS.filter((step) => REQUESTED_STEPS.includes(step.id))
    : STEPS;
  if (profiles.length === 0) throw new Error("no matching in-app profile");
  if (steps.length === 0) throw new Error("no matching step");

  // 운영 반영 뒤 같은 스윕을 실제 배포본에 그대로 겨눌 수 있어야 한다. BASE_URL 이 있으면
  // 프리뷰를 띄우지 않고 그 오리진을 그대로 쓴다.
  const externalBase = process.env.TOONSPECTRUM_SWEEP_BASE_URL?.trim();
  const port = externalBase ? 0 : await findFreePort();
  const preview = externalBase ? null : spawnVitePreview({ port, runner: "pnpm-exec" });
  const baseUrl = externalBase ?? `http://127.0.0.1:${port}`;
  log(`target ${baseUrl}${externalBase ? " (external)" : " (local preview)"}`);
  const browser = await launchStudioInAppBrowser();
  const reports: ProfileReport[] = [];
  try {
    await waitForServer(`${baseUrl}/studio`);
    for (const profile of profiles) {
      reports.push(await sweepProfile(profile, baseUrl, browser, steps));
    }
  } finally {
    await browser.close().catch(() => undefined);
    if (preview) await stopChildProcess(preview);
  }

  const allErrors = reports.flatMap((report) =>
    report.errors.map((error) => ({ ...error, profile: report.profile })));
  const reportPath = join(SCRATCH, "report.json");
  writeFileSync(
    reportPath,
    `${JSON.stringify({
      kind: "toonspectrum-studio-inapp-feature-sweep-v1",
      profiles: profiles.map((entry) => entry.id),
      steps: steps.map((step) => step.id),
      reports,
      errorCount: allErrors.length,
    }, null, 2)}\n`,
  );

  log(`report ${reportPath}`);
  const failedSteps = reports.flatMap((report) =>
    report.steps.filter((step) => step.status === "failed")
      .map((step) => `${report.profile}/${step.id}: ${step.detail}`));
  for (const failure of failedSteps) log(`STEP FAILED ${failure}`);

  const byStep = new Map<string, number>();
  for (const error of allErrors) {
    byStep.set(error.step, (byStep.get(error.step) ?? 0) + 1);
  }
  for (const [step, count] of [...byStep.entries()].sort((a, b) => b[1] - a[1])) {
    log(`errors by step: ${step} → ${count}`);
  }

  if (allErrors.length > 0 || failedSteps.length > 0) {
    log(`RESULT: FAIL (${allErrors.length} runtime error(s), ${failedSteps.length} broken step(s))`);
    process.exitCode = 1;
    return;
  }
  log(`RESULT: OK (${reports.length} profile(s) × ${steps.length} step(s), 0 runtime errors)`);
}

await main();
