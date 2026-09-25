// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION } from "./studio-virtual-space-customization";
import {
  applyStudioVirtualReward,
  parseStudioVirtualRewardInventory,
  readStudioVirtualRewardInventory,
  studioVirtualRewardUnlocked,
  unlockStudioVirtualReward,
  writeStudioVirtualRewardInventory,
} from "./studio-virtual-space-rewards";

beforeEach(() => localStorage.clear());

describe("Virtual Studio cosmetic rewards", () => {
  it("unlocks only allowlisted cosmetic rewards without currency or chance", () => {
    const empty = { version: 1 as const, unlocked: [] as const };
    const unlocked = unlockStudioVirtualReward(empty, "review-sparkle");
    expect(studioVirtualRewardUnlocked(unlocked, "review-sparkle")).toBe(true);
    expect(unlockStudioVirtualReward(unlocked, "review-sparkle")).toBe(unlocked);
    expect(applyStudioVirtualReward(DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION, "review-sparkle"))
      .toMatchObject({ auraKey: "sparkle" });
  });

  it("persists a bounded inventory and rejects unknown identifiers", () => {
    const inventory = unlockStudioVirtualReward({ version: 1, unlocked: [] }, "navigator-badge");
    expect(writeStudioVirtualRewardInventory(inventory)).toBe(true);
    expect(readStudioVirtualRewardInventory()).toEqual(inventory);
    expect(parseStudioVirtualRewardInventory({ version: 1, unlocked: ["paid-token"] })).toBeNull();
  });
});
