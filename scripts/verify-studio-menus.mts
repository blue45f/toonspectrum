/**
 * scripts/verify-studio-menus.mts
 * Desktop headless check: Studio application menus + left rail + menu-driven popovers.
 *
 * Desktop IA (canvas-first simplification 2026-09-15, discoverability follow-up 2026-09-17):
 * - Catalogue: 17 specification groups + AI remains the complete command inventory.
 * - Presentation: nine primary workflow titles. Fourteen catalogue groups are owned by six
 *   composites: 파일←파일·협업, 편집←편집·선택·변형, 보기←보기·창, 캔버스는 문서 규격의 독립 메뉴,
 *   삽입←텍스트·벡터·3D, 창작←그리기·만화·애니메이션, 효과←필터.
 * - AI remains first-class in a detached action menu beside completion controls.
 * - Every source group keeps its caption, row ids and execution handler.
 *
 * Run: pnpm exec tsx scripts/verify-studio-menus.mts
 * Expects production build in dist/ (vite preview).
 */
import { pathToFileURL } from "node:url";

import { chromium, type Locator, type Page } from "playwright";

import {
  STUDIO_MAIN_MENU_ACTION_ORDER,
  STUDIO_MAIN_MENU_COMPOSITE_GROUPS,
  STUDIO_MAIN_MENU_PRESENTATION_ORDER,
  studioMainMenuPresentedTitleFor,
} from "../apps/web/src/domains/creator/studio-main-menu-presentation";

import { findFreePort, spawnVitePreview, waitForServer } from "./lib/studio-verify-preview-harness.mjs";

import type { StudioRailToolId } from "../apps/web/src/domains/creator/studio-app-settings";
import type { StudioMainMenuCompositeGroupId } from "../apps/web/src/domains/creator/studio-main-menu-presentation";
import type { ChildProcess } from "node:child_process";

const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";

interface CatalogueGroup {
  /** §15.3 catalogue group id — the key the presentation folds on. */
  readonly id: string;
  /**
   * Korean group name. For a title that stands on its own this is the menubar
   * label; inside a composite dropdown it is the section caption printed above
   * the group's first row (`data-studio-main-menu-section`).
   */
  readonly caption: string;
  readonly items: readonly string[];
}

/**
 * Every catalogue group and every row it must still expose. Rows are asserted under
 * whichever title now owns them — folding two tables into one must never drop a row,
 * so `buildPresentedMenus()` re-reports any group the presentation does not place.
 */
export const CATALOGUE_GROUPS: readonly CatalogueGroup[] = [
  {
    id: "file",
    caption: "파일",
    items: [
      "저장하기",
      "게시",
      "프로젝트 가져오기…",
      "PSD 가져오기…",
      "ORA / CBZ / WILL 가져오기…",
      "프로젝트 센터…",
      "내보내기 / 다운로드",
      "백업 (.json)",
      "빠른 시작 · 새 작업…",
      "저장 기록…",
      "게시 패키지…",
      "에셋 권리 감사…",
    ],
  },
  {
    id: "edit",
    caption: "편집",
    items: [
      "실행취소",
      "다시실행",
      "잘라내기",
      "복사",
      "붙여넣기",
      "현재 위치에 붙여넣기",
      "선택 제거",
      "복제",
      "작업 내역",
      "펜 압력 설정…",
      "애플리케이션 설정…",
      "자동 액션 · 매크로…",
    ],
  },
  {
    id: "view",
    caption: "보기",
    items: [
      "플로팅 UI · 배치 설정…",
      "확대",
      "축소",
      "왼쪽으로 90° 회전",
      "오른쪽으로 90° 회전",
      "화면에 맞게 조정",
      "실제 픽셀 (100%)",
      "현재 보기 저장",
      "제작 인사이트…",
      "미니맵 · 탐색",
      "밑그림 오버레이 (이메레스)",
    ],
  },
  {
    id: "canvas",
    caption: "캔버스",
    items: [
      "캔버스 px 눈금자",
      "원근 도우미 보기",
      "캔버스 크기 · 문서 설정…",
      "웹툰 플랫폼 규격 가이드",
      "그리드",
      "현재 캔버스 · 범용·고화질 세로 웹툰 · 1080 × 8000px",
      "현재 캔버스 · 네이버 연재형 · 690 × 8000px",
      "현재 캔버스 · 카카오 연재형 · 720 × 8000px",
      "현재 캔버스 · WEBTOON Canvas형 · 800 × 8000px",
      "스티키 노트",
    ],
  },
  {
    id: "layer",
    caption: "레이어",
    items: [
      "이미지…",
      "레이어 · 맨 위로",
      "레이어 · 맨 뒤로",
      "레이어 자르기…",
      "레이어 마스크 편집…",
      "나만 숨긴 레이어 모두 표시",
    ],
  },
  { id: "select", caption: "선택", items: ["모두 선택", "선택 해제", "선택 반전"] },
  { id: "transform", caption: "변형", items: ["선택 변형"] },
  {
    id: "brush",
    caption: "그리기",
    items: [
      "펜",
      "지우개",
      "채우기",
      "스마트 도형",
      "방금 그린 선 다듬기…",
      "브러시 프리셋 목록…",
      "브러시 스튜디오…",
      "자연 매체 · 안료…",
      "내 브러시…",
      "브러시 가져오기 (ABR · MYB · KPP)…",
      "배경 · 톤",
      "팔레트 · 브랜드",
    ],
  },
  {
    id: "filter",
    caption: "필터",
    items: [
      "마지막 필터…",
      "가우시안 블러",
      "모션 블러",
      "색조 / 채도 / 밝기",
      "명도 / 대비",
      "색상 커브",
      "레이어 보정 · 레벨",
      "색수차",
      "스케치 선화 정리",
      "노이즈 추가",
    ],
  },
  { id: "vector", caption: "벡터", items: ["요소 · 도형"] },
  {
    id: "text",
    caption: "텍스트",
    items: ["말풍선", "텍스트", "대사 일괄 편집…", "대사 번역 · 다국어…"],
  },
  {
    id: "comic",
    caption: "만화",
    items: [
      "새 페이지",
      "콜라주",
      "톤 · 스크린톤",
      "Writer Room · 대본…",
      "스토리보드 그리드…",
      "제작 바이블…",
      "마감·품질 검사…",
      "세로 스크롤 미리보기…",
      "애니매틱 타임라인…",
    ],
  },
  { id: "animation", caption: "애니메이션", items: ["프레임 애니메이션…"] },
  { id: "3d", caption: "3D", items: ["3D 데생 인형", "3D 캐릭터", "3D 배경"] },
  { id: "collaboration", caption: "협업", items: ["팀 · 공유 권한…", "페이지 검토 · 승인…"] },
  {
    id: "window",
    caption: "창",
    items: [
      "슈퍼심플 레이아웃",
      "전체 레이아웃",
      "패널 접어 넓게",
      "캔버스만",
      "템플릿 · 에셋",
      "참고 이미지 창",
      "멀티 디스플레이 작업공간…",
    ],
  },
  { id: "ai", caption: "AI", items: ["AI 어시스트", "스톡 이미지", "연동 설정"] },
  {
    id: "help",
    caption: "도움말",
    items: [
      "명령 · 속성 통합 검색",
      "다른 앱 용어 찾기",
      "현재 도구 도움말",
      "도움말 홈 · 단계별 가이드",
      "단축키 · 기본 조작",
      "기기 · 브라우저 진단…",
      "복구 가이드…",
      "라이선스 · 서드파티 고지…",
      "버그 리포트 패키지…",
    ],
  },
];

