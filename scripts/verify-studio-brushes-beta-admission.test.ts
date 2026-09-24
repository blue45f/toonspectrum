import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./verify-studio-brushes.mts", import.meta.url),
  "utf8",
);

describe("Studio brush browser beta admission", () => {
  it("dismisses the beta notice through the stable product selector before transient chrome", () => {
    expect(source).toContain(
      'page.locator(\'[data-studio-beta-notice="true"]\')',
    );
    expect(source).toContain(
      '[data-studio-beta-notice-acknowledge="true"]',
    );
    expect(source).toContain(
      'acknowledge.click({ timeout: 30_000, noWaitAfter: true })',
    );
    expect(source).toContain(
      'notice.waitFor({ state: "hidden", timeout: 30_000 })',
    );

    const transientChrome = source.indexOf(
      "async function dismissTransientChrome",
    );
    const admission = source.indexOf(
      "await acknowledgeStudioBetaNoticeIfPresent(page);",
      transientChrome,
    );
    const quickstart = source.indexOf(
      "const quickstart = page.locator",
      transientChrome,
    );

    expect(transientChrome).toBeGreaterThan(-1);
    expect(admission).toBeGreaterThan(transientChrome);
    expect(quickstart).toBeGreaterThan(admission);
  });
});
