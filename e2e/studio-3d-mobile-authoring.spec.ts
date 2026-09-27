import { readFile } from "node:fs/promises";

import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

import { STUDIO_BETA_NOTICE_REVISION, STUDIO_BETA_NOTICE_STORAGE_KEY } from "../apps/web/src/domains/creator/studio-beta-notice-storage";

const ROOT = '[data-character-shaper="true"]';
const SLOTS = ["face-shape", "eyes", "irises", "nose", "mouth", "ears", "hair", "body", "top", "bottom", "shoes", "accessory", "expression", "pose", "hand-pose"];

async function activate(target: Locator, info: TestInfo): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  if (info.project.use.hasTouch) await target.tap();
  else await target.click();
}

async function openCharacter(page: Page): Promise<Locator> {
  await page.addInitScript(({ key, revision }) => {
    localStorage.setItem(key, revision);
    localStorage.setItem("toonstudio-studio-quick-start-dismissed", "1");
    localStorage.setItem("toonstudio-studio-mobile-hint-dismissed", "1");
    sessionStorage.setItem("toonstudio-compat-dismissed", "true");
  }, { key: STUDIO_BETA_NOTICE_STORAGE_KEY, revision: STUDIO_BETA_NOTICE_REVISION });
  // 인증 경계만 게스트로 고정한다. 캐릭터·셰이더·문서·저장소는 실제 제품 코드를 실행한다.
  await page.route("**/api/auth/session", (route) => route.request().method() === "GET"
    ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: false, user: null }) })
    : route.fallback());
  await page.goto("/studio/character", { waitUntil: "domcontentloaded" });
  const root = page.locator(ROOT);
  await expect(root).toBeVisible({ timeout: 150_000 });
  await expect(root.getByRole("button", { name: "전신", exact: true })).toBeEnabled({ timeout: 120_000 });
  return root;
}

async function assertUsableControl(target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  await expect(target).toBeInViewport({ ratio: 1 });
  const box = await target.boundingBox();
  if (!box) throw new Error("조작할 컨트롤의 표시 영역이 없습니다.");
  expect(box.width).toBeGreaterThanOrEqual(43.5);
  expect(box.height).toBeGreaterThanOrEqual(43.5);
  await target.click({ trial: true });
}

async function capture(page: Page, info: TestInfo, label: string): Promise<void> {
  await info.attach(label, { body: await page.screenshot(), contentType: "image/png" });
}

async function collapseMobile(root: Locator, info: TestInfo): Promise<void> {
  const control = root.getByRole("button", { name: "모델 크게 보기", exact: true });
  if (await control.count()) await activate(control, info);
}

test("실제 캐릭터와 핵심 조작이 화면 안에서 겹치지 않고 도달 가능하다", async ({ page }, info) => {
  const root = await openCharacter(page);
  const stage = root.locator('[data-character-shaper-stage="true"]');
  await expect(stage.locator("canvas").first()).toBeVisible();
  const box = await stage.boundingBox();
  if (!box) throw new Error("실제 3D 뷰포트가 없습니다.");
  expect(box.width).toBeGreaterThanOrEqual(160);
  expect(box.height).toBeGreaterThanOrEqual(info.project.name === "landscape" ? 120 : 180);
  for (const label of ["닫기", "캔버스에 추가"]) {
    await assertUsableControl(root.getByRole("button", { name: label, exact: true }));
  }
  const more = root.getByRole("button", { name: "내보내기 더 보기", exact: true });
  if (await more.count()) await assertUsableControl(more);
  await activate(root.getByRole("button", { name: "전신", exact: true }), info);
  await expect(root.getByRole("button", { name: "전신", exact: true })).toHaveAttribute("aria-pressed", "true");
  await activate(root.getByRole("button", { name: "확대", exact: true }), info);
  await activate(root.getByRole("button", { name: "축소", exact: true }), info);
  await activate(root.getByRole("button", { name: "시점 초기화", exact: true }), info);
  await capture(page, info, "모델과-핵심-조작");
});