/** Visible Korean titles for the six workflow composites. */
const COMPOSITE_TITLES: Readonly<Record<StudioMainMenuCompositeGroupId, string>> = {
  file: "파일",
  edit: "편집",
  view: "보기",
  insert: "삽입",
  create: "창작",
  filter: "효과",
};

interface PresentedMenu {
  /** Presented (menubar) group id from the presentation order. */
  readonly id: string;
  /** Menubar title — also the dropdown's `aria-label`. */
  readonly title: string;
  /** `true` when several catalogue groups share this workflow title. */
  readonly composite: boolean;
  /** Catalogue groups this title owns, in the order their sections render. */
  readonly sections: readonly CatalogueGroup[];
}

const PRESENTED_ORDER: readonly string[] = STUDIO_MAIN_MENU_PRESENTATION_ORDER;
const ACTION_ORDER: readonly string[] = STUDIO_MAIN_MENU_ACTION_ORDER;

/** Canvas-first IA: nine primary titles, plus AI beside completion actions. */
const PINNED_PRESENTED_TITLES: readonly string[] = [
  "파일",
  "편집",
  "보기",
  "캔버스",
  "삽입",
  "레이어",
  "창작",
  "효과",
  "도움말",
];
const PINNED_ACTION_TITLES: readonly string[] = ["AI 도우미"];

function compositeSourceOrder(presentedId: string): readonly string[] | null {
  return (
    (STUDIO_MAIN_MENU_COMPOSITE_GROUPS as Readonly<Record<string, readonly string[]>>)[
      presentedId
    ] ?? null
  );
}

/**
 * Folds `CATALOGUE_GROUPS` exactly the way the product does: `studioMainMenuPresentedTitleFor`
 * decides which title owns a group and `STUDIO_MAIN_MENU_COMPOSITE_GROUPS` decides the section
 * order inside a composite dropdown. `orphans` catches any catalogue group the presentation
 * would not place, so a future re-fold cannot silently retire rows from this verifier.
 */
function buildPresentedMenus(): {
  menus: PresentedMenu[];
  actionMenus: PresentedMenu[];
  orphans: string[];
} {
  const orphans: string[] = [];
  const owned = new Map<string, CatalogueGroup[]>();
  for (const group of CATALOGUE_GROUPS) {
    const presentedId = studioMainMenuPresentedTitleFor(group.id);
    if (!PRESENTED_ORDER.includes(presentedId) && !ACTION_ORDER.includes(presentedId)) {
      orphans.push(`${group.caption} (${group.id}) → ${presentedId}`);
      continue;
    }
    const bucket = owned.get(presentedId);
    if (bucket) bucket.push(group);
    else owned.set(presentedId, [group]);
  }

  const buildOrder = (order: readonly string[]): PresentedMenu[] => {
    const menus: PresentedMenu[] = [];
    for (const presentedId of order) {
      const sections = owned.get(presentedId);
      if (!sections || sections.length === 0) {
        orphans.push(`제시 제목에 대응하는 카탈로그 그룹 없음: ${presentedId}`);
        continue;
      }
      const sourceOrder = compositeSourceOrder(presentedId);
      const ordered = sourceOrder
        ? [...sections].sort(
          (a, b) => sourceOrder.indexOf(a.id) - sourceOrder.indexOf(b.id),
        )
        : sections;
      menus.push({
        id: presentedId,
        title: ACTION_ORDER.includes(presentedId)
          ? "AI 도우미"
          : sourceOrder
            ? COMPOSITE_TITLES[presentedId as StudioMainMenuCompositeGroupId]
            : ordered[0].caption,
        composite: sourceOrder !== null,
        sections: ordered,
      });
    }
    return menus;
  };

  return {
    menus: buildOrder(PRESENTED_ORDER),
    actionMenus: buildOrder(ACTION_ORDER),
    orphans,
  };
}

const {
  menus: PRESENTED_MENUS,
  actionMenus: ACTION_MENUS,
  orphans: PRESENTATION_ORPHANS,
} = buildPresentedMenus();

/** Compare primary and action menu titles independently so AI never re-enters the scroll lane. */
function pinnedTitleDrift(): string[] {
  const primary = PRESENTED_MENUS.map((menu) => menu.title);
  const actions = ACTION_MENUS.map((menu) => menu.title);
  const primaryMatches =
    primary.length === PINNED_PRESENTED_TITLES.length
    && primary.every((title, index) => title === PINNED_PRESENTED_TITLES[index]);
  const actionMatches =
    actions.length === PINNED_ACTION_TITLES.length
    && actions.every((title, index) => title === PINNED_ACTION_TITLES[index]);
  const failures: string[] = [];
  if (!primaryMatches) {
    failures.push(
      `기본 메뉴 8종 계약 위반 — 기대: [${PINNED_PRESENTED_TITLES.join(" ")}] / 실제: [${primary.join(" ")}]`,
    );
  }
  if (!actionMatches) {
    failures.push(
      `액션 메뉴 계약 위반 — 기대: [${PINNED_ACTION_TITLES.join(" ")}] / 실제: [${actions.join(" ")}]`,
    );
  }
  return failures;
}

const PRESENTATION_TITLE_DRIFT = pinnedTitleDrift();

/**
 * Menubar title that currently owns a catalogue group (예: "canvas" → 보기). An unmapped group
 * falls back to its own caption instead of throwing: `PRESENTATION_ORPHANS` already reports
 * that case as a failure, and a throw here would abort the run before the report is printed.
 */
function presentedTitleFor(catalogueGroupId: string): string {
  const presentedId = studioMainMenuPresentedTitleFor(catalogueGroupId);
  const menu = [...PRESENTED_MENUS, ...ACTION_MENUS]
    .find((entry) => entry.id === presentedId);
  if (menu) return menu.title;
  const group = CATALOGUE_GROUPS.find((entry) => entry.id === catalogueGroupId);
  return group?.caption ?? catalogueGroupId;
}

