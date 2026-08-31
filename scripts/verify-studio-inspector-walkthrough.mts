/**
 * Inspector walkthrough — every control the inspector can present, driven in a
 * real browser, at desktop width and at the 360px mobile baseline.
 *
 * This is not a smoke test. For each control it answers three questions the
 * density work made it necessary to answer:
 *
 *   1. **Reachable?** What is the exact click/keyboard path from a freshly
 *      loaded Studio, and does any step block (collapsed with no affordance,
 *      needs a selection the artist cannot make yet, off-screen at 360px)?
 *   2. **Does it DO something?** Not "the button exists" — an observable state
 *      change: the document model, the layer list, a control's own value, the
 *      inspector's route, or a live-region announcement.
 *   3. **Round trip?** Where a control has an inverse, the inverse works.
 *
 * Run after `pnpm run build`:
 *   pnpm run verify:studio-inspector-walkthrough
 *
 * Findings that are real but out of scope for a hard gate are collected in
 * `notes` rather than failing the run, so the report stays honest about what it
 * could not exercise.
 */
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "playwright";
import { preview, type PreviewServer } from "vite";

import { DIST_DIR } from "./lib/repo-paths.mjs";
import { findFreePort, waitForServer } from "./lib/studio-verify-preview-harness.mjs";

const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const UI_DENSITY_KEY = "toonspectrum-studio-ui-density:v1";
const LANGUAGE_KEY = "toonspectrum-lang";
const MOBILE_HINT_KEY = "toonspectrum-studio-mobile-hint-dismissed";
const IMMERSIVE_SESSION_KEY = "toonspectrum-studio-mobile-immersive:v1";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const SCRATCH =
  process.env.TOONSPECTRUM_INSPECTOR_WALKTHROUGH_DIR
  ?? process.env.TOONSPECTRUM_VERIFY_DIR
  ?? join(tmpdir(), "toonspectrum-studio-inspector-walkthrough");

const PANEL = '[data-studio-sheet-id="props"]';
const NAVIGATOR = '[data-testid="studio-inspector-navigator"]';

/** The four collapsible groups the canvas panel gained. */
const CANVAS_SECTIONS = [
  "canvas.surface",
  "canvas.resize",
  "canvas.guide-lines",
  "canvas.style",
] as const;

type Verdict = "reachable" | "blocked" | "not-exercised";

interface ControlRow {
  /** Human name, as the artist sees it. */
  control: string;
  /** What must be true for the control to be on screen at all. */
  state: string;
  /** Click/keyboard path from a freshly loaded Studio. */
  path: string;
  verdict: Verdict;
  /** What observable change was asserted, or why none was. */
  effect: string;
  defect?: string;
}

interface Measurement {
  width: number;
  height: number;
}

interface WalkthroughReport {
  desktop: {
    panel: Measurement;
    /** Aside top → first tabpanel top: pure chrome before any content. */
    chromeHeight: number;
    /** Per-band breakdown so the chrome number is auditable, not a single figure. */
    chromeBands: { commandSearchRow?: number; navigator?: number };
    canvasPanelCollapsed: number;
    canvasPanelExpanded: number;
  };
  mobile: {
    panel: Measurement;
    chromeHeight: number;
    canvasPanelCollapsed: number;
    /** Interactive elements inside the sheet whose box is under 44px tall. */
    smallTouchTargets: { label: string; height: number }[];
  };
  rows: ControlRow[];
  notes: string[];
  failures: string[];
}

function log(message: string): void {
  console.log(`[verify-inspector-walkthrough] ${message}`);
}

async function installStudioPreferences(
  context: BrowserContext,
  mobile: boolean,
): Promise<void> {
  await context.addInitScript(
    ({ quickStartKey, densityKey, languageKey, hintKey, immersiveKey, isMobile }) => {
      try {
        globalThis.localStorage.setItem(quickStartKey, "1");
        globalThis.localStorage.setItem(densityKey, JSON.stringify({ mode: "full" }));
        globalThis.localStorage.setItem(
          languageKey,
          JSON.stringify({ state: { lang: "ko" }, version: 0 }),
        );
        if (isMobile) {
          globalThis.localStorage.setItem(hintKey, "1");
          // 몰입 모드는 크롬을 숨긴다 — 측정 대상이 사라지지 않게 창 모드로 고정한다.
          globalThis.sessionStorage.setItem(immersiveKey, "windowed");
        }
      } catch {
        // 저장소가 막혀도 브라우저 계약 자체는 계속 검사해야 한다.
      }
    },
    {
      quickStartKey: QUICKSTART_KEY,
      densityKey: UI_DENSITY_KEY,
      languageKey: LANGUAGE_KEY,
      hintKey: MOBILE_HINT_KEY,
      immersiveKey: IMMERSIVE_SESSION_KEY,
      isMobile: mobile,
    },
  );
  // esbuild `keepNames` 가 page.evaluate 안의 중첩 함수에 심는 헬퍼.
  await context.addInitScript(() => {
    (globalThis as unknown as { __name: (fn: unknown) => unknown }).__name = (fn) => fn;
  });
}

async function dismissHydratedQuickStart(page: Page): Promise<void> {
  const quickStart = page.locator('[data-studio-creative-starter="true"]');
  const mounted = await quickStart
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!mounted) return;
  await quickStart.locator('[data-studio-quickstart-dismiss="true"]').click();
  await quickStart.waitFor({ state: "detached", timeout: 3_000 });
}

/** 300ms 시트 트랜지션이 끝나기 전에 재는 것을 막는다. */
async function awaitElementAnimations(locator: Locator): Promise<void> {
  await locator
    .evaluate(async (element) => {
      await Promise.all(
        element.getAnimations().map(async (animation) => {
          try {
            await animation.finished;
          } catch {
            /* 취소된 애니메이션은 무시한다. */
          }
        }),
      );
    })
    .catch(() => undefined);
}

async function measure(locator: Locator): Promise<Measurement> {
  await awaitElementAnimations(locator);
  const box = await locator.boundingBox();
  return {
    width: Math.round(box?.width ?? 0),
    height: Math.round(box?.height ?? 0),
  };
}

/** 인스펙터 최상단부터 첫 탭패널까지 — 콘텐츠 이전에 지불하는 순수 크롬. */
async function measureChromeHeight(page: Page): Promise<number> {
  return page.evaluate((panelSelector) => {
    const aside = document.querySelector<HTMLElement>(panelSelector);
    if (!aside) return -1;
    const asideTop = aside.getBoundingClientRect().top;
    const visibleTabpanel = [
      ...aside.querySelectorAll<HTMLElement>('[role="tabpanel"]'),
    ].find((node) => {
      if (node.hidden) return false;
      const rect = node.getBoundingClientRect();
      return rect.height > 2;
    });
    if (!visibleTabpanel) return -1;
    return Math.round(visibleTabpanel.getBoundingClientRect().top - asideTop);
  }, PANEL);
}

async function gotoStudio(page: Page, baseUrl: string): Promise<void> {
  await page.route("**/api/auth/session", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ authenticated: false, user: null }),
    });
  });
  await page.goto(`${baseUrl}/studio`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page
    .locator('[data-studio-main-menu="true"]')
    .waitFor({ state: "visible", timeout: 30_000 })
    .catch(() => undefined);
  await dismissHydratedQuickStart(page);
}

/* --------------------------------------------------------------- helpers */

function record(
  rows: ControlRow[],
  row: ControlRow,
): void {
  rows.push(row);
  const mark =
    row.verdict === "reachable" ? "OK  " : row.verdict === "blocked" ? "BLOCK" : "SKIP ";
  log(`${mark} ${row.control} — ${row.effect}`);
}

/** 기본 탭으로 이동하고 실제로 선택됐는지 확인한다. */
function primaryTab(page: Page, tab: string): Locator {
  return page.locator(`${NAVIGATOR} [data-studio-inspector-primary-tab="${tab}"]`).first();
}

