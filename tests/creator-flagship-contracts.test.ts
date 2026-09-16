import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { creatorSectionFromHash } from "../apps/web/src/domains/marketing/creator-home-navigation";

describe("creator flagship integration contracts", () => {
  it("runs the deterministic search, launch and storage regression suite", () => {
    const output = execFileSync(process.execPath, ["tools/verify-creator-flagship.mjs"], {
      cwd: process.cwd(), encoding: "utf8", timeout: 20_000,
    });
    const result = JSON.parse(output) as { status: string; count: number };
    expect(result.status).toBe("passed");
    expect(result.count).toBeGreaterThanOrEqual(46);
  });
  it("maps registered legacy deep links onto current focusable headings", () => {
    expect(creatorSectionFromHash("#creator-desk-title")?.headingId).toBe("creator-toolkit-title");
    expect(creatorSectionFromHash("#creator-offline-title")?.headingId).toBe("creator-process-title");
    expect(creatorSectionFromHash("#creator-film")?.headingId).toBe("creator-process-title");
    expect(creatorSectionFromHash("#creator-faq-title")?.headingId).toBe("creator-support-title");
    expect(creatorSectionFromHash("#%ZZ")).toBeUndefined();
    expect(creatorSectionFromHash("#input[name=secret]")).toBeUndefined();
  });
});
