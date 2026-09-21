import { expect, it, vi } from "vitest";
import { waitForStudioSkiaPresentationFence } from "./studio-skia-presentation-fence";

it("waits for the real layer draw and removes only its own listener", async () => {
  let draw!: () => void;
  const layer = { on: vi.fn((_event: string, handler: () => void) => { draw = handler; }), off: vi.fn(), batchDraw: vi.fn() };
  const abort = new AbortController(); let resolved = false;
  const promise = waitForStudioSkiaPresentationFence(layer, abort.signal).then(() => { resolved = true; });
  await Promise.resolve(); expect(resolved).toBe(false); expect(layer.batchDraw).toHaveBeenCalledOnce();
  draw(); await promise;
  expect(layer.off).toHaveBeenCalledWith(layer.on.mock.calls[0]![0], draw);
  abort.abort(); expect(layer.off).toHaveBeenCalledTimes(1);
});
it("cleans aborted and failed draw requests without claiming presentation", async () => {
  const layer = { on: vi.fn(), off: vi.fn(), batchDraw: vi.fn() }; const abort = new AbortController();
  const promise = waitForStudioSkiaPresentationFence(layer, abort.signal); abort.abort();
  await expect(promise).rejects.toMatchObject({ name: "AbortError" }); expect(layer.off).toHaveBeenCalledOnce();
  await expect(waitForStudioSkiaPresentationFence(null, new AbortController().signal)).rejects.toThrow("not available");
  layer.batchDraw.mockImplementation(() => { throw new Error("draw failed"); });
  await expect(waitForStudioSkiaPresentationFence(layer, new AbortController().signal)).rejects.toThrow("draw failed");
  expect(layer.off).toHaveBeenCalledTimes(2);
});
