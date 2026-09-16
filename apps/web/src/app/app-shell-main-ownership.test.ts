import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE_ROOT = "apps/web/src";
const APP_SHELL = "apps/web/src/app/AppShell.tsx";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!entry.name.endsWith(".tsx")) return [];
    if (entry.name.includes(".test.") || entry.name.endsWith(".test-fixture.tsx")) return [];
    return [path];
  });
}

describe("application main landmark ownership", () => {
  it("keeps AppShell as the only main landmark owner", () => {
    const shellSource = readFileSync(APP_SHELL, "utf8");
    expect(shellSource.match(/<main\b/gu)).toHaveLength(1);

    const offenders = sourceFiles(SOURCE_ROOT)
      .filter((path) => path !== APP_SHELL)
      .filter((path) => /<main\b/u.test(readFileSync(path, "utf8")))
      .map((path) => relative(SOURCE_ROOT, path));

    expect(offenders).toEqual([]);
  });
});
