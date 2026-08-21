/**
 * scripts/verify-studio-menus.mts
 * Desktop headless check: Studio application menus + left rail + menu-driven popovers.
 *
 * Desktop IA (V5 §15.3):
 * - Visible: app menubar + 17 specification groups + AI + left tool rail
 * - Toolbelt is parked off-screen on lg+ (still mounts popovers when opened via main menu)
 *
 * Run: pnpm exec tsx scripts/verify-studio-menus.mts
 * Expects production build in dist/ (vite preview).
 */
import { spawn, type ChildProcess } from "node:child_process";

import { chromium, type Page } from "playwright";

import { findFreePort, waitForServer } from "./lib/studio-verify-preview-harness.mjs";

const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";

const MAIN_MENU: Record<string, string[]> = {
  파일: [
    "임시저장",
    "게시",
    "프로젝트 가져오기…",
    "PSD 가져오기…",
    "ORA / CBZ / WILL 가져오기…",
    "프로젝트 도구…",
    "내보내기 / 다운로드",
    "백업 (.json)",
    "빠른 시작 · 새 작업…",
    "버전 체크포인트…",
    "게시 패키지…",
    "에셋 권리 감사…",
  ],
  편집: [
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
  보기: [
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
  캔버스: ["캔버스 크기 · 문서 설정…"],
  레이어: [
    "이미지…",
    "레이어 · 맨 위로",
    "레이어 · 맨 뒤로",
    "레이어 자르기…",
    "레이어 마스크 편집…",
    "나만 숨긴 레이어 모두 표시",
  ],
  선택: ["모두 선택", "선택 해제", "선택 반전"],
  변형: ["선택 변형"],
  그리기: [
    "펜",
    "지우개",
    "채우기",
    "스마트 도형",
    "브러시 프리셋 목록…",
    "브러시 스튜디오…",
    "자연 매체 · 안료…",
    "내 브러시…",
    "브러시 가져오기 (ABR · MYB · KPP)…",
    "배경 · 톤",
    "팔레트 · 브랜드",
  ],
  필터: [
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
  벡터: ["요소 · 도형"],
  텍스트: ["말풍선", "텍스트", "대사 일괄 편집…", "대사 번역 · 다국어…"],
  만화: [
    "새 페이지",
    "콜라주",
    "톤 · 스크린톤",
    "Writer Room · 대본…",
    "스토리보드 그리드…",
    "제작 바이블…",
    "이야기 연속성 검사…",
    "세로 스크롤 미리보기…",
    "애니매틱 타임라인…",
  ],
  애니메이션: ["프레임 애니메이션…"],
  "3D": ["3D 데생 인형", "3D 캐릭터", "3D 배경"],
  협업: ["팀 · 공유 권한…", "페이지 검토 · 승인…"],
  창: [
    "슈퍼심플 레이아웃",
    "전체 레이아웃",
    "패널 접어 넓게",
    "캔버스만",
    "템플릿 · 에셋",
    "참고 이미지",
    "멀티 디스플레이 작업공간…",
    "애플리케이션 설정",
  ],
  AI: ["AI 어시스트", "스톡 이미지", "연동 설정"],
  도움말: [
    "명령 · 속성 통합 검색",
    "CSP · Photoshop 용어 찾기",
    "현재 도구 도움말",
    "사용법 · 기능 튜토리얼",
    "단축키 · 기본 조작",
    "기기 · 브라우저 진단…",
    "복구 가이드…",
    "라이선스 · 서드파티 고지…",
    "버그 리포트 패키지…",
  ],
};

/** Left vertical rail — primary tool surface on desktop. */
const RAIL_TOOLS = [
  "선택 (V)",
  "펜 (B)",
  "지우개 (E)",
  // Fill: when no raster is selected the aria-label becomes the guard reason (still exposed).
  { anyOf: ["채우기 (G)", "래스터 이미지 레이어를 먼저 선택하세요."] },
  "스포이드 (I / Alt+클릭)",
  { anyOf: ["스마트 도형 켜기", "스마트 도형 끄기"] },
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
    group: "창",
    item: "템플릿 · 에셋",
    expectVisible: ["템플릿", "이메레스", "장면", "클립", "효과"],
  },
  {
    group: "그리기",
    item: "배경 · 톤",
    expectVisible: ["배경 편집"],
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
  const btn = nav.getByRole("menuitem", { name: label, exact: true });
  await btn.click({ timeout: 5000 });
  await page.locator(`[role="menu"][aria-label="${label}"]`).waitFor({ state: "visible", timeout: 5000 });
}

async function hasVisibleText(page: Page, text: string): Promise<boolean> {
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
  const nav = page.locator('[data-studio-main-menu="true"]');
  if (!(await nav.isVisible().catch(() => false))) {
    failures.push("메인 메뉴 nav 미노출 (lg 이상 뷰포트 필요)");
    return failures;
  }

  // Top-level group labels always visible
  for (const group of Object.keys(MAIN_MENU)) {
    if (!(await nav.getByRole("menuitem", { name: group, exact: true }).isVisible().catch(() => false))) {
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
        if (await hasVisibleText(page, text)) matched += 1;
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
  const url = `http://127.0.0.1:${port}/studio`;
  let child: ChildProcess | null = null;
  let exitCode: number;

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
    await waitForServer(`http://127.0.0.1:${port}/`, {
      timeoutMs: 20000,
      notReadyMessage: `preview not ready: http://127.0.0.1:${port}/`,
    });
    log(`preview ready @ ${url}`);

    const browser = await chromium.launch({ headless: true });
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
      ...(await assertRailTools(page)),
      ...(await assertMenuDrivenPopovers(page)),
      ...(await assertWorkspaceDeviceEditor(page)),
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
