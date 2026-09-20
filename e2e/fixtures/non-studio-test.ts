import { expect, test as base, type Page } from "@playwright/test";

/** Public journeys first dismiss the real first-visit event through its visible control. */
export async function installBetaEventDismissal(page: Page): Promise<void> {
  const gate = page.locator('[role="dialog"][aria-labelledby="beta-open-gate-title"]');
  await page.addLocatorHandler(gate, async () => {
    const close = gate.getByRole("button", { name: /^(베타 이벤트 닫기|Close beta event)$/u });
    await expect(close).toBeVisible();
    await close.click();
    await expect(gate).toBeHidden();
  });
}

export const test = base.extend<{ dismissBetaEvent: boolean }>({
  // Dedicated gate tests opt out so first exposure, keyboard close and persistence stay covered.
  dismissBetaEvent: [true, { option: true }],
  page: async ({ page, dismissBetaEvent }, use) => {
    if (dismissBetaEvent) await installBetaEventDismissal(page);
    await use(page);
  },
});

export { expect };
