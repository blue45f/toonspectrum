import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

const tslNode = () => {
  const node: Record<string, unknown> = {};
  const chain = () => node;
  for (const method of [
    "clamp", "mul", "div", "fract", "floor", "greaterThan", "select", "renderOutput", "toVar",
  ]) node[method] = chain;
  node.a = node;
  node.rgb = node;
  return node;
};

vi.mock("three/tsl", () => ({
  Fn: (body: (args: readonly unknown[]) => unknown) => (...args: readonly unknown[]) => body(args),
  depth: tslNode(),
  float: () => tslNode(),
  screenUV: tslNode(),
  texture: () => tslNode(),
  vec3: () => tslNode(),
  vec4: () => tslNode(),
}));

const quadRender = vi.hoisted(() => vi.fn());
const quadDispose = vi.hoisted(() => vi.fn());

vi.mock("three/webgpu", () => ({
  MeshBasicNodeMaterial: class {
    name = "";
    blending = 0;
    toneMapped = true;
    transparent = false;
    fog = true;
    colorNode: unknown = null;
    dispose = vi.fn();
  },
  NodeMaterial: class {
    name = "";
    fragmentNode: unknown = null;
    dispose = quadDispose;
  },
  QuadMesh: class {
    constructor(readonly material: { dispose: () => void }) {}
    render = quadRender;
  },
}));

const { createStudioBg3dThreeWebGpuCaptureAdapter: createAdapter } = await import(
  "./studio-bg3d-three-webgpu-capture"
);
const { registerStudioBg3dCaptureExcludedObject, registerStudioBg3dDepthExcludedObject } =
  await import("./studio-bg3d-capture-exclusion");

const adapters = new Set<ReturnType<typeof createAdapter>>();
function createStudioBg3dThreeWebGpuCaptureAdapter(...args: Parameters<typeof createAdapter>) {
  const adapter = createAdapter(...args);
  adapters.add(adapter);
  return adapter;
}

interface FakeRendererOptions {
  readonly colorBytes?: Uint8Array;
  readonly depthBytes?: Uint8Array;
}

function createFakeWebGpuRenderer(options: FakeRendererOptions = {}) {
  const reads: Uint8Array[] = [];
  if (options.colorBytes) reads.push(options.colorBytes);
  if (options.depthBytes) reads.push(options.depthBytes);
  let readIndex = 0;
  const state = {
    isWebGPURenderer: true,
    autoClear: false,
    toneMapping: THREE.NeutralToneMapping,
    xr: { enabled: true },
    domElement: { width: 640, height: 480 },
    renderTarget: null as THREE.RenderTarget | null,
    clearHex: 0x123456,
    clearColor: new THREE.Color(0x123456),
    clearAlpha: 0.25,
    mrt: { test: "existing-mrt" } as unknown,
    viewport: new THREE.Vector4(1, 2, 3, 4),
    scissor: new THREE.Vector4(5, 6, 7, 8),
    scissorTest: true,
    targetsAtDraw: [] as Array<THREE.RenderTarget | null>,
    getMRT() { return state.mrt; },
    setMRT(value: unknown) { state.mrt = value; },
    getViewport(target: THREE.Vector4) { return target.copy(state.viewport); },
    setViewport(value: THREE.Vector4) { state.viewport.copy(value); },
    getScissor(target: THREE.Vector4) { return target.copy(state.scissor); },
    setScissor(value: THREE.Vector4) { state.scissor.copy(value); },
    getScissorTest() { return state.scissorTest; },
    setScissorTest(value: boolean) { state.scissorTest = value; },
    getActiveCubeFace() { return 0; },
    getActiveMipmapLevel() { return 0; },
    renderCalls: 0,
    watched: [] as THREE.Object3D[],
    visibilityAtDraw: [] as Array<Array<{ name: string; visible: boolean }>>,
    getRenderTarget() { return state.renderTarget; },
    setRenderTarget(target: THREE.RenderTarget | null) { state.renderTarget = target; },
    getClearColor(target: THREE.Color) { return target.copy(state.clearColor); },
    getClearAlpha() { return state.clearAlpha; },
    setClearColor(value: number | THREE.Color, alpha: number) {
      state.clearColor = value instanceof THREE.Color ? value.clone() : new THREE.Color(value);
      state.clearHex = state.clearColor.getHex(); state.clearAlpha = alpha;
    },
    render() {
      state.renderCalls += 1;
      state.targetsAtDraw.push(state.renderTarget);
      state.visibilityAtDraw.push(
        state.watched.map((object) => ({ name: object.name, visible: object.visible })),
      );
    },
    readRenderTargetPixelsAsync: vi.fn(async (_target?: THREE.RenderTarget, _x?: number,
      _y?: number, _width?: number, _height?: number) => {
      const next = reads[Math.min(readIndex, reads.length - 1)];
      readIndex += 1;
      return next ?? new Uint8Array(0);
    }),
  };
  return state;
}