/** Pin the shipped first-run contract independently of the settings implementation. */
export const FIRST_RUN_RAIL_TOOL_IDS = [
  "select", "pen", "eraser", "fill", "marquee-rect", "smart-shape", "text", "image", "transform", "lasso",
] as const satisfies readonly StudioRailToolId[];

export const IMAGE_RAIL_ENTRY = { id: "image", label: "이미지·소재" } as const;
export const QUICK_ACCESS_CLOSE_LABEL = "빠른 액세스 팔레트 닫기";

/** Every first-run tool and the specialized tools added below must remain reachable. */
const PERSISTENT_RAIL_TOOLS = [
  "선택 (V)",
  "펜 (B)",
  "지우개 (E)",
  // Fill: when no raster is selected the aria-label becomes the guard reason (still exposed).
  { anyOf: ["색 채우기 (G)", "래스터 이미지 레이어를 먼저 선택하세요."] },
  "사각 선택 (M)",
  "스마트 도형",
  "색 가져오기 (I / Alt+클릭)",
  "텍스트",
  "말풍선",
  IMAGE_RAIL_ENTRY.label,
] as const;

/** More uses catalogue names; the exposed rail also preserves its shortcut suffix. */
export const OPTIONAL_RAIL_TOOLS = [
  { id: "eyedropper", moreLabel: "색 가져오기", railLabel: "색 가져오기 (I / Alt+클릭)" },
  { id: "bubble", moreLabel: "말풍선", railLabel: "말풍선" },
  { id: "smart-shape", moreLabel: "스마트 도형", railLabel: "스마트 도형" },
  { id: "shape-rect", moreLabel: "사각형 도형", railLabel: "사각형 도형" },
  { id: "shape-ellipse", moreLabel: "타원 도형", railLabel: "타원 도형" },
  { id: "reference", moreLabel: "참고 이미지", railLabel: "참고 이미지" },
] as const satisfies readonly { id: StudioRailToolId; moreLabel: string; railLabel: string }[];

export const DESKTOP_FLOATING_LAYOUT_DIALOG = {
  name: "보기 · 플로팅 UI",
  closeLabel: "보기 · 플로팅 UI 닫기",
} as const;

/**
 * Open via main menu → assert popover chrome appears.
 *
 * Entries name the CATALOGUE group that owns the row; the runner resolves the visible
 * title and surface, so composite moves and the detached AI action remain stable.
 */
export const MENU_DRIVEN_POPOVERS: {
  groupId: string;
  item: string;
  /** Prefer unique headers so menubar labels are not false positives. */
  expectVisible: string[];
  expectDialogName?: string;
  /** Require the loaded feature body in addition to its surrounding popover chrome. */
  expectSelector?: string;
  /** A shared word such as “배경” must belong to the loaded editor, not surrounding chrome. */
  contentSelector?: string;
}[] = [
  {
    groupId: "window",
    item: "템플릿 · 에셋",
    expectVisible: ["템플릿", "이메레스", "장면", "클립", "효과"],
  },
  {
    groupId: "brush",
    item: "배경 · 톤",
    expectVisible: ["배경"],
    contentSelector: '[data-studio-background-panel="true"]',
    expectSelector: '[data-studio-background-panel="true"] [role="tablist"][aria-label="배경 편집 탭"]',
  },
  {
    groupId: "brush",
    item: "팔레트 · 브랜드",
    expectVisible: ["스타일", "팔레트", "브랜드"],
  },
  {
    groupId: "ai",
    item: "AI 어시스트",
    expectVisible: ["AI 연동", "어시스트", "스톡"],
  },
  {
    groupId: "file",
    item: "프로젝트 센터…",
    expectVisible: ["프로젝트 센터", "백업 · 기획 · 제작 · 검수 · 게시"],
    expectDialogName: "프로젝트 센터",
  },
];

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

/**
 * Resolves once the element's box has stopped moving for `quietMs`. Playwright's own
 * stability check only spans two animation frames, which is shorter than the gap between
 * the pointerdown and mouseup it dispatches on a loaded runner.
 */
async function waitForStableBox(target: Locator, quietMs: number, timeoutMs: number): Promise<void> {
  const started = Date.now();
  let last = await target.boundingBox();
  let quietSince = Date.now();
  while (Date.now() - started < timeoutMs) {
    await target.page().waitForTimeout(50);
    const next = await target.boundingBox();
    const same = Boolean(last && next)
      && last!.x === next!.x && last!.y === next!.y
      && last!.width === next!.width && last!.height === next!.height;
    if (!same) quietSince = Date.now();
    last = next;
    if (next && Date.now() - quietSince >= quietMs) return;
  }
}

async function openMainMenuGroup(
  page: Page,
  label: string,
  surface: "primary" | "action" = "primary",
): Promise<void> {
  const nav = page.locator(
    surface === "action"
      ? '[data-studio-main-menu-action="true"]'
      : '[data-studio-main-menu="true"]',
  );
  await nav.waitFor({ state: "visible", timeout: 15000 });
  // Close any open group first
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(80);
  const btn = nav.getByRole("menuitem", { name: label, exact: true });
  const menu = page.locator(`[role="menu"][aria-label="${label}"]`);
  // The workspace chip to the left of the titles grows by a "변경됨"/"세션" badge once the
  // workspace preferences settle after a cold load. Traced on CI's Chrome build (2026-09-06):
  // when that badge lands between the pointerdown and the mouseup of the first click, every
  // title shifts ~38px, the click falls on the bar instead of the button and no menu opens,
  // although every later open settles in well under 100ms. Let the title hold still first and
  // retry a click that was swallowed that way; a menu that never opens still fails.
  await waitForStableBox(btn, 350, 4000);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await btn.click({ timeout: 5000 });
    const opened = await menu
      .waitFor({ state: "visible", timeout: attempt === 0 ? 2500 : 5000 })
      .then(() => true)
      .catch(() => false);
    if (opened) return;
    if ((await btn.getAttribute("aria-expanded").catch(() => null)) === "true") {
      // The click landed and the dropdown is on its way; do not toggle it shut again.
      await menu.waitFor({ state: "visible", timeout: 5000 });
      return;
    }
    if (attempt === 0) {
      log(`  retry: 메인 메뉴 [${label}] 첫 클릭이 제목 이동에 밀려 무시됨 — 안정화 후 다시 클릭`);
      await waitForStableBox(btn, 350, 4000);
    }
  }
  throw new Error(`메인 메뉴 [${label}] 열기 실패: 다시 클릭해도 메뉴가 열리지 않음`);
}

