import { describe, expect, it } from "vitest";

import { studioAutomergeOfflineBranchEnabled } from "./studio-offline-branch-feature";

describe("studio Automerge offline branch feature flag", () => {
  it.each([
    ["1", true],
    ["true", true],
    ["0", false],
    ["false", false],
    [undefined, false],
  ] as const)("maps %s to %s", (value, expected) => {
    expect(studioAutomergeOfflineBranchEnabled(value)).toBe(expected);
  });
});