function scene(): THREE.Scene {
  const created = new THREE.Scene();
  created.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
  return created;
}

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

afterEach(() => {
  for (const adapter of adapters) adapter.dispose?.();
  adapters.clear();
  vi.restoreAllMocks();
  quadRender.mockClear();
  quadDispose.mockClear();
});

describe("Studio BG3D Three WebGPU capture adapter", () => {
  it("refuses a renderer that is not an initialized WebGPU renderer", () => {
    const notWebgpu = { ...createFakeWebGpuRenderer(), isWebGPURenderer: false };
    expect(() => createStudioBg3dThreeWebGpuCaptureAdapter({
      renderer: notWebgpu as never,
      scene: scene(),
      camera,
    })).toThrow(TypeError);

    expect(() => createStudioBg3dThreeWebGpuCaptureAdapter({
      renderer: createFakeWebGpuRenderer() as never,
      scene: {} as never,
      camera,
    })).toThrow(TypeError);
  });

  it("declares the same capture profile as the WebGL adapter under a WebGPU identity", () => {
    const adapter = createStudioBg3dThreeWebGpuCaptureAdapter({
      renderer: createFakeWebGpuRenderer() as never,
      scene: scene(),
      camera,
    });
    expect(adapter).toMatchObject({
      backend: "three-webgpu",
      engineId: "three",
      graphicsApi: "webgpu",
      profileId: "studio-rgba8-straight-srgb-topdown-depth-f32-v1",
    });
    expect(adapter.getSourceSize()).toEqual({ width: 640, height: 480 });
  });

  it("returns tightly packed top-down RGBA and restores renderer state", async () => {
    // 2x2 with WebGPU's 256-byte row alignment: only the first 16 bytes of each row are real.
    const colorBytes = new Uint8Array(256 + 8);
    colorBytes.set([1, 2, 3, 255, 4, 5, 6, 255], 0);
    colorBytes.set([7, 8, 9, 255, 10, 11, 12, 255], 256);
    const renderer = createFakeWebGpuRenderer({ colorBytes });
    const target = scene();
    const adapter = createStudioBg3dThreeWebGpuCaptureAdapter({ renderer: renderer as never, scene: target, camera });

    const raster = await adapter.capture({
      width: 2,
      height: 2,
      background: { color: "#ffffff", alpha: 1 },
      includeDepth: false,
    });

    expect(raster.width).toBe(2);
    expect([...raster.rgba]).toEqual([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255]);
    expect(raster.depth).toBeUndefined();
    // Scene render plus the straight-alpha output quad.
    expect(renderer.renderCalls).toBe(1);
    expect(quadRender).toHaveBeenCalledOnce();
    expect(quadDispose).not.toHaveBeenCalled(); // Warm resources are retained, not leaked.
    adapter.dispose?.();
    expect(quadDispose).toHaveBeenCalledOnce();
    // Live renderer state is handed back exactly as it was found.
    expect(renderer.renderTarget).toBeNull();
    expect(renderer.clearHex).toBe(0x123456);
    expect(renderer.clearAlpha).toBe(0.25);
    expect(renderer.autoClear).toBe(false);
    expect(renderer.xr.enabled).toBe(true);
    expect(target.overrideMaterial).toBeNull();
  });

  it("decodes packed depth with Three's RGBA depth factors", async () => {
    const colorBytes = new Uint8Array(16);
    // 0x80,0,0,0 unpacks to 128/256 = 0.5; white is the packed far plane.
    const depthBytes = new Uint8Array([128, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0, 64, 0, 0, 0]);
    const renderer = createFakeWebGpuRenderer({ colorBytes, depthBytes });
    const adapter = createStudioBg3dThreeWebGpuCaptureAdapter({
      renderer: renderer as never,
      scene: scene(),
      camera,
    });

    const raster = await adapter.capture({
      width: 2,
      height: 2,
      background: { color: "#ffffff", alpha: 0 },
      includeDepth: true,
    });

    expect(raster.depth).toBeInstanceOf(Float32Array);
    expect(raster.depth![0]).toBeCloseTo(0.5, 6);
    expect(raster.depth![1]).toBeCloseTo(1, 5);
    expect(raster.depth![2]).toBe(0);
    expect(raster.depth![3]).toBeCloseTo(0.25, 6);
  });

  it("refuses a raster larger than the pixel budget before touching the GPU", async () => {
    const renderer = createFakeWebGpuRenderer();
    const adapter = createStudioBg3dThreeWebGpuCaptureAdapter({
      renderer: renderer as never,
      scene: scene(),
      camera,
    });
    await expect(adapter.capture({
      width: 100_000,
      height: 100_000,
      background: { color: "#ffffff", alpha: 1 },
      includeDepth: false,
    })).rejects.toThrow(RangeError);
    expect(renderer.renderCalls).toBe(0);
  });

  it("keeps viewport-only objects hidden across both the colour and depth draws", async () => {
    const target = scene();
    const gizmo = new THREE.Object3D();
    gizmo.name = "gizmo";
    const contactShadow = new THREE.Object3D();
    contactShadow.name = "contactShadow";
    target.add(gizmo, contactShadow);
    registerStudioBg3dCaptureExcludedObject(gizmo);
    registerStudioBg3dDepthExcludedObject(contactShadow);

    const renderer = createFakeWebGpuRenderer({
      colorBytes: new Uint8Array(16),
      depthBytes: new Uint8Array(16),
    });
    renderer.watched = [gizmo, contactShadow];
    const adapter = createStudioBg3dThreeWebGpuCaptureAdapter({
      renderer: renderer as never,
      scene: target,
      camera,
    });

    await adapter.capture({
      width: 2,
      height: 2,
      background: { color: "#ffffff", alpha: 1 },
      includeDepth: true,
    });

    // One scene draw per pass; the output quad renders through QuadMesh, not renderer.render.
    expect(renderer.visibilityAtDraw).toHaveLength(2);
    const [colorPass, depthPass] = renderer.visibilityAtDraw;
    // A capture-excluded gizmo restored between the passes would be packed into the depth raster.
    expect(colorPass).toEqual([
      { name: "gizmo", visible: false },
      { name: "contactShadow", visible: true },
    ]);
    expect(depthPass).toEqual([
      { name: "gizmo", visible: false },
      { name: "contactShadow", visible: false },
    ]);
    // Both exclusions are handed back once the submissions are done.
    expect(gizmo.visible).toBe(true);
    expect(contactShadow.visible).toBe(true);
  });
});


