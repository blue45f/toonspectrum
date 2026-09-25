import assert from "node:assert/strict";
import { expect } from "@playwright/test";

/** Public UI contract: no dev-only imports, fake document storage, or production writes. */
export async function assertStudioWorkspaceHome(page) {
  const home = page.locator('[data-workspace-surface="home"]');
  await expect(home).toBeVisible({ timeout: 30000 });
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(home.locator("#workspace-title")).toBeVisible();
  const navigation = home.locator(".workspace-nav a");
  await expect(navigation).toHaveCount(5);
  assert.deepEqual(await navigation.evaluateAll((links) => links.map((link) => new URL(link.href).pathname)),
    ["/home", "/studio", "/discover", "/community", "/sitemap"]);
  await expect(home.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator(".vs2-bottom, .public-site-journey, video")).toHaveCount(0);
  const primary = home.locator(".workspace-statusbar .workspace-primary, .workspace-live-status .workspace-live-actions > a");
  await expect(primary).toBeVisible();
  await expect.poll(async () => (await primary.boundingBox())?.height ?? 0,
    { message: "The settled primary action must retain a 44px target" }).toBeGreaterThanOrEqual(44);
  const selection = home.locator(".workspace-project-select select");
  await expect(selection).toBeEnabled();
  const selectedProject = await selection.inputValue();
  await expect(home.locator(".workspace-list-view")).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(home.locator(".workspace-list-view")).toBeVisible();
  await expect(selection).toHaveValue(selectedProject);
  const workTrigger = home.locator(".workspace-work-shortcut");
  const trigger = await workTrigger.isVisible()
    ? workTrigger
    : home.getByRole("button", { name: /^(도구와 공간 메뉴|Tools and space menu)$/u });
  await trigger.click();
  const panel = home.locator("dialog[open]");
  await expect(panel).toBeVisible();
  assert(await panel.evaluate((element) => element.contains(document.activeElement)), "Panel must receive focus");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(home.locator(".workspace-statusbar")).toBeVisible();

  // The task-first home keeps virtual-space entry explicit. A new visitor must
  // choose a character first; a returning visitor still enters through a direct CTA.
  const personalStudio = home.locator(".workspace-personal-studio-card");
  await expect(personalStudio).toBeVisible();
  const enter = personalStudio.locator(".workspace-personal-studio-actions .workspace-primary");
  await expect(enter).toBeVisible();
  await expect.poll(async () => (await enter.boundingBox())?.height ?? 0,
    { message: "The explicit spatial entry action must retain a 44px target" }).toBeGreaterThanOrEqual(44);
  const characterReady = await personalStudio.getAttribute("data-character-ready");
  assert.equal(
    await enter.getAttribute("href"),
    characterReady === "true" ? "/studio/space" : "/onboarding/character?next=%2Fstudio%2Fspace",
    "Virtual-space entry must preserve the explicit character boundary",
  );
  await expect(home.locator('[data-studio-engine-status="ready"]')).toHaveCount(0);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Workspace must not overflow horizontally");
}
