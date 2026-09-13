// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Matrix4, Quaternion, Vector3 } from "three";
import { createSpatialReaderRuntime } from "./spatial-reader-runtime";
import { SPATIAL_READER_DEFAULTS } from "./spatial-reader-model";
import type { SpatialReaderRuntime, SpatialReaderRuntimeOptions } from "./spatial-reader-runtime";

const mock = vi.hoisted(() => ({ renderer: {} as Record<string, unknown> }));
vi.mock("three", async (original) => ({ ...await original<typeof import("three")>(), WebGLRenderer: class { constructor() { return mock.renderer; } } }));
vi.mock("./spatial-reader-textures", async () => {
  const { CanvasTexture } = await import("three");
  return {
    SpatialReaderImagePool: class { load() { return new Promise(() => {}); } dispose() {} },
    makeSpatialReaderTexture: () => new CanvasTexture(document.createElement("canvas")),
    makeSpatialReaderLabel: () => new CanvasTexture(document.createElement("canvas")),
    releaseSpatialReaderTexture: (texture: { dispose: () => void } | null) => texture?.dispose(),
  };
});
let runtime: SpatialReaderRuntime;
let options: SpatialReaderRuntimeOptions;
let session: XRSession;
let nativeEnd: ReturnType<typeof vi.fn>;
let request: ReturnType<typeof vi.fn>;
let frameLoop: ((time: number, frame: XRFrame) => void) | null;
const originalXr = Object.getOwnPropertyDescriptor(navigator, "xr");
const matrix = new Matrix4().identity().toArray();
function frame(present = true): XRFrame {
  return { getViewerPose: () => present ? { transform: { matrix } } : undefined, getPose: () => undefined, getHitTestResults: () => [] } as unknown as XRFrame;
}
beforeEach(() => {
  frameLoop = null; vi.stubGlobal("isSecureContext", true);
  let attached: XRSession | null = null;
  const manager = {
    enabled: false, isPresenting: false, setReferenceSpaceType: vi.fn(), setFramebufferScaleFactor: vi.fn(),
    getSession: () => attached, getReferenceSpace: () => ({}),
    setSession: vi.fn(async (value: XRSession) => { attached = value; manager.isPresenting = true; }),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  };
  nativeEnd = vi.fn(async () => {
    attached = null; manager.isPresenting = false;
    const event = new Event("end"); Object.defineProperty(event, "session", { value: session }); session.dispatchEvent(event);
  });
  session = Object.assign(new EventTarget(), {
    end: nativeEnd, visibilityState: "visible", inputSources: [], requestReferenceSpace: vi.fn(async () => ({})),
  }) as unknown as XRSession;
  request = vi.fn(async () => session);
  Object.defineProperty(navigator, "xr", { configurable: true, value: { isSessionSupported: async () => true, requestSession: request } });
  mock.renderer = { xr: manager, setPixelRatio: vi.fn(), setSize: vi.fn(), setClearAlpha: vi.fn(), render: vi.fn(), dispose: vi.fn(), forceContextLoss: vi.fn(),
    setAnimationLoop: vi.fn((callback) => { frameLoop = callback; }) };
  options = { canvas: document.createElement("canvas"), overlayRoot: document.createElement("div"), onState: vi.fn(), onCommand: vi.fn(), onSize: vi.fn(), onMessage: vi.fn(), onError: vi.fn() };
  runtime = createSpatialReaderRuntime(options);
  runtime.update({ pages: ["/one.png", "/two.png"], cursor: { page: 0, segment: 0 }, sizes: {}, settings: { ...SPATIAL_READER_DEFAULTS } });
});
afterEach(async () => {
  await runtime.dispose(); vi.unstubAllGlobals();
  if (originalXr) Object.defineProperty(navigator, "xr", originalXr); else Reflect.deleteProperty(navigator, "xr");
});
describe("spatial XR runtime integration", () => {
  it("requests XR within the click turn and makes hit testing optional", async () => {
    const starting = runtime.start("immersive-ar");
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]![1]).toMatchObject({ requiredFeatures: ["local"], optionalFeatures: ["dom-overlay", "hit-test"] });
    await starting; await Promise.resolve();
    expect(options.onMessage).toHaveBeenCalledWith(expect.stringContaining("시점 앞에 배치"));
  });
  it("does not render while hidden or tracking is unavailable", async () => {
    await runtime.start("immersive-vr"); frameLoop!(100, frame());
    expect(mock.renderer.render).toHaveBeenCalledTimes(1);
    Object.defineProperty(session, "visibilityState", { configurable: true, value: "hidden" });
    frameLoop!(200, frame()); expect(mock.renderer.render).toHaveBeenCalledTimes(1);
    Object.defineProperty(session, "visibilityState", { configurable: true, value: "visible" });
    frameLoop!(300, frame(false)); expect(mock.renderer.render).toHaveBeenCalledTimes(1);
  });
  it("uses the event source for transient pinch selection, even with an empty input array", async () => {
    await runtime.start("immersive-vr"); frameLoop!(100, frame());
    const ray = new Vector3(-0.2, -0.87, -1.985).normalize();
    const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), ray);
    const transform = new Matrix4().makeRotationFromQuaternion(rotation).toArray();
    const event = new Event("select");
    Object.defineProperties(event, { inputSource: { value: { targetRaySpace: {} } }, frame: { value: { getPose: () => ({ transform: { matrix: transform } }) } } });
    session.dispatchEvent(event);
    expect(session.inputSources).toHaveLength(0); expect(options.onCommand).toHaveBeenCalledWith("next");
  });
  it("suppresses duplicate XR selects over DOM controls only", () => {
    const controls = document.createElement("button"); controls.setAttribute("data-spatial-xr-controls", ""); options.overlayRoot.append(controls);
    const blocked = new Event("beforexrselect", { bubbles: true, cancelable: true }); controls.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);
    const allowed = new Event("beforexrselect", { bubbles: true, cancelable: true }); options.overlayRoot.dispatchEvent(allowed);
    expect(allowed.defaultPrevented).toBe(false);
  });
  it("ends native privacy ownership before disposing the renderer, idempotently", async () => {
    await runtime.start("immersive-vr");
    const closing = runtime.dispose(); expect(runtime.dispose()).toBe(closing);
    await closing; expect(nativeEnd).toHaveBeenCalledTimes(1); expect(mock.renderer.dispose).toHaveBeenCalledTimes(1);
    expect(frameLoop).toBeNull(); expect(mock.renderer.forceContextLoss).toHaveBeenCalledTimes(1);
    await expect(runtime.start("immersive-vr")).rejects.toThrow("닫혔습니다");
  });
  it("releases a hit-test source arriving after the native session ended", async () => {
    let resolveHit!: (source: { cancel: () => void }) => void;
    Object.defineProperty(session, "requestHitTestSource", { value: () => new Promise((resolve) => { resolveHit = resolve; }) });
    await runtime.start("immersive-ar"); await Promise.resolve();
    await runtime.end(); const cancel = vi.fn(); resolveHit({ cancel }); await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
