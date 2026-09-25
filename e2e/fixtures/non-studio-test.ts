import { expect, test as base } from "@playwright/test";

import {
  STUDIO_BETA_NOTICE_REVISION,
  STUDIO_BETA_NOTICE_STORAGE_KEY,
} from "../../apps/web/src/domains/creator/studio-beta-notice-storage";
import { installBetaEventDismissal } from "../../scripts/lib/public-page-event-gate.mjs";

export { installBetaEventDismissal };

export async function installStudioBetaNoticeDismissal(page: Parameters<typeof installBetaEventDismissal>[0]) {
  await page.addInitScript(({ key, revision }) => {
    localStorage.setItem(key, revision);
  }, {
    key: STUDIO_BETA_NOTICE_STORAGE_KEY,
    revision: STUDIO_BETA_NOTICE_REVISION,
  });

  const gate = page.locator('[data-studio-beta-notice="true"]');
  await page.addLocatorHandler(gate, async () => {
    const acknowledge = gate.locator('[data-studio-beta-notice-acknowledge="true"]');
    await acknowledge.click();
    await expect(gate).toBeHidden();
  });
}

export const test = base.extend<{
  dismissBetaEvent: boolean;
  dismissStudioBetaNotice: boolean;
}>({
  // Dedicated gate tests opt out so first exposure, keyboard close and persistence stay covered.
  dismissBetaEvent: [true, { option: true }],
  dismissStudioBetaNotice: [true, { option: true }],
  page: async ({ page, dismissBetaEvent, dismissStudioBetaNotice }, use) => {
    if (dismissBetaEvent) await installBetaEventDismissal(page);
    if (dismissStudioBetaNotice) await installStudioBetaNoticeDismissal(page);
    await use(page);
  },
});

export { expect };
