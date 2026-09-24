import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./verify-studio-discovery-ux.mts", import.meta.url),
  "utf8",
);

describe("Studio discovery browser admission", () => {
  it("acknowledges the beta notice before the first editor tool interaction", () => {
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

    const editorReady = source.indexOf(
      'page.locator(\'[data-studio-editor="true"]\').waitFor',
    );
    const acknowledgement = source.lastIndexOf(
      "await acknowledgeStudioBetaNoticeIfPresent(page);",
    );
    const penClick = source.indexOf("await pen.first().click();");

    expect(editorReady).toBeGreaterThan(-1);
    expect(acknowledgement).toBeGreaterThan(editorReady);
    expect(penClick).toBeGreaterThan(acknowledgement);
  });
});
