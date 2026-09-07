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
 * 2. **필수 동선은 실제로 통과해야 한다.** 각 스텝이 필요한 도구·패널 상태로 진입하며,
 *    필수 UI가 없거나 누를 수 없으면 실패한다. 성공·제외·실패 개수를 별도로 보고한다.
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

import { studioAutosaveKey } from "../apps/web/src/domains/creator/studio-autosave";

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
import { readDurableStudioAutosaveDocument } from "./lib/studio-verify-durable-autosave.mjs";
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
      await button.click({ timeout: 2_000 }).catch(() => undefined);
      await page.waitForTimeout(120);
    }
  }
}

/** Draw a real stroke across the canvas with pointer events the editor accepts. */
async function drawStroke(page: Page, sample = 24): Promise<"ok" | { skipped: string }> {
  const viewport = page.locator('[data-studio-canvas-viewport="true"]').first();
  if (await viewport.count() === 0) throw new Error("required canvas viewport is missing");
  const box = await viewport.boundingBox();
  if (!box) throw new Error("required canvas viewport has no visible box");
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

async function openDrawSettings(page: Page): Promise<Locator> {
  const pen = dock(page).locator('button[data-studio-primary-action="draw"]');
  if (await pen.getAttribute("aria-pressed") !== "true") await pen.click();
  const settings = dock(page).getByRole("button", { name: "브러시 설정 (굵기·색·프리셋)", exact: true });
  if (await settings.getAttribute("aria-expanded") !== "true") await settings.click();
  const sheet = page.locator("#studio-mobile-draw-settings");
  await sheet.getByRole("slider", { name: "브러시 굵기 슬라이더", exact: true }).waitFor();
  return sheet;
}

async function openBrushLibrary(page: Page): Promise<Locator> {
  const sheet = await openDrawSettings(page);
  await sheet.locator('[data-studio-open-brush-library="true"]').click();
  const library = page.locator('[data-studio-brush-library="true"]').first();
  await library.waitFor();
  return library;
}

/** 작업 메뉴(2행)를 펼친다. 이미 펼쳐져 있으면 그대로 둔다. */
async function expandWorkRow(page: Page): Promise<boolean> {
  const expanded = page.locator(
    '[data-studio-mobile-editing-dock="true"][data-studio-mobile-dock-expanded="true"]',
  );
  if (await expanded.count() > 0) return true;
  const toggle = dock(page).locator('[data-studio-mobile-workspace-toggle="true"]');
  await toggle.click({ timeout: 5_000 });
  await expanded.waitFor({ state: "visible" });
  await settle(page);
  return await expanded.count() > 0;
}

/** Click the visible instance of a required action without bypassing browser hit testing. */
async function clickLocator(
  page: Page,
  locator: Locator,
  what: string,
): Promise<"ok" | { skipped: string }> {
  const count = await locator.count();
  if (count === 0) throw new Error(`${what}: required action is not present`);
  // 같은 셀렉터가 여러 셸(몰입형/윈도우드, 데스크톱 잔재)에 걸쳐 존재하고 그중 하나만 보인다.
  // 현재 화면에서 노출된 인스턴스를 찾아 누르되, 모두 숨겨져 있으면 실패한다.
  for (let index = 0; index < Math.min(count, 6); index += 1) {
    const candidate = locator.nth(index);
    if (!(await candidate.isVisible().catch(() => false))) continue;
    await candidate.click({ timeout: 5_000 });
    await settle(page);
    return "ok";
  }
  throw new Error(`${what}: required action is present but not visible on this profile`);
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
      await sheet.waitFor({ state: "visible" });
      return "ok";
    },
  },
  {
    id: "brush-size-and-opacity",
    label: "굵기·투명도 조절",
    run: async (page) => {
      const sheet = await openDrawSettings(page);
      for (const name of ["브러시 굵기", "브러시 투명도"]) {
        const number = sheet.getByRole("spinbutton", { name: `${name} 숫자`, exact: true });
        const slider = sheet.getByRole("slider", { name: `${name} 슬라이더`, exact: true });
        await number.fill("40");
        if (await slider.inputValue() !== "40") throw new Error(`${name}: numeric entry did not update the slider`);
        await slider.focus();
        await slider.press("ArrowRight");
        if (await number.inputValue() !== "41") throw new Error(`${name}: slider keyboard input did not update the value`);
      }
      await sheet.getByRole("spinbutton", { name: "브러시 굵기 숫자", exact: true }).fill("8");
      await sheet.getByRole("spinbutton", { name: "브러시 투명도 숫자", exact: true }).fill("100");
      await settle(page);
      return "ok";
    },
  },
  {
    id: "brush-colour-swatch",
    label: "색상 선택",
    run: async (page) => {
      const sheet = await openDrawSettings(page);
      const swatches = sheet.getByRole("button", { name: /^색상 #/u });
      if (await swatches.count() === 0) throw new Error("brush colour swatches are missing");
      for (const swatch of await swatches.all()) {
        await swatch.click();
        if (await swatch.getAttribute("aria-pressed") !== "true") throw new Error("selected colour was not applied");
      }
      await swatches.first().click();
      return "ok";
    },
  },
  {
    id: "brush-draw-mode-group",
    label: "그리기 모드 전환",
    run: async (page) => {
      const sheet = await openDrawSettings(page);
      const group = sheet.getByRole("group", { name: "그리기 모드" });
      const buttons = group.getByRole("button");
      const count = await buttons.count();
      if (count !== 4) throw new Error(`expected four draw modes, found ${count}`);
      for (let index = 0; index < count; index += 1) {
        await buttons.nth(index).click();
        if (await buttons.nth(index).getAttribute("aria-pressed") !== "true") throw new Error("draw mode did not activate");
      }
      await group.getByRole("button", { name: "펜", exact: true }).click();
      await settle(page);
      return "ok";
    },
  },
  {
    id: "brush-quick-tray",
    label: "빠른 브러시 트레이",
    run: async (page) => {
      const sheet = await openDrawSettings(page);
      const tray = sheet.locator('[data-studio-brush-tray="true"]');
      return clickLocator(page, tray.locator('[role="option"]'), "brush tray option");
    },
  },
  {
    id: "brush-library-open",
    label: "브러시 전체 라이브러리",
    run: async (page) => {
      await openBrushLibrary(page);
      return "ok";
    },
  },
  {
    id: "brush-library-search-and-pick",
    label: "브러시 검색·선택",
    run: async (page) => {
      const library = await openBrushLibrary(page);
      const search = library.getByRole("searchbox");
      await search.fill("펜");
      if (await search.inputValue() !== "펜") throw new Error("brush library search did not retain the query");
      await settle(page);
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
      await sheet.waitFor({ state: "visible" });
      await sheet.locator('[data-testid="studio-add-page"]').click();
      const second = sheet.getByRole("button", { name: /^2페이지 선택$/u });
      await second.click();
      if (await second.getAttribute("aria-pressed") !== "true") throw new Error("new page was not selected");
      // Restore the page containing this sweep's ink so the next layer actions have a real target.
      await sheet.getByRole("button", { name: /^1페이지 선택$/u }).click();
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
      await sheet.waitFor({ state: "visible" });
      for (const tab of ["properties", "layers", "document"]) {
        const target = sheet.locator(`[data-studio-inspector-primary-tab="${tab}"]`);
        await target.click();
        if (await target.getAttribute("aria-selected") !== "true") throw new Error(`inspector ${tab} tab did not become selected`);
        const panelId = await target.getAttribute("aria-controls");
        if (!panelId) throw new Error(`inspector ${tab} tab has no associated panel`);
        await page.locator(`[id="${panelId}"]`).waitFor({ state: "visible" });
      }
      await settle(page);
      return "ok";
    },
  },
  {
    id: "layer-navigator",
    label: "레이어 내비게이터",
    run: async (page) => {
      await expandWorkRow(page);
      await page.getByRole("button", { name: "작업 패널", exact: true }).click();
      const sheet = page.locator('[data-studio-sheet-id="props"]');
      const height = sheet.getByRole("slider", { name: /^작업 패널 크기 조절/u });
      await height.press("ArrowUp");
      await height.press("ArrowUp");
      if (await height.getAttribute("aria-valuenow") !== "2") throw new Error("inspector did not expand to full height");
      await settle(page);
      await sheet.locator('[data-studio-inspector-primary-tab="layers"]').click();
      const navigator = page.locator('[aria-label="전문 레이어 내비게이터"]');
      await navigator.waitFor();
      const rows = navigator.locator('[data-studio-layer-row="true"]');
      if (await rows.count() === 0) throw new Error("layer navigator has no rows after drawing");
      await rows.first().click();
      await page.waitForTimeout(300);
      for (const action of ["visibility", "lock"]) {
        const button = rows.first().locator(`[data-studio-layer-row-action="${action}"]`);
        const originalLabel = await button.getAttribute("aria-label");
        await button.click();
        await settle(page);
        if (await button.getAttribute("aria-label") === originalLabel) throw new Error(`layer ${action} did not change`);
        await button.click();
        await settle(page);
        if (await button.getAttribute("aria-label") !== originalLabel) throw new Error(`layer ${action} did not restore`);
      }
      await rows.first().locator('[data-studio-layer-row-action="menu"]').click();
      await navigator.getByRole("dialog").waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      await settle(page);
      if (!await sheet.isVisible()) throw new Error("Escape closed the inspector with its layer menu");
      const comps = sheet.getByTestId("studio-layer-comps-panel");
      const idleComps = sheet.locator('[data-testid="studio-layer-comps-panel"][aria-busy="false"]:enabled');
      await idleComps.waitFor({ state: "visible" });
      const visibility = rows.first().locator('[data-studio-layer-row-action="visibility"]');
      const capturedVisibility = await visibility.getAttribute("aria-label");
      await comps.getByRole("button", { name: "새 콤프", exact: true }).click();
      await comps.getByPlaceholder("콤프 이름 (예: 대사 없는 클린본)").fill("PR831 레이어 상태");
      await comps.getByRole("button", { name: "저장", exact: true }).click();
      // Capture and delivery are asynchronous; wait for both before another document edit.
      await comps.getByRole("button", { name: /^PR831 레이어 상태/u }).waitFor({ state: "visible" });
      await idleComps.waitFor({ state: "visible" });
      await visibility.click();
      await settle(page);
      await comps.getByRole("button", { name: "적용", exact: true }).click();
      await idleComps.waitFor({ state: "visible" });
      await settle(page);
      if (await visibility.getAttribute("aria-label") !== capturedVisibility) throw new Error("layer comp did not restore captured visibility");
      await comps.getByTitle("이름 수정").click();
      await comps.getByRole("textbox", { name: "PR831 레이어 상태 이름 수정" }).fill("PR831 복원 상태");
      await comps.getByRole("button", { name: "콤프 이름 저장" }).click();
      const compButton = comps.getByRole("button", { name: /^PR831 복원 상태/u });
      await compButton.waitFor({ state: "visible" });
      await idleComps.waitFor({ state: "visible" });
      let persisted = false;
      for (let attempt = 0; attempt < 32; attempt += 1) {
        const document = await readDurableStudioAutosaveDocument(page, studioAutosaveKey({}));
        if (document?.raw.includes('"name":"PR831 복원 상태"')) { persisted = true; break; }
        await page.waitForTimeout(250);
      }
      if (!persisted) throw new Error("renamed layer comp was not saved to the durable OPFS document");
      await sheet.focus();
      await page.keyboard.press("Escape");
      await sheet.waitFor({ state: "hidden" });
      await expandWorkRow(page);
      await page.getByRole("button", { name: "작업 패널", exact: true }).click();
      await sheet.locator('[data-studio-inspector-primary-tab="layers"]').click();
      await compButton.waitFor({ state: "visible" });
      await idleComps.waitFor({ state: "visible" });
      await comps.getByTitle("콤프 삭제").click();
      await compButton.waitFor({ state: "detached" });
      await idleComps.waitFor({ state: "visible" });
      if (await compButton.count() !== 0) throw new Error("layer comp was not deleted");
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
      await combobox.waitFor({ state: "visible", timeout: 15_000 });
      await combobox.first().fill("레이어");
      await settle(page);
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(250);
      await page.keyboard.press("Enter");
      await combobox.waitFor({ state: "hidden", timeout: 5_000 });
      return "ok";
    },
  },
  {
    id: "filter-dialog",
    label: "필터 다이얼로그",
    run: async (page) => {
      await expandWorkRow(page);
      const filter = page.locator('[data-studio-mobile-filter-select="workspace"]');
      const select = filter.locator("select");
      if (await filter.getAttribute("aria-disabled") === "true") {
        const reason = await filter.getAttribute("title");
        if (!reason?.includes("지우개로 지운 자국이 남은 그리기 레이어")) {
          throw new Error(`unexpected workspace filter restriction: ${reason}`);
        }
        log("filter precondition: prior eraser marks correctly expose the page-composite restriction");
      }
      // Earlier steps deliberately leave eraser commands on their page. A fresh page gives
      // this filter case its own supported raster target through the same UI a user follows.
      await dock(page).locator('button[data-studio-primary-action="pages"]').click();
      const pages = page.locator("#studio-mobile-pages-sheet");
      await pages.locator('[data-testid="studio-add-page"]').click();
      const newPage = pages.getByRole("button", { name: /^\d+페이지 선택$/u }).last();
      await newPage.click();
      if (await newPage.getAttribute("aria-pressed") !== "true") throw new Error("filter page was not selected");
      await page.keyboard.press("Escape");
      await page.locator('#studio-mobile-pages-sheet[aria-hidden="true"][inert]').waitFor({ state: "attached" });
      const settings = await openDrawSettings(page);
      await settings.getByRole("group", { name: "그리기 모드" }).getByRole("button", { name: "펜", exact: true }).click();
      await settings.getByRole("button", { name: "브러시 설정 닫기", exact: true }).click();
      await page.locator('#studio-mobile-draw-settings[aria-hidden="true"][inert]').waitFor({ state: "attached" });
      await drawStroke(page);
      await expandWorkRow(page);
      await select.waitFor({ state: "visible" });
      await select.selectOption({ index: 1 });
      await settle(page);
      const dialog = page.locator('[aria-labelledby="studio-filter-dialog-title"]');
      await dialog.waitFor({ state: "visible" });
      const range = dialog.locator('input[type="range"]:visible').first();
      await range.waitFor({ state: "visible" });
      const initialValue = await range.inputValue();
      await range.focus();
      await range.press("ArrowRight");
      if (await range.inputValue() === initialValue) throw new Error("filter slider did not change");
      const compare = dialog.getByRole("button", { name: "원본 비교", exact: true });
      await compare.focus();
      await page.keyboard.down("Space");
      if (await compare.getAttribute("aria-pressed") !== "true") throw new Error("held filter comparison did not show the original");
      await page.keyboard.up("Space");
      if (await compare.getAttribute("aria-pressed") !== "false") throw new Error("released filter comparison did not restore the preview");
      await dialog.getByRole("button", { name: "취소", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
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
      const items = menu.getByRole("menuitem");
      if (await items.count() !== 6) throw new Error("quick action wheel did not expose all six slots");
      for (const item of await items.all()) await item.waitFor({ state: "visible" });
      await clickLocator(page, items.first(), "wheel slot");
      await menu.waitFor({ state: "detached" });
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
      if (!box) throw new Error("canvas comment target has no visible box");
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
      page.getByRole("button", { name: "프로젝트 센터", exact: true }),
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
      const immersive = page.locator("[data-studio-mobile-app-mode]");
      const restoreImmersive = await immersive.getAttribute("aria-pressed") === "true";
      if (restoreImmersive) await immersive.click();
      await belt.waitFor({ state: "visible" });
      try {
        for (const name of ["선택", "펜", "지우개", "펜"]) {
          const tool = belt.getByRole("button", { name, exact: true });
          await tool.click();
          if (await tool.getAttribute("aria-pressed") !== "true") throw new Error(`windowed ${name} tool did not activate`);
        }
        const history = belt.getByRole("button", { name: "작업 내역", exact: true });
        await history.click();
        if (await history.getAttribute("aria-pressed") !== "true") throw new Error("windowed history did not open");
        await history.click();
        if (await history.getAttribute("aria-pressed") !== "false") throw new Error("windowed history did not close");
        const assets = belt.getByRole("button", { name: "템플릿·에셋", exact: true });
        await assets.click();
        if (await assets.getAttribute("aria-expanded") !== "true") throw new Error("windowed asset menu did not expand");
        await page.locator('[data-studio-tool-popover="asset-group"]').waitFor({ state: "visible" });
        await page.keyboard.press("Escape");
        if (await assets.getAttribute("aria-expanded") !== "false") throw new Error("windowed asset menu did not close");
      } finally {
        await dismissOverlays(page);
        if (restoreImmersive) await immersive.click();
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
        await dock(page).waitFor({ state: "visible", timeout: 25_000 });
        if (new URL(page.url()).pathname !== path) throw new Error(`editor route ${path} navigated to ${page.url()}`);
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
        await page.locator("h1").first().waitFor({ state: "visible", timeout: 25_000 });
        if (new URL(page.url()).pathname !== path) throw new Error(`Studio route ${path} navigated to ${page.url()}`);
        await settle(page);
        return "ok" as const;
      },
    })),
]);

interface ProfileReport {
  readonly profile: string;
  readonly steps: readonly StudioInAppStepOutcome[];
  readonly errors: readonly StudioInAppRuntimeError[];
  readonly scriptRequests: readonly {
    step: string;
    url: string;
    startedAt: number;
    status?: number;
    contentType?: string;
    fromServiceWorker?: boolean;
    failure?: string;
    canceled?: boolean;
    blockedReason?: string;
    corsError?: string;
  }[];
  readonly navigations: readonly { step: string; url: string; at: number }[];
  readonly routeState: readonly {
    step: string;
    url: string;
    isolated: boolean;
    chunkReloadAttempted: boolean;
    adapterReloadAttempted: boolean;
  }[];
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
  let currentStep = "boot";
  const scriptRequests: Array<ProfileReport["scriptRequests"][number]> = [];
  const navigations: Array<ProfileReport["navigations"][number]> = [];
  const routeState: Array<ProfileReport["routeState"][number]> = [];
  const session = await context.newCDPSession(page);
  const pendingScripts = new Map<string, { url: string; startedAt: number }>();
  session.on("Network.requestWillBeSent", (event) => {
    if (event.type === "Script") pendingScripts.set(event.requestId, {
      url: event.request.url,
      startedAt: event.wallTime * 1000,
    });
  });
  session.on("Network.loadingFinished", ({ requestId }) => pendingScripts.delete(requestId));
  session.on("Network.loadingFailed", (event) => {
    const request = pendingScripts.get(event.requestId);
    pendingScripts.delete(event.requestId);
    if (!request) return;
    scriptRequests.push({
      step: currentStep,
      ...request,
      failure: event.errorText,
      canceled: event.canceled,
      blockedReason: event.blockedReason,
      corsError: event.corsErrorStatus?.corsError,
    });
  });
  await session.send("Network.enable");
  session.on("ServiceWorker.workerErrorReported", ({ errorMessage }) => {
    collector.errors.push({
      step: currentStep,
      channel: "workererror",
      text: `${errorMessage.errorMessage} @ ${errorMessage.sourceURL}:${errorMessage.lineNumber}:${errorMessage.columnNumber}`,
      stack: null,
    });
  });
  await session.send("ServiceWorker.enable");
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    navigations.push({ step: currentStep, url: frame.url(), at: Date.now() });
  });
  page.on("response", (response) => {
    const request = response.request();
    if (request.resourceType() !== "script") return;
    const contentType = response.headers()["content-type"];
    // Keep successful loader responses plus anomalies, rather than thousands of unrelated
    // module responses. Request failures below retain every rejected script, including aborts.
    if (response.status() < 400 && contentType?.includes("javascript")
      && !response.url().includes("/assets/studio-legacy-editor-adapter-")) return;
    scriptRequests.push({
      step: currentStep,
      url: response.url(),
      startedAt: request.timing().startTime,
      status: response.status(),
      contentType,
      fromServiceWorker: response.fromServiceWorker(),
    });
  });
  // Preserve aborted module requests as diagnostics even when normal route cancellation is
  // excluded from the runtime gate. A rejected import must still fail its owning step.
  page.on("requestfailed", (request) => {
    if (request.resourceType() !== "script") return;
    scriptRequests.push({
      step: currentStep,
      url: request.url(),
      startedAt: request.timing().startTime,
      failure: request.failure()?.errorText ?? "unknown failure",
    });
  });
  await installStudioInAppFirstRunState(page);
  // 로컬 프리뷰에는 Nest API 가 없어 게스트 경계를 세워 준다. 실제 배포본에는 API 가 있으므로
  // 가로채면 오히려 제품과 다른 경로를 재게 된다.
  if (!process.env.TOONSPECTRUM_SWEEP_BASE_URL) {
    await installStudioInAppGuestBoundary(page);
  }

  const outcomes: StudioInAppStepOutcome[] = [];
  await page.goto(`${baseUrl}/studio`, { waitUntil: "domcontentloaded", timeout: 30_000 });

  for (const step of steps) {
    currentStep = step.id;
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
      detail = error instanceof Error ? error.message : String(error);
      await page.screenshot({ path: join(SCRATCH, `${profile.id}-${step.id}-failure.png`) }).catch(() => undefined);
    }
    if (step.id.startsWith("route-")) {
      const state = await page.evaluate(() => ({
        url: location.href,
        isolated: crossOriginIsolated,
        chunkReloadAttempted: sessionStorage.getItem("toonspectrum:chunk-reload-attempted") === "1",
        adapterReloadAttempted: sessionStorage.getItem("chunk-reload:LegacyStudioEditorAdapter") === "1",
      }));
      routeState.push({ step: step.id, ...state });
    }
    await dismissOverlays(page).catch(() => undefined);
    const stepErrors = collector.drain();
    if (stepErrors.length > 0) {
      status = "failed";
      detail = [detail, `${stepErrors.length} runtime error(s)`].filter(Boolean).join("; ");
    }
    const shot = join(SCRATCH, `${profile.id}-${step.id}.png`);
    await page.screenshot({ path: shot, fullPage: false }).catch(() => undefined);
    outcomes.push({ id: step.id, label: step.label, status, detail, errors: stepErrors, shot });
    const errorNote = stepErrors.length > 0 ? ` errors=${stepErrors.length}` : "";
    const detailNote = detail ? ` (${detail.slice(0, 300)})` : "";
    log(`${profile.id}/${step.id}: ${status}${errorNote}${detailNote}`);
    for (const error of stepErrors) {
      log(`  ${error.channel}: ${error.text}`);
    }
  }

  await context.close();
  return { profile: profile.id, steps: outcomes, errors: collector.errors, scriptRequests, navigations, routeState };
}

