import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** Runs the same bounded contracts in normal web CI and from a dependency-light terminal. */
describe("creator workflow upgrade contracts", () => {
  it("passes the bilingual, offline, video, AI transport and wiring regression suite", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");
    const output = execFileSync(process.execPath, [resolve(root, "tools/verify-creator-workflow-upgrades.mjs")], {
      cwd: root,
      encoding: "utf8",
      timeout: 45_000,
      maxBuffer: 1024 * 1024,
    });
    const report = JSON.parse(output) as { status: string; count: number };
    expect(report.status).toBe("passed");
    expect(report.count).toBeGreaterThanOrEqual(62);
  }, 50_000);
});
