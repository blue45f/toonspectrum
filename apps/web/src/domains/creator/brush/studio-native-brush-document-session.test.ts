import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { planStudioNativeBrushDocument } from "./studio-native-brush-document-contract";
import { NATIVE_BRUSH_SESSION_IDLE_MS, NATIVE_BRUSH_SESSION_MAX_OPERATIONS, StudioNativeBrushDocumentSession } from "./studio-native-brush-document-session";

import type { StudioNativeBrushDocumentPlan } from "./studio-native-brush-document-contract";
import type { StudioNativeBrushDocumentClientPort } from "./studio-native-brush-document-product";

const execute = vi.hoisted(() => vi.fn());
vi.mock("./studio-native-brush-document-product", () => ({ renderStudioNativeBrushDocumentOnClient: execute }));
function plan(engine: "libmypaint" | "canvaskit" | "vello" = "libmypaint") {
  return planStudioNativeBrushDocument({ id: "s", type: "draw", points: [100, 100, 120, 110], pressures: [0.3, 0.8],
    stroke: "#123456", strokeWidth: 12, sampleTimeOffsets: [0, 8] },
  { engine, style: "ink", documentWidth: 720, documentHeight: 1000 });
}
const signal = () => new AbortController().signal;
function fixture(idleMs = NATIVE_BRUSH_SESSION_IDLE_MS) {
  const clients: Array<StudioNativeBrushDocumentClientPort & { disposed: boolean }> = [];
  const create = vi.fn(() => {
    const client = { disposed: false, request: vi.fn(), dispose: vi.fn(() => { client.disposed = true; }) };
    clients.push(client); return client;
  });
  const session = new StudioNativeBrushDocumentSession({ createClient: create, idleMs, now: () => Date.now() });
  return { session, clients, create };
}
beforeEach(() => {
  execute.mockImplementation(async (input: StudioNativeBrushDocumentPlan) => ({ sourceElementId: input.sourceElementId,
    engine: input.engine, seed: input.config.seed, bounds: input.bounds, src: "test-result" }));
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("scoped native engine session", () => {
  it("does not create a Worker on construction or for pre-cancelled work", async () => {
    const f = fixture(), abort = new AbortController(); abort.abort();
    expect(f.create).not.toHaveBeenCalled();
    await expect(f.session.render(plan(), abort.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(f.create).not.toHaveBeenCalled(); f.session.dispose();
  });
  it("initializes once and reuses only the same selected engine", async () => {
    const f = fixture();
    try {
      await f.session.render(plan(), signal()); await f.session.render(plan(), signal());
      expect(f.clients).toHaveLength(1); expect(execute.mock.calls.map((call) => call[3])).toEqual([true, false]);
      await f.session.render(plan("vello"), signal());
      expect(f.clients).toHaveLength(2); expect(f.clients[0]!.disposed).toBe(true);
      expect(execute.mock.calls.at(-1)![3]).toBe(true);
    } finally { f.session.dispose(); }
  });
  it("passes changed size/seed as a fresh operation without reusing old source data", async () => {
    const f = fixture();
    try {
      await f.session.render(plan(), signal());
      const input = plan(); input.config.seed = 99;
      const resized = { ...input, surface: { width: 160, height: 200 } };
      await f.session.render(resized, signal());
      expect(execute.mock.calls[1]![0]).toEqual(resized); expect(execute.mock.calls[1]![0]).not.toBe(resized);
      expect(execute.mock.calls[1]![3]).toBe(false); expect(f.clients).toHaveLength(1);
    } finally { f.session.dispose(); }
  });
  it("evicts at the idle deadline and lazily creates the next Worker only on explicit use", async () => {
    vi.useFakeTimers(); const f = fixture();
    await f.session.render(plan(), signal());
    vi.advanceTimersByTime(NATIVE_BRUSH_SESSION_IDLE_MS - 1); expect(f.clients[0]!.disposed).toBe(false);
    vi.advanceTimersByTime(1); expect(f.clients[0]!.disposed).toBe(true); expect(f.create).toHaveBeenCalledTimes(1);
    await f.session.render(plan(), signal()); expect(f.create).toHaveBeenCalledTimes(2); f.session.dispose();
  });
  it("checks wall-clock idle expiry even when a background timer did not run", async () => {
    vi.useFakeTimers(); vi.setSystemTime(0); const f = fixture();
    await f.session.render(plan(), signal()); vi.setSystemTime(16_000);
    await f.session.render(plan(), signal()); expect(f.clients[0]!.disposed).toBe(true);
    expect(f.create).toHaveBeenCalledTimes(2); f.session.dispose();
  });
  it("does not renew the absolute two-minute lifetime indefinitely", async () => {
    vi.useFakeTimers(); vi.setSystemTime(0); const f = fixture();
    for (let i = 0; i < 12; i++) { await f.session.render(plan(), signal()); vi.advanceTimersByTime(10_000); }
    expect(f.create).toHaveBeenCalledTimes(1); expect(f.clients[0]!.disposed).toBe(true);
    await f.session.render(plan(), signal()); expect(f.create).toHaveBeenCalledTimes(2); f.session.dispose();
  });
  it("retires a lease after its bounded number of conversions", async () => {
    const f = fixture();
    for (let i = 0; i < NATIVE_BRUSH_SESSION_MAX_OPERATIONS; i++) await f.session.render(plan(), signal());
    expect(f.create).toHaveBeenCalledTimes(1); expect(f.clients[0]!.disposed).toBe(true);
    await f.session.render(plan(), signal()); expect(f.create).toHaveBeenCalledTimes(2); f.session.dispose();
  });
  it("never retries a failed engine within the failed operation", async () => {
    const f = fixture(); execute.mockRejectedValueOnce(new Error("GPU lost"));
    await expect(f.session.render(plan("vello"), signal())).rejects.toThrow("GPU lost");
    expect(f.create).toHaveBeenCalledTimes(1); expect(f.clients[0]!.disposed).toBe(true);
    await f.session.render(plan("vello"), signal()); expect(f.create).toHaveBeenCalledTimes(2); f.session.dispose();
  });
  it("rejects overlap without cancelling or poisoning the active operation", async () => {
    const f = fixture(); let finish!: (value: object) => void;
    execute.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = f.session.render(plan(), signal());
    await expect(f.session.render(plan(), signal())).rejects.toThrow(/active conversion/);
    expect(f.clients[0]!.disposed).toBe(false); finish({ valid: true }); await pending; f.session.dispose();
  });
  it("does not keep a late result from an operation cancelled during validation", async () => {
    const f = fixture(), abort = new AbortController(); let finish!: (value: object) => void;
    execute.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = f.session.render(plan(), abort.signal); abort.abort(); finish({ late: true });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(f.clients[0]!.disposed).toBe(true); f.session.dispose();
  });
  it("disposes during initialization and rejects stale resolution without reuse", async () => {
    const f = fixture(); let finish!: (value: object) => void;
    execute.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = f.session.render(plan(), signal()); f.session.dispose(); finish({ late: true });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(f.clients[0]!.disposed).toBe(true);
    await expect(f.session.render(plan(), signal())).rejects.toMatchObject({ name: "AbortError" });
    expect(f.create).toHaveBeenCalledTimes(1);
  });
  it("clears expiry timers and double disposal is harmless", async () => {
    vi.useFakeTimers(); const f = fixture(); await f.session.render(plan(), signal());
    f.session.dispose(); f.session.dispose(); expect(vi.getTimerCount()).toBe(0);
    expect(f.clients[0]!.dispose).toHaveBeenCalledTimes(1);
  });
  it.each([0, -1, 0.5, 15001, Infinity, NaN])("rejects an invalid retention override %s", (idleMs) => {
    expect(() => fixture(idleMs)).toThrow(RangeError);
  });
});
