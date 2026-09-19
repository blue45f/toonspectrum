// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { createArtifactReviewRuntime } from "./artifact-review-runtime";
import { createSpecialistFixture } from "./specialist-fixtures";
import { sha256 } from "./specialist-gltf";
import type { ArtifactReviewSource } from "./artifact-review-contract";
import type { SpecialistArtifact } from "./specialist-contract";

const state = vi.hoisted(() => ({
  parse: vi.fn(),
  renderers: [] as {
    domElement: HTMLCanvasElement;
    dispose: ReturnType<typeof vi.fn>;
    forceContextLoss: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class Renderer {
    domElement = document.createElement("canvas");
    autoClear = false;
    outputColorSpace = "";
    dispose = vi.fn();
    forceContextLoss = vi.fn();
    render = vi.fn();
    setPixelRatio = vi.fn();
    setClearColor = vi.fn();
    setViewport = vi.fn();
    setScissor = vi.fn();
    setScissorTest = vi.fn();
    clear = vi.fn();
    setSize = (width: number, height: number) => {
      this.domElement.width = width;
      this.domElement.height = height;
    };
    constructor() {
      state.renderers.push(this);
    }
  }
  return { ...actual, WebGLRenderer: Renderer };
});
vi.mock("three/addons/controls/OrbitControls.js", async () => {
  const { EventDispatcher, Vector3 } = await import("three");
  return {
    OrbitControls: class extends EventDispatcher {
      target = new Vector3();
      enableDamping = false;
      minDistance = 0;
      maxDistance = 0;
      dispose = vi.fn();
      constructor(private camera: import("three").Camera) {
        super();
      }
      update() {
        this.camera.lookAt(this.target);
        return true;
      }
    },
  };
});
vi.mock("three/addons/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    setMeshoptDecoder() {
      return this;
    }
    setKTX2Loader() {
      return this;
    }
    parseAsync(...args: unknown[]) {
      return state.parse(...args);
    }
  },
}));
const pendingFrames: FrameRequestCallback[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  state.renderers = [];
  pendingFrames.length = 0;
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    pendingFrames.push(callback);
    return pendingFrames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
function loaded(x = 0, scale = 1) {
  const geometry = new BoxGeometry(2, 2, 2);
  const material = new MeshStandardMaterial();
  const root = new Group().add(new Mesh(geometry, material));
  root.position.x = x;
  root.scale.setScalar(scale);
  return { scene: root, scenes: [root], geometry, material };
}
async function input() {
  const bytes = await createSpecialistFixture("cube");
  const stats = {
    triangles: 12,
    vertices: 24,
    nodes: 1,
    animations: 0,
    animationKeys: 0,
    tangentPrimitives: 0,
  };
  const artifact: SpecialistArtifact = {
    name: "cube.glb",
    mime: "model/gltf-binary",
    bytes,
    sha256: sha256(bytes),
    stats,
  };
  const source: ArtifactReviewSource = {
    label: "source",
    bytes,
    sha256: artifact.sha256,
    stats,
  };
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 640 });
  return { artifact, source, host };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
describe("owned preview runtime cleanup and coordinates", () => {
  it("rejects mismatched data before allocating any context or parsing", async () => {
    const args = await input();
    await expect(
      createArtifactReviewRuntime({
        ...args,
        artifact: { ...args.artifact, sha256: "sha256:" + "0".repeat(64) },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow();
    expect(state.renderers).toHaveLength(0);
    expect(state.parse).not.toHaveBeenCalled();
  });
  it("preserves world-coordinate differences, uses one context, and disposes both loaded roots exactly once", async () => {
    const args = await input();
    const original = loaded();
    const derived = loaded(3, 2);
    const geo = [original.geometry, derived.geometry].map((g) =>
      vi.spyOn(g, "dispose"),
    );
    const mats = [original.material, derived.material].map((m) =>
      vi.spyOn(m, "dispose"),
    );
    state.parse.mockResolvedValueOnce(original).mockResolvedValueOnce(derived);
    const measurement = vi.fn();
    const frame = vi.fn();
    const runtime = await createArtifactReviewRuntime({
      ...args,
      signal: new AbortController().signal,
      onMeasurement: measurement,
      onFrame: frame,
    });
    expect(state.renderers).toHaveLength(1);
    expect(state.parse).toHaveBeenCalledTimes(2);
    expect(measurement).toHaveBeenCalledWith({
      sourceSize: [2, 2, 2],
      resultSize: [4, 4, 4],
      centerShift: 3,
      sourceTriangles: 12,
      resultTriangles: 12,
    });
    expect(frame.mock.calls.at(-1)![0].target).toEqual([0, 0, 0]);
    expect(derived.scene.position.x).toBe(3);
    expect(derived.scene.scale.x).toBe(2);
    runtime.dispose();
    runtime.dispose();
    for (const spy of [...geo, ...mats]) expect(spy).toHaveBeenCalledOnce();
    expect(state.renderers[0]!.dispose).toHaveBeenCalledOnce();
    expect(args.host.querySelector("canvas")).toBeNull();
  });
  it("waits for a late source parse, releases its resources and never starts the second parse after cancellation", async () => {
    const args = await input();
    const late = deferred<ReturnType<typeof loaded>>();
    state.parse.mockReturnValueOnce(late.promise);
    const abort = new AbortController();
    const runtime = createArtifactReviewRuntime({
      ...args,
      signal: abort.signal,
    });
    const rejected = expect(runtime).rejects.toMatchObject({
      code: "cancelled",
    });
    await waitFor(() => expect(state.parse).toHaveBeenCalledOnce());
    abort.abort();
    const source = loaded();
    const release = vi.spyOn(source.geometry, "dispose");
    late.resolve(source);
    await rejected;
    expect(release).toHaveBeenCalledOnce();
    expect(state.parse).toHaveBeenCalledOnce();
    expect(state.renderers[0]!.dispose).toHaveBeenCalledOnce();
  });
  it("releases the first model when decoding the derivative fails", async () => {
    const args = await input();
    const source = loaded();
    const release = vi.spyOn(source.geometry, "dispose");
    state.parse
      .mockResolvedValueOnce(source)
      .mockRejectedValueOnce(new Error("bad derivative"));
    await expect(
      createArtifactReviewRuntime({
        ...args,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("bad derivative");
    expect(release).toHaveBeenCalledOnce();
    expect(state.renderers[0]!.forceContextLoss).toHaveBeenCalledOnce();
  });
  it("reports context loss and prevents subsequent renders until the user starts another preview", async () => {
    const args = await input();
    state.parse.mockResolvedValue(loaded());
    const onError = vi.fn();
    const runtime = await createArtifactReviewRuntime({
      ...args,
      source: undefined,
      signal: new AbortController().signal,
      onError,
    });
    const renderer = state.renderers[0]!;
    renderer.domElement.dispatchEvent(
      new Event("webglcontextlost", { cancelable: true }),
    );
    for (const callback of pendingFrames.splice(0)) callback(0);
    runtime.zoom(0.8);
    expect(onError).toHaveBeenCalledOnce();
    expect(renderer.render).not.toHaveBeenCalled();
    runtime.dispose();
  });
});
