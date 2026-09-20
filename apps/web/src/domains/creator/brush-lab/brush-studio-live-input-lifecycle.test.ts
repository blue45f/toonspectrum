// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrushStudioV6Program, type BrushStudioV6Program } from "./brush-studio-v6-engine";
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
  // Exercise the 2D overload explicitly; other suites also add the WebGPU overload.
  const canvas2dPrototype: { getContext(contextId: "2d"): CanvasRenderingContext2D | null } = HTMLCanvasElement.prototype;
  vi.spyOn(canvas2dPrototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
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
  let program: BrushStudioV6Program = { ...initial, input: { ...initial.input, transport: "move-basic" } };
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
    useRaw() { program = { ...program, input: { ...program.input, transport: "raw-coalesced" } }; } };
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

it("does not roll back a committed stroke when releasing capture synchronously", () => {
  const f = fixture();
  const release = f.canvas.releasePointerCapture;
  f.canvas.releasePointerCapture = (id) => { release(id); f.send("lostpointercapture"); };
  f.send("pointerdown");
  const snapshots = f.context.drawImage.mock.calls.length;
  f.send("pointerup", { clientX: 90, pressure: 0 });
  expect(calls.strokes[0]!.points).toHaveLength(2);
  expect(f.context.drawImage.mock.calls.length).toBe(snapshots);
  expect(f.capture.size).toBe(0);
});
it("cancels the active stroke on destroy and makes repeated disposal inert", () => {
  const f = fixture(); f.send("pointerdown");
  const snapshots = f.context.drawImage.mock.calls.length;
  f.controller.destroy();
  expect(f.context.drawImage.mock.calls.length).toBeGreaterThan(snapshots);
  expect(f.capture.size).toBe(0);
  const clearCalls = f.context.clearRect.mock.calls.length;
  f.controller.destroy(); f.controller.clear(); f.send("pointermove", { clientX: 90 });
  expect(f.context.clearRect.mock.calls.length).toBe(clearCalls);
  expect(calls.strokes[0]!.points).toHaveLength(1);
});
it("does not construct a stroke when the browser refuses pointer capture", () => {
  const f = fixture();
  f.canvas.setPointerCapture = () => { throw new DOMException("Pointer no longer active", "NotFoundError"); };
  f.send("pointerdown");
  expect(calls.strokes).toHaveLength(0);
  expect(f.capture.size).toBe(0);
});
it("resolves a changed transport only when the next stroke starts", () => {
  const f = fixture(); f.send("pointerdown"); f.useRaw(); f.send("pointerup");
  f.send("pointerdown"); f.send("pointermove", { clientX: 80 });
  expect(calls.strokes[1]!.points).toHaveLength(1);
  f.send("pointerrawupdate", { clientX: 80 });
  expect(calls.strokes[1]!.points).toHaveLength(2);
});
