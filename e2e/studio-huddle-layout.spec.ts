import { expect, test } from "@playwright/test";

for (const width of [320, 390, 768, 1440]) {
  test(`chat and work creation remain separate at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tools/browser-harnesses/huddle-layout.html");
    const create = page.getByRole("link", { name: "새 작품 만들기" });
    const chat = page.getByRole("button", { name: "채팅·통화", exact: true });
    await expect(chat).toHaveCount(1);
    await create.scrollIntoViewIfNeeded();
    const a = await create.boundingBox();
    const b = await chat.boundingBox();
    expect(a).not.toBeNull(); expect(b).not.toBeNull();
    const overlap = a!.x < b!.x + b!.width && a!.x + a!.width > b!.x
      && a!.y < b!.y + b!.height && a!.y + a!.height > b!.y;
    expect(overlap).toBe(false);
    expect(a!.width).toBeGreaterThan(100);
    await create.click();
    await expect(page).toHaveURL(/#new-work$/);
    await chat.click();
    const panel = page.locator("#studio-p2p-huddle-panel");
    await expect(panel).toBeVisible();
    const rect = await panel.boundingBox();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
    expect(rect!.y).toBeGreaterThanOrEqual(0);
    await expect(page.getByRole("button", { name: "공동작업 연결 다시 확인" })).toHaveCount(0);
  });
}

test("disconnected setup is handled by the service, without a user connection check", async ({ page }) => {
  await page.goto("/tools/browser-harnesses/huddle-layout.html?failed");
  await page.getByRole("button", { name: "채팅·통화", exact: true }).click();
  await expect(page.getByText("채팅·통화 연결을 자동으로 복구하고 있습니다.")).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시도", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "동의하고 P2P 채팅 참여" })).toBeDisabled();
});
