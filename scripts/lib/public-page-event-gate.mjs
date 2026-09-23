import { expect } from "@playwright/test";

/** Dismiss a real first-visit dialog through its visible control before public journeys.
 * @param {import("@playwright/test").Page} page
 */
export async function installBetaEventDismissal(page) {
  const gate = page.locator('[role="dialog"][aria-labelledby="beta-open-gate-title"]');
  await page.addLocatorHandler(gate, () => dismissBetaEvent(page));
}

/** Complete the real first-visit dismissal before checking restored page focus.
 * @param {import("@playwright/test").Page} page
 */
export async function dismissBetaEvent(page) {
  const gate = page.locator('[role="dialog"][aria-labelledby="beta-open-gate-title"]');
  const close = gate.getByRole("button", { name: /^(베타 이벤트 닫기|Close beta event)$/u });
  try {
    await close.waitFor({ state: "visible", timeout: 2_500 });
  } catch {
    // Spatial-campus routes deliberately suppress global marketing overlays.
    return false;
  }
  await close.click();
  await expect(gate).toBeHidden();
  return true;
}
