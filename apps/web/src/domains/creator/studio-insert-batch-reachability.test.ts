import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const assetWorkspaceSource = readFileSync(
  new URL("./StudioAssetToolPopoverWorkspace.tsx", import.meta.url),
  "utf8",
);
const lazyAssetSource = readFileSync(
  new URL("./studio-unified-asset-lazy-ui.ts", import.meta.url),
  "utf8",
);

function occurrenceCount(source: string, pattern: string): number {
  return source.split(pattern).length - 1;
}

describe("studio batch insertion reachability", () => {
  it("mounts one lazy preflight before the unified asset workspace", () => {
    const preflightElement =
      "<LazyStudioInsertBatchPreflight toolBelt={toolBelt} />";
    const preflightIndex = assetWorkspaceSource.indexOf(preflightElement);
    const unifiedWorkspaceIndex = assetWorkspaceSource.indexOf(
      "<LazyStudioUnifiedAssetToolPopoverContent",
    );

    expect(occurrenceCount(assetWorkspaceSource, preflightElement)).toBe(1);
    expect(assetWorkspaceSource).toContain("LazyStudioInsertBatchPreflight,");
    expect(lazyAssetSource).toContain('import("./StudioInsertBatchPreflight")');
    expect(lazyAssetSource).toContain("default: module.StudioInsertBatchPreflight");
    expect(preflightIndex).toBeGreaterThanOrEqual(0);
    expect(unifiedWorkspaceIndex).toBeGreaterThan(preflightIndex);
  });
});
