import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ThorvgBackendConflictError,
  acquireThorvgRuntime,
  resetThorvgRuntimeForTests,
  thorvgRuntimeSnapshot,
} from "./runtime";

function fakeLoader(init: ReturnType<typeof vi.fn>) {
  return async () => ({ default: { init } }) as never;
}

afterEach(async () => {
  await resetThorvgRuntimeForTests();
});

describe("ThorVG process-global runtime ownership", () => {
  it("shares one immutable backend and terminates after the final release", async () => {
    const term = vi.fn();
    const namespace = { term };
    const init = vi.fn(async () => namespace);
    const loadModule = fakeLoader(init);

    const first = await acquireThorvgRuntime({ backend: "wg", loadModule, wasmUrl: "/thorvg.wasm" });
    const second = await acquireThorvgRuntime({ backend: "wg", loadModule, wasmUrl: "/thorvg.wasm" });
    expect(init).toHaveBeenCalledTimes(1);
    expect(thorvgRuntimeSnapshot()).toEqual({ backend: "wg", references: 2 });

    first.release();
    expect(term).not.toHaveBeenCalled();
    second.release();
    expect(term).toHaveBeenCalledTimes(1);
    expect(thorvgRuntimeSnapshot()).toEqual({ backend: null, references: 0 });
  });

  it("fails closed when another backend is requested during a live lease", async () => {
    const init = vi.fn(async () => ({ term: vi.fn() }));
    const first = await acquireThorvgRuntime({
      backend: "wg",
      loadModule: fakeLoader(init),
      wasmUrl: "/thorvg.wasm",
    });

    await expect(acquireThorvgRuntime({
      backend: "gl",
      loadModule: fakeLoader(init),
      wasmUrl: "/thorvg.wasm",
    })).rejects.toBeInstanceOf(ThorvgBackendConflictError);
    expect(thorvgRuntimeSnapshot()).toEqual({ backend: "wg", references: 1 });
    first.release();
  });

  it("clears a failed initialization so an explicit retry can start cleanly", async () => {
    const failed = vi.fn(() => Promise.reject(new Error("wasm blocked")));
    await expect(acquireThorvgRuntime({
      backend: "wg",
      loadModule: fakeLoader(failed),
      wasmUrl: "/thorvg.wasm",
    })).rejects.toThrow("wasm blocked");
    expect(thorvgRuntimeSnapshot()).toEqual({ backend: null, references: 0 });
  });
});
