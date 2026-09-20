// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrushStudioV6Program } from "./brush-studio-v6-engine";
import { attachBrushStudioV6LivePreview } from "./brush-studio-v6-preview";
import { mapBrushStudioV6Pressure } from "./brush-studio-v6-material-engine";

const calls = vi.hoisted(() => ({ strokes: [] as { points: unknown[] }[] }));
vi.mock("./brush-studio-v6-material-engine", async (original) => ({
  ...await original<typeof import("./brush-studio-v6-material-engine")>(),
  createBrushStudioV6MaterialStroke: () => {
    const stroke = { points: [] as unknown[], push(point: unknown) { this.points.push(point); return []; } };
    calls.strokes.push(stroke); return stroke;
  },
  renderBrushStudioV6MaterialMarks: vi.fn(),
}));
const cleanups: (() => void)[] = [];
beforeEach(() => { calls.strokes.length = 0; });
afterEach(() => { cleanups.splice(0).forEach((fn) => fn()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture() {
  const context = { setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), save: vi.fn(),
    restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), drawImage: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const canvas = document.createElement("canvas");
  Object.defineProperties(canvas, { clientWidth: { value: 400, configurable: true }, clientHeight: { value: 200 },
    offsetWidth: { value: 400 }, onpointerrawupdate: { value: null } });
  canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 400, height: 200 } as DOMRect);
  const capture = new Set<number>();
  canvas.setPointerCapture = (id) => { capture.add(id); };
  canvas.hasPointerCapture = (id) => capture.has(id);
  canvas.releasePointerCapture = (id) => { capture.delete(id); };
  class PointerMock { getCoalescedEvents() { return []; } }
  vi.stubGlobal("PointerEvent", PointerMock);
  vi.stubGlobal("devicePixelRatio", 1);
  const initial = createBrushStudioV6Program("clean-ink");
  let program = { ...initial, input: { ...initial.input, transport: "move-basic" as const } };
  const telemetry = vi.fn();
  const controller = attachBrushStudioV6LivePreview(canvas, () => program, telemetry);
  cleanups.push(() => controller.destroy());
  function send(type: string, values: Record<string, unknown> = {}) {
    const event = new Event(type);
    Object.assign(event, { pointerId: 1, pointerType: "pen", isPrimary: true, button: 0,
      buttons: type === "pointerup" ? 0 : 1, pressure: 0.3, width: 1, height: 1,
      clientX: 40, clientY: 60, tiltX: 0, tiltY: 0, twist: 0, ...values });
    canvas.dispatchEvent(event);
  }
  return { canvas, context, capture, telemetry, controller, send, initial,
    useRaw() { program = { ...program, input: { ...program.input, transport: "raw-coalesced" } } as typeof program; } };
}

describe("workbench material pointer lifecycle", () => {
  it("pins transport until the active stroke ends", () => {
    const f = fixture(); f.send("pointerdown"); f.useRaw();
    f.send("pointermove", { clientX: 80 }); f.send("pointerrawupdate", { clientX: 80 });
    expect(calls.strokes[0]!.points).toHaveLength(2);
    expect((calls.strokes[0]!.points[1] as { x: number }).x).toBe(70);
  });
  it("keeps the last contact pressure at a new release endpoint", () => {
    const f = fixture(); f.send("pointerdown"); f.send("pointerup", { clientX: 100, pressure: 0 });
    expect(calls.strokes[0]!.points).toHaveLength(2);
    expect(calls.strokes[0]!.points[1]).toMatchObject({ x: 90, y: 40,
      pressure: mapBrushStudioV6Pressure(0.3, f.initial.input) });
    expect(f.capture.size).toBe(0);
  });
  it("does not deposit the same endpoint twice", () => {
    const f = fixture(); f.send("pointerdown"); f.send("pointerup", { pressure: 0 });
    expect(calls.strokes[0]!.points).toHaveLength(1);
  });
  it.each(["pointercancel", "lostpointercapture"])("restores the pre-stroke surface on %s", (type) => {
    const f = fixture(); f.send("pointerdown"); f.send("pointermove", { clientX: 100 });
    const before = f.context.drawImage.mock.calls.length;
    f.send(type); expect(f.context.drawImage.mock.calls.length).toBeGreaterThan(before);
    const count = calls.strokes[0]!.points.length;
    f.send("pointermove", { clientX: 160 }); expect(calls.strokes[0]!.points).toHaveLength(count);
    expect(f.capture.size).toBe(0);
  });
  it("releases capture when clearing, and ignores late input", () => {
    const f = fixture(); f.send("pointerdown"); f.controller.clear();
    expect(f.capture.size).toBe(0);
    f.send("pointermove", { clientX: 140 }); expect(calls.strokes[0]!.points).toHaveLength(1);
  });
  it("has one pointer writer and never accepts a right-button stroke", () => {
    const f = fixture(); f.send("pointerdown", { button: 2, buttons: 2 });
    expect(calls.strokes).toHaveLength(0);
    f.send("pointerdown"); f.send("pointerdown", { pointerId: 2 }); expect(calls.strokes).toHaveLength(1);
  });
});