describe("WebGPU capture resource and HDR execution", () => {
  const request = { width: 2, height: 2, includeDepth: false,
    background: { color: "#ffffff", alpha: 0 } } as const;

  it("uses an HDR linear scene target and reuses it only after a completed readback", async () => {
    const renderer = createFakeWebGpuRenderer({ colorBytes: new Uint8Array(16) });
    const adapter = createStudioBg3dThreeWebGpuCaptureAdapter({ renderer: renderer as never,
      scene: scene(), camera });
    await adapter.capture(request);
    await adapter.capture(request);
    expect(renderer.targetsAtDraw[0]).toBe(renderer.targetsAtDraw[1]);
    expect(renderer.targetsAtDraw[0]?.texture.type).toBe(THREE.HalfFloatType);
    const output = renderer.readRenderTargetPixelsAsync.mock.calls[0]?.[0] as THREE.RenderTarget;
    expect(output.texture.type).toBe(THREE.UnsignedByteType);
  });

  it("restores the exact linear clear color, viewport, scissor and pre-existing MRT", async () => {
    const renderer = createFakeWebGpuRenderer({ colorBytes: new Uint8Array(16) });
    renderer.clearColor.setRGB(0.123456789, 1.25, 0.234567891);
    const original = renderer.clearColor.clone(); const mrt = renderer.mrt;
    const adapter = createStudioBg3dThreeWebGpuCaptureAdapter({ renderer: renderer as never,
      scene: scene(), camera });
    await adapter.capture(request);
    expect(renderer.clearColor).toEqual(original);
    expect(renderer.mrt).toBe(mrt);
    expect(renderer.viewport.toArray()).toEqual([1, 2, 3, 4]);
    expect(renderer.scissor.toArray()).toEqual([5, 6, 7, 8]);
    expect(renderer.scissorTest).toBe(true);
  });

  it("does not destroy pending GPU resources when the adapter is unmounted", async () => {
    const renderer = createFakeWebGpuRenderer();
    let resolve!: (value: Uint8Array) => void;
    renderer.readRenderTargetPixelsAsync.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const adapter = createStudioBg3dThreeWebGpuCaptureAdapter({ renderer: renderer as never,
      scene: scene(), camera });
    const pending = adapter.capture(request);
    const target = renderer.targetsAtDraw[0]!;
    const dispose = vi.spyOn(target, "dispose");
    adapter.dispose?.();
    expect(dispose).not.toHaveBeenCalled();
    const rejected = expect(pending).rejects.toThrow(/disposed/);
    resolve(new Uint8Array(16)); await rejected;
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("drains an earlier readback if the later depth submission throws", async () => {
    const renderer = createFakeWebGpuRenderer();
    let reject!: (reason: Error) => void;
    renderer.readRenderTargetPixelsAsync.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    const originalRender = renderer.render;
    renderer.render = () => {
      if (renderer.renderCalls === 1) throw new Error("depth submission failed");
      originalRender();
    };
    const adapter = createStudioBg3dThreeWebGpuCaptureAdapter({ renderer: renderer as never,
      scene: scene(), camera });
    const pending = adapter.capture({ ...request, includeDepth: true });
    const target = renderer.targetsAtDraw[0]!;
    const dispose = vi.spyOn(target, "dispose");
    expect(dispose).not.toHaveBeenCalled();
    const rejected = expect(pending).rejects.toThrow("depth submission failed");
    reject(new Error("color copy also failed")); await rejected;
    expect(dispose).toHaveBeenCalledOnce();
    expect(renderer.renderTarget).toBeNull();
  });

  it("does not release a shared renderer pool while another View still owns an adapter", async () => {
    const renderer = createFakeWebGpuRenderer({ colorBytes: new Uint8Array(16) });
    const first = createStudioBg3dThreeWebGpuCaptureAdapter({ renderer: renderer as never,
      scene: scene(), camera });
    const second = createStudioBg3dThreeWebGpuCaptureAdapter({ renderer: renderer as never,
      scene: scene(), camera });
    await first.capture(request); first.dispose?.();
    await second.capture(request);
    expect(renderer.targetsAtDraw[0]).toBe(renderer.targetsAtDraw[1]);
    await expect(first.capture(request)).rejects.toThrow(/disposed/);
  });
});


it("replacement Views cannot bypass the GPU budget of an unmounted pending capture", async () => {
  const renderer = createFakeWebGpuRenderer();
  let reject!: (reason: Error) => void;
  renderer.readRenderTargetPixelsAsync.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
  const first = createStudioBg3dThreeWebGpuCaptureAdapter({ renderer: renderer as never, scene: scene(), camera });
  const request = { width: 4096, height: 4096, includeDepth: false,
    background: { color: "#ffffff", alpha: 0 } } as const;
  const pending = first.capture(request);
  const rejected = expect(pending).rejects.toThrow("copy cancelled");
  first.dispose?.();
  const second = createStudioBg3dThreeWebGpuCaptureAdapter({ renderer: renderer as never, scene: scene(), camera });
  await expect(second.capture(request)).rejects.toThrow(/memory budget/);
  expect(renderer.renderCalls).toBe(1);
  reject(new Error("copy cancelled")); await rejected;
  second.dispose?.();
});
