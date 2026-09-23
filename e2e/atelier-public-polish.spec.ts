import { expect, test } from "./fixtures/non-studio-test";

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
  test(`${width}px community route keeps the spatial campus and real destinations usable`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/community");
    const room = page.getByRole("region", { name: "전시관·창작자 카페" });
    await expect(room).toBeVisible();
    await expect(page.getByTestId("atelier-workbench")).toHaveCount(0);
    await room.getByRole("link", { name: "작품 전시", exact: true }).click();
    await expect(page).toHaveURL(/\/showcase$/u);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("campus view modes remain keyboard-operable with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/community");
  const modes = page.getByRole("group", { name: "보기 방식" });
  const work = modes.getByRole("button", { name: "업무", exact: true });
  await work.click();
  await expect(work).toHaveAttribute("aria-pressed", "true");
  const space = modes.getByRole("button", { name: "공간", exact: true });
  await space.click();
  await expect(space).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("atelier-workbench")).toHaveCount(0);
});

test("retired atelier artwork failures cannot block the current research workspace", async ({ page }) => {
  await page.route("**/brand/atelier-*.webp", (route) => route.abort());
  await page.goto("/research");
  await expect(page.getByRole("region", { name: "이야기 도서관" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.getByTestId("atelier-workbench")).toHaveCount(0);
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