async function main(): Promise<void> {
  mkdirSync(SCRATCH, { recursive: true });
  const unknownProfiles = REQUESTED_PROFILES.filter((id) => !STUDIO_INAPP_PROFILES.some((entry) => entry.id === id));
  const unknownSteps = REQUESTED_STEPS.filter((id) => !STEPS.some((entry) => entry.id === id));
  if (unknownProfiles.length) throw new Error(`unknown in-app profiles: ${unknownProfiles.join(", ")}`);
  if (unknownSteps.length) throw new Error(`unknown steps: ${unknownSteps.join(", ")}`);
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
  const outcomes = reports.flatMap((report) => report.steps);
  const counts = {
    ok: outcomes.filter((step) => step.status === "ok").length,
    skipped: outcomes.filter((step) => step.status === "skipped").length,
    failed: outcomes.filter((step) => step.status === "failed").length,
  };
  const reportPath = join(SCRATCH, "report.json");
  writeFileSync(
    reportPath,
    `${JSON.stringify({
      kind: "toonspectrum-studio-inapp-feature-sweep-v1",
      profiles: profiles.map((entry) => entry.id),
      steps: steps.map((step) => step.id),
      reports,
      counts,
      errorCount: allErrors.length,
    }, null, 2)}\n`,
  );

  log(`report ${reportPath}`);
  log(`steps: ${counts.ok} ok, ${counts.skipped} skipped, ${counts.failed} failed`);
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
  log(`RESULT: OK (${counts.ok} passed, ${counts.skipped} skipped, ${counts.failed} failed; ${reports.length} profile(s), 0 runtime errors)`);
}

await main();
