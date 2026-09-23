import { describe, expect, it } from "vitest";

import { shouldSyncGradePoseAfterPhotoApply } from "./character-shaper-grade-photo-sync";

describe("character-shaper grade photo sync policy", () => {
  it("syncs the grade twin only when the host photo apply succeeded", () => {
    expect(shouldSyncGradePoseAfterPhotoApply(true)).toBe(true);
    expect(shouldSyncGradePoseAfterPhotoApply(false)).toBe(false);
  });
});
