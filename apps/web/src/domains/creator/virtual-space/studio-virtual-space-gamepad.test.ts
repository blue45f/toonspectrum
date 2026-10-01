import { describe, expect, it } from "vitest";

import {
  applyStudioVirtualSpaceGamepadDeadzone,
  readStudioVirtualSpaceGamepadInput,
  readStudioVirtualSpaceGamepadInputWithOptions,
  readStudioVirtualSpaceGamepadsInput,
  type StudioVirtualSpaceGamepadLike,
} from "./studio-virtual-space-gamepad";

function pad(
  axes: readonly number[] = [0, 0],
  pressed: readonly number[] = [],
): StudioVirtualSpaceGamepadLike {
  return {
    connected: true,
    axes,
    buttons: Array.from({ length: 16 }, (_, index) => ({
      pressed: pressed.includes(index),
      value: pressed.includes(index) ? 1 : 0,
    })),
  };
}

describe("Studio virtual space gamepad", () => {
  it("removes stick drift inside the deadzone", () => {
    expect(applyStudioVirtualSpaceGamepadDeadzone(0.12)).toBe(0);
    expect(applyStudioVirtualSpaceGamepadDeadzone(-0.17)).toBe(0);
    expect(applyStudioVirtualSpaceGamepadDeadzone(1)).toBe(1);
  });

  it("reads and normalizes the left stick", () => {
    const input = readStudioVirtualSpaceGamepadInput(pad([1, 1]));
    expect(Math.hypot(input.x, input.y)).toBeCloseTo(1, 5);
    expect(input.x).toBeGreaterThan(0);
    expect(input.y).toBeGreaterThan(0);
  });

  it("supports D-pad movement and standard A/Cross interaction", () => {
    const input = readStudioVirtualSpaceGamepadInput(pad([0, 0], [0, 12, 15]));
    expect(input.x).toBeGreaterThan(0);
    expect(input.y).toBeLessThan(0);
    expect(input.interact).toBe(true);
  });

  it("uses L3 as sprint and returns neutral input when disconnected", () => {
    expect(readStudioVirtualSpaceGamepadInput(pad([0, 0], [10])).sprint).toBe(true);
    expect(readStudioVirtualSpaceGamepadInput({ ...pad(), connected: false })).toEqual({
      x: 0,
      y: 0,
      sprint: false,
      interact: false,
    });
  });

  it("uses an active second controller when the first connected pad is idle", () => {
    const input = readStudioVirtualSpaceGamepadsInput([
      pad(),
      pad([0.8, 0], [10]),
    ]);
    expect(input.x).toBeGreaterThan(0);
    expect(input.sprint).toBe(true);
  });
});

describe("gamepad options", () => {
  it("without options matches the legacy reader", () => {
    const legacy = readStudioVirtualSpaceGamepadInput(pad([0.7, -0.4], [10]));
    const next = readStudioVirtualSpaceGamepadInputWithOptions(pad([0.7, -0.4], [10]));
    expect(next.x).toBeCloseTo(legacy.x, 5);
    expect(next.y).toBeCloseTo(legacy.y, 5);
    expect(next.sprint).toBe(legacy.sprint);
    expect(next.interact).toBe(legacy.interact);
  });

  it("applies a custom deadzone", () => {
    const narrow = readStudioVirtualSpaceGamepadInputWithOptions(pad([0.12, 0]), { deadzone: 0.05 });
    expect(Math.hypot(narrow.x, narrow.y)).toBeGreaterThan(0);
    const wide = readStudioVirtualSpaceGamepadInputWithOptions(pad([0.12, 0]), { deadzone: 0.2 });
    expect(Math.hypot(wide.x, wide.y)).toBe(0);
  });

  it("applies a response curve to the stick", () => {
    const linear = readStudioVirtualSpaceGamepadInputWithOptions(pad([0.6, 0]));
    const curved = readStudioVirtualSpaceGamepadInputWithOptions(pad([0.6, 0]), {
      responseCurve: "quadratic",
    });
    expect(Math.hypot(curved.x, curved.y)).toBeLessThan(Math.hypot(linear.x, linear.y));
    expect(Math.hypot(curved.x, curved.y)).toBeGreaterThan(0);
  });

  it("snaps to 8 directions when requested", () => {
    const angle = (20 * Math.PI) / 180;
    const input = readStudioVirtualSpaceGamepadInputWithOptions(
      pad([Math.cos(angle), Math.sin(angle)]),
      { snap8Way: true },
    );
    expect(Math.atan2(input.y, input.x)).toBeCloseTo(0, 4);
  });
});