test("15개 슬롯에서 프리셋 적용과 지원 제한을 실제 런타임으로 확인한다", async ({ page }, info) => {
  const root = await openCharacter(page);
  const coverage: { slot: string; available: number; unavailable: number; applied: boolean }[] = [];
  for (const slot of SLOTS) {
    await activate(root.locator(`[data-character-slot="${slot}"]`), info);
    await expect(root.locator(`[data-character-slot="${slot}"]`)).toHaveAttribute("aria-current", "true");
    const available = root.locator('[data-character-slot-card]:not([aria-disabled="true"])');
    const candidate = root.locator('[data-character-slot-card-availability="available"]:not([aria-pressed="true"])').first();
    const canApply = await candidate.count() > 0;
    coverage.push({ slot, available: await available.count(),
      unavailable: await root.locator('[data-character-slot-card-availability="unavailable"]').count(), applied: canApply });
    if (canApply) {
      const entryId = await candidate.getAttribute("data-character-slot-card");
      if (!entryId) throw new Error("실행할 프리셋의 고정 ID가 없습니다.");
      await activate(candidate, info);
      // 선택 직후 :not([aria-pressed=true])는 다음 카드로 바뀌므로 같은 원본 ID를 검증한다.
      await expect(root.locator(`[data-character-slot-card="${entryId}"]`)).toHaveAttribute("aria-pressed", "true");
    }
  }
  expect(coverage).toHaveLength(15);
  expect(coverage.filter((entry) => entry.applied).length).toBeGreaterThan(0);
  await info.attach("슬롯별-실행-범위", { body: JSON.stringify(coverage, null, 2), contentType: "application/json" });
  await collapseMobile(root, info);
  await capture(page, info, "프리셋-적용-결과");
});

test("프리셋 편집의 실행 취소와 다시 실행이 실제 선택을 복원한다", async ({ page }, info) => {
  const root = await openCharacter(page);
  await activate(root.locator('[data-character-slot="face-shape"]'), info);
  const egg = root.locator('[data-character-slot-card="face-shape:oval"]');
  await activate(egg, info);
  await expect(egg).toHaveAttribute("aria-pressed", "true");
  const summary = root.locator('[data-character-shaper-summary="true"]');
  await activate(summary.getByRole("button", { name: "실행 취소", exact: true }), info);
  await expect(egg).toHaveAttribute("aria-pressed", "false");
  await activate(summary.getByRole("button", { name: "다시 실행", exact: true }), info);
  await expect(egg).toHaveAttribute("aria-pressed", "true");
  await collapseMobile(root, info);
  await capture(page, info, "실행-취소-다시-실행");
});

test("실제 PNG 파일을 생성하고 이미지 서명과 해상도를 검증한다", async ({ page }, info) => {
  const root = await openCharacter(page);
  const more = root.getByRole("button", { name: "내보내기 더 보기", exact: true });
  if (await more.count()) await activate(more, info);
  await root.getByRole("combobox", { name: "파일 내보내기 해상도" }).selectOption("1024");
  const pending = page.waitForEvent("download", { timeout: 120_000 });
  await activate(root.getByRole("button", { name: "PNG 저장", exact: true }), info);
  const download = await pending;
  expect(await download.failure()).toBeNull();
  const file = info.outputPath("character-export.png");
  await download.saveAs(file);
  const bytes = await readFile(file);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(Math.max(bytes.readUInt32BE(16), bytes.readUInt32BE(20))).toBe(1024);
  const pixels = await page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const drawing = canvas.getContext("2d");
    if (!drawing) throw new Error("출력 이미지의 픽셀을 읽을 수 없습니다.");
    drawing.drawImage(bitmap, 0, 0);
    bitmap.close();
    const data = drawing.getImageData(0, 0, canvas.width, canvas.height).data;
    let visible = 0;
    const colors = new Set<number>();
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] === 0) continue;
      visible += 1;
      colors.add((data[index] << 16) | (data[index + 1] << 8) | data[index + 2]);
    }
    return { visible, colors: colors.size };
  }, bytes.toString("base64"));
  expect(pixels.visible).toBeGreaterThan(100);
  expect(pixels.colors).toBeGreaterThan(16);
  await info.attach("실제-PNG-출력", { path: file, contentType: "image/png" });
});
