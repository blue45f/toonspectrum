import { expect, test as base } from "@playwright/test";

import { installBetaEventDismissal } from "../../scripts/lib/public-page-event-gate.mjs";

export { installBetaEventDismissal };

export const test = base.extend<{ dismissBetaEvent: boolean }>({
  // Dedicated gate tests opt out so first exposure, keyboard close and persistence stay covered.
  dismissBetaEvent: [true, { option: true }],
  page: async ({ page, dismissBetaEvent }, use) => {
    if (dismissBetaEvent) await installBetaEventDismissal(page);
    await use(page);
  },
});

export { expect };
