import assert from "node:assert/strict";
import { expect } from "@playwright/test";

/** Public UI contract: no dev-only imports, fake document storage, or production writes. */
export async function assertStudioWorkspaceHome(page) {
  const home = page.locator('[data-route-ready="studio-workspace"][data-workspace-surface="home"]');
  await expect(home).toBeVisible({ timeout: 30000 });
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(home.locator("#workspace-title")).toBeVisible();
  const navigation = home.locator(".workspace-nav a");
  await expect(navigation).toHaveCount(4);
  assert.deepEqual(await navigation.evaluateAll((links) => links.map((link) => new URL(link.href).pathname)),
    ["/home", "/studio", "/team", "/hub"]);
  await expect(home.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator(".vs2-bottom, .public-site-journey, video")).toHaveCount(0);
  const primary = home.locator(".workspace-statusbar .workspace-primary");
  await expect(primary).toBeVisible();
  await expect.poll(async () => (await primary.boundingBox())?.height ?? 0,
    { message: "The settled primary action must retain a 44px target" }).toBeGreaterThanOrEqual(44);
  const selection = home.locator(".workspace-project-select select");
  await expect(selection).toBeEnabled();
  const selectedProject = await selection.inputValue();
  const viewButtons = home.locator('[data-creator-experience-switch="true"] button');
  await expect(viewButtons).toHaveCount(2);
  await viewButtons.first().click();
  await expect(home.locator(".workspace-list-view")).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(home.locator(".workspace-list-view")).toBeVisible();
  await expect(selection).toHaveValue(selectedProject);
  await viewButtons.nth(1).click();
  const art = home.locator(".workspace-world img");
  await expect(art).toBeVisible();
  await expect.poll(() => art.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(selection).toHaveValue(selectedProject);
  const workTrigger = home.locator(".workspace-work-shortcut");
  const trigger = await workTrigger.isVisible() ? workTrigger : home.locator(".workspace-footer-actions .workspace-icon-button");
  await trigger.click();
  const panel = home.locator("dialog[open]");
  await expect(panel).toBeVisible();
  assert(await panel.evaluate((element) => element.contains(document.activeElement)), "Panel must receive focus");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Workspace must not overflow horizontally");
  await expect(home.locator(".workspace-statusbar")).toBeVisible();
}
