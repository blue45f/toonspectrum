// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceJoystick } from "./StudioVirtualSpaceJoystick";

describe("StudioVirtualSpaceJoystick", () => {
  it("publishes a normalized touch vector and resets when released", () => {
    const onVectorChange = vi.fn();
    const { getByRole } = render(<StudioVirtualSpaceJoystick onVectorChange={onVectorChange} />);
    const joystick = getByRole("application");

    vi.spyOn(joystick, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 112,
      bottom: 112,
      width: 112,
      height: 112,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.pointerDown(joystick, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 108,
      clientY: 56,
      buttons: 1,
    });
    expect(onVectorChange).toHaveBeenLastCalledWith(expect.objectContaining({
      x: expect.any(Number),
      y: expect.any(Number),
    }));
    const moving = onVectorChange.mock.calls.at(-1)?.[0] as { x: number; y: number };
    expect(moving.x).toBeGreaterThan(0.8);
    expect(Math.abs(moving.y)).toBeLessThan(0.1);

    fireEvent.pointerUp(joystick, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 108,
      clientY: 56,
      buttons: 0,
    });
    expect(onVectorChange).toHaveBeenLastCalledWith({ x: 0, y: 0 });
  });
});
