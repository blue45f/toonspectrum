import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const insertionHubSource = readFileSync(
  new URL("./StudioUnifiedAssetToolPopoverContent.tsx", import.meta.url),
  "utf8",
);

function occurrenceCount(source: string, pattern: string): number {
  return source.split(pattern).length - 1;
}

describe("studio batch insertion reachability", () => {
  it("mounts one preflight between the insertion subtabs and smart library", () => {
    const importStatement =
      'import { StudioInsertBatchPreflight } from "./StudioInsertBatchPreflight";';
    const preflightElement =
      "<StudioInsertBatchPreflight toolBelt={toolBelt} />";
    const subtabIndex = insertionHubSource.indexOf("<StudioMenuSubtabs");
    const preflightIndex = insertionHubSource.indexOf(preflightElement);
    const libraryIndex = insertionHubSource.indexOf(
      "<StudioUnifiedAssetSmartLibrary",
    );

    expect(occurrenceCount(insertionHubSource, importStatement)).toBe(1);
    expect(occurrenceCount(insertionHubSource, preflightElement)).toBe(1);
    expect(subtabIndex).toBeGreaterThanOrEqual(0);
    expect(preflightIndex).toBeGreaterThan(subtabIndex);
    expect(libraryIndex).toBeGreaterThan(preflightIndex);
  });
});
