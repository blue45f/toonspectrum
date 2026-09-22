import { describe, expect, it, vi } from "vitest";

import {
  createStudioPointerStrokePoints,
  dispatchStudioPointerStroke,
  parseStudioPointerInputMode,
  resolveStudioPointerInputMode,
} from "./studio-pointer-input-driver.mjs";

function harness() {
  const send = vi.fn(async () => ({}));
  const move = vi.fn(async () => undefined);
  const down = vi.fn(async () => undefined);
  const up = vi.fn(async () => undefined);
  const waitForTimeout = vi.fn(async () => undefined);
  return {
    cdp: { send },
    page: { mouse: { move, down, up }, waitForTimeout },
    send,
    move,
    down,
    up,
    waitForTimeout,
  };
}

const bounds = { x: 100, y: 50, width: 900, height: 620 };

describe("Studio pointer input mode", () => {
  it("uses pen for desktop auto mode and touch for mobile auto mode", () => {
    expect(resolveStudioPointerInputMode("auto", { mobile: false })).toBe("pen");
    expect(resolveStudioPointerInputMode(undefined, { mobile: true })).toBe("touch");
    expect(resolveStudioPointerInputMode("mouse", { mobile: true })).toBe("mouse");
  });

  it("fails closed on an unknown input mode", () => {
    expect(() => parseStudioPointerInputMode("stylus-ish")).toThrow(/must be one of/u);
  });
});

describe("Studio pointer stroke geometry", () => {
  it("keeps every point inside the canvas and varies pressure, tilt and twist", () => {
    const points = createStudioPointerStrokePoints(bounds, 17, { steps: 32 });
    expect(points).toHaveLength(33);
    expect(points.every((point) => (
      point.x >= bounds.x
      && point.x <= bounds.x + bounds.width
      && point.y >= bounds.y
      && point.y <= bounds.y + bounds.height
    ))).toBe(true);
    expect(new Set(points.map((point) => point.pressure.toFixed(3))).size).toBeGreaterThan(10);
    expect(new Set(points.map((point) => point.tiltX.toFixed(2))).size).toBeGreaterThan(10);
    expect(new Set(points.map((point) => point.twist)).size).toBeGreaterThan(10);
  });

  it("rejects unusable bounds and unbounded step counts", () => {
    expect(() => createStudioPointerStrokePoints({ ...bounds, width: 20 }, 1)).toThrow(/120×120/u);
    expect(() => createStudioPointerStrokePoints(bounds, 0)).toThrow(/positive integer/u);
    expect(() => createStudioPointerStrokePoints(bounds, 1, { steps: 241 })).toThrow(/2 to 240/u);
  });
});

describe("Studio pointer dispatch", () => {
  const points = createStudioPointerStrokePoints(bounds, 5, { steps: 4 });

  it("preserves the compatibility mouse path without requiring CDP", async () => {
    const runtime = harness();
    const result = await dispatchStudioPointerStroke({
      page: runtime.page,
      cdp: null,
      mode: "mouse",
      points,
    });
    expect(runtime.move).toHaveBeenCalledTimes(points.length);
    expect(runtime.down).toHaveBeenCalledTimes(1);
    expect(runtime.up).toHaveBeenCalledTimes(1);
    expect(runtime.send).not.toHaveBeenCalled();
    expect(result).toMatchObject({ mode: "mouse", points: points.length });
  });

  it("sends a real CDP pen stream with pressure, tilt, twist and an explicit release", async () => {
    const runtime = harness();
    const result = await dispatchStudioPointerStroke({
      page: runtime.page,
      cdp: runtime.cdp,
      mode: "pen",
      points,
    });
    const commands = runtime.send.mock.calls;
    expect(commands[0]?.[0]).toBe("Input.dispatchMouseEvent");
    expect(commands[1]?.[1]).toMatchObject({
      type: "mousePressed",
      pointerType: "pen",
      buttons: 1,
      button: "left",
    });
    expect(commands.slice(2, -1).every(([, payload]) => (
      payload.pointerType === "pen"
      && payload.buttons === 1
      && Number(payload.force) > 0
      && Number.isFinite(payload.tiltX)
      && Number.isFinite(payload.tiltY)
      && Number.isFinite(payload.twist)
    ))).toBe(true);
    expect(commands.at(-1)?.[1]).toMatchObject({
      type: "mouseReleased",
      pointerType: "pen",
      buttons: 0,
      force: 0,
    });
    expect(result.pressureMax).toBeGreaterThan(result.pressureMin);
  });

  it("sends touch contact geometry and ends with no active touch points", async () => {
    const runtime = harness();
    await dispatchStudioPointerStroke({
      page: runtime.page,
      cdp: runtime.cdp,
      mode: "touch",
      points,
    });
    const commands = runtime.send.mock.calls;
    expect(commands[0]).toEqual([
      "Input.dispatchTouchEvent",
      expect.objectContaining({
        type: "touchStart",
        touchPoints: [expect.objectContaining({ id: 1, force: points[0]?.pressure })],
      }),
    ]);
    expect(commands.slice(1, -1).every(([, payload]) => (
      payload.type === "touchMove"
      && payload.touchPoints[0].radiusX > 1
      && payload.touchPoints[0].force > 0
    ))).toBe(true);
    expect(commands.at(-1)).toEqual([
      "Input.dispatchTouchEvent",
      { type: "touchEnd", touchPoints: [] },
    ]);
  });

  it.each(["pen", "touch"] as const)("does not silently downgrade %s without CDP", async (mode) => {
    const runtime = harness();
    await expect(dispatchStudioPointerStroke({
      page: runtime.page,
      cdp: null,
      mode,
      points,
    })).rejects.toThrow(/requires an attached Chromium CDP session/u);
  });
});
