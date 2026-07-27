import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const studioPage = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");
const packagePlanner = readFileSync(
  new URL("./studio-publish-package.ts", import.meta.url),
  "utf8"
);
const manifestRuntime = readFileSync(
  new URL("./studio-publish-package-manifest-runtime.ts", import.meta.url),
  "utf8"
);

describe("Studio publish manifest runtime boundary", () => {
  it("keeps manifest migration and archive reconciliation out of the drawing route", () => {
    expect(packagePlanner).not.toContain("export function parseStudioPublishPackageManifest");
    expect(packagePlanner).not.toContain("export function finalizeStudioPublishPackageManifest");
    expect(packagePlanner).not.toContain("export function serializeStudioPublishPackageManifest");
    expect(manifestRuntime).toContain("export function parseStudioPublishPackageManifest");
    expect(manifestRuntime).toContain("export function finalizeStudioPublishPackageManifest");
    expect(manifestRuntime).toContain("export function serializeStudioPublishPackageManifest");
  });

  it("loads the runtime only from explicit async export and download actions", () => {
    expect(studioPage).not.toMatch(
      /from\s+["']\.\/studio-publish-package-manifest-runtime["']/u
    );
    expect(
      studioPage.match(/import\(["']\.\/studio-publish-package-manifest-runtime["']\)/gu)
    ).toHaveLength(2);
    expect(studioPage).not.toMatch(
      /import\s*\{[^}]*?(?:finalize|serialize)StudioPublishPackageManifest[^}]*?\}\s*from\s*["']\.\/studio-publish-package["']/u
    );
  });
});
