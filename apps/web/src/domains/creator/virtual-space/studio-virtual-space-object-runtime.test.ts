import { describe, expect, it } from "vitest";

import { stepStudioDoorState } from "./studio-virtual-space-object-runtime";

describe("Virtual Studio world-object state", () => {
  it("opens a physical door near the player and closes it only after a grace period", () => {
    const opened = stepStudioDoorState({ open: false, lastNearAt: -Infinity }, 30, 1000);
    expect(opened).toEqual({ open: true, lastNearAt: 1000 });
    expect(stepStudioDoorState(opened, 100, 1600).open).toBe(true);
    expect(stepStudioDoorState(opened, 100, 1900).open).toBe(false);
  });
});