export function menuItemRowHasExactLabel(rowText: string, name: string): boolean {
  return rowText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .includes(name);
}

interface VisibleMenuFrame {
  readonly itemRows: readonly string[];
  readonly sectionCaptions: readonly string[];
}

const EMPTY_VISIBLE_MENU_FRAME: VisibleMenuFrame = {
  itemRows: [],
  sectionCaptions: [],
};

/**
 * Capture rows and accessible composite captions in one browser evaluation. Pointer-opened
 * desktop menus can hand hover ownership to a neighbouring title when the compressed header
 * settles, so splitting these reads across several Playwright calls creates a false missing-row
 * failure even though the complete frame was rendered.
 */
async function snapshotVisibleMenuFrame(menu: Locator): Promise<VisibleMenuFrame> {
  return menu.evaluateAll((elements) => {
    for (const element of elements) {
      if (!(element instanceof HTMLElement)) continue;
      const menuStyle = getComputedStyle(element);
      const menuRect = element.getBoundingClientRect();
      if (
        menuStyle.display === "none"
        || menuStyle.visibility === "hidden"
        || menuRect.width <= 0
        || menuRect.height <= 0
      ) {
        continue;
      }

      const itemRows = Array.from(element.querySelectorAll<HTMLElement>(
        '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
      )).flatMap((row) => {
        const style = getComputedStyle(row);
        const rect = row.getBoundingClientRect();
        if (
          style.display === "none"
          || style.visibility === "hidden"
          || rect.width <= 0
          || rect.height <= 0
        ) {
          return [];
        }
        const label = row.querySelector<HTMLElement>(
          '[data-studio-main-menu-item-label="true"]',
        )?.textContent?.trim();
        return label ? [label] : [];
      });

      const sectionCaptions = Array.from(element.querySelectorAll<HTMLElement>(
        '[role="group"][aria-labelledby]',
      )).flatMap((group) => {
        const labelledBy = group.getAttribute("aria-labelledby")?.trim();
        if (!labelledBy || labelledBy.includes(" ")) return [];
        const caption = document.getElementById(labelledBy);
        if (!(caption instanceof HTMLElement) || !group.contains(caption)) return [];
        if (!caption.hasAttribute("data-studio-main-menu-section")) return [];
        const style = getComputedStyle(caption);
        const rect = caption.getBoundingClientRect();
        const label = caption.textContent?.trim();
        if (
          !label
          || style.display === "none"
          || style.visibility === "hidden"
          || rect.width <= 0
          || rect.height <= 0
        ) {
          return [];
        }
        return [label];
      });

      return { itemRows, sectionCaptions };
    }
    return { itemRows: [], sectionCaptions: [] };
  });
}

async function openMainMenuGroupWithKeyboard(
  page: Page,
  label: string,
  surface: "primary" | "action",
): Promise<void> {
  const nav = page.locator(
    surface === "action"
      ? '[data-studio-main-menu-action="true"]'
      : '[data-studio-main-menu="true"]',
  );
  await nav.waitFor({ state: "visible", timeout: 15_000 });
  await page.keyboard.press("Escape").catch(() => undefined);
  const trigger = nav.getByRole("menuitem", { name: label, exact: true });
  await trigger.focus();
  await trigger.press("ArrowDown");
  await page.locator(`[role="menu"][aria-label="${label}"]`).waitFor({
    state: "visible",
    timeout: 5_000,
  });
}

async function captureMainMenuFrame(
  page: Page,
  label: string,
  surface: "primary" | "action",
): Promise<VisibleMenuFrame> {
  let frame = EMPTY_VISIBLE_MENU_FRAME;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt === 0) await openMainMenuGroup(page, label, surface);
    else await openMainMenuGroupWithKeyboard(page, label, surface);

    frame = await snapshotVisibleMenuFrame(
      page.locator(`[role="menu"][aria-label="${label}"]`),
    ).catch(() => EMPTY_VISIBLE_MENU_FRAME);
    if (frame.itemRows.length > 0) return frame;

    if (attempt === 0) {
      log(`  retry: 메인 메뉴 [${label}]가 포인터 수명주기 중 닫힘 — 키보드 경로로 다시 열기`);
    }
  }
  return frame;
}

async function hasVisibleText(page: Page | Locator, text: string): Promise<boolean> {
  const matches = page.getByText(text);
  const count = await matches.count();
  for (let index = 0; index < count; index += 1) {
    if (await matches.nth(index).isVisible().catch(() => false)) return true;
  }
  return false;
}

/**
 * 고정 내보내기 옵션 컨트롤 — 액션 레인의 그것 하나.
 *
 * 이름만으로는 못 집는다: §15.3 커맨드 바가 사용자 설정이라 같은 명령이 슬롯에도 놓일 수
 * 있고, Playwright 의 `name` 은 기본이 **부분 일치**라 슬롯의 한정 이름("슬롯 4: 내보내기
 * 옵션")까지 함께 걸려 strict mode 위반이 된다. 제품은 두 컨트롤을 서로 다른 접근명으로
 * 갈라 놓았으므로(`StudioMenubarContent` 의 `resolveStudioCommandBarSlotNames`), 검증기도
 * "액션 레인의 정확한 이름" 이라는 원래 뜻 그대로 좁혀서 묻는다.
 */
function exportOptionsTrigger(page: Page) {
  return page
    .locator('[data-studio-menubar-actions="true"]')
    .getByRole("button", { name: "내보내기 옵션", exact: true });
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
      ok: async () => exportOptionsTrigger(page).isVisible(),
    },
  ];
  for (const c of checks) {
    if (!(await c.ok().catch(() => false))) failures.push(`크롬 미노출: ${c.name}`);
  }
  return failures;
}

