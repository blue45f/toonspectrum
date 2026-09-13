import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./verify-studio-gpu-filters.mts", import.meta.url), "utf8");

describe("GPU parity browser entry contract", () => {
  it("resolves the workspace harness independently of Vite's apps/web root", () => {
    expect(source).toContain('new URL("./studio-gpu-filters-parity-browser.ts", import.meta.url)');
    expect(source).toContain('`/@fs/${normalizePath(fileURLToPath(');
    expect(source).not.toContain('src=\\"/scripts/studio-gpu-filters-parity-browser.ts');
  });

  it("rejects missing scripts and HTML fallbacks before waiting for GPU results", () => {
    expect(source).toContain("harnessEntry.ok()");
    expect(source).toContain('harnessEntry.headers()["content-type"]?.includes("javascript")');
    expect(source.indexOf("harnessEntry.ok()")).toBeLessThan(source.indexOf("await page.goto("));
  });

  it("keeps the original GPU result deadline and pixel parity gates", () => {
    expect(source).toContain("const RESULT_TIMEOUT_MS = 45_000;");
    expect(source).toContain("const MAX_CHANNEL_DELTA_LUT_EXACT = 0;");
    expect(source).toContain("const MAX_CHANNEL_DELTA_SINGLE_KERNEL = 1;");
    expect(source).toContain("const MAX_CHANNEL_DELTA_CHAIN = 1;");
    expect(source).toContain("parityCase.maxAlphaDelta !== 0");
    expect(source).toContain("process.exitCode = 2;");
    expect(source).not.toMatch(/strict:\s*false|fs:\s*\{\s*allow/);
  });
});
