import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sweep = readFileSync(
  new URL("../../../../../scripts/verify-studio-inapp-feature-sweep.mts", import.meta.url),
  "utf8",
);

describe("Studio in-app feature sweep route contract", () => {
  it("boots the real canvas editor before exercising editing controls", () => {
    expect(sweep).toContain('page.goto(`${baseUrl}/studio/canvas`');
    expect(sweep).toContain('waitForServer(`${baseUrl}/studio/canvas`)');
    expect(sweep).not.toContain('page.goto(`${baseUrl}/studio`, { waitUntil: "domcontentloaded", timeout: 30_000 });');
  });
});