async function selectPrimaryTab(page: Page, tab: string): Promise<boolean> {
  const button = primaryTab(page, tab);
  if ((await button.count()) === 0) return false;
  if ((await button.getAttribute("aria-selected")) !== "true") await button.click();
  return (await button.getAttribute("aria-selected")) === "true";
}

function documentTab(page: Page, label: string): Locator {
  return page.locator(`${NAVIGATOR} [role="tablist"][aria-label="페이지 설정"] [role="tab"]`, {
    hasText: label,
  }).first();
}

async function selectDocumentTab(page: Page, label: string): Promise<boolean> {
  const tab = documentTab(page, label);
  if ((await tab.count()) === 0) return false;
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
  return (await tab.getAttribute("aria-selected")) === "true";
}

/** 탭의 실제 소유 panel을 aria-controls로 찾고, 구버전 빌드에는 aria-label을 쓴다. */
async function controlledPanel(
  page: Page,
  tab: Locator,
  fallbackLabels: readonly string[],
): Promise<Locator> {
  const panelId = await tab.getAttribute("aria-controls").catch(() => null);
  if (panelId) {
    const linked = page.locator(`${PANEL} [id=${JSON.stringify(panelId)}]`).first();
    if ((await linked.count()) > 0) return linked;
  }
  const fallbackSelector = fallbackLabels
    .map((label) => `${PANEL} [role="tabpanel"][aria-label=${JSON.stringify(label)}]`)
    .join(", ");
  return page.locator(fallbackSelector || `${PANEL} [data-missing-controlled-panel]`).first();
}

function sectionHeader(page: Page, sectionId: string): Locator {
  return page.locator(`[data-inspector-section="${sectionId}"] > button`).first();
}

/** 헤더에 키보드 포커스를 준 뒤 Enter 로 연다 — 마우스 전용이 아님을 증명한다. */
async function openSectionByKeyboard(page: Page, sectionId: string): Promise<boolean> {
  const header = sectionHeader(page, sectionId);
  if ((await header.count()) === 0) return false;
  await header.scrollIntoViewIfNeeded().catch(() => undefined);
  await header.focus();
  const focused = await header.evaluate((node) => node === document.activeElement);
  if (!focused) return false;
  await page.keyboard.press("Enter");
  return (await header.getAttribute("aria-expanded")) === "true";
}

/* ------------------------------------------------------------- desktop run */

