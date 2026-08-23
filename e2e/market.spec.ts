import { expect, test } from "@playwright/test";

/**
 * 창작 마켓 공개 라우트 — 백엔드 데이터 유무와 무관하게 결정적으로 단언한다.
 * 목록이 비면 "빈 상태가 다음 행동을 가르친다"는 DESIGN.md 계약을 따른다.
 */

const KIND_HREFS = [
  "/market/browse?kind=brush",
  "/market/browse?kind=filter",
  "/market/browse?kind=palette",
  "/market/browse?kind=template",
  "/market/browse?kind=3d-preset",
  "/market/browse?kind=asset",
];

test("마켓 홈은 카테고리 6종과 CTA를 렌더링한다", async ({ page }) => {
  await page.goto("/market");
  await expect(page.getByRole("heading", { name: "창작 마켓" })).toBeVisible();
  await expect(page.getByRole("link", { name: "리소스 둘러보기" })).toBeVisible();
  await expect(page.getByRole("link", { name: "스튜디오에서 공유하기" })).toBeVisible();

  for (const href of KIND_HREFS) {
    await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible();
  }
  // 브라우저 로케일에 따라 ko/en 사전이 모두 정답이다.
  await expect(page).toHaveTitle(/창작 마켓|Creator Market/);
});

test("마켓 탐색은 종류 칩 필터와 라이선스 셀렉트를 제공한다", async ({ page }) => {
  await page.goto("/market/browse");
  await expect(page.getByRole("heading", { name: "마켓 탐색" })).toBeVisible();

  const kindGroup = page.getByRole("group", { name: "리소스 종류 필터" });
  await expect(kindGroup.getByRole("button", { name: "전체" })).toBeVisible();
  for (const label of ["브러시", "필터", "팔레트", "템플릿", "3D 프리셋", "에셋"]) {
    await expect(kindGroup.getByRole("button", { name: label })).toBeVisible();
  }
  await expect(page.getByLabel("라이선스")).toBeVisible();
});

test("종류 칩은 URL 파라미터를 갱신한다", async ({ page }) => {
  await page.goto("/market/browse");
  const kindGroup = page.getByRole("group", { name: "리소스 종류 필터" });
  await kindGroup.getByRole("button", { name: "브러시" }).click();
  await expect(page).toHaveURL(/market\/browse\?kind=brush$/);
  await expect(kindGroup.getByRole("button", { name: "브러시" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("없는 리소스 상세는 404 안내 또는 오류 상태로 흐름 제어한다", async ({ page }) => {
  await page.goto("/market/resource/123e4567-e89b-42d3-a456-426614174000");
  await expect(page.getByRole("link", { name: "마켓으로 돌아가기" })).toBeVisible();
  await expect(
    page.getByText(/리소스를 찾을 수 없어요|불러오지 못했습니다/)
  ).toBeVisible({ timeout: 15_000 });
});
