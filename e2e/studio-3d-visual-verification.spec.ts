import { expect, test, type Page } from "@playwright/test";

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
}

/** 렌더된 프레임의 픽셀 통계. 디코딩은 브라우저가 한다(Node 측 이미지 의존성 없음). */
async function frameStats(page: Page, selector: string): Promise<FrameStats> {
  const shot = await page.locator(selector).first().screenshot();
  return page.evaluate(async (base64) => {
    const response = await fetch(`data:image/png;base64,${base64}`);
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
    const tileCounts = new Float64Array(tileCols * tileRows);
    for (let y = 0; y < height; y += 1) {
      const row = Math.min(tileRows - 1, Math.floor((y / height) * tileRows));
      for (let x = 0; x < width; x += 1) {
        const column = Math.min(tileCols - 1, Math.floor((x / width) * tileCols));
        const offset = (y * width + x) * 4;
        const tile = row * tileCols + column;
        tileSums[tile] += (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
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
    };
  }, shot.toString("base64"));
}

/** 두 프레임이 가장 크게 달라진 칸의 휘도 차. 안티에일리어싱 잡음은 한 자리를 넘지 않는다. */
function peakTileDelta(a: FrameStats, b: FrameStats): number {
  let peak = 0;
  for (let index = 0; index < a.tiles.length; index += 1) {
    peak = Math.max(peak, Math.abs(a.tiles[index] - (b.tiles[index] ?? 0)));
  }
  return peak;
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
): Promise<FrameStats> {
  const deadline = Date.now() + timeoutMs;
  let latest = baseline;
  let peak = 0;
  while (Date.now() < deadline) {
    latest = await frameStats(page, selector);
    peak = peakTileDelta(latest, baseline);
    if (peak > 3) return latest;
    await page.waitForTimeout(2_000);
  }
  throw new Error(
    `${label}: 프레임이 바뀌지 않았습니다 `
    + `(칸 최대 휘도차 ${peak.toFixed(1)}, `
    + `색 ${baseline.distinctColors} → ${latest.distinctColors}).`,
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
    }, TEST_CREATOR_SESSION);
  });

  test("3D 배경 편집기가 실제 3D 프레임을 그린다", async ({ page }) => {
    test.setTimeout(300_000);
    const fatal = collectFatalErrors(page);
    await openStudio(page);
    await openBg3d(page);

    // 엔진은 선택한 백엔드로 정착해야 한다. WebGPU가 없으면 WebGL2로 내려간다. 능력 probe가
    // 끝나기 전 배지는 "확인 중"이므로, 한 번 읽지 않고 정착할 때까지 폴링한다 — 영원히 "확인 중"에
    // 머무는 것 자체가 이 스위트가 잡아야 할 회귀다.
    const backendBadge = page
      .locator('[data-testid="studio-bg3d-engine-active-backend"]')
      .first();
    if (await backendBadge.count()) {
      await expect(backendBadge).toHaveText(/WebGL2|WebGPU/, { timeout: 120_000 });
    }

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

  test("절차형 에셋과 선화 미리보기가 프레임을 바꾼다", async ({ page }) => {
    test.setTimeout(300_000);
    const fatal = collectFatalErrors(page);
    await openStudio(page);
    await openBg3d(page);

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
    test.setTimeout(300_000);
    const fatal = collectFatalErrors(page);
    await openStudio(page);
    await openBg3d(page);

    const emptyScene = await frameStats(page, BG3D_VIEWPORT);
    await page.locator('[aria-label="상자 추가"]').first().click();
    // 빈 장면을 캡처해 놓고 삽입하면 이 테스트가 무엇도 증명하지 못한다.
    await waitForFrameChange(page, BG3D_VIEWPORT, emptyScene, "상자 추가");
    await page.getByRole("button", { name: /컬러 배경 추가/ }).first().click();

    // 삽입이 성공하면 편집기가 닫힌다. 실패로 닫히는 분기에서는 열린 채 오류만 남았다.
    await expect(page.locator(BG3D_DIALOG)).toHaveCount(0, { timeout: 120_000 });
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
