import { describe, expect, it, vi } from "vitest";
import { createStudioSkiaCameraSource } from "./studio-skia-camera-source";

describe("Skia live camera", () => {
  it("reads the committed and imperative Stage transform without a React snapshot", () => {
    let x = 10; let y = 20;
    const stage = { x: () => x, y: () => y, scaleX: () => -2, scaleY: () => 2, rotation: () => 90, on: vi.fn(), off: vi.fn() };
    const source = createStudioSkiaCameraSource(() => stage);
    expect(source.read()).toEqual({ scaleX: -2, scaleY: 2, rotation: 90, offsetX: 10, offsetY: 20 });
    const listener = vi.fn(); const unsubscribe = source.subscribe(listener);
    x = -50; y = -120;
    expect(source.read()).toMatchObject({ offsetX: -50, offsetY: -120 });
    expect(stage.on).toHaveBeenCalledWith(expect.stringContaining("xChange.skiaCamera"), listener);
    unsubscribe();
    expect(stage.off).toHaveBeenCalledWith(stage.on.mock.calls[0]![0], listener);
  });
  it("does not invent a camera before the Stage is mounted", () => {
    const source = createStudioSkiaCameraSource(() => null);
    expect(source.read()).toBeNull(); expect(() => source.subscribe(vi.fn())()).not.toThrow();
  });
});