async function assertMainMenus(page: Page): Promise<string[]> {
  const failures: string[] = [];
  for (const drift of PRESENTATION_TITLE_DRIFT) failures.push(drift);
  for (const orphan of PRESENTATION_ORPHANS) {
    failures.push(`메뉴 표현 매핑 누락: ${orphan}`);
  }

  const surfaces: readonly {
    surface: "primary" | "action";
    selector: string;
    menus: readonly PresentedMenu[];
    titles: readonly string[];
    label: string;
  }[] = [
    {
      surface: "primary",
      selector: '[data-studio-main-menu="true"]',
      menus: PRESENTED_MENUS,
      titles: PINNED_PRESENTED_TITLES,
      label: "기본 메뉴",
    },
    {
      surface: "action",
      selector: '[data-studio-main-menu-action="true"]',
      menus: ACTION_MENUS,
      titles: PINNED_ACTION_TITLES,
      label: "액션 메뉴",
    },
  ];

  for (const spec of surfaces) {
    const nav = page.locator(spec.selector);
    if (!(await nav.isVisible().catch(() => false))) {
      failures.push(`${spec.label} nav 미노출`);
      continue;
    }

    const triggerCount = await nav.locator("[data-studio-main-menu-trigger]").count();
    if (triggerCount !== spec.titles.length) {
      failures.push(
        `${spec.label} 제목 수 불일치: 기대 ${spec.titles.length} / 실제 ${triggerCount}`,
      );
    }

    for (const menu of spec.menus) {
      const visible = await nav
        .getByRole("menuitem", { name: menu.title, exact: true })
        .isVisible()
        .catch(() => false);
      if (!visible) failures.push(`${spec.label} 그룹 버튼 미노출: ${menu.title}`);
    }

    for (const presented of spec.menus) {
      try {
        const frame = await captureMainMenuFrame(page, presented.title, spec.surface);
        for (const section of presented.sections) {
          if (presented.composite && !frame.sectionCaptions.includes(section.caption)) {
            failures.push(`${spec.label} [${presented.title}] 섹션 캡션 없음: ${section.caption}`);
          }
          for (const item of section.items) {
            const visible = frame.itemRows.some((rowText) =>
              menuItemRowHasExactLabel(rowText, item),
            );
            if (!visible) {
              const where = presented.composite
                ? `${presented.title} ▸ ${section.caption}`
                : presented.title;
              failures.push(`${spec.label} [${where}] 항목 없음: ${item}`);
            }
          }
        }
        await page.keyboard.press("Escape");
        await page.waitForTimeout(100);
      } catch (err) {
        failures.push(
          `${spec.label} [${presented.title}] 열기 실패: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
  return failures;
}

async function assertReferenceWindowToggle(page: Page): Promise<string[]> {
  const failures: string[] = [];
  const panel = page.getByRole("region", { name: "레퍼런스 캔버스" });
  // 창 is owned by 보기; resolve through the presentation so this check follows the IA.
  const windowTitle = presentedTitleFor("window");
  const openWindowMenu = async (): Promise<Locator> => {
    await openMainMenuGroup(page, windowTitle);
    return page
      .locator(`[role="menu"][aria-label="${windowTitle}"]`)
      .locator('[data-studio-menu-item-id="reference-window"]');
  };

  let row = await openWindowMenu();
  if ((await row.getAttribute("role")) !== "menuitemcheckbox") {
    failures.push("참고 이미지 창이 menuitemcheckbox 의미를 노출하지 않음");
  }
  if ((await row.getAttribute("aria-checked")) === "true") {
    await row.click();
    await panel.waitFor({ state: "detached", timeout: 5_000 }).catch(() => undefined);
    row = await openWindowMenu();
  }
  if ((await row.getAttribute("aria-checked")) !== "false") {
    failures.push("참고 이미지 창 닫힘 상태를 aria-checked=false로 노출하지 않음");
  }

  await row.click();
  const openedAt = Date.now();
  const immediateFeedback = page.locator(
    '[data-studio-reference-panel-loading="true"], [role="region"][aria-label="레퍼런스 캔버스"]',
  );
  const feedbackVisible = await immediateFeedback.first()
    .waitFor({ state: "visible", timeout: 1_500 })
    .then(() => true)
    .catch(() => false);
  if (!feedbackVisible) {
    failures.push("참고 이미지 창을 여는 동안 즉각적인 로딩 피드백을 노출하지 않음");
  }
  const panelVisible = await panel
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!panelVisible) {
    failures.push("창 → 참고 이미지 창으로 레퍼런스 캔버스를 열 수 없음");
    return failures;
  }

  row = await openWindowMenu();
  if ((await row.getAttribute("aria-checked")) !== "true") {
    failures.push("참고 이미지 창 열림 상태를 aria-checked=true로 노출하지 않음");
  }
  await row.click();
  await panel.waitFor({ state: "detached", timeout: 5_000 }).catch(() => undefined);
  if (await panel.isVisible().catch(() => false)) {
    failures.push("창 → 참고 이미지 창으로 레퍼런스 캔버스를 닫을 수 없음");
  }

  if (failures.length === 0) {
    log(`  reference window toggle ok: open + checked + close (${Date.now() - openedAt}ms)`);
  }
  return failures;
}

async function assertRailTools(page: Page): Promise<string[]> {
  const rail = page.locator('[data-studio-tool-rail="true"]');
  const failures: string[] = [];

  const initialIds = await rail.locator("[data-studio-rail-tool-id]")
    .evaluateAll((tools) => tools.map((tool) => tool.getAttribute("data-studio-rail-tool-id")));
  if (initialIds.length !== FIRST_RUN_RAIL_TOOL_IDS.length
    || FIRST_RUN_RAIL_TOOL_IDS.some((id) => !initialIds.includes(id))) {
    failures.push(`좌측 레일 기본 도구 불일치: 기대 ${FIRST_RUN_RAIL_TOOL_IDS.join(", ")} / 실제 ${initialIds.join(", ")}`);
  }

  // Add through the actual More picker and retain every previous choice, including defaults.
  const expectedIds = new Set<string>(FIRST_RUN_RAIL_TOOL_IDS);
  for (const { id, moreLabel, railLabel } of OPTIONAL_RAIL_TOOLS) {
    const tool = rail.locator(`[data-studio-rail-tool-id="${id}"]`);
    try {
      if (!(await tool.isVisible().catch(() => false))) {
        await page.getByRole("button", { name: "전체 도구", exact: true }).click();
        const hiddenTools = page.getByRole("dialog", { name: "전체 도구", exact: true });
        await hiddenTools.getByRole("button", { name: `${moreLabel} 고정`, exact: true }).click();
        await hiddenTools.getByRole("button", { name: "전체 도구 닫기", exact: true }).click();
        await hiddenTools.waitFor({ state: "hidden", timeout: 5_000 });
        await tool.waitFor({ state: "visible", timeout: 5_000 });
      }
      const exposedLabel = await tool.getAttribute("aria-label");
      if (exposedLabel !== railLabel) {
        failures.push(`좌측 레일 추가 도구 라벨 불일치: ${railLabel} / 실제: ${exposedLabel ?? "없음"}`);
      }
    } catch (error) {
      failures.push(
        `좌측 레일 추가 도구 활성화 실패: ${railLabel} (${error instanceof Error ? error.message : String(error)})`,
      );
      await page.keyboard.press("Escape").catch(() => undefined);
    }
    expectedIds.add(id);
    for (const retainedId of expectedIds) {
      if (!(await rail.locator(`[data-studio-rail-tool-id="${retainedId}"]`).isVisible().catch(() => false))) {
        failures.push(`좌측 레일 도구가 ${moreLabel} 추가 뒤 사라짐: ${retainedId}`);
      }
    }
  }

  const expectedToolCount = expectedIds.size;
  const actualToolCount = await rail.locator("[data-studio-rail-tool-id]").count();
  if (actualToolCount < expectedToolCount) {
    failures.push(`좌측 레일 도구 누적 실패: 기대 최소 ${expectedToolCount} / 실제 ${actualToolCount}`);
  }
  for (const { id, railLabel } of OPTIONAL_RAIL_TOOLS) {
    const retained = await rail
      .locator(`[data-studio-rail-tool-id="${id}"]`)
      .isVisible()
      .catch(() => false);
    if (!retained) failures.push(`좌측 레일 추가 도구가 다음 선택 뒤 사라짐: ${railLabel}`);
  }

  for (const entry of PERSISTENT_RAIL_TOOLS) {
    if (typeof entry === "string") {
      const byLabel = rail.getByRole("button", { name: entry, exact: true }).first();
      const byTitle = rail.locator(`[title="${entry}"]`).first();
      const visible =
        (await byLabel.isVisible().catch(() => false)) ||
        (await byTitle.isVisible().catch(() => false));
      if (!visible) {
        failures.push(`좌측 레일 도구 미노출: ${entry}`);
      }
      continue;
    }
    const ok = await Promise.any(
      entry.anyOf.map(async (label) => {
        const visible =
          (await rail.getByRole("button", { name: label, exact: true }).first().isVisible().catch(() => false)) ||
          (await rail.locator(`[title="${label}"]`).first().isVisible().catch(() => false));
        if (!visible) throw new Error("miss");
        return true;
      })
    ).catch(() => false);
    if (!ok) failures.push(`좌측 레일 도구 미노출: ${entry.anyOf.join(" | ")}`);
  }
  // Verify the real image action, not a hidden legacy label. An empty selection leaves the document unchanged.
  try {
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 5_000 }),
      rail.locator(`[data-studio-rail-tool-id="${IMAGE_RAIL_ENTRY.id}"]`).click(),
    ]);
    await chooser.setFiles([]);
    log("  image rail action ok: real file chooser opens without changing the document");
  } catch (error) {
    failures.push(`이미지 도구 실행 실패: ${error instanceof Error ? error.message : String(error)}`);
  }
  return failures;
}

export async function closeFloatingUi(page: Page) {
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(80);
  await page.keyboard.press("Escape").catch(() => undefined);
  // Quick Access is a persistent window. Escape alone does not close it once focus leaves it.
  const quickAccess = page.locator('[data-studio-quick-access-surface="true"]');
  if (await quickAccess.isVisible()) {
    await quickAccess.getByRole("button", { name: QUICK_ACCESS_CLOSE_LABEL, exact: true }).click();
    await quickAccess.waitFor({ state: "hidden", timeout: 5_000 });
  }
  await page.waitForTimeout(120);
}

async function assertMenuDrivenPopovers(page: Page): Promise<string[]> {
  const failures: string[] = [];
  for (const entry of MENU_DRIVEN_POPOVERS) {
    const title = presentedTitleFor(entry.groupId);
    const surface = ACTION_ORDER.includes(studioMainMenuPresentedTitleFor(entry.groupId))
      ? "action" as const
      : "primary" as const;
    try {
      await closeFloatingUi(page);
      await openMainMenuGroup(page, title, surface);
      const menu = page.locator(`[role="menu"][aria-label="${title}"]`);
      await menu.getByRole("menuitem", { name: entry.item }).click({ timeout: 4000 });
      // Lazy panels + fixed popovers need a beat after main-menu close
      await page.waitForTimeout(700);

      if (entry.expectDialogName) {
        const dialog = page.getByRole("dialog", { name: entry.expectDialogName });
        await dialog.waitFor({ state: "visible", timeout: 5000 });
      }
      if (entry.expectSelector) {
        await page.locator(entry.expectSelector).waitFor({ state: "visible", timeout: 5000 });
      }

      const content = entry.contentSelector ? page.locator(entry.contentSelector) : page;
      if (entry.contentSelector) {
        await page.locator(entry.contentSelector).waitFor({ state: "visible", timeout: 5000 });
      }
      let matched = 0;
      for (const text of entry.expectVisible) {
        if (await hasVisibleText(content, text)) matched += 1;
      }
      if (matched === 0) {
        failures.push(
          `메뉴 연동 팝오버 내용 없음: ${title} → ${entry.item} (expected ${entry.expectVisible.join(", ")})`
        );
      } else {
        log(`  popover ok: ${title} → ${entry.item} (${matched}/${entry.expectVisible.length} markers)`);
      }
      await closeFloatingUi(page);
    } catch (err) {
      failures.push(
        `메뉴 연동 팝오버 실패 (${title}/${entry.item}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return failures;
}

async function assertCurrentCanvasPlatformResize(page: Page): Promise<string[]> {
  const failures: string[] = [];
  const canvasMenuTitle = presentedTitleFor("canvas");
  const windowMenuTitle = presentedTitleFor("window");

  const waitForHeight = async (height: number): Promise<boolean> =>
    page
      .locator(`span[aria-label="높이 ${height}px"]`)
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

  const applyPreset = async (itemId: string, expectedHeight: number): Promise<boolean> => {
    await openMainMenuGroup(page, canvasMenuTitle);
    const menu = page.locator(`[role="menu"][aria-label="${canvasMenuTitle}"]`);
    await menu.locator(`[data-studio-menu-item-id="${itemId}"]`).click({ timeout: 4_000 });
    return waitForHeight(expectedHeight);
  };

  try {
    await closeFloatingUi(page);
    await openMainMenuGroup(page, windowMenuTitle);
    await page
      .locator(`[role="menu"][aria-label="${windowMenuTitle}"]`)
      .locator('[data-studio-menu-item-id="density-full"]')
      .click({ timeout: 4_000 });
    await page.waitForTimeout(150);

    await openMainMenuGroup(page, canvasMenuTitle);
    const menu = page.locator(`[role="menu"][aria-label="${canvasMenuTitle}"]`);
    await menu
      .locator('[data-studio-menu-item-id="canvas-settings"]')
      .click({ timeout: 4_000 });
    await page.locator("span[aria-label^=\"높이 \"][aria-label$=\"px\"]").first().waitFor({ state: "visible", timeout: 5_000 });

    const drawingUrl = page.url();
    if (!(await applyPreset("apply-webtoon-naver", 8_348))) {
      failures.push("현재 드로잉에 네이버 690 × 8000 비율을 적용하지 못함");
    }
    if (page.url() !== drawingUrl) {
      failures.push("플랫폼 규격 적용이 현재 드로잉을 유지하지 않고 다른 화면으로 이동함");
    }
    if (!(await applyPreset("apply-webtoon-kakao", 8_000))) {
      failures.push("현재 드로잉에 카카오 720 × 8000 비율을 적용하지 못함");
    }

    await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
    if (!(await waitForHeight(8_348))) {
      failures.push("플랫폼 규격 변경을 한 번의 실행취소로 복원하지 못함");
    }

    if (failures.length === 0) {
      log("  current canvas platform resize ok: Naver → Kakao → undo");
    }
  } catch (err) {
    failures.push(
      `현재 캔버스 플랫폼 규격 변경: ${err instanceof Error ? err.message : String(err)}`,
    );
    await page.keyboard.press("Escape").catch(() => undefined);
  }
  return failures;
}

async function assertWorkspaceDeviceEditor(page: Page): Promise<string[]> {
  const failures: string[] = [];
  try {
    await closeFloatingUi(page);
    const trigger = page.getByRole("button", { name: /^작업공간:/ }).first();
    await trigger.click({ timeout: 4000 });

    const quickDialog = page.getByRole("dialog", { name: "작업공간" });
    await quickDialog.waitFor({ state: "visible", timeout: 5000 });
    await quickDialog.getByRole("button", { name: "작업공간 관리", exact: true }).click({
      timeout: 4000,
    });

    const management = page.getByRole("dialog", { name: "작업공간 관리" });
    await management.waitFor({ state: "visible", timeout: 5000 });
    await management.getByRole("button", { name: "전환 설정", exact: true }).click({
      timeout: 4000,
    });

    for (const marker of ["모바일 주요 도구 위치", "기기별 배치"]) {
      if (!(await management.getByText(marker, { exact: true }).first().isVisible().catch(() => false))) {
        failures.push(`작업공간 기기 편집기 표식 미노출: ${marker}`);
      }
    }
    if (!(await management.getByRole("group", { name: "조정할 기기" }).isVisible().catch(() => false))) {
      failures.push("작업공간 기기 편집기 표식 미노출: 조정할 기기");
    }
    for (const device of ["펜 디스플레이", "모바일", "키보드", "마우스", "터치"]) {
      const choice = management.getByRole("button", {
        name: new RegExp(`^${device}(?: ·|$)`),
      });
      if (!(await choice.isVisible().catch(() => false))) {
        failures.push(`작업공간 기기 축 선택지 미노출: ${device}`);
      }
    }
    for (const side of ["왼쪽", "오른쪽"]) {
      const choice = management.getByRole("button", {
        name: new RegExp(`모바일 주요 도구 ${side} 배치`),
      });
      if (!(await choice.isVisible().catch(() => false))) {
        failures.push(`모바일 손잡이 선택지 미노출: ${side}`);
      }
    }

    if (failures.length === 0) log("  workspace device editor ok: 5 devices + handedness");
    await management.getByRole("button", { name: "작업공간 메뉴 닫기", exact: true }).click();
    await page.waitForTimeout(100);
  } catch (err) {
    failures.push(
      `작업공간 기기 편집기: ${err instanceof Error ? err.message : String(err)}`,
    );
    await page.keyboard.press("Escape").catch(() => undefined);
  }
  return failures;
}

async function assertDrawOptionsBar(page: Page): Promise<string[]> {
  const failures: string[] = [];
  try {
    await closeFloatingUi(page);
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

async function assertFloatingLayoutManager(page: Page): Promise<string[]> {
  const failures: string[] = [];
  try {
    // Drawing options are now a persistent inline workbench, not a floating dock.
    // Exercise the real optional arrangement launcher and keep offline/save safety visible.
    const workbench = page.locator('[data-studio-workbench-options="true"]');
    const arrangement = page.locator('[data-studio-shell-floating-target="workspace-arrangement"]');
    const saveStatus = page.locator('[data-studio-draft-save-center]');
    const launcher = page.locator('[data-studio-shell-view-options="true"] > button');
    await workbench.waitFor({ state: "visible", timeout: 5000 });
    await arrangement.waitFor({ state: "visible", timeout: 5000 });
    await launcher.click();
    const dialog = page.getByRole("dialog", { name: DESKTOP_FLOATING_LAYOUT_DIALOG.name, exact: true });
    await dialog.waitFor({ state: "visible", timeout: 5000 });
    await dialog.getByRole("switch", { name: "배치 편집 도구 숨기기", exact: true }).click();
    await arrangement.waitFor({ state: "hidden", timeout: 3000 });
    await workbench.waitFor({ state: "visible", timeout: 3000 });
    await dialog.getByRole("switch", { name: "배치 편집 도구 표시하기", exact: true }).click();
    await arrangement.waitFor({ state: "visible", timeout: 3000 });
    if (await dialog.locator('[data-studio-shell-mounted-state="available"]').count() === 0) {
      failures.push("현재 화면에서 사용 가능한 플로팅 요소 상태가 표시되지 않음");
    }
    await dialog.getByRole("button", { name: /캔버스 집중/ }).click();
    await arrangement.waitFor({ state: "hidden", timeout: 3000 });
    await workbench.waitFor({ state: "visible", timeout: 3000 });
    await dialog.locator('[data-studio-shell-focus-mode="true"]').waitFor({ state: "visible", timeout: 3000 });
    await dialog.getByRole("button", { name: "원래 보기", exact: true }).click();
    await arrangement.waitFor({ state: "visible", timeout: 3000 });

    await dialog.getByRole("button", { name: "배치 편집", exact: true }).click();
    const handle = page.locator('[data-studio-shell-floating-handle="workspace-arrangement"]');
    await handle.waitFor({ state: "visible", timeout: 3000 });
    await handle.getByRole("button", { name: "배치 편집 도구 위치 잠금", exact: true }).click();
    if (!(await handle.getByRole("button", { name: "배치 편집 도구 이동", exact: true }).isDisabled())) {
      failures.push("배치 편집 도구 위치 잠금 미적용");
    }
    await handle.getByRole("button", { name: "배치 편집 도구 위치 잠금 해제", exact: true }).click();
    const dock = handle.getByRole("combobox", { name: "배치 편집 도구 도킹 위치", exact: true });
    await dock.selectOption("top");
    if (await dock.inputValue() !== "top") failures.push("플로팅 도구 직접 도킹 선택 미적용");
    await dock.selectOption("bottom");
    await dialog.getByRole("button", { name: "배치 완료", exact: true }).click();

    const autoHide = dialog.getByRole("switch", { name: /펜으로 그리는 동안 자동 숨김/ });
    if (await autoHide.getAttribute("aria-checked") !== "true") await autoHide.click();
    await dialog.getByRole("button", { name: "모두 숨김", exact: true }).click();
    await arrangement.waitFor({ state: "hidden", timeout: 3000 });
    await workbench.waitFor({ state: "visible", timeout: 3000 });
    // A local preview has no authenticated save server. Never hide its offline warning
    // merely to satisfy a layout test or imply that a server save succeeded.
    if (await saveStatus.getAttribute("data-studio-shell-force-visible") !== "true") {
      failures.push("로컬 preview의 저장 경고 안전 표시를 확인하지 못함");
    }
    await saveStatus.waitFor({ state: "visible", timeout: 3000 });
    if (!(await launcher.isVisible())) failures.push("모두 숨김 후 보기 복구 버튼이 사라짐");
    await dialog.getByRole("button", { name: "모두 표시", exact: true }).click();
    await arrangement.waitFor({ state: "visible", timeout: 3000 });
    if (await autoHide.getAttribute("aria-checked") !== "true") failures.push("드로잉 자동 숨김 활성 상태 미유지");
    await dialog.getByRole("button", { name: DESKTOP_FLOATING_LAYOUT_DIALOG.closeLabel, exact: true }).click();
    await dialog.waitFor({ state: "hidden", timeout: 3000 });

    const canvas = page.locator('[data-studio-canvas-viewport] canvas').first();
    await canvas.dispatchEvent("pointerdown", { pointerId: 91, pointerType: "pen", button: 0, isPrimary: true });
    try {
      await page.waitForFunction(() => document.querySelector('[data-studio-shell-view-options="true"]')
        ?.getAttribute("data-studio-shell-drawing-auto-hide-active") === "true");
      await saveStatus.waitFor({ state: "visible", timeout: 3000 });
    } finally {
      await canvas.dispatchEvent("pointerup", { pointerId: 91, pointerType: "pen", button: 0, isPrimary: true });
    }
    await page.waitForFunction(() => document.querySelector('[data-studio-shell-view-options="true"]')
      ?.getAttribute("data-studio-shell-drawing-auto-hide-active") === "false", undefined, { timeout: 3000 });
    const viewport = await page.locator('[data-studio-canvas-viewport="true"]').first().boundingBox();
    if (!viewport) throw new Error("자동 집중 검증용 캔버스를 찾지 못함");
    const x = viewport.x + viewport.width * 0.48, y = viewport.y + viewport.height * 0.45;
    await page.mouse.move(x, y);
    await page.mouse.down();
    try {
      await page.mouse.move(x + 28, y + 12, { steps: 4 });
      await page.waitForFunction(() => document.documentElement.dataset.studioStrokeFocusPhase === "drawing");
      await page.waitForFunction(() => {
        const root = document.querySelector<HTMLElement>('[data-studio-shell-view-options="true"]');
        if (!root) return false;
        const style = getComputedStyle(root);
        return root.dataset.studioShellDrawingAutoHideActive === "true" && root.inert
          && root.getAttribute("aria-hidden") === "true" && style.opacity === "0" && style.pointerEvents === "none";
      }, undefined, { timeout: 3000 });
      await workbench.waitFor({ state: "visible", timeout: 3000 });
      await saveStatus.waitFor({ state: "visible", timeout: 3000 });
      await arrangement.waitFor({ state: "visible", timeout: 3000 });
    } finally { await page.mouse.up(); }
    await page.waitForFunction(() => document.documentElement.dataset.studioStrokeFocusPhase === "settling");
    await page.waitForFunction(() => !document.documentElement.hasAttribute("data-studio-stroke-focus-phase"));
    await launcher.waitFor({ state: "visible", timeout: 3000 });
    await page.waitForFunction(() => {
      const root = document.querySelector<HTMLElement>('[data-studio-shell-view-options="true"]');
      if (!root) return false;
      const style = getComputedStyle(root);
      return !root.inert && root.getAttribute("aria-hidden") !== "true"
        && style.opacity === "1" && style.pointerEvents === "auto";
    }, undefined, { timeout: 3000 });
    if (failures.length === 0) log("  floating visibility + docking/locks + stroke focus + persistent safety/workbench ok");
  } catch (err) {
    failures.push(`플로팅 보기·배치: ${err instanceof Error ? err.message : String(err)}`);
    await page.keyboard.press("Escape").catch(() => undefined);
  }
  return failures;
}

async function assertExportOptions(page: Page): Promise<string[]> {
  const failures: string[] = [];
  try {
    await exportOptionsTrigger(page).click({ timeout: 4000 });
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
  const port = await findFreePort({ unavailableMessage: "could not allocate port" });
  const url = `http://127.0.0.1:${port}/studio/canvas`;
  let child: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  let exitCode: number;

  try {
    child = spawnVitePreview({
      port,
      runner: "node-vite-bin",
    });
    child.stderr?.on("data", (d) => {
      const s = String(d);
      if (!s.includes("ECONNREFUSED") && !s.includes("proxy error")) process.stderr.write(d);
    });
    await waitForServer(`http://127.0.0.1:${port}/`, {
      timeoutMs: 20000,
      notReadyMessage: `preview not ready: http://127.0.0.1:${port}/`,
    });
    log(`preview ready @ ${url}`);

    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await ctx.newPage();
    await page.addInitScript(({ key }) => {
      try {
        window.localStorage.setItem(key, "1");
        // The assertions below intentionally use Korean product labels. Chromium's CI locale is
        // commonly en-US, so pin the persisted app locale instead of depending on the host.
        window.localStorage.setItem(
          "toonspectrum-lang",
          JSON.stringify({ state: { lang: "ko" }, version: 0 })
        );
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
      ...(await assertReferenceWindowToggle(page)),
      ...(await assertRailTools(page)),
      ...(await assertMenuDrivenPopovers(page)),
      ...(await assertCurrentCanvasPlatformResize(page)),
      ...(await assertWorkspaceDeviceEditor(page)),
      ...(await assertDrawOptionsBar(page)),
      ...(await assertFloatingLayoutManager(page)),
      ...(await assertExportOptions(page)),
    ];

    if (failures.length === 0) {
      log("PASS: canvas-first menus exposed (9 primary + AI action + current-canvas platform resize + rail + popovers)");
      exitCode = 0;
    } else {
      log(`FAIL (${failures.length}):`);
      for (const f of failures) log(`  - ${f}`);
      const menubar = await page.locator('[data-studio-app-menubar="true"]').innerText().catch(() => "(none)");
      log(`menubar text:\n${menubar}`);
      exitCode = 1;
    }
  } catch (err) {
    console.error("[verify-menus] fatal:", err);
    exitCode = 1;
  } finally {
    await browser?.close().catch(() => undefined);
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
