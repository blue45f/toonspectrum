// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSparkReferenceSession } from "./splat-reference-runtime";

const state = vi.hoisted(() => ({
  phase: "",
  rendererDispose: vi.fn(),
  contextLoss: vi.fn(),
  controlsDispose: vi.fn(),
  sparkDispose: vi.fn(),
  meshDispose: vi.fn(),
}));
vi.mock("three", async () => {
  const real = await vi.importActual<typeof import("three")>("three");
  return {
    ...real,
    WebGLRenderer: class {
      domElement = document.createElement("canvas");
      setPixelRatio() {}
      setClearColor() {}
      setSize() {}
      render() {}
      dispose = state.rendererDispose;
      forceContextLoss = state.contextLoss;
    },
  };
});
vi.mock("three/addons/controls/OrbitControls.js", async () => {
  const { Vector3 } = await vi.importActual<typeof import("three")>("three");
  return {
    OrbitControls: class {
      target = new Vector3();
      constructor() {
        if (state.phase === "controls") throw new Error("controls failed");
      }
      update() {}
      addEventListener() {}
      dispose = state.controlsDispose;
    },
  };
});
vi.mock("@sparkjsdev/spark", async () => {
  const { Group } = await vi.importActual<typeof import("three")>("three");
  return {
    SplatFileType: { SPLAT: "splat" },
    SparkRenderer: class extends Group {
      constructor() {
        super();
        if (state.phase === "spark") throw new Error("spark failed");
      }
      async update() {}
      dispose = state.sparkDispose;
    },
    SplatMesh: class extends Group {
      initialized: Promise<void>;
      constructor() {
        super();
        if (state.phase === "mesh") throw new Error("mesh failed");
        this.initialized =
          state.phase === "initialize"
            ? Promise.reject(new Error("initialize failed"))
            : Promise.resolve();
      }
      dispose = state.meshDispose;
    },
  };
});
function fixture() {
  const bytes = new Uint8Array(32);
  const view = new DataView(bytes.buffer);
  for (let axis = 0; axis < 3; axis++)
    view.setFloat32(12 + axis * 4, 0.1, true);
  bytes.set([200, 80, 90, 255, 255, 128, 128, 128], 24);
  return bytes;
}
beforeEach(() => {
  vi.clearAllMocks();
  state.phase = "";
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
describe("Spark reference construction lifetime", () => {
  it.each(["controls", "spark", "mesh", "initialize"])(
    "releases the context and each created owner after %s failure",
    async (phase) => {
      state.phase = phase;
      await expect(
        createSparkReferenceSession(document.createElement("div"), fixture()),
      ).rejects.toThrow(phase + " failed");
      expect(state.rendererDispose).toHaveBeenCalledOnce();
      expect(state.contextLoss).toHaveBeenCalledOnce();
      if (phase !== "controls")
        expect(state.controlsDispose).toHaveBeenCalledOnce();
      if (["mesh", "initialize"].includes(phase))
        expect(state.sparkDispose).toHaveBeenCalledOnce();
      if (phase === "initialize")
        expect(state.meshDispose).toHaveBeenCalledOnce();
    },
  );
  it("idempotently closes a fully initialized session", async () => {
    const host = document.createElement("div");
    const session = await createSparkReferenceSession(host, fixture());
    expect(host.querySelector("canvas")).not.toBeNull();
    await session.dispose();
    await session.dispose();
    expect(host.querySelector("canvas")).toBeNull();
    expect(state.meshDispose).toHaveBeenCalledOnce();
    expect(state.contextLoss).toHaveBeenCalledOnce();
  });
});
