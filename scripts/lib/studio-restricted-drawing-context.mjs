import assert from "node:assert/strict";
import { expect } from "@playwright/test";

/** Capability result is evidence, not a user-agent promise. Failure must stay visible. */
export async function verifyRestrictedDrawingContext(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(url);
    const fixture = page.getByTestId("drawing-fixture");
    await expect(fixture).toHaveAttribute("data-persistence", /^(saved|session-only)$/, { timeout: 45000 });
    const state = await fixture.getAttribute("data-persistence");
    if (state === "session-only") {
      await page.getByRole("button", { name: "주 색", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "주 색 선택", exact: true });
      await expect(dialog.getByRole("status", { name: "최근 색 저장 상태" })).toContainText("현재 세션에서만");
      await dialog.getByRole("textbox", { name: "헥스 색상 코드" }).fill("#a1b2c3");
      await dialog.getByRole("button", { name: "색상 적용" }).click();
      await expect(page.getByTestId("primary")).toHaveText("#a1b2c3");
      await expect(fixture).toHaveAttribute("data-history-persistence", "session-only");
      await expect(page.getByTestId("recent")).toContainText("#a1b2c3");
      await expect(page.getByTestId("undo")).toHaveText("0");
    }
    assert.deepEqual(errors, []);
    return { mode: "ephemeral", state, check: state === "saved" ? "storage supported" : "explicit session-only; editing usable, not reported as durable" };
  } finally { await context.close(); }
}
