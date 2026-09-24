import { describe, expect, it } from "vitest";

import { STUDIO_NPC_DAY_MS, studioNpcScheduleIndex, studioNpcSchedulePeriod } from "./studio-virtual-space-npc-schedule";

describe("Virtual Studio NPC schedule", () => {
  it("gives roles stable but different routes through authored anchors", () => {
    expect(studioNpcScheduleIndex("studio-guide", 0, 5)).not.toBe(studioNpcScheduleIndex("studio-editor", 0, 5));
    expect(studioNpcScheduleIndex("studio-guide", STUDIO_NPC_DAY_MS, 5)).toBe(studioNpcScheduleIndex("studio-guide", 0, 5));
    expect(new Set(Array.from({ length: 8 }, (_, hour) => studioNpcScheduleIndex("studio-guide", hour * STUDIO_NPC_DAY_MS / 8, 5))).size)
      .toBeGreaterThan(3);
  });

  it("exposes production-friendly schedule periods", () => {
    expect(studioNpcSchedulePeriod(0)).toBe("arrival");
    expect(studioNpcSchedulePeriod(STUDIO_NPC_DAY_MS * 0.3)).toBe("work");
    expect(studioNpcSchedulePeriod(STUDIO_NPC_DAY_MS * 0.5)).toBe("meeting");
    expect(studioNpcSchedulePeriod(STUDIO_NPC_DAY_MS * 0.95)).toBe("closing");
  });
});
