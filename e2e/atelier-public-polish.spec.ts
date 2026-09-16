import { expect, test } from "@playwright/test";

// API failures remain explicit; this suite verifies client-side interaction, not live writes.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("toonspectrum-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
    sessionStorage.setItem("toonspectrum-compat-dismissed", "true");
  });
  await page.route("**/api/**", async (route) => {
    const session = new URL(route.request().url()).pathname.endsWith("/auth/session");
    await route.fulfill({ status: session ? 200 : 503, json: session ? { authenticated: false, user: null } : { message: "Deliberate offline fixture" } });
  });
});

for (const width of [390, 1440]) {
  test(`${width}px atelier tabs, layers, camera and routes work`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/community");
    const demo = page.getByTestId("atelier-workbench");
    await demo.scrollIntoViewIfNeeded();
    await expect(demo).toHaveCount(1);
    await demo.getByRole("tab", { name: "선의 감각" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(demo.getByRole("tab", { name: "색과 레이어" })).toBeFocused();
    await demo.getByRole("button", { name: "채색", exact: true }).click();
    await expect(demo.locator("[data-color]")).toHaveAttribute("data-color", "false");
    await demo.getByRole("tab", { name: "컷과 이야기" }).click();
    await demo.getByRole("button", { name: "세로 흐름" }).click();
    await expect(demo.locator("[data-vertical]")).toHaveAttribute("data-vertical", "true");
    await demo.getByRole("tab", { name: "움직이는 컷" }).click();
    const slider = demo.getByRole("slider", { name: /카메라 위치/ });
    await slider.focus();
    await page.keyboard.press("End");
    await expect(slider).toHaveValue("100");
    await expect(demo).toHaveAttribute("data-manual-camera", "true");
    await expect(demo).toHaveAttribute("data-running", "false");
    await expect(demo.getByRole("link", { name: "홍보 영상 만들기" })).toHaveAttribute("href", "/create/promo");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
    await demo.screenshot({ path: info.outputPath(`atelier-${width}.png`) });
    await demo.getByRole("tab", { name: "창작 재료" }).click();
    await demo.getByRole("link", { name: "리소스 찾아보기" }).click();
    await expect(page).toHaveURL(/\/market\/browse$/u);
    await expect(page.getByTestId("atelier-workbench")).toHaveAttribute("data-scene", "materials");
    expect(errors).toEqual([]);
  });
}

test("motion actually pauses, resumes, and obeys the system preference", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/community");
  const demo = page.getByTestId("atelier-workbench");
  await demo.scrollIntoViewIfNeeded();
  await expect(demo).toHaveAttribute("data-running", "true");
  const art = demo.locator(".atelier-workbench__art");
  await expect(art).toHaveCSS("animation-play-state", "running");
  await demo.getByRole("button", { name: "모션 일시정지" }).click();
  await expect(art).toHaveCSS("animation-play-state", "paused");
  await demo.getByRole("button", { name: "모션 일시정지" }).click();
  await expect(art).toHaveCSS("animation-play-state", "running");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(demo).toHaveAttribute("data-running", "false");
  await expect(art).toHaveCSS("animation-name", "none");
});

test("image failure leaves explanation and onward actions usable", async ({ page }) => {
  await page.route("**/brand/atelier-*.webp", (route) => route.abort());
  await page.goto("/research");
  const demo = page.getByTestId("atelier-workbench");
  await demo.scrollIntoViewIfNeeded();
  await expect(demo.getByText(/이미지 없이도/)).toBeVisible();
  await expect(demo.getByRole("link", { name: "레이어로 작업하기" })).toHaveAttribute("href", "/studio");
});

test("sensitive routes remain free of interactive promotional chapters", async ({ page }) => {
  for (const route of ["/settings", "/login", "/market/manage", "/terms", "/privacy"]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByTestId("atelier-workbench")).toHaveCount(0);
  }
});

test("calendar day lists expand without losing keyboard navigation or full export", async ({ page }, info) => {
  const { readFile } = await import("node:fs/promises");
  const calendar = JSON.parse(await readFile("apps/web/public/data/calendar.json", "utf8"));
  await page.route("**/api/calendar**", (route) => route.fulfill({ status: 200, json: calendar }));
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/calendar");
  const monday = page.getByRole("tab", { name: /^월/u });
  await monday.click();
  const panel = page.getByRole("tabpanel");
  await expect(panel.locator('a[href^="/title/"]')).toHaveCount(24);
  await panel.getByRole("button", { name: /월요일 .*더 보기/u }).click();
  await expect(panel.locator('a[href^="/title/"]')).toHaveCount(48);
  await monday.focus();
  await page.keyboard.press("ArrowRight");
  const tuesday = page.getByRole("tab", { name: /^화/u });
  await expect(tuesday).toBeFocused();
  await expect(tuesday).toHaveAttribute("aria-selected", "true");
  await expect(panel.locator('a[href^="/title/"]')).toHaveCount(24);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: /내보내기/u }).click();
  const download = await downloading;
  await download.saveAs(info.outputPath("full-week-calendar.ics"));
  const content = await readFile(info.outputPath("full-week-calendar.ics"), "utf8");
  expect(content).toContain("BEGIN:VCALENDAR");
  expect(content.match(/BEGIN:VEVENT/gu)!.length).toBeGreaterThan(48);
});