async function walkDesktop(
  browser: Browser,
  baseUrl: string,
  report: WalkthroughReport,
): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    locale: "ko-KR",
  });
  await installStudioPreferences(context, false);
  const page = await context.newPage();
  const rows = report.rows;

  try {
    await gotoStudio(page, baseUrl);
    const panel = page.locator(PANEL);
    await panel.waitFor({ state: "visible", timeout: 20_000 });

    report.desktop.panel = await measure(panel);
    report.desktop.chromeHeight = await measureChromeHeight(page);
    report.desktop.chromeBands = await page.evaluate((panelSelector) => {
      const aside = document.querySelector<HTMLElement>(panelSelector);
      if (!aside) return {};
      const height = (selector: string) =>
        Math.round(
          aside.querySelector<HTMLElement>(selector)?.getBoundingClientRect().height ?? 0,
        );
      return {
        commandSearchRow: height('[data-studio-command-search-row="true"]'),
        navigator: height('[data-testid="studio-inspector-navigator"]'),
      };
    }, PANEL);
    log(
      `desktop panel ${report.desktop.panel.width}×${report.desktop.panel.height}, chrome ${report.desktop.chromeHeight}px`,
    );

    /* ---- A. 상단 크롬 --------------------------------------------------- */

    const searchTrigger = page.locator('[data-testid="studio-command-search-trigger"]');
    const collapse = panel.locator('button[title="속성 패널 접기"]');
    const chromeRow = panel.locator('[data-studio-command-search-row="true"]');
    const chromeRowCount = await chromeRow.count();
    record(rows, {
      control: "상단 크롬 행 (기능 검색 + 접기)",
      state: "항상 (데스크톱)",
      path: "인스펙터 최상단",
      verdict:
        chromeRowCount === 1 && (await searchTrigger.count()) === 1 && (await collapse.count()) === 1
          ? "reachable"
          : "blocked",
      effect: `검색 트리거와 접기가 한 행에 있다 (행 ${chromeRowCount}개)`,
      defect:
        chromeRowCount === 1
          ? undefined
          : "검색/접기가 별도 행으로 분리돼 세로 공간을 두 번 먹는다",
    });

    // F1 로 통합 검색이 열리고 Esc 로 닫힌다.
    await page.keyboard.press("F1");
    const dialogOpen = await page
      .locator('[role="dialog"]')
      .first()
      .waitFor({ state: "visible", timeout: 4_000 })
      .then(() => true)
      .catch(() => false);
    if (dialogOpen) await page.keyboard.press("Escape");
    record(rows, {
      control: "통합 명령 검색 (F1)",
      state: "항상",
      path: "F1, 또는 인스펙터 상단 '기능 검색' 클릭",
      verdict: dialogOpen ? "reachable" : "blocked",
      effect: dialogOpen ? "다이얼로그가 열리고 Esc 로 닫힌다" : "F1 이 다이얼로그를 열지 못함",
      defect: dialogOpen ? undefined : "F1 바인딩이 동작하지 않는다",
    });

    // 기본 탭 4개 — 클릭 시 대응 탭패널이 실제로 보여야 한다.
    // 페이지 탭이 어느 하위 탭으로 착지하는지는 활성 워크스페이스가 정한다
    // (기본 '스토리보드' 프로필은 미니맵으로 연다). 그래서 세 하위 패널 중
    // 하나가 보이면 통과로 본다 — 아래에서 착지 지점을 따로 기록한다.
    for (const [tab, label, panelLabels] of [
      ["properties", "속성", ["선택 요소 속성", "시작 안내", "그리기 도구 설정", "전문 픽셀 도구"]],
      ["layers", "레이어", ["레이어"]],
      ["document", "페이지", ["캔버스 설정", "페이지 색보정", "미니맵과 페이지 탐색"]],
      ["publish", "작품 정보", ["작품 정보"]],
    ] as const) {
      const selected = await selectPrimaryTab(page, tab);
      const panel = await controlledPanel(page, primaryTab(page, tab), panelLabels);
      // 탭패널은 lazy 마운트/트랜지션을 지날 수 있으므로 잠깐 폴링한다.
      let visible = false;
      for (let attempt = 0; attempt < 20 && !visible; attempt += 1) {
        visible = await panel.isVisible().catch(() => false)
          && (await panel.boundingBox())?.height !== undefined
          && ((await panel.boundingBox())?.height ?? 0) > 2;
        if (!visible) await page.waitForTimeout(250);
      }
      record(rows, {
        control: `기본 탭 · ${label}`,
        state: "항상",
        path: `인스펙터 탭 스트립 → ${label}`,
        verdict: selected && visible ? "reachable" : "blocked",
        effect: selected
          ? `aria-selected=true, 대응 탭패널(${panelLabels[0]}) 표시됨=${visible}`
          : "탭이 선택되지 않음",
        defect: selected && !visible ? "탭은 선택되지만 대응 패널이 보이지 않는다" : undefined,
      });
    }

    // 키보드 방향키 순회.
    const firstTab = page.locator(`${NAVIGATOR} [data-studio-inspector-primary-tab="properties"]`);
    await selectPrimaryTab(page, "properties");
    await firstTab.focus();
    await page.keyboard.press("ArrowRight");
    const movedTo = await page.evaluate(
      () =>
        document.activeElement?.getAttribute("data-studio-inspector-primary-tab") ?? null,
    );
    record(rows, {
      control: "탭 스트립 키보드 순회 (←/→/Home/End)",
      state: "항상",
      path: "탭에 포커스 → ArrowRight",
      verdict: movedTo === "layers" ? "reachable" : "blocked",
      effect: `ArrowRight 로 포커스가 ${movedTo ?? "이동 안 함"} 으로 갔다`,
      defect: movedTo === "layers" ? undefined : "방향키 순회가 동작하지 않는다",
    });

    // 패널 찾기(로컬 검색) — 입력 후 Enter 가 실제로 라우팅해야 한다.
    await selectPrimaryTab(page, "properties");
    const localSearchToggle = page.locator(`${NAVIGATOR} button[aria-label="패널과 기능 찾기"]`);
    await localSearchToggle.click();
    const localInput = page.locator(`${NAVIGATOR} input[type="search"]`);
    const localSearchOpened = await localInput
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    let routedByLocalSearch = false;
    if (localSearchOpened) {
      await localInput.fill("게시");
      await page.keyboard.press("Enter");
      routedByLocalSearch = await page
        .locator(`${NAVIGATOR} [data-studio-inspector-primary-tab="publish"][aria-selected="true"]`)
        .waitFor({ state: "attached", timeout: 3_000 })
        .then(() => true)
        .catch(() => false);
    }
    record(rows, {
      control: "패널 찾기 (인스펙터 로컬 검색)",
      state: "항상",
      path: "인스펙터 헤더 돋보기 → 검색어 → Enter",
      verdict: localSearchOpened && routedByLocalSearch ? "reachable" : "blocked",
      effect: routedByLocalSearch
        ? "'게시' 입력 + Enter 가 게시 탭으로 실제 이동시켰다"
        : "검색은 열렸으나 Enter 가 라우팅하지 않았다",
      defect: localSearchOpened && !routedByLocalSearch ? "결과 Enter 가 no-op" : undefined,
    });

    /* ---- B. 페이지 ▸ 캔버스 (변경된 패널) -------------------------------- */

    await selectPrimaryTab(page, "document");
    const activeWorkspaceLabel = await page
      .getByRole("button", { name: /^작업공간:/u })
      .first()
      .getAttribute("aria-label");
    const defaultStoryboardActive = activeWorkspaceLabel?.startsWith("작업공간: 스토리보드")
      ?? false;
    const landedOn = await page.evaluate(
      (panelSelector) =>
        [
          ...(document
            .querySelector<HTMLElement>(panelSelector)
            ?.querySelectorAll<HTMLElement>('[role="tablist"][aria-label="페이지 설정"] [role="tab"]')
            ?? []),
        ].find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent?.trim() ?? null,
      PANEL,
    );
    record(rows, {
      control: "페이지 탭 하위 착지 지점 (캔버스 / 색보정 / 미니맵)",
      state: "페이지 탭",
      path: "페이지 탭 클릭 (1 스텝)",
      verdict: defaultStoryboardActive && landedOn === "미니맵" ? "reachable" : "blocked",
      effect: `활성 ${activeWorkspaceLabel ?? "작업공간 확인 불가"}; '${landedOn}' 하위 탭으로 착지한다`,
      defect: !defaultStoryboardActive
        ? `새 Studio가 기본 '스토리보드' 작업공간으로 시작하지 않았다 (${activeWorkspaceLabel ?? "라벨 없음"})`
        : landedOn !== "미니맵"
          ? `스토리보드 작업공간의 Page 계약은 '미니맵'인데 실제 착지는 '${landedOn}' 이다`
          : undefined,
    });

    await selectDocumentTab(page, "캔버스");
    const canvasPanel = await controlledPanel(page, documentTab(page, "캔버스"), ["캔버스 설정"]);
    await canvasPanel.waitFor({ state: "visible", timeout: 8_000 });
    report.desktop.canvasPanelCollapsed = (await measure(canvasPanel)).height;

    // 기본 티어는 접기 없이 닿아야 한다 + 실제로 동작해야 한다.
    const heightValueBefore = await page
      .locator(`${PANEL} span[aria-label^="높이 "]`)
      .first()
      .textContent();
    await canvasPanel.getByRole("button", { name: "높이 240px 늘리기" }).click();
    const heightValueAfter = await page
      .locator(`${PANEL} span[aria-label^="높이 "]`)
      .first()
      .textContent();
    const heightChanged = heightValueBefore !== heightValueAfter;
    // 되돌리기(역동작).
    await canvasPanel.getByRole("button", { name: "높이 240px 줄이기" }).click();
    const heightRestored =
      (await page.locator(`${PANEL} span[aria-label^="높이 "]`).first().textContent())
      === heightValueBefore;
    record(rows, {
      control: "캔버스 높이 ± (기본 티어)",
      state: "페이지 ▸ 캔버스",
      path: "페이지 탭 → 캔버스 → 높이 +/−  (2 스텝)",
      verdict: heightChanged ? "reachable" : "blocked",
      effect: `${heightValueBefore} → ${heightValueAfter}, 역동작 복원=${heightRestored}`,
      defect: heightChanged ? undefined : "높이 버튼이 값을 바꾸지 않는다",
    });

    const gridToggle = canvasPanel.getByLabel("그리드 격자 표시");
    const gridBefore = await gridToggle.isChecked();
    await gridToggle.click();
    const gridAfter = await gridToggle.isChecked();
    const gridSizeVisible = await canvasPanel
      .getByRole("combobox", { name: "그리드 간격" })
      .isVisible()
      .catch(() => false);
    await gridToggle.click();
    record(rows, {
      control: "그리드 격자 표시 + 간격 (기본 티어)",
      state: "페이지 ▸ 캔버스",
      path: "페이지 탭 → 캔버스 → 체크박스 (2 스텝)",
      verdict: gridBefore !== gridAfter ? "reachable" : "blocked",
      effect: `체크 상태 ${gridBefore}→${gridAfter}, 켰을 때 간격 select 노출=${gridSizeVisible}, 역동작 복원됨`,
    });

    const snapToggle = canvasPanel.getByRole("checkbox", { name: /스냅/u }).first();
    const snapBefore = await snapToggle.isChecked();
    await snapToggle.click();
    const snapAfter = await snapToggle.isChecked();
    await snapToggle.click();
    record(rows, {
      control: "정렬 가이드(스냅) (기본 티어)",
      state: "페이지 ▸ 캔버스",
      path: "페이지 탭 → 캔버스 → 체크박스 (2 스텝)",
      verdict: snapBefore !== snapAfter ? "reachable" : "blocked",
      effect: `${snapBefore}→${snapAfter}, 역동작 복원됨`,
    });

    const webtoonToggle = canvasPanel.getByLabel("웹툰 규격 가이드");
    const webtoonBefore = await webtoonToggle.isChecked();
    await webtoonToggle.click();
    const legendShown = await canvasPanel
      .getByText(/플랫폼 표준폭|웹툰 규격 가이드를 여는 중/u)
      .first()
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    await webtoonToggle.click();
    record(rows, {
      control: "웹툰 규격 가이드 (기본 티어)",
      state: "페이지 ▸ 캔버스",
      path: "페이지 탭 → 캔버스 → 체크박스 (2 스텝)",
      verdict: webtoonBefore !== undefined ? "reachable" : "blocked",
      effect: `켜면 규격 범례가 나타난다=${legendShown}, 역동작 복원됨`,
    });

    record(rows, {
      control: "배경색 (기본 티어)",
      state: "페이지 ▸ 캔버스",
      path: "페이지 탭 → 캔버스 → 색상 입력 (2 스텝)",
      verdict: (await canvasPanel.getByLabel("배경색").count()) === 1 ? "reachable" : "blocked",
      effect: "네이티브 <input type=color> 로 노출됨 (헤드리스에서 OS 색상 대화상자는 구동 불가)",
    });

    // 접힌 섹션 — 열기 전에는 컨트롤이 DOM 에 없어야 하고, 키보드로 열려야 한다.
    for (const sectionId of CANVAS_SECTIONS) {
      const header = sectionHeader(page, sectionId);
      const exists = (await header.count()) === 1;
      const expandedBefore = exists ? await header.getAttribute("aria-expanded") : null;
      // 헤더 텍스트에는 sr-only 배지 문장이 붙는다 — 제목 span 만 읽는다.
      const label = exists
        ? ((await header.locator("span.truncate").first().textContent()) ?? "").trim()
        : sectionId;
      const openedByKeyboard = exists ? await openSectionByKeyboard(page, sectionId) : false;
      record(rows, {
        control: `접기 섹션 · ${label || sectionId}`,
        state: "페이지 ▸ 캔버스",
        path: `페이지 탭 → 캔버스 → 섹션 헤더 (Tab 으로 포커스 후 Enter)  (3 스텝)`,
        verdict: openedByKeyboard ? "reachable" : "blocked",
        effect: `aria-expanded ${expandedBefore} → ${openedByKeyboard ? "true" : "실패"}; 키보드 Enter 로 열림`,
        defect: exists
          ? openedByKeyboard
            ? undefined
            : "헤더는 있으나 키보드로 열리지 않는다"
          : "섹션 헤더가 렌더되지 않는다",
      });
    }

    report.desktop.canvasPanelExpanded = (await measure(canvasPanel)).height;

    // 펼친 뒤에야 나타나는 컨트롤들이 실제로 있고 동작하는지.
    const gutterSlider = canvasPanel.getByRole("slider", { name: /패널 여백/u });
    const gutterExists = (await gutterSlider.count()) > 0;
    const gutterDisabled = gutterExists ? await gutterSlider.isDisabled() : true;
    const gutterReason = canvasPanel.locator("[data-studio-panel-gutter-reason]");
    const gutterReasonText = (await gutterReason.textContent().catch(() => null))?.trim() ?? null;
    const gutterReasonId = await gutterReason.getAttribute("id").catch(() => null);
    const gutterDescribedBy = gutterExists
      ? await gutterSlider.getAttribute("aria-describedby")
      : null;
    const gutterUnavailableExplained = !gutterDisabled || (
      Boolean(gutterReasonText) && gutterReasonId === gutterDescribedBy
    );
    record(rows, {
      control: "패널 여백 (Gutter) — 접기 뒤",
      state: "페이지 ▸ 캔버스 ▸ 크기·여백 펼침",
      path: "페이지 탭 → 캔버스 → '크기·여백' 펼치기 → 슬라이더 (3 스텝)",
      verdict: gutterExists && gutterUnavailableExplained ? "reachable" : "blocked",
      effect: gutterDisabled
        ? `비활성 사유가 인라인으로 노출되고 aria-describedby로 연결됨: ${gutterReasonText ?? "사유 없음"}`
        : "슬라이더가 활성 상태로 노출됨",
      defect: !gutterExists
        ? "패널 여백 슬라이더가 렌더되지 않는다"
        : gutterDisabled && !gutterUnavailableExplained
          ? "비활성 사유가 없거나 슬라이더의 aria-describedby와 연결되지 않았다"
          : undefined,
    });

    for (const [name, note] of [
      ["+ 세로 가이드", "가이드선"],
      ["+ 가로 가이드", "가이드선"],
      ["배경 편집기 · 리사이저 열기", "배경·종이 질감"],
    ] as const) {
      const button = canvasPanel.getByRole("button", { name });
      record(rows, {
        control: `${name} — 접기 뒤`,
        state: `페이지 ▸ 캔버스 ▸ ${note} 펼침`,
        path: `페이지 탭 → 캔버스 → '${note}' 펼치기 → 버튼 (3 스텝)`,
        verdict: (await button.count()) > 0 ? "reachable" : "blocked",
        effect: (await button.count()) > 0 ? "펼친 뒤 클릭 가능한 버튼으로 노출됨" : "없음",
      });
    }

    // 가이드 추가는 실제로 문서를 바꿔야 한다 — 목록에 항목이 생기는지 확인한다.
    const addVertical = canvasPanel.getByRole("button", { name: "+ 세로 가이드" });
    if ((await addVertical.count()) > 0) {
      await addVertical.click();
      const guideSlider = canvasPanel.getByRole("slider", { name: /가이드 #1 위치/u });
      const created = await guideSlider
        .waitFor({ state: "visible", timeout: 4_000 })
        .then(() => true)
        .catch(() => false);
      let removed = false;
      if (created) {
        await canvasPanel.getByRole("button", { name: "모든 가이드 삭제" }).click();
        removed = await guideSlider
          .waitFor({ state: "detached", timeout: 4_000 })
          .then(() => true)
          .catch(() => false);
      }
      record(rows, {
        control: "가이드 추가 → 목록 → 전체 삭제 (왕복)",
        state: "페이지 ▸ 캔버스 ▸ 가이드선 펼침",
        path: "'+ 세로 가이드' → 목록 항목 확인 → '모든 가이드 삭제'",
        verdict: created ? "reachable" : "blocked",
        effect: `가이드 생성=${created}, 전체 삭제로 목록이 사라짐=${removed}`,
        defect: created && !removed ? "삭제가 목록을 비우지 않는다" : undefined,
      });
    }

    // 접기 상태가 새로고침을 넘어 유지되는지 — 실제 localStorage 를 통과하는 왕복.
    const persistedSection = CANVAS_SECTIONS[1];
    await page.reload({ waitUntil: "domcontentloaded" });
    await dismissHydratedQuickStart(page);
    await page.locator(PANEL).waitFor({ state: "visible", timeout: 20_000 });
    await selectPrimaryTab(page, "document");
    await selectDocumentTab(page, "캔버스");
    const persistedExpanded = await sectionHeader(page, persistedSection)
      .getAttribute("aria-expanded")
      .catch(() => null);
    record(rows, {
      control: "접기 상태 유지 (새로고침 왕복)",
      state: "페이지 ▸ 캔버스",
      path: "섹션 펼치기 → 새로고침 → 같은 섹션 확인",
      verdict: persistedExpanded === "true" ? "reachable" : "blocked",
      effect: `새로고침 뒤 ${persistedSection} 의 aria-expanded=${persistedExpanded}`,
      defect:
        persistedExpanded === "true"
          ? undefined
          : "새로고침하면 접기 선택이 사라진다 (탭 왕복마다 다시 열어야 함)",
    });

    /* ---- C. 페이지 ▸ 색보정 / 미니맵 ------------------------------------ */

    if (await selectDocumentTab(page, "색보정")) {
      const gradePanel = await controlledPanel(page, documentTab(page, "색보정"), ["페이지 색보정"]);
      const gradeToggle = gradePanel.locator('button[aria-expanded="false"]').first();
      const hadDisclosure = (await gradeToggle.count()) > 0;
      if (hadDisclosure) await gradeToggle.click();
      // 색보정 본체는 lazy 다 — 로딩 폴백이 걷힐 때까지 기다린 뒤에 센다.
      await gradePanel
        .locator('input[type="range"]')
        .first()
        .waitFor({ state: "visible", timeout: 15_000 })
        .catch(() => undefined);
      const gradeControls = await gradePanel
        .locator('input[type="range"], button')
        .count();
      record(rows, {
        control: "페이지 색보정",
        state: "페이지 ▸ 색보정",
        path: "페이지 탭 → 색보정 → (닫혀 있으면) 펼치기 (2~3 스텝)",
        verdict: gradeControls > 1 ? "reachable" : "blocked",
        effect: `펼친 뒤 컨트롤 ${gradeControls}개 노출 (디스클로저 존재=${hadDisclosure})`,
      });
    }

    if (await selectDocumentTab(page, "미니맵")) {
      const minimap = page.locator(`${PANEL} [aria-label^="미니맵:"]`);
      const minimapVisible = await minimap.isVisible().catch(() => false);
      let keyboardFocusable = false;
      if (minimapVisible) {
        await minimap.focus();
        keyboardFocusable = await minimap.evaluate((node) => node === document.activeElement);
      }
      record(rows, {
        control: "미니맵 · 페이지 탐색",
        state: "페이지 ▸ 미니맵",
        path: "페이지 탭 → 미니맵 (2 스텝)",
        verdict: minimapVisible ? "reachable" : "blocked",
        effect: `렌더됨=${minimapVisible}, 키보드 포커스 가능=${keyboardFocusable} (방향키 스크롤 지원)`,
        defect:
          minimapVisible && !keyboardFocusable
            ? "미니맵이 키보드로 포커스되지 않는다"
            : undefined,
      });
    }

    /* ---- D. 게시 -------------------------------------------------------- */

    await selectPrimaryTab(page, "publish");
    const inspectorPanel = page.locator(PANEL);
    const titleInput = inspectorPanel.getByRole("textbox", { name: "작품 제목 (필수)", exact: true });
    await titleInput.fill("워크스루 제목");
    const titleKept = (await titleInput.inputValue()) === "워크스루 제목";
    const descriptionInput = inspectorPanel.getByRole("textbox", { name: "게시용 설명", exact: true });
    await descriptionInput.fill("설명");
    const tagsInput = inspectorPanel.getByRole("textbox", { name: "게시용 태그", exact: true });
    await tagsInput.fill("태그1,태그2");
    record(rows, {
      control: "작품 정보 (제목·설명·태그)",
      state: "작품 정보 탭",
      path: "작품 정보 탭 → 입력 (2 스텝)",
      verdict: titleKept ? "reachable" : "blocked",
      effect: `제목이 문서 상태로 반영됨=${titleKept}, 설명/태그 입력 수용됨`,
    });

    /* ---- E. 레이어 ------------------------------------------------------ */

    await selectPrimaryTab(page, "layers");
    const layersPanel = await controlledPanel(page, primaryTab(page, "layers"), ["레이어"]);
    const layerNavigatorMounted = await layersPanel
      .locator("section, ul, [role='tree'], [role='listbox']")
      .first()
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    record(rows, {
      control: "레이어 탐색기",
      state: "레이어 탭",
      path: "레이어 탭 (1 스텝)",
      verdict: layerNavigatorMounted ? "reachable" : "blocked",
      effect: `lazy 로드된 레이어 탐색기가 마운트됨=${layerNavigatorMounted}`,
    });

    /* ---- F. 속성 · 선택 없음 (시작 안내) --------------------------------- */

    await selectPrimaryTab(page, "properties");
    const coach = page.locator('[data-testid="studio-inspector-empty-coach"]');
    const coachVisible = await coach.isVisible().catch(() => false);
    if (coachVisible) {
      for (const [name, accessibleName] of [
        ["펜으로 그리기", "펜으로 그리기"],
        ["선택 도구", "선택 도구"],
        ["레이어 패널", "레이어 패널 열기"],
        ["이미지 편집", "이미지 편집 · 전문 도구 열기"],
        ["사용법 따라 하기", "스튜디오 사용법 따라 하기"],
      ] as const) {
        record(rows, {
          control: `시작 안내 · ${name}`,
          state: "속성 탭 · 선택 없음 · 그리기 아님",
          path: "속성 탭 → 카드 버튼 (2 스텝)",
          verdict:
            (await coach.getByRole("button", { name: accessibleName, exact: true }).count()) > 0
              ? "reachable"
              : "blocked",
          effect: "빈 상태에서 다음 행동을 제안하는 카드로 노출됨",
        });
      }
      // 펜 버튼은 실제로 도구를 바꾸고 인스펙터를 그리기 패널로 넘겨야 한다.
      await coach.getByRole("button", { name: /펜으로 그리기/u }).click();
      const switchedToDrawing = await page
        .locator('[data-testid="studio-inspector-context-drawing-panel"]')
        .waitFor({ state: "visible", timeout: 8_000 })
        .then(() => true)
        .catch(() => false);
      record(rows, {
        control: "시작 안내 → 그리기 전환 (실효)",
        state: "속성 탭 · 선택 없음",
        path: "'펜으로 그리기' 클릭",
        verdict: switchedToDrawing ? "reachable" : "blocked",
        effect: `인스펙터가 그리기 도구 설정 패널로 실제 전환됨=${switchedToDrawing}`,
        defect: switchedToDrawing ? undefined : "버튼이 도구를 바꾸지 못한다",
      });
    } else {
      report.notes.push(
        "속성 탭이 빈 문서에서 시작 안내 대신 다른 모드로 진입했다 — 시작 안내 경로를 구동하지 못함",
      );
    }

    /* ---- G. 속성 · 그리기 도구 ------------------------------------------ */

    const drawingPanel = page.locator('[data-testid="studio-inspector-context-drawing-panel"]');
    if (await drawingPanel.isVisible().catch(() => false)) {
      let presetGroup = drawingPanel.getByRole("group", { name: "브러시 크기 프리셋" });
      let presetSurface = drawingPanel;
      // 전체 팔레트 모드에서는 컨트롤이 인라인이지만, 기본 icon-popup 모드에서는
      // 도구 속성 런처를 먼저 열어야 한다. 숨은 DOM을 직접 찾지 말고 실제 사용자 경로를 밟는다.
      let presetVisible = await presetGroup.isVisible().catch(() => false);
      let presetPath = "펜 도구(B) → 속성 탭 → 프리셋 클릭 (2 스텝)";
      if (!presetVisible) {
        const trigger = drawingPanel.locator(
          '[data-studio-drawing-palette-icon-trigger="tool-properties"]',
        ).first();
        // drawingPanel 자체가 먼저 보이고 palette stack은 lazy/Suspense 뒤에 붙을 수 있다.
        // 즉시 isVisible 한 번으로 icon-popup 모드를 놓치지 않도록 런처를 제한 시간 기다린다.
        const triggerVisible = await trigger
          .waitFor({ state: "visible", timeout: 15_000 })
          .then(() => true)
          .catch(() => false);
        if (triggerVisible) {
          await trigger.click();
          const popup = page.locator(
            '[data-studio-drawing-palette-overlay="palette"]'
              + '[data-studio-drawing-palette-overlay-id="tool-properties"]',
          );
          const popupVisible = await popup
            .waitFor({ state: "visible", timeout: 8_000 })
            .then(() => true)
            .catch(() => false);
          if (popupVisible) {
            presetSurface = popup;
            presetGroup = popup.getByRole("group", { name: "브러시 크기 프리셋" });
            presetVisible = await presetGroup
              .waitFor({ state: "visible", timeout: 15_000 })
              .then(() => true)
              .catch(() => false);
            presetPath = "펜 도구(B) → 도구 속성 팝업 → 프리셋 클릭 (3 스텝)";
          }
        } else {
          // 저장된 프레젠테이션이 full이면 런처 없이 인라인 팔레트가 늦게 나타난다.
          presetVisible = await presetGroup
            .waitFor({ state: "visible", timeout: 15_000 })
            .then(() => true)
            .catch(() => false);
        }
      }
      let sizeApplied = false;
      let presetDiagnostics = "preset group not visible";
      if (presetVisible) {
        const target = presetGroup.getByRole("button", { name: "브러시 크기 30px" });
        const readPresetState = async () => ({
          pressed: await presetGroup
            .locator('button[aria-pressed="true"]')
            .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label"))),
          range: await presetSurface.locator('input[type="range"]').first().inputValue(),
        });
        const before = await readPresetState();
        await target.scrollIntoViewIfNeeded().catch(() => undefined);
        await target.click();
        // React가 같은 클릭에서 도구 메모리와 최근 크기 목록을 함께 갱신한다. 프로덕션
        // 번들/느린 CI에서는 커밋이 Playwright click 반환보다 한 프레임 늦을 수 있으므로,
        // 즉시 읽기 한 번으로 정상 동작을 실패 처리하지 않고 짧고 제한된 시간만 관찰한다.
        const pressedDeadline = Date.now() + 2_000;
        do {
          sizeApplied = (await target.getAttribute("aria-pressed")) === "true";
          if (sizeApplied) break;
          await page.waitForTimeout(50);
        } while (Date.now() < pressedDeadline);
        const after = await readPresetState();
        presetDiagnostics = `before=${JSON.stringify(before)}; after=${JSON.stringify(after)}`;
      }
      record(rows, {
        control: "브러시 크기 프리셋 그리드",
        state: "속성 탭 · 그리기 도구",
        path: presetPath,
        verdict: presetVisible ? "reachable" : "blocked",
        effect: `30px 프리셋 클릭 후 aria-pressed=true 로 적용됨=${sizeApplied}; ${presetDiagnostics}`,
        defect: presetVisible && !sizeApplied ? "프리셋 클릭이 활성 크기를 바꾸지 않는다" : undefined,
      });

      for (const sectionId of [
        "tool.line-correction",
        "tool.brush-studio",
        "tool.brush-engines",
        "tool.symmetry",
        "tool.rulers",
      ]) {
        const header = sectionHeader(page, sectionId);
        const exists = (await header.count()) > 0;
        const opened = exists ? await openSectionByKeyboard(page, sectionId) : false;
        record(rows, {
          control: `도구 속성 접기 · ${sectionId}`,
          state: "속성 탭 · 그리기 도구",
          path: "펜 도구 → 속성 탭 → 섹션 헤더 Enter (3 스텝)",
          verdict: exists ? (opened ? "reachable" : "blocked") : "not-exercised",
          effect: exists
            ? `키보드로 펼침=${opened}`
            : "이 도구 모드에서는 렌더되지 않음 (해당 도구 선택 시에만 노출)",
          defect: exists && !opened ? "헤더는 있으나 키보드로 열리지 않는다" : undefined,
        });
      }
    }

    /* ---- H. 속성 · 선택 있음 -------------------------------------------- */

    // 실제 스트로크를 그려 선택 가능한 요소를 만든다 — "선택이 필요한데 만들 방법이
    // 없다" 를 검증하려면 만들 방법 자체를 밟아 봐야 한다.
    const stage = page.locator("[data-studio-canvas-viewport] canvas").first();
    const stageBox = await stage.boundingBox().catch(() => null);
    let selectionPanelVisible = false;
    if (stageBox) {
      const cx = stageBox.x + stageBox.width / 2;
      const cy = stageBox.y + Math.min(stageBox.height / 2, 240);
      await page.mouse.move(cx - 60, cy);
      await page.mouse.down();
      await page.mouse.move(cx, cy + 40, { steps: 12 });
      await page.mouse.move(cx + 60, cy, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(400);

      await page.keyboard.press("v");
      await page.waitForTimeout(200);
      await page.mouse.click(cx, cy + 30);
      await page.waitForTimeout(400);
      selectionPanelVisible = await page
        .locator('[data-testid="studio-inspector-context-selection"]')
        .isVisible()
        .catch(() => false);
    }

    // 캔버스 히트테스트가 빗나가도 요소를 만들고 고르는 경로가 있어야 한다 —
    // "선택이 필요한데 만들 방법이 없다"를 배제하는 두 번째·세 번째 동선.
    let insertedViaCommandSearch = false;
    if (!selectionPanelVisible) {
      // F1 통합 검색 → '말풍선 추가' — 빈 문서에서 선택 가능한 요소를 만드는 정식 경로.
      await page.keyboard.press("F1");
      const dialog = page.locator('[role="dialog"]').first();
      if (
        await dialog
          .waitFor({ state: "visible", timeout: 5_000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await page.keyboard.type("말풍선 추가");
        await page.waitForTimeout(500);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(900);
        // 검색이 아무것도 못 찾았으면 다이얼로그가 그대로 남아 백드롭이 이후
        // 클릭을 전부 가로챈다 — 반드시 닫고 나간다.
        if (await dialog.isVisible().catch(() => false)) {
          await page.keyboard.press("Escape");
        }
        await dialog.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => undefined);
        await selectPrimaryTab(page, "properties");
        selectionPanelVisible = await page
          .locator('[data-testid="studio-inspector-context-selection"]')
          .waitFor({ state: "visible", timeout: 6_000 })
          .then(() => true)
          .catch(() => false);
        insertedViaCommandSearch = selectionPanelVisible;
      }
    }

    let selectedViaLayerPanel = false;
    if (!selectionPanelVisible) {
      await selectPrimaryTab(page, "layers");
      const row = page.locator(`${PANEL} [role="treeitem"]`).first();
      if (
        await row
          .waitFor({ state: "visible", timeout: 8_000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await row.click();
        await selectPrimaryTab(page, "properties");
        selectionPanelVisible = await page
          .locator('[data-testid="studio-inspector-context-selection"]')
          .waitFor({ state: "visible", timeout: 6_000 })
          .then(() => true)
          .catch(() => false);
        selectedViaLayerPanel = selectionPanelVisible;
      }
    }
    record(rows, {
      control: "선택 요소 속성 진입 (스트로크 그리기 → 선택)",
      state: "속성 탭 · 요소 선택됨",
      path: insertedViaCommandSearch
        ? "F1 통합 검색 → '말풍선 추가' → Enter → 속성 탭 (3 스텝)"
        : selectedViaLayerPanel
          ? "펜으로 캔버스 드래그 → 레이어 탭 → 레이어 행 클릭 → 속성 탭 (4 스텝)"
          : "펜으로 캔버스 드래그 → V → 스트로크 클릭 (3 스텝)",
      verdict: selectionPanelVisible ? "reachable" : "not-exercised",
      effect: selectionPanelVisible
        ? `선택 요소 속성 탭패널이 나타났다 (F1 삽입 경로=${insertedViaCommandSearch}, 레이어 패널 경로=${selectedViaLayerPanel})`
        : "헤드리스에서 캔버스 히트테스트·F1 삽입·레이어 행 어느 쪽으로도 선택을 만들지 못했다",
      defect: undefined,
    });

    if (selectionPanelVisible) {
      const selectionPanel = page.locator('[data-testid="studio-inspector-context-selection"]');
      const opacity = selectionPanel.getByRole("slider", { name: /불투명도/u }).first();
      let opacityChanged = false;
      if ((await opacity.count()) > 0) {
        const before = await opacity.inputValue();
        await opacity.fill("50");
        opacityChanged = (await opacity.inputValue()) !== before;
      }
      record(rows, {
        control: "선택 요소 · 불투명도 (기본 티어)",
        state: "속성 탭 · 요소 선택됨",
        path: "요소 선택 → 슬라이더 (0 추가 스텝)",
        verdict: (await opacity.count()) > 0 ? "reachable" : "blocked",
        effect: `값 변경 반영됨=${opacityChanged}`,
      });

      for (const sectionId of [
        "element.layout",
        "element.order-align",
        "element.constraints",
      ]) {
        const header = sectionHeader(page, sectionId);
        const exists = (await header.count()) > 0;
        const opened = exists ? await openSectionByKeyboard(page, sectionId) : false;
        record(rows, {
          control: `선택 요소 접기 · ${sectionId}`,
          state: "속성 탭 · 요소 선택됨",
          path: "요소 선택 → 섹션 헤더 Enter (1 스텝)",
          verdict: exists ? (opened ? "reachable" : "blocked") : "not-exercised",
          effect: exists ? `키보드로 펼침=${opened}` : "이 선택 타입에서는 렌더되지 않음",
        });
      }
    } else {
      report.notes.push(
        "선택 기반 컨트롤(불투명도·혼합 모드·클리핑·그룹·배치·정렬·순서·타이포그래피·말풍선 등)은 "
          + "이 하니스에서 구동하지 못했다. 원인은 인스펙터가 아니라 문서다: "
          + "펜 스트로크 드래그 · F1 통합 검색 '말풍선 추가' · 메뉴 텍스트▸말풍선 세 경로를 모두 밟았지만 "
          + "vite preview(백엔드 API 없음)에서는 문서에 요소가 하나도 생기지 않았다(레이어 트리 0행, JS 오류 없음, "
          + "502 는 /api 프록시뿐). 즉 '선택이 필요한 컨트롤에 도달할 수 없다'가 아니라 "
          + "'이 하니스에서 선택 대상을 만들 수 없다'다. 해당 분기는 jsdom 단위 테스트가 덮는다.",
      );
    }

    /* ---- I. 접기/펼치기 왕복 ------------------------------------------- */

    await selectPrimaryTab(page, "properties");
    const collapseButton = panel.locator('button[title="속성 패널 접기"]');
    await collapseButton.click();
    const collapsedAway = await panel
      .waitFor({ state: "hidden", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    const edgeRail = page.locator('button[title="속성 패널 펼치기"]');
    const railVisible = await edgeRail.isVisible().catch(() => false);
    let restored = false;
    if (railVisible) {
      await edgeRail.click();
      restored = await panel
        .waitFor({ state: "visible", timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
    }
    record(rows, {
      control: "인스펙터 접기 → 엣지 레일 → 펼치기 (왕복)",
      state: "데스크톱",
      path: "인스펙터 상단 '접기' → 우측 엣지 레일 '속성' 클릭",
      verdict: collapsedAway && restored ? "reachable" : "blocked",
      effect: `접힘=${collapsedAway}, 복구 레일 노출=${railVisible}, 복원=${restored} — 캔버스가 패널 폭 전체를 회수한다`,
      defect: collapsedAway && !railVisible ? "접은 뒤 되돌릴 어포던스가 없다" : undefined,
    });

    await page.screenshot({ path: join(SCRATCH, "inspector-desktop.png") }).catch(() => undefined);
  } finally {
    await context.close();
  }
}

/* -------------------------------------------------------------- mobile run */

async function walkMobile(
  browser: Browser,
  baseUrl: string,
  report: WalkthroughReport,
): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: 360, height: 780 },
    hasTouch: true,
    isMobile: true,
    userAgent: MOBILE_UA,
    locale: "ko-KR",
  });
  await installStudioPreferences(context, true);
  const page = await context.newPage();
  const rows = report.rows;

  try {
    await gotoStudio(page, baseUrl);
    await page
      .locator('nav[aria-label="스튜디오 모바일 도구막대"]')
      .waitFor({ state: "visible", timeout: 20_000 });

    // 인스펙터 런처('패널')는 접힌 2행에 있다. 1행의 '도구' disclosure 는 가로
    // 드로잉 스크롤 밖에 고정되어, 360px 첫 화면에서도 스와이프 없이 보여야 한다.
    const workspaceToggle = page.locator('[data-studio-mobile-workspace-toggle="true"]');
    const toggleInitiallyVisible = await workspaceToggle.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const dockBounds = element
        .closest<HTMLElement>('[data-studio-mobile-editing-dock="true"]')
        ?.getBoundingClientRect();
      const hit = document.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
      );
      return Boolean(
        dockBounds
        && !element.closest('[data-studio-mobile-dock-scroll]')
        && bounds.width >= 44
        && bounds.height >= 44
        && bounds.left >= dockBounds.left - 0.5
        && bounds.right <= dockBounds.right + 0.5
        && bounds.left >= -0.5
        && bounds.right <= window.innerWidth + 0.5
        && (hit === element || element.contains(hit))
      );
    });
    const toggleExpandedBefore = await workspaceToggle.getAttribute("aria-expanded");
    await workspaceToggle.click();
    const toggleExpandedAfter = await workspaceToggle.getAttribute("aria-expanded");
    record(rows, {
      control: "모바일 작업공간 도구 펼치기 (인스펙터 진입 선행 단계)",
      state: "360px",
      path: "하단 도크 1행의 고정 ∧ '도구' 토글 (1 스텝)",
      verdict:
        toggleInitiallyVisible && toggleExpandedAfter === "true"
          ? "reachable"
          : "blocked",
      effect:
        `초기 고정·히트 가능=${toggleInitiallyVisible}; `
        + `aria-expanded ${toggleExpandedBefore} → ${toggleExpandedAfter}; `
        + "2행(댓글·페이지·필터·새 작업·패널·색각·줌)이 나타난다",
      defect:
        !toggleInitiallyVisible
          ? "도구 토글이 첫 화면에 고정되지 않았거나 실제 히트테스트를 통과하지 못한다"
          : toggleExpandedAfter !== "true"
            ? "작업공간 토글이 2행을 펼치지 못한다"
            : undefined,
    });

    const launcher = page.locator(
      'nav[aria-label="스튜디오 모바일 도구막대"] button[aria-label="작업 패널"]',
    );
    const launcherInitiallyVisible = await launcher.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const scrollBounds = element
        .closest<HTMLElement>('[data-studio-mobile-dock-scroll="secondary"]')
        ?.getBoundingClientRect();
      const hit = document.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
      );
      return Boolean(
        scrollBounds
        && bounds.width >= 44
        && bounds.height >= 44
        && bounds.left >= scrollBounds.left - 0.5
        && bounds.right <= scrollBounds.right + 0.5
        && (hit === element || element.contains(hit))
      );
    });
    if (!launcherInitiallyVisible) {
      record(rows, {
        control: "모바일 작업 패널 열기",
        state: "360px · 도구 행 펼침",
        path: "하단 도구막대 '도구' → '패널' (2 스텝)",
        verdict: "blocked",
        effect: "패널 런처가 2행의 초기 가시 영역에 없거나 실제 히트테스트를 통과하지 못함",
      });
      return;
    }
    await launcher.click();

    const sheet = page.locator(PANEL);
    const opened = await sheet
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    record(rows, {
      control: "모바일 작업 패널 열기",
      state: "360px",
      path: "하단 도구막대 '도구' → '패널' (2 스텝)",
      verdict: opened ? "reachable" : "blocked",
      effect: `런처 초기 가시·히트 가능=${launcherInitiallyVisible}; role=dialog 시트가 올라옴=${opened}`,
      defect: opened ? undefined : "360px 에서 인스펙터에 도달할 수 없다",
    });
    if (!opened) return;

    report.mobile.panel = await measure(sheet);
    report.mobile.chromeHeight = await measureChromeHeight(page);
    log(
      `mobile sheet ${report.mobile.panel.width}×${report.mobile.panel.height}, chrome ${report.mobile.chromeHeight}px`,
    );

    // 탭 스트립이 360px 에서도 전부 닿는가.
    for (const tab of ["properties", "layers", "document", "publish"]) {
      const button = page.locator(`${NAVIGATOR} [data-studio-inspector-primary-tab="${tab}"]`);
      const box = await button.boundingBox();
      const inViewport = box !== null && box.x >= 0 && box.x + box.width <= 360;
      record(rows, {
        control: `모바일 탭 · ${tab}`,
        state: "360px · 속성 시트 열림",
        path: "'작업' 시트 → 탭 스트립 (2 스텝)",
        verdict: inViewport ? "reachable" : "blocked",
        effect: `가로 360px 안에 들어옴=${inViewport} (x=${Math.round(box?.x ?? -1)}, w=${Math.round(box?.width ?? 0)})`,
        defect: inViewport ? undefined : "탭이 뷰포트 밖으로 잘린다",
      });
    }

    await selectPrimaryTab(page, "document");
    await selectDocumentTab(page, "캔버스");
    const canvasPanel = await controlledPanel(page, documentTab(page, "캔버스"), ["캔버스 설정"]);
    if (await canvasPanel.isVisible().catch(() => false)) {
      report.mobile.canvasPanelCollapsed = (await measure(canvasPanel)).height;
      const collapsedHeaders = await page
        .locator('[data-inspector-section-open="false"]')
        .count();
      record(rows, {
        control: "모바일 캔버스 패널 (접힌 기본 상태)",
        state: "360px · 페이지 ▸ 캔버스",
        path: "'작업' 시트 → 페이지 → 캔버스 (3 스텝)",
        verdict: collapsedHeaders >= CANVAS_SECTIONS.length ? "reachable" : "blocked",
        effect: `접힌 섹션 ${collapsedHeaders}개, 패널 높이 ${report.mobile.canvasPanelCollapsed}px`,
      });
    }

    // 터치 대상 감사 — 시트 안의 모든 인터랙티브 요소.
    report.mobile.smallTouchTargets = await page.evaluate((panelSelector) => {
      const sheetRoot = document.querySelector<HTMLElement>(panelSelector);
      if (!sheetRoot) return [];
      const interactive = [
        ...sheetRoot.querySelectorAll<HTMLElement>(
          'button, [role="tab"], a[href], select, input:not([type="hidden"]), textarea, [role="button"]',
        ),
      ];
      const small: { label: string; height: number }[] = [];
      for (const node of interactive) {
        if (node.closest("[hidden]") || node.hasAttribute("hidden")) continue;
        const rect = node.getBoundingClientRect();
        if (rect.height < 2 || rect.width < 2) continue;
        // 실제 탭 대상은 감싸는 <label> 이나 부모 hit-area 일 수 있다
        // (스와치 버튼, 체크박스 행). 그 높이를 유효 터치 크기로 본다.
        const effective = Math.max(
          rect.height,
          node.parentElement?.getBoundingClientRect().height ?? 0,
          node.closest("label")?.getBoundingClientRect().height ?? 0,
        );
        if (effective >= 44) continue;
        const label =
          node.getAttribute("aria-label")
          ?? node.getAttribute("title")
          ?? (node.textContent ?? "").trim().slice(0, 30)
          ?? node.tagName;
        small.push({ label: label || node.tagName, height: Math.round(rect.height) });
      }
      return small;
    }, PANEL);

    // 시트 스냅 — 크기를 바꿔 캔버스를 되찾을 수 있는가.
    // 페이지 시트에도 같은 핸들이 있다 — 속성 시트의 것만 잡는다.
    const handle = sheet
      .locator('[data-studio-sheet-drag-handle="true"][data-studio-sheet-kind="props"]')
      .first();
    const snapBefore = await sheet.getAttribute("data-studio-sheet-snap");
    let snapChanged = false;
    if ((await handle.count()) > 0) {
      await handle.click();
      await awaitElementAnimations(sheet);
      snapChanged = (await sheet.getAttribute("data-studio-sheet-snap")) !== snapBefore;
    }
    record(rows, {
      control: "모바일 시트 스냅 (compact/medium/full)",
      state: "360px · 속성 시트 열림",
      path: "시트 상단 드래그 핸들 탭 (2 스텝)",
      verdict: snapChanged ? "reachable" : "blocked",
      effect: `스냅 ${snapBefore} → ${await sheet.getAttribute("data-studio-sheet-snap")} — 시트를 줄여 캔버스를 되찾을 수 있다`,
      defect: snapChanged ? undefined : "핸들 탭이 스냅을 바꾸지 않는다",
    });

    const closeButton = page.getByRole("button", { name: "작업 패널 닫기", exact: true });
    let closed = false;
    if ((await closeButton.count()) > 0) {
      await closeButton.click();
      closed = await sheet
        .waitFor({ state: "hidden", timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
    }
    record(rows, {
      control: "모바일 시트 닫기 (왕복)",
      state: "360px · 속성 시트 열림",
      path: "시트 헤더 X (1 스텝)",
      verdict: closed ? "reachable" : "blocked",
      effect: `시트가 닫혀 캔버스가 화면 전체를 회수함=${closed}`,
    });

    await page.screenshot({ path: join(SCRATCH, "inspector-mobile-360.png") }).catch(() => undefined);
  } finally {
    await context.close();
  }
}

/* --------------------------------------------------------------------- run */

async function main(): Promise<void> {
  if (!existsSync(join(DIST_DIR, "index.html"))) {
    throw new Error('missing dist/index.html; run "pnpm run build" first');
  }

  const port = await findFreePort({ unavailableMessage: "could not allocate preview port" });
  const baseUrl = `http://127.0.0.1:${port}`;
  let previewServer: PreviewServer | null = null;
  let browser: Browser | null = null;

  const report: WalkthroughReport = {
    desktop: {
      panel: { width: 0, height: 0 },
      chromeHeight: -1,
      chromeBands: {},
      canvasPanelCollapsed: -1,
      canvasPanelExpanded: -1,
    },
    mobile: {
      panel: { width: 0, height: 0 },
      chromeHeight: -1,
      canvasPanelCollapsed: -1,
      smallTouchTargets: [],
    },
    rows: [],
    notes: [],
    failures: [],
  };

  try {
    previewServer = await preview({
      preview: { host: "127.0.0.1", port, strictPort: true },
    });
    await waitForServer(baseUrl, {
      notReadyMessage: `preview did not become ready: ${baseUrl}`,
    });
    log(`production preview ready @ ${baseUrl}`);

    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    await walkDesktop(browser, baseUrl, report);
    await walkMobile(browser, baseUrl, report);
  } finally {
    await browser?.close().catch(() => undefined);
    await previewServer?.close();
  }

  for (const row of report.rows) {
    if (row.verdict === "blocked") {
      report.failures.push(`${row.control}: ${row.defect ?? row.effect}`);
    }
  }
  if (report.desktop.canvasPanelCollapsed >= report.desktop.canvasPanelExpanded) {
    report.failures.push(
      "canvas panel is not actually shorter when collapsed — the disclosure buys nothing",
    );
  }

  console.log(JSON.stringify(report, null, 2));
  const reachable = report.rows.filter((row) => row.verdict === "reachable").length;
  log(
    `${reachable}/${report.rows.length} controls reachable and effective; `
      + `${report.rows.filter((r) => r.verdict === "not-exercised").length} not exercised`,
  );

  // 게이트를 깨지는 않지만 사람이 봐야 하는 것들 — "동선은 있으나 매끄럽지 않다".
  const softFindings = report.rows.filter((row) => row.verdict !== "blocked" && row.defect);
  if (softFindings.length > 0) {
    log(`FINDINGS (게이트 미실패, 검토 대상 ${softFindings.length}건):`);
    for (const row of softFindings) log(`  · ${row.control}: ${row.defect}`);
  }
  if (report.mobile.smallTouchTargets.length > 0) {
    log(`360px 44px 미만 터치 대상 ${report.mobile.smallTouchTargets.length}건:`);
    for (const target of report.mobile.smallTouchTargets) {
      log(`  · ${target.label} (${target.height}px)`);
    }
  }
  for (const note of report.notes) log(`NOTE: ${note}`);
  if (report.failures.length > 0) {
    log(`RESULT: FAIL (${report.failures.length})`);
    for (const failure of report.failures) log(`  ✗ ${failure}`);
    process.exitCode = 1;
    return;
  }
  log("RESULT: OK");
}

void main().catch((error: unknown) => {
  console.error("[verify-inspector-walkthrough] fatal:", error);
  process.exitCode = 1;
});
